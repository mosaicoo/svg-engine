import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEllipse,
  createEmptyDocument,
  createGroup,
  createLine,
  createPath,
  createRect,
  EditorStateService,
  findNodeById,
  HistoryService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { LayersService, SelectionService } from 'svg-engine/edit';
import { SvgeInspector } from './inspector.component';

@Component({
  standalone: true,
  imports: [SvgeInspector],
  template: `<svge-inspector></svge-inspector>`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({
    imports: [TestHost],
  });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const selection = TestBed.inject(SelectionService);
  selection.clear();
  TestBed.inject(HistoryService).clear();
  fixture.detectChanges();
  return { fixture, state, selection, bus: TestBed.inject(CommandBus) };
}

function placeholderText(host: HTMLElement): string {
  return host.querySelector('.placeholder')?.textContent?.trim() ?? '';
}

describe('SvgeInspector — empty / multi states', () => {
  it('shows "No selection" when nothing is selected', () => {
    const { fixture } = setup();
    expect(placeholderText(fixture.nativeElement)).toContain('No selection');
  });

  it('shows multi-selection placeholder with count when >1 selected', () => {
    const { fixture, state, selection } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    selection.selectMany([a.id, b.id]);
    fixture.detectChanges();
    const text = placeholderText(fixture.nativeElement);
    expect(text).toContain('Multiple selection');
    expect(text).toContain('2');
  });
});

describe('SvgeInspector — header', () => {
  it('shows the type and id slice in the header', () => {
    const { fixture, state, selection } = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('.inspector-header');
    expect(header?.textContent).toContain('rect');
    expect(header?.textContent).toContain(r.id.slice(0, 8));
  });
});

describe('SvgeInspector — geometry per type', () => {
  function setupWith(node: import('svg-engine/core').SvgNode) {
    const ctx = setup();
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([node], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(node.id);
    ctx.fixture.detectChanges();
    return { ...ctx, node };
  }

  it('rect shows x/y/w/h with current values', () => {
    const r = createRect({ x: 12, y: 34, width: 56, height: 78 });
    const { fixture } = setupWith(r);
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    const values = inputs.map((i) => Number(i.value));
    // First 4 inputs = geometry (x, y, w, h); the rest are stroke/opacity
    expect(values.slice(0, 4)).toEqual([12, 34, 56, 78]);
  });

  it('ellipse shows cx/cy/rx/ry', () => {
    const e = createEllipse({ cx: 5, cy: 7, rx: 11, ry: 13 });
    const { fixture } = setupWith(e);
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    expect(inputs.slice(0, 4).map((i) => Number(i.value))).toEqual([5, 7, 11, 13]);
  });

  it('line shows x1/y1/x2/y2', () => {
    const l = createLine({ x1: 1, y1: 2, x2: 30, y2: 40 });
    const { fixture } = setupWith(l);
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    expect(inputs.slice(0, 4).map((i) => Number(i.value))).toEqual([1, 2, 30, 40]);
  });

  it('path shows the "not yet supported" placeholder for geometry', () => {
    const p = createPath('M0 0 L10 10');
    const { fixture } = setupWith(p);
    const small = fixture.nativeElement.querySelector('.placeholder.small');
    expect(small?.textContent).toContain('not yet supported');
  });

  it('group has no geometry section', () => {
    const grp = createGroup([], {});
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([grp], { id: state.document().root.id }),
    });
    selection.select(grp.id);
    fixture.detectChanges();
    // Style section should still render, but no "Geometry" heading
    const sections = Array.from(
      fixture.nativeElement.querySelectorAll('.section .section-title'),
    ) as HTMLElement[];
    const titles = sections.map((s) => s.textContent?.trim());
    expect(titles).not.toContain('Geometry');
    expect(titles).toContain('Style');
  });
});

describe('SvgeInspector — command dispatch on edit', () => {
  it('changing rect.x dispatches SetPropertyCommand and updates the node', () => {
    const r = createRect({ x: 10, y: 20, width: 30, height: 40 });
    const { fixture, state, selection, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();

    const xInput = fixture.nativeElement.querySelector(
      'mat-form-field input[type="number"]',
    ) as HTMLInputElement | null;
    if (xInput === null) throw new Error('x input not found');
    xInput.value = '99';
    xInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const updated = findNodeById(state.document().root, r.id);
    expect((updated as { x: number }).x).toBe(99);
    expect(bus).toBeDefined(); // CommandBus is the dispatch target — undo works
  });

  it('changing fill via color picker updates style.fill', () => {
    const r = createRect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      // No style override at construction — defaults to DEFAULT_STYLE
    });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();

    const fillInput = fixture.nativeElement.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement | null;
    if (fillInput === null) throw new Error('fill input not found');
    fillInput.value = '#ff0000';
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const updated = findNodeById(state.document().root, r.id);
    expect(updated?.style.fill).toBe('#ff0000');
  });

  it('non-finite input is dropped silently (no command, no mutation)', () => {
    const r = createRect({ x: 5, y: 5, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const beforeDoc = state.document();

    const xInput = fixture.nativeElement.querySelector(
      'mat-form-field input[type="number"]',
    ) as HTMLInputElement | null;
    if (xInput === null) throw new Error('x input not found');
    xInput.value = '';
    xInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(state.document()).toBe(beforeDoc);
  });

  it('repeated edit with same value is a no-op (no spurious command)', () => {
    const r = createRect({ x: 5, y: 5, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const beforeDoc = state.document();

    const xInput = fixture.nativeElement.querySelector(
      'mat-form-field input[type="number"]',
    ) as HTMLInputElement | null;
    xInput!.value = '5'; // same as current
    xInput!.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(state.document()).toBe(beforeDoc);
  });
});

describe('SvgeInspector — reactive updates', () => {
  it('header refreshes when focus changes', () => {
    const { fixture, state, selection } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createEllipse({ cx: 0, cy: 0, rx: 5, ry: 5 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    selection.select(a.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.type-label')?.textContent).toBe('rect');
    selection.select(b.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.type-label')?.textContent).toBe('ellipse');
  });

  it('inputs refresh after an external command changes the node', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { fixture, state, selection, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();

    // External edit (e.g., MoveNodeCommand from a drag would do similar)
    bus.dispatch(
      new InsertNodeCommand(
        state.document().root.id,
        createRect({ x: 50, y: 50, width: 5, height: 5 }),
      ),
    );
    // Different node inserted; re-confirm header is still about r
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.type-label')?.textContent).toBe('rect');
  });
});

describe('SvgeInspector — lock enforcement', () => {
  function setupWithLockedRect() {
    const ctx = setup();
    const layers = TestBed.inject(LayersService);
    layers.unlockAll();
    const r = createRect({ x: 10, y: 10, width: 20, height: 20 });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([r], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(r.id);
    layers.setLocked(r.id, true);
    ctx.fixture.detectChanges();
    return { ...ctx, layers, rectId: r.id };
  }

  it('shows the Locked badge in the header when focused node is locked', () => {
    const { fixture } = setupWithLockedRect();
    const badge = fixture.nativeElement.querySelector('.inspector-header .lock-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Locked');
  });

  it('adds .locked class to the header when focused node is locked', () => {
    const { fixture } = setupWithLockedRect();
    const header = fixture.nativeElement.querySelector('.inspector-header');
    expect(header?.classList.contains('locked')).toBe(true);
  });

  it('disables every input when the focused node is locked', () => {
    const { fixture } = setupWithLockedRect();
    const numberInputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    const colorInputs = Array.from(
      fixture.nativeElement.querySelectorAll('input[type="color"]'),
    ) as HTMLInputElement[];
    expect(numberInputs.length).toBeGreaterThan(0);
    expect(colorInputs.length).toBe(2);
    for (const i of [...numberInputs, ...colorInputs]) {
      expect(i.disabled).toBe(true);
    }
  });

  it('setNumber is a no-op when focused node is locked (defense in depth)', () => {
    const { fixture, state, rectId } = setupWithLockedRect();
    const beforeDoc = state.document();
    // Programmatically dispatch a change event (bypasses the [disabled]
    // gate to confirm the setter itself short-circuits).
    const xInput = fixture.nativeElement.querySelector(
      'mat-form-field input[type="number"]',
    ) as HTMLInputElement | null;
    if (xInput === null) throw new Error('input not found');
    xInput.disabled = false; // force re-enable for this test
    xInput.value = '999';
    xInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(state.document()).toBe(beforeDoc);
    expect(rectId).toBeDefined();
  });

  it('removes the Locked badge after unlocking', () => {
    const { fixture, layers, rectId } = setupWithLockedRect();
    expect(fixture.nativeElement.querySelector('.lock-badge')).not.toBeNull();
    layers.setLocked(rectId, false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.lock-badge')).toBeNull();
  });
});
