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

describe('Audit #10 — Drag-drop reorder', () => {
  function getTabs(fixture: { nativeElement: HTMLElement }): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.page-tab')) as HTMLElement[];
  }

  function fireDrag(source: HTMLElement, target: HTMLElement, position: 'before' | 'after'): void {
    // jsdom (v28) doesn't expose the `DragEvent` global. Since
    // DragEvent extends MouseEvent and Angular's `(dragstart)` /
    // `(drop)` etc. bindings dispatch by event type string (not
    // constructor identity), a `MouseEvent` whose type is 'dragstart'
    // is enough to trigger the handlers. We force-set
    // `dataTransfer = null` so the component's `!== null` guard
    // short-circuits cleanly (without it, the property is
    // `undefined`, the guard fails, and the handler crashes
    // trying to assign `effectAllowed` on undefined).
    // getBoundingClientRect() returns zeros in jsdom, so the
    // component sees midX = 0. clientX -10 → 'before', +10 → 'after'.
    function fire(el: HTMLElement, type: string, clientX: number): void {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(e, 'dataTransfer', { value: null, writable: false });
      el.dispatchEvent(e);
    }
    fire(source, 'dragstart', 0);
    const clientX = position === 'after' ? 10 : -10;
    fire(target, 'dragover', clientX);
    fire(target, 'drop', clientX);
    fire(source, 'dragend', 0);
  }

  it('dragging tab "before" another reorders pages via MoveNodeInTreeCommand', () => {
    const { fixture, bus, pages } = setup();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    const c = new CreatePageCommand(VB, 'C');
    bus.dispatch(c);
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(pages.pages().map((p) => p.id)).toEqual([
      a.getCreatedPageId(),
      b.getCreatedPageId(),
      c.getCreatedPageId(),
    ]);

    // Drag C to "before A" → [C, A, B]
    const tabs = getTabs(fixture);
    fireDrag(tabs[2]!, tabs[0]!, 'before');
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(pages.pages().map((p) => p.id)).toEqual([
      c.getCreatedPageId(),
      a.getCreatedPageId(),
      b.getCreatedPageId(),
    ]);
  });

  it('dragging tab "after" the same tab is a no-op (no command dispatched)', () => {
    const { fixture, bus, pages, state } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'A'));
    bus.dispatch(new CreatePageCommand(VB, 'B'));
    TestBed.flushEffects();
    fixture.detectChanges();
    const docBefore = state.document();

    const tabs = getTabs(fixture);
    // Drop on itself — same target as source.
    fireDrag(tabs[0]!, tabs[0]!, 'after');
    TestBed.flushEffects();
    fixture.detectChanges();

    // Document root identity unchanged → no mutation happened.
    expect(state.document().root).toBe(docBefore.root);
    expect(pages.count()).toBe(2);
  });

  it('tab being renamed is not draggable (canDrag returns "false")', () => {
    const { fixture, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'A'));
    bus.dispatch(new CreatePageCommand(VB, 'B'));
    TestBed.flushEffects();
    fixture.detectChanges();

    const tabs = getTabs(fixture);
    // Begin rename on the first tab.
    tabs[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    // Re-query — the renaming tab should now report draggable=false;
    // the other tab stays draggable=true.
    const tabsAfter = getTabs(fixture);
    expect(tabsAfter[0]!.getAttribute('draggable')).toBe('false');
    expect(tabsAfter[1]!.getAttribute('draggable')).toBe('true');
  });

  it('single-page documents do not show draggable tabs (no reorder possible)', () => {
    const { fixture, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'Solo'));
    TestBed.flushEffects();
    fixture.detectChanges();

    const tabs = getTabs(fixture);
    expect(tabs.length).toBe(1);
    expect(tabs[0]!.getAttribute('draggable')).toBe('false');
  });

  it('undo restores original page order after a drag-drop reorder', () => {
    const { fixture, bus, pages } = setup();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    fixture.detectChanges();
    const originalOrder = pages.pages().map((p) => p.id);

    // Drag A "after" B → [B, A]
    const tabs = getTabs(fixture);
    fireDrag(tabs[0]!, tabs[1]!, 'after');
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(pages.pages().map((p) => p.id)).toEqual([b.getCreatedPageId(), a.getCreatedPageId()]);

    // Undo → back to [A, B]
    bus.undo();
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(pages.pages().map((p) => p.id)).toEqual(originalOrder);
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
