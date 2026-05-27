import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  CreatePageCommand,
  createEmptyDocument,
  EditorStateService,
  isPage,
  type NodeId,
} from 'svg-engine/core';
import { ActivePageService, PagesService } from 'svg-engine/edit';
import { SvgePagesPanel } from './pages-panel.component';

/**
 * **D-079 / PAGES-C** specs — SvgePagesPanel. Verifies the visible
 * surface (auto-hide, tab rendering, active highlight) + actions
 * (add, delete, click-to-activate, rename inline).
 */

@Component({
  standalone: true,
  imports: [SvgePagesPanel],
  template: `<svge-pages-panel />`,
})
class TestHost {}

const VB = { x: 0, y: 0, width: 800, height: 600 };

function setup() {
  TestBed.configureTestingModule({
    imports: [TestHost],
    providers: [provideNoopAnimations()],
  });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return {
    fixture,
    state,
    bus: TestBed.inject(CommandBus),
    pages: TestBed.inject(PagesService),
    active: TestBed.inject(ActivePageService),
  };
}

describe('PAGES-C — SvgePagesPanel auto-hide', () => {
  it('renders no .pages-bar when document has zero pages', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.pages-bar')).toBeNull();
  });

  it('renders the .pages-bar once a page is created', () => {
    const { fixture, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'A'));
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pages-bar')).not.toBeNull();
  });
});

describe('PAGES-C — Tab rendering + active highlight', () => {
  it('renders one .page-tab per page, in z-order', () => {
    const { fixture, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'First'));
    bus.dispatch(new CreatePageCommand(VB, 'Second'));
    bus.dispatch(new CreatePageCommand(VB, 'Third'));
    TestBed.flushEffects();
    fixture.detectChanges();
    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('.page-tab .page-name'),
    ) as HTMLElement[];
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['First', 'Second', 'Third']);
  });

  it('marks the active tab with .active class', () => {
    const { fixture, bus, active } = setup();
    const first = new CreatePageCommand(VB, 'A');
    bus.dispatch(first);
    const second = new CreatePageCommand(VB, 'B');
    bus.dispatch(second);
    TestBed.flushEffects();
    active.setActive(second.getCreatedPageId());
    fixture.detectChanges();
    const activeTabs = fixture.nativeElement.querySelectorAll('.page-tab.active');
    expect(activeTabs.length).toBe(1);
    const name = activeTabs[0].querySelector('.page-name')?.textContent?.trim();
    expect(name).toBe('B');
  });
});

describe('PAGES-C — Add page button', () => {
  it('the add button dispatches CreatePageCommand and activates the new page', () => {
    const { fixture, state, pages, active, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'Initial'));
    TestBed.flushEffects();
    fixture.detectChanges();
    const initialActiveId = active.activePageId();

    const addBtn = fixture.nativeElement.querySelector('.add-btn') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    addBtn.click();
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(pages.count()).toBe(2);
    // Newly added page should be the active one.
    expect(active.activePageId()).not.toBe(initialActiveId);
    // Sanity: the new page is in the document.
    expect(state.document().root.children.filter((c) => isPage(c)).length).toBe(2);
  });
});

describe('PAGES-C — Click activates page', () => {
  it('clicking a tab calls active.setActive()', () => {
    const { fixture, bus, active } = setup();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    fixture.detectChanges();
    // First page is active by default.
    expect(active.activePageId()).toBe(a.getCreatedPageId());
    // Click the 2nd tab.
    const tabs = fixture.nativeElement.querySelectorAll('.page-tab') as NodeListOf<HTMLElement>;
    tabs[1].click();
    fixture.detectChanges();
    expect(active.activePageId()).toBe(b.getCreatedPageId());
  });
});

describe('PAGES-C — Delete button', () => {
  it('shows the close X only when there are 2+ pages', () => {
    const { fixture, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'Solo'));
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.close-btn')).toBeNull();
    bus.dispatch(new CreatePageCommand(VB, 'Pair'));
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.close-btn').length).toBe(2);
  });

  it('clicking the X dispatches DeletePageCommand', () => {
    const { fixture, bus, pages } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'A'));
    bus.dispatch(new CreatePageCommand(VB, 'B'));
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(pages.count()).toBe(2);
    const closeBtns = fixture.nativeElement.querySelectorAll(
      '.close-btn',
    ) as NodeListOf<HTMLButtonElement>;
    closeBtns[0].click();
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(pages.count()).toBe(1);
  });
});

describe('PAGES-C — Inline rename (dblclick → input → Enter)', () => {
  it('dblclick swaps the .page-name span for an input', () => {
    const { fixture, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'Old'));
    TestBed.flushEffects();
    fixture.detectChanges();
    const tab = fixture.nativeElement.querySelector('.page-tab') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rename-input')).not.toBeNull();
  });

  it('Enter commits the rename via RenamePageCommand', () => {
    const { fixture, bus, pages } = setup();
    const cmd = new CreatePageCommand(VB, 'Old');
    bus.dispatch(cmd);
    TestBed.flushEffects();
    fixture.detectChanges();
    const id = cmd.getCreatedPageId() as NodeId;

    const tab = fixture.nativeElement.querySelector('.page-tab') as HTMLElement;
    tab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.rename-input') as HTMLInputElement;
    input.value = 'Renamed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(pages.nameOf(id)).toBe('Renamed');
  });
});
