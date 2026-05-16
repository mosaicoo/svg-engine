import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createEmptyDocument,
  createEllipse,
  createGroup,
  createRect,
  EditorStateService,
} from 'svg-engine/core';
import { LayersService, SelectionService } from 'svg-engine/edit';
import { LayersPanel } from './layers-panel.component';

@Component({
  standalone: true,
  imports: [LayersPanel],
  template: `<svge-layers-panel></svge-layers-panel>`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const selection = TestBed.inject(SelectionService);
  selection.clear();
  const layers = TestBed.inject(LayersService);
  layers.showAll();
  layers.unlockAll();
  fixture.detectChanges();
  return { fixture, state, selection, layers };
}

function rows(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.row'));
}

describe('LayersPanel — render', () => {
  it('shows "No layers" when the document is empty', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.empty')?.textContent).toContain('No layers');
  });

  it('renders one row per top-level child of the root', () => {
    const { state, fixture } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createEllipse({ cx: 0, cy: 0, rx: 5, ry: 5 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    expect(rows(fixture.nativeElement).length).toBe(2);
  });

  it('shows the type icon and label per row', () => {
    const { state, fixture } = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    const row = rows(fixture.nativeElement)[0]!;
    expect(row.querySelector('.label')?.textContent).toContain('rect');
    expect(row.querySelector('.label')?.textContent).toContain(r.id.slice(0, 6));
  });
});

describe('LayersPanel — selection sync', () => {
  it('click on row selects the node (single)', () => {
    const { state, selection, fixture } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    const [rowA] = rows(fixture.nativeElement);
    rowA?.click();
    expect(selection.focusId()).toBe(a.id);
    expect(selection.count()).toBe(1);
  });

  it('ctrl-click toggles membership in the selection', () => {
    const { state, selection, fixture } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    const [rowA, rowB] = rows(fixture.nativeElement);
    rowA?.click();
    rowB?.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    expect(selection.count()).toBe(2);
    rowA?.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    expect(selection.count()).toBe(1);
    expect(selection.isSelected(b.id)).toBe(true);
  });

  it('selected row gets the .selected class', () => {
    const { state, selection, fixture } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    selection.select(a.id);
    fixture.detectChanges();
    expect(rows(fixture.nativeElement)[0]?.classList.contains('selected')).toBe(true);
  });
});

describe('LayersPanel — visibility / lock toggles', () => {
  function setupWithRect() {
    const { state, layers, fixture } = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    return { fixture, layers, rectId: r.id };
  }

  it('clicking the visibility icon toggles LayersService.isVisible', () => {
    const { fixture, layers, rectId } = setupWithRect();
    const visBtn = fixture.nativeElement.querySelector(
      '.row .visibility',
    ) as HTMLButtonElement | null;
    expect(layers.isVisible(rectId)).toBe(true);
    visBtn?.click();
    fixture.detectChanges();
    expect(layers.isVisible(rectId)).toBe(false);
    visBtn?.click();
    fixture.detectChanges();
    expect(layers.isVisible(rectId)).toBe(true);
  });

  it('clicking the lock icon toggles LayersService.isLocked', () => {
    const { fixture, layers, rectId } = setupWithRect();
    const lockBtn = fixture.nativeElement.querySelector('.row .lock') as HTMLButtonElement | null;
    expect(layers.isLocked(rectId)).toBe(false);
    lockBtn?.click();
    fixture.detectChanges();
    expect(layers.isLocked(rectId)).toBe(true);
  });

  it('hidden row gets the .hidden class', () => {
    const { fixture, layers, rectId } = setupWithRect();
    layers.setVisible(rectId, false);
    fixture.detectChanges();
    expect(rows(fixture.nativeElement)[0]?.classList.contains('hidden')).toBe(true);
  });

  it('locked row gets the .locked class', () => {
    const { fixture, layers, rectId } = setupWithRect();
    layers.setLocked(rectId, true);
    fixture.detectChanges();
    expect(rows(fixture.nativeElement)[0]?.classList.contains('locked')).toBe(true);
  });

  it('clicking on a locked row is a no-op (does not select)', () => {
    const { fixture, layers, rectId } = setupWithRect();
    const sel = TestBed.inject(SelectionService);
    sel.clear();
    layers.setLocked(rectId, true);
    fixture.detectChanges();
    rows(fixture.nativeElement)[0]?.click();
    fixture.detectChanges();
    expect(sel.count()).toBe(0);
    expect(sel.focusId()).toBeNull();
  });

  it('locked row has aria-disabled="true" for screen readers', () => {
    const { fixture, layers, rectId } = setupWithRect();
    layers.setLocked(rectId, true);
    fixture.detectChanges();
    expect(rows(fixture.nativeElement)[0]?.getAttribute('aria-disabled')).toBe('true');
  });

  it('toggle clicks do not trigger row select (stopPropagation)', () => {
    const { fixture, rectId, layers } = setupWithRect();
    const sel = TestBed.inject(SelectionService);
    sel.clear();
    const visBtn = fixture.nativeElement.querySelector(
      '.row .visibility',
    ) as HTMLButtonElement | null;
    visBtn?.click();
    fixture.detectChanges();
    // Visibility changed but selection didn't
    expect(layers.isVisible(rectId)).toBe(false);
    expect(sel.count()).toBe(0);
  });
});

describe('LayersPanel — group expansion', () => {
  it('group rows show an expand chevron; click expands inline', () => {
    const { state, fixture } = setup();
    const child = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const grp = createGroup([child]);
    state.setDocument({
      ...state.document(),
      root: createGroup([grp], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    expect(rows(fixture.nativeElement).length).toBe(1); // collapsed by default
    const chevron = fixture.nativeElement.querySelector('.row .expand') as HTMLButtonElement | null;
    chevron?.click();
    fixture.detectChanges();
    expect(rows(fixture.nativeElement).length).toBe(2); // group + child
  });
});
