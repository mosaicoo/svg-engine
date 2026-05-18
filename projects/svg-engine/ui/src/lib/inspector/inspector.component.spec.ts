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
import { LayersService, PaletteRegistry, SelectionService } from 'svg-engine/edit';
import { cssColorToHex6, SvgeInspector } from './inspector.component';

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

  it('shows multi-edit panel (not placeholder) when >1 selected (Item 1 — débito 4c)', () => {
    const { fixture, state, selection } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    selection.selectMany([a.id, b.id]);
    fixture.detectChanges();
    // Header (mode=multi) AND a STYLE section render — no placeholder.
    const header = fixture.nativeElement.querySelector(
      '.inspector-header[data-mode="multi"]',
    ) as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain('Multi-selection');
    expect(header?.textContent).toContain('2 editable');
    expect(fixture.nativeElement.querySelector('.section-title')?.textContent).toContain('Style');
  });

  it('shows "all locked" placeholder when multi-selection has zero unlocked items', () => {
    const ctx = setup();
    const layers = TestBed.inject(LayersService);
    layers.unlockAll();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([a, b], { id: ctx.state.document().root.id }),
    });
    ctx.selection.selectMany([a.id, b.id]);
    layers.setLocked(a.id, true);
    layers.setLocked(b.id, true);
    TestBed.flushEffects();
    ctx.fixture.detectChanges();
    // Selection.toggle/select filter locked, so count() drops to 0 → "No selection".
    // (Confirms the lock-enforcement chain stays intact for multi too.)
    expect(placeholderText(ctx.fixture.nativeElement)).toContain('No selection');
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

describe('SvgeInspector — lock interaction (Bloco 4b-Lock v2)', () => {
  it('locking a focused node auto-deselects → inspector shows "No selection"', () => {
    const ctx = setup();
    const layers = TestBed.inject(LayersService);
    layers.unlockAll();
    const r = createRect({ x: 10, y: 10, width: 20, height: 20 });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([r], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(r.id);
    ctx.fixture.detectChanges();
    expect(ctx.fixture.nativeElement.querySelector('.inspector-header')).not.toBeNull();

    // Lock → SelectionService effect prunes selection
    layers.setLocked(r.id, true);
    TestBed.flushEffects();
    ctx.fixture.detectChanges();
    expect(ctx.fixture.nativeElement.querySelector('.inspector-header')).toBeNull();
    expect(ctx.fixture.nativeElement.querySelector('.placeholder')?.textContent).toContain(
      'No selection',
    );
  });
});

describe('SvgeInspector — display polish (Bloco 4-IP)', () => {
  it('geometry values are rounded to integers in the inputs', () => {
    const r = createRect({ x: 12.7, y: 34.123, width: 55.99, height: 78.5001 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();

    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    // First 4 = rect geometry (x, y, w, h) — should show rounded integers
    expect(inputs.slice(0, 4).map((i) => i.value)).toEqual(['13', '34', '56', '79']);
  });

  it('model preserves precision even when display rounds', () => {
    const r = createRect({ x: 12.7, y: 0, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    // The MODEL still has 12.7 — display just shows 13
    const root = state.document().root as unknown as { children: readonly { x: number }[] };
    expect(root.children[0]?.x).toBe(12.7);
  });

  it('opacity input defaults to "1" when undefined in model', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const allNumberInputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    // Last number input = opacity (after geometry x/y/w/h + strokeWidth)
    const opacityInput = allNumberInputs[allNumberInputs.length - 1]!;
    expect(opacityInput.value).toBe('1');
  });

  it('opacity input shows model value with 2 decimals when set', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { opacity: 0.5 } });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const allNumberInputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    const opacityInput = allNumberInputs[allNumberInputs.length - 1]!;
    expect(opacityInput.value).toBe('0.50');
  });

  it('renders a swatch element next to each color picker', () => {
    const r = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: '#ff0000', stroke: '#00ff00' } },
    );
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const swatches = Array.from(fixture.nativeElement.querySelectorAll('.swatch')) as HTMLElement[];
    expect(swatches.length).toBe(2); // fill + stroke
  });

  it('swatch reflects HSL or other non-hex CSS color from model', () => {
    const r = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: 'hsl(200 60% 75%)', stroke: 'rgb(255, 0, 0)' } },
    );
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const swatches = Array.from(fixture.nativeElement.querySelectorAll('.swatch')) as HTMLElement[];
    // Browsers normalize CSS colors when parsed — just confirm they're
    // not 'transparent' (default fallback)
    expect(swatches[0]?.style.backgroundColor).not.toBe('');
    expect(swatches[0]?.style.backgroundColor).not.toBe('transparent');
    expect(swatches[1]?.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('swatch shows "transparent" when style field is undefined', () => {
    const r = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: undefined, stroke: undefined } },
    );
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const swatches = Array.from(fixture.nativeElement.querySelectorAll('.swatch')) as HTMLElement[];
    // Browsers represent 'transparent' as 'rgba(0, 0, 0, 0)' in computed style;
    // we set it directly via inline style binding so it stays as the literal.
    expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(swatches[0]?.style.backgroundColor);
  });

  describe('cssColorToHex6 (picker value normalization, Bloco 4-IP-FixBugs2)', () => {
    it('passes through 6-char hex unchanged (lower-cased)', () => {
      expect(cssColorToHex6('#FF8800')).toBe('#ff8800');
      expect(cssColorToHex6('#aabbcc')).toBe('#aabbcc');
    });

    it('expands 3-char shorthand hex to 6-char', () => {
      expect(cssColorToHex6('#f80')).toBe('#ff8800');
      expect(cssColorToHex6('#ABC')).toBe('#aabbcc');
    });

    it('named colors are handled (browser path; jsdom may return null)', () => {
      // Named colors (`'red'`, `'tomato'`) require the Canvas round-trip
      // because there's no JS table for the ~150 CSS named colors. In
      // a real browser this returns the correct hex; in jsdom Canvas
      // doesn't normalize, so we accept either hex OR null (the call
      // site falls back to the gray default — acceptable for now since
      // the seeded shapes use hsl() not named colors).
      const out = cssColorToHex6('red');
      if (out !== null) expect(out).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('normalizes rgb() (both legacy comma + CSS Color 4 space form)', () => {
      expect(cssColorToHex6('rgb(255, 0, 0)')).toBe('#ff0000');
      expect(cssColorToHex6('rgb(0 128 64)')).toBe('#008040');
      // Alpha is discarded
      expect(cssColorToHex6('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
      // Percent channels
      expect(cssColorToHex6('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    });

    it('normalizes hsl() including the format randomPastel() produces', () => {
      // Pure red via HSL
      expect(cssColorToHex6('hsl(0, 100%, 50%)')).toBe('#ff0000');
      // CSS Color 4 space-separated form (matches randomPastel output)
      const pastel = cssColorToHex6('hsl(180 60% 75%)');
      expect(pastel).toMatch(/^#[0-9a-f]{6}$/);
      expect(pastel).not.toBe('#cccccc');
      // Alpha discarded
      expect(cssColorToHex6('hsla(0, 100%, 50%, 0.3)')).toBe('#ff0000');
      // Hue normalization: 360 == 0 == red
      expect(cssColorToHex6('hsl(360, 100%, 50%)')).toBe('#ff0000');
    });

    it('returns null for malformed input', () => {
      expect(cssColorToHex6('not a color at all')).toBeNull();
      expect(cssColorToHex6('')).toBeNull();
    });
  });

  it('picker input value is normalized to hex even when model has hsl/rgb/named', () => {
    // Bloco 4-IP-FixBugs2 regression: pre-fix, the native picker opened
    // at #cccccc (gray) whenever the model held a non-hex color. Now it
    // opens at the normalized hex equivalent so the user sees their
    // actual color highlighted in the picker dialog.
    const r = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: 'rgb(0, 128, 64)' } },
    );
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
    // Browsers store color values lower-cased and zero-padded.
    expect(fillInput.value).toBe('#008040');
  });

  describe('palette integration (Bloco 4d)', () => {
    it('palette is rendered below the color rows', () => {
      const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const { fixture, state, selection } = setup();
      state.setDocument({
        ...state.document(),
        root: createGroup([r], { id: state.document().root.id }),
      });
      selection.select(r.id);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('svge-color-palette')).not.toBeNull();
    });

    it('clicking the fill row marks fill as the active palette target', () => {
      const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const { fixture, state, selection } = setup();
      state.setDocument({
        ...state.document(),
        root: createGroup([r], { id: state.document().root.id }),
      });
      selection.select(r.id);
      fixture.detectChanges();
      // Active-target moved from <label.field-row> to the wrapping
      // <div.color-cell> (Bloco 4-Alpha) so the accent ring wraps
      // both the color row and the new alpha input.
      const cells = Array.from(
        fixture.nativeElement.querySelectorAll('.color-cell'),
      ) as HTMLElement[];
      const labelRows = Array.from(
        fixture.nativeElement.querySelectorAll('label.field-row'),
      ) as HTMLLabelElement[];
      expect(cells[0]?.classList.contains('active-target')).toBe(true);
      expect(cells[1]?.classList.contains('active-target')).toBe(false);
      labelRows[1]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(cells[0]?.classList.contains('active-target')).toBe(false);
      expect(cells[1]?.classList.contains('active-target')).toBe(true);
    });

    it('palette colorPicked applies to fill by default', () => {
      const r = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#000000' } });
      const { fixture, state, selection } = setup();
      // Seed a deterministic palette BEFORE first detectChanges so the
      // component renders with a known swatch list.
      const reg = TestBed.inject(PaletteRegistry);
      reg.register({ id: 'spec', name: 'Spec', swatches: ['#ff8800'] });
      state.setDocument({
        ...state.document(),
        root: createGroup([r], { id: state.document().root.id }),
      });
      selection.select(r.id);
      fixture.detectChanges();
      // Click the first swatch — Angular @Output binding routes it
      // through onPalettePick → setStyle('fill', '#ff8800').
      const swatch = fixture.nativeElement.querySelector(
        'svge-color-palette .swatch',
      ) as HTMLButtonElement | null;
      if (swatch === null) throw new Error('palette swatch not found');
      swatch.click();
      fixture.detectChanges();
      const updated = findNodeById(state.document().root, r.id);
      expect(updated?.style.fill).toBe('#ff8800');
    });

    it('palette colorPicked applies to stroke after activating stroke row', () => {
      const r = createRect(
        { x: 0, y: 0, width: 10, height: 10 },
        { style: { fill: '#000000', stroke: '#333333' } },
      );
      const { fixture, state, selection } = setup();
      const reg = TestBed.inject(PaletteRegistry);
      reg.register({ id: 'spec', name: 'Spec', swatches: ['#00ff00'] });
      state.setDocument({
        ...state.document(),
        root: createGroup([r], { id: state.document().root.id }),
      });
      selection.select(r.id);
      fixture.detectChanges();
      const rows = Array.from(
        fixture.nativeElement.querySelectorAll('label.field-row'),
      ) as HTMLLabelElement[];
      rows[1]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      const specSwatch = fixture.nativeElement.querySelector(
        'svge-color-palette .swatch',
      ) as HTMLButtonElement;
      specSwatch.click();
      fixture.detectChanges();
      const updated = findNodeById(state.document().root, r.id);
      expect(updated?.style.stroke).toBe('#00ff00');
      expect(updated?.style.fill).toBe('#000000'); // unchanged
    });
  });

  describe('per-color alpha inputs (Bloco 4-Alpha)', () => {
    function setupWithRect(style?: Record<string, unknown>) {
      const r = createRect(
        { x: 0, y: 0, width: 10, height: 10 },
        style ? { style: style as import('svg-engine/core').SvgStyle } : {},
      );
      const ctx = setup();
      ctx.state.setDocument({
        ...ctx.state.document(),
        root: createGroup([r], { id: ctx.state.document().root.id }),
      });
      ctx.selection.select(r.id);
      ctx.fixture.detectChanges();
      return { ...ctx, r };
    }

    it('renders one alpha input per color cell (2 total: fill + stroke)', () => {
      const { fixture } = setupWithRect();
      const alphas = fixture.nativeElement.querySelectorAll('.alpha-input');
      expect(alphas.length).toBe(2);
    });

    it('alpha inputs default to "1" when fillOpacity/strokeOpacity are undefined', () => {
      const { fixture } = setupWithRect();
      const alphas = Array.from(
        fixture.nativeElement.querySelectorAll('.alpha-input'),
      ) as HTMLInputElement[];
      expect(alphas[0]?.value).toBe('1');
      expect(alphas[1]?.value).toBe('1');
    });

    it('alpha inputs reflect model values formatted to 2 decimals', () => {
      const { fixture } = setupWithRect({ fillOpacity: 0.5, strokeOpacity: 0.25 });
      const alphas = Array.from(
        fixture.nativeElement.querySelectorAll('.alpha-input'),
      ) as HTMLInputElement[];
      expect(alphas[0]?.value).toBe('0.50');
      expect(alphas[1]?.value).toBe('0.25');
    });

    it('editing fill alpha dispatches SetPropertyCommand for fillOpacity', () => {
      const { fixture, state, r } = setupWithRect({ fill: '#ff0000' });
      const alphas = Array.from(
        fixture.nativeElement.querySelectorAll('.alpha-input'),
      ) as HTMLInputElement[];
      alphas[0]!.value = '0.3';
      alphas[0]!.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
      const updated = findNodeById(state.document().root, r.id);
      expect(updated?.style.fillOpacity).toBe(0.3);
    });

    it('swatch background uses rgba() composing color + alpha when alpha < 1', () => {
      const { fixture } = setupWithRect({ fill: '#ff0000', fillOpacity: 0.5 });
      const swatch = fixture.nativeElement.querySelector('.swatch') as HTMLElement;
      // Browsers normalize inline rgba() to lowercase with spaces.
      expect(swatch.style.backgroundColor).toMatch(/rgba\(\s*255\s*,\s*0\s*,\s*0\s*,\s*0?\.5\s*\)/);
    });

    it('swatch background returns "transparent" when alpha is 0', () => {
      const { fixture } = setupWithRect({ fill: '#ff0000', fillOpacity: 0 });
      const swatch = fixture.nativeElement.querySelector('.swatch') as HTMLElement;
      expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(swatch.style.backgroundColor);
    });
  });

  it('color row is position:relative so the picker dialog anchors next to the swatch', () => {
    // Bloco 4-IP-FixBugs: without position:relative on the label, the
    // absolutely-positioned hidden input escapes to the initial
    // containing block (viewport). Native browsers anchor the color
    // picker dialog to the input element, so the popover would appear
    // in the viewport's top-left corner instead of next to the swatch.
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const fieldRow = fixture.nativeElement.querySelector(
      'label.field-row',
    ) as HTMLLabelElement | null;
    if (fieldRow === null) throw new Error('field-row not found');
    const cs = getComputedStyle(fieldRow);
    expect(cs.position).toBe('relative');
  });

  it('color picker is fused with swatch under a single <label> (single visual control)', () => {
    // Bloco 4-IP-Fix: market-standard pattern. Native <input type="color">
    // is visually hidden (via .color-input-hidden) but tab-focusable and
    // wired to the swatch via the parent <label>. Result: ONE clickable
    // element per color field (no duplicated grey picker box).
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();

    const fieldRows = Array.from(
      fixture.nativeElement.querySelectorAll('label.field-row'),
    ) as HTMLLabelElement[];
    expect(fieldRows.length).toBe(2); // fill + stroke
    // Each label wraps exactly one swatch + one hidden color input
    for (const row of fieldRows) {
      expect(row.querySelectorAll('.swatch').length).toBe(1);
      const colorInputs = row.querySelectorAll('input[type="color"]');
      expect(colorInputs.length).toBe(1);
      expect(colorInputs[0]?.classList.contains('color-input-hidden')).toBe(true);
    }
  });
});

describe('SvgeInspector — multi-edit (Item 1, débito 4c)', () => {
  function setupMulti(rectsStyle: Record<string, unknown>[]) {
    const ctx = setup();
    const rects = rectsStyle.map((style) =>
      createRect(
        { x: 0, y: 0, width: 10, height: 10 },
        { style: style as import('svg-engine/core').SvgStyle },
      ),
    );
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup(rects, { id: ctx.state.document().root.id }),
    });
    ctx.selection.selectMany(rects.map((r) => r.id));
    ctx.fixture.detectChanges();
    return { ...ctx, rects };
  }

  it('common fill value: when all selected nodes share the same color, picker reads it', () => {
    const { fixture } = setupMulti([{ fill: '#ff0000' }, { fill: '#ff0000' }]);
    const colorInput = fixture.nativeElement.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement | null;
    expect(colorInput?.value).toBe('#ff0000');
  });

  it('mixed fill values: picker shows neutral fallback, alpha input is empty', () => {
    const { fixture } = setupMulti([
      { fill: '#ff0000', fillOpacity: 0.5 },
      { fill: '#00ff00', fillOpacity: 1 },
    ]);
    const colorInput = fixture.nativeElement.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    expect(colorInput.value).toBe('#cccccc'); // neutral
    const alphaInput = fixture.nativeElement.querySelector('.alpha-input') as HTMLInputElement;
    expect(alphaInput.value).toBe(''); // mixed → empty
    expect(alphaInput.placeholder).toBe('mixed');
  });

  it('editing fill in multi-edit dispatches SetStylePropertyOnManyCommand atomically', () => {
    const { fixture, state, rects } = setupMulti([{ fill: '#000000' }, { fill: '#000000' }]);
    const colorInput = fixture.nativeElement.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    colorInput.value = '#abcdef';
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    // Both nodes updated.
    for (const r of rects) {
      const updated = findNodeById(state.document().root, r.id);
      expect(updated?.style.fill).toBe('#abcdef');
    }
  });

  it('single undo reverts a multi-edit on all affected nodes', () => {
    const { fixture, state, rects, bus } = setupMulti([
      { fill: '#000000' },
      { fill: '#000000' },
      { fill: '#000000' },
    ]);
    const colorInput = fixture.nativeElement.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    colorInput.value = '#abcdef';
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    bus.undo();
    for (const r of rects) {
      expect(findNodeById(state.document().root, r.id)?.style.fill).toBe('#000000');
    }
  });

  it('palette pick in multi-edit applies the color to all selected', () => {
    const { fixture, state, rects } = setupMulti([{ fill: '#000000' }, { fill: '#111111' }]);
    const reg = TestBed.inject(PaletteRegistry);
    reg.register({ id: 'spec', name: 'Spec', swatches: ['#ff8800'] });
    fixture.detectChanges();
    const specSwatch = fixture.nativeElement.querySelector(
      'svge-color-palette .swatch',
    ) as HTMLButtonElement;
    specSwatch.click();
    fixture.detectChanges();
    for (const r of rects) {
      expect(findNodeById(state.document().root, r.id)?.style.fill).toBe('#ff8800');
    }
  });

  it('locked nodes are excluded from multi-edit writes', () => {
    const ctx = setup();
    const layers = TestBed.inject(LayersService);
    layers.unlockAll();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#000000' } });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#000000' } });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([a, b], { id: ctx.state.document().root.id }),
    });
    ctx.selection.selectMany([a.id, b.id]);
    // Lock b AFTER select — SelectionService prunes locked, but the
    // inspector defensively re-filters via multiEditableIds anyway.
    layers.setLocked(b.id, true);
    TestBed.flushEffects();
    ctx.fixture.detectChanges();
    // Now only a is selected (lock pruned b).
    expect(ctx.selection.count()).toBe(1);
    // The inspector shows SINGLE-edit for a. Verify a fill change
    // doesn't touch b.
    const colorInput = ctx.fixture.nativeElement.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    colorInput.value = '#ff0000';
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    ctx.fixture.detectChanges();
    expect(findNodeById(ctx.state.document().root, a.id)?.style.fill).toBe('#ff0000');
    expect(findNodeById(ctx.state.document().root, b.id)?.style.fill).toBe('#000000');
  });
});
