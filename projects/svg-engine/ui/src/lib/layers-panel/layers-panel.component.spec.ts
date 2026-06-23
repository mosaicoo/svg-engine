import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createEmptyDocument,
  createEllipse,
  createGroup,
  createRect,
  EditorStateService,
  isLayer,
  type NodeId,
  withLayerFlag,
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

describe('LayersPanel — drag-drop reorder (Bloco 4b-DnD)', () => {
  function seed3() {
    const ctx = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([a, b, c], { id: ctx.state.document().root.id }),
    });
    ctx.fixture.detectChanges();
    return { ...ctx, a, b, c };
  }

  /**
   * Simulate a drag from `srcRow` to `tgtRow` at the given `position`.
   * jsdom returns zero-dimensional layout rects, so we stub
   * `getBoundingClientRect` on the target row with a known size so the
   * component's Y-zone math (top 30% / middle / bottom 30%) works.
   *
   * Both `DataTransfer` and `DragEvent` are missing in jsdom — we
   * dispatch `MouseEvent`s with the drag event-type names; component
   * handlers guard `dataTransfer` defensively (== null) so the
   * MouseEvent-without-dataTransfer is accepted.
   */
  function simulateDragDrop(
    srcRow: HTMLElement,
    tgtRow: HTMLElement,
    position: 'before' | 'after' | 'inside',
  ): void {
    const fakeRect: DOMRect = {
      top: 0,
      bottom: 30,
      left: 0,
      right: 200,
      width: 200,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    tgtRow.getBoundingClientRect = () => fakeRect;
    const y = position === 'before' ? 2 : position === 'after' ? 28 : 15; // 30 * 0.3 boundaries
    const x = 10;
    srcRow.dispatchEvent(new MouseEvent('dragstart', { bubbles: true }));
    tgtRow.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientX: x, clientY: y }));
    tgtRow.dispatchEvent(new MouseEvent('drop', { bubbles: true, clientX: x, clientY: y }));
    srcRow.dispatchEvent(new MouseEvent('dragend', { bubbles: true }));
  }

  it('drag a → AFTER c: order becomes [b, c, a]', () => {
    const { state, fixture, a, b, c } = seed3();
    const rs = rows(fixture.nativeElement);
    simulateDragDrop(rs[0]!, rs[2]!, 'after');
    fixture.detectChanges();
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, c.id, a.id]);
  });

  it('drag c → BEFORE a: order becomes [c, a, b]', () => {
    const { state, fixture, a, b, c } = seed3();
    const rs = rows(fixture.nativeElement);
    simulateDragDrop(rs[2]!, rs[0]!, 'before');
    fixture.detectChanges();
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([c.id, a.id, b.id]);
  });

  it('drag onto a group (inside): node becomes first child (reparent)', () => {
    const { state, fixture } = setup();
    const inner = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const grp = createGroup([inner]);
    const loose = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([grp, loose] as unknown as ReturnType<typeof createRect>[], {
        id: state.document().root.id,
      }),
    });
    fixture.detectChanges();
    const rs = rows(fixture.nativeElement);
    simulateDragDrop(rs[1]!, rs[0]!, 'inside');
    fixture.detectChanges();
    const root = state.document().root;
    expect(root.children.length).toBe(1);
    expect(
      (root.children[0] as { children: readonly { id: string }[] }).children.map((ch) => ch.id),
    ).toEqual([loose.id, inner.id]);
  });

  it('drag on locked target: no mutation', () => {
    const { state, fixture, layers, a, b, c } = seed3();
    layers.setLocked(c.id, true);
    fixture.detectChanges();
    const before = state.document();
    const rs = rows(fixture.nativeElement);
    simulateDragDrop(rs[0]!, rs[2]!, 'after');
    fixture.detectChanges();
    expect(state.document()).toBe(before);
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });

  it('drag onto self: no-op (no mutation)', () => {
    const { state, fixture, a, b, c } = seed3();
    const before = state.document();
    const rs = rows(fixture.nativeElement);
    simulateDragDrop(rs[1]!, rs[1]!, 'after');
    fixture.detectChanges();
    expect(state.document()).toBe(before);
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });

  it('after successful drop, the moved node is selected', () => {
    const { fixture, selection, a } = seed3();
    selection.clear();
    const rs = rows(fixture.nativeElement);
    simulateDragDrop(rs[0]!, rs[2]!, 'after');
    fixture.detectChanges();
    expect(selection.focusId()).toBe(a.id);
  });
});

describe('LayersPanel — D-072 Logical Layers', () => {
  it('renders layer rows with the .is-layer class', () => {
    const { state, fixture } = setup();
    const layer = withLayerFlag(createGroup([]));
    const plain = createGroup([]);
    state.setDocument({
      ...state.document(),
      root: createGroup([layer, plain], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    const [layerRow, plainRow] = rows(fixture.nativeElement);
    expect(layerRow?.classList.contains('is-layer')).toBe(true);
    expect(plainRow?.classList.contains('is-layer')).toBe(false);
  });

  it('layer rows use the folder_special icon (distinct from plain folder)', () => {
    const { state, fixture } = setup();
    const layer = withLayerFlag(createGroup([]));
    state.setDocument({
      ...state.document(),
      root: createGroup([layer], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    const icon = rows(fixture.nativeElement)[0]?.querySelector('.type-icon');
    expect(icon?.textContent?.trim()).toBe('folder_special');
  });

  it('"+ New Layer" button dispatches a CreateLayerCommand', () => {
    const { state, fixture } = setup();
    const before = state.document().root.children.length;
    const btn = (fixture.nativeElement as HTMLElement).querySelector(
      '.new-layer-btn',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    btn!.click();
    fixture.detectChanges();
    const after = state.document().root.children;
    expect(after.length).toBe(before + 1);
    // New layer is the FIRST child (front of the document).
    expect(isLayer(after[0]!)).toBe(true);
  });

  it('drag a layer onto another group (inside): NO mutation (top-level invariant)', () => {
    const { state, fixture } = setup();
    const layer = withLayerFlag(createGroup([]));
    const group = createGroup([]);
    state.setDocument({
      ...state.document(),
      root: createGroup([layer, group], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    const before = state.document();
    const [layerRow, groupRow] = rows(fixture.nativeElement);
    expect(layerRow).toBeDefined();
    expect(groupRow).toBeDefined();
    // Stub bounding rect on the group row so "inside" math works.
    const fakeRect: DOMRect = {
      top: 0,
      bottom: 30,
      left: 0,
      right: 200,
      width: 200,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    groupRow!.getBoundingClientRect = () => fakeRect;
    layerRow!.dispatchEvent(new MouseEvent('dragstart', { bubbles: true }));
    groupRow!.dispatchEvent(
      new MouseEvent('dragover', { bubbles: true, clientX: 10, clientY: 15 }),
    );
    groupRow!.dispatchEvent(new MouseEvent('drop', { bubbles: true, clientX: 10, clientY: 15 }));
    layerRow!.dispatchEvent(new MouseEvent('dragend', { bubbles: true }));
    fixture.detectChanges();
    // Tree unchanged — drop rejected by isDropAllowed.
    expect(state.document()).toBe(before);
  });
});

describe('LayersPanel — D-105 Auto Reveal', () => {
  const KEY = 'svge:layers-panel:auto-reveal';

  beforeEach(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // storage disabled — defaults apply
    }
  });

  function trigger(host: HTMLElement): HTMLButtonElement {
    return host.querySelector('.auto-reveal-trigger') as HTMLButtonElement;
  }

  /** Seed a collapsed group containing one nested child; return both ids. */
  function seedNestedCollapsed(
    state: EditorStateService,
    fixture: ReturnType<typeof setup>['fixture'],
  ): { childId: NodeId; groupId: NodeId } {
    const child = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const grp = createGroup([child]);
    state.setDocument({
      ...state.document(),
      root: createGroup([grp], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    return { childId: child.id, groupId: grp.id };
  }

  it('header shows the auto-reveal toggle, active by default', () => {
    const { fixture, state } = setup();
    // Header only renders when the tree is non-empty.
    state.setDocument({
      ...state.document(),
      root: createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        id: state.document().root.id,
      }),
    });
    fixture.detectChanges();
    const btn = trigger(fixture.nativeElement);
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('has-active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggling off flips aria-pressed and persists to localStorage', () => {
    const { fixture, state } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        id: state.document().root.id,
      }),
    });
    fixture.detectChanges();
    const btn = trigger(fixture.nativeElement);
    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.classList.contains('has-active')).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('restores the persisted "off" preference on a fresh panel', () => {
    localStorage.setItem(KEY, 'false');
    const { fixture, state } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        id: state.document().root.id,
      }),
    });
    fixture.detectChanges();
    expect(trigger(fixture.nativeElement).getAttribute('aria-pressed')).toBe('false');
  });

  it('ON: selecting a node inside a collapsed group reveals its row', () => {
    const { state, selection, fixture } = setup();
    const { childId } = seedNestedCollapsed(state, fixture);
    // Collapsed: only the group row is present.
    expect(rows(fixture.nativeElement).length).toBe(1);
    selection.select(childId);
    fixture.detectChanges();
    // Revealed: the nested child's row now exists in the DOM.
    const childRow = fixture.nativeElement.querySelector(`.row[data-node-id="${childId}"]`);
    expect(childRow).not.toBeNull();
    expect(rows(fixture.nativeElement).length).toBe(2);
  });

  it('OFF: selecting the same node does NOT auto-expand the group', () => {
    const { state, selection, fixture } = setup();
    // Seed first so the header (and toggle) renders, then turn auto-reveal off.
    const { childId } = seedNestedCollapsed(state, fixture);
    trigger(fixture.nativeElement).click();
    fixture.detectChanges();
    selection.select(childId);
    fixture.detectChanges();
    const childRow = fixture.nativeElement.querySelector(`.row[data-node-id="${childId}"]`);
    expect(childRow).toBeNull();
    expect(rows(fixture.nativeElement).length).toBe(1); // group stays collapsed
  });

  it('every row carries its data-node-id for reveal lookup', () => {
    const { state, fixture } = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    fixture.detectChanges();
    expect(rows(fixture.nativeElement)[0]?.getAttribute('data-node-id')).toBe(String(r.id));
  });
});
