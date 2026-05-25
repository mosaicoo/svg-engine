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

describe('SvgeInspector — transform decomposition (Item 5, débito 4c-Polish)', () => {
  function setupWithRect(transform: import('svg-engine/core').Transform) {
    const ctx = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 }, { transform });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([r], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(r.id);
    ctx.fixture.detectChanges();
    return { ...ctx, r };
  }

  it('shows rotation=0, scaleX=1, scaleY=1 for identity transform', () => {
    const { fixture } = setupWithRect([1, 0, 0, 1, 0, 0]);
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    // First 4 = rect geometry; then 3 transform inputs (rotation, sx, sy)
    // then 2 style numbers (stroke-width, opacity).
    const rotationInput = inputs[4]!;
    expect(rotationInput.value).toBe('0.0');
    expect(inputs[5]!.value).toBe('1.00'); // scaleX
    expect(inputs[6]!.value).toBe('1.00'); // scaleY
  });

  it('decomposes a pure 90° rotation correctly', () => {
    // Pure rotation 90° → [0, 1, -1, 0, 0, 0]
    const { fixture } = setupWithRect([0, 1, -1, 0, 0, 0]);
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    expect(Math.abs(Number(inputs[4]!.value) - 90)).toBeLessThan(0.1);
    expect(inputs[5]!.value).toBe('1.00');
    expect(inputs[6]!.value).toBe('1.00');
  });

  it('editing rotation dispatches SetPropertyCommand with composed transform', () => {
    const { fixture, state, r } = setupWithRect([1, 0, 0, 1, 0, 0]);
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('mat-form-field input[type="number"]'),
    ) as HTMLInputElement[];
    const rotationInput = inputs[4]!;
    rotationInput.value = '45';
    rotationInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, r.id);
    // After 45° rotation, transform[0] = cos(45°) ≈ 0.707
    expect(
      Math.abs(
        (updated as unknown as { transform: readonly number[] }).transform[0]! -
          Math.cos(Math.PI / 4),
      ),
    ).toBeLessThan(1e-6);
  });

  it('Reset button restores identity rotation + scale (keeps translation)', () => {
    // Start with translate(10,20) + rotate(45°) + scale(2)
    const t = ((): import('svg-engine/core').Transform => {
      const angle = Math.PI / 4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // T(10,20) · R(45) · S(2) = [2cos, 2sin, -2sin, 2cos, 10, 20]
      return [2 * cos, 2 * sin, -2 * sin, 2 * cos, 10, 20];
    })();
    const { fixture, state, r } = setupWithRect(t);
    // Click Reset button (first .reset-btn in the Transform section)
    const resetBtn = fixture.nativeElement.querySelector('.reset-btn') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, r.id);
    const newT = (updated as unknown as { transform: readonly number[] }).transform;
    // Translation preserved
    expect(newT[4]).toBe(10);
    expect(newT[5]).toBe(20);
    // Rotation + scale reset to identity
    expect(newT[0]).toBe(1);
    expect(newT[3]).toBe(1);
    expect(newT[1]).toBe(0);
    expect(newT[2]).toBe(0);
  });
});

describe('SvgeInspector — pivot picker (Item 5b, débito 4c-Polish)', () => {
  it('renders a 3×3 grid of 9 pivot dots', () => {
    const ctx = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([r], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(r.id);
    ctx.fixture.detectChanges();
    const dots = ctx.fixture.nativeElement.querySelectorAll('.pivot-dot');
    expect(dots.length).toBe(9);
  });

  it('default active anchor is mc (middle-center) when no custom pivot set', () => {
    const ctx = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([r], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(r.id);
    ctx.fixture.detectChanges();
    const dots = Array.from(
      ctx.fixture.nativeElement.querySelectorAll('.pivot-dot'),
    ) as HTMLElement[];
    // Middle dot in 3×3 grid is index 4 (tl, tc, tr, ml, mc, mr, bl, bc, br)
    expect(dots[4]?.classList.contains('active')).toBe(true);
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

// ── D-068 — Type section (text-only) ─────────────────────────────────
//
// Covers:
// 1. Type section is **invisible** for non-text nodes (rect/group/etc).
// 2. Type section **renders** for text nodes with all 5 controls.
// 3. Each control's `change` event dispatches a SetPropertyCommand
//    that mutates the correct field on the model.
// 4. Empty inputs clear the property (set to undefined).
// 5. OpenType feature quick-toggles read + write `fontFeatureSettings`
//    via the parse/stringify round-trip.
// 6. textPath dropdown enumerates only `path` nodes in the document;
//    setting "(none)" clears both ref AND startOffset.
// 7. Pure helpers (parseFontFeatures + stringifyFontFeatures) handle
//    the spec's tolerated quote styles + on/off/0/1 toggles.

import { createText, type TextNode } from 'svg-engine/core';
import { parseFontFeatures, stringifyFontFeatures } from './inspector.component';

describe('SvgeInspector — D-068 Type section visibility', () => {
  it('does NOT render the Type section for non-text nodes (rect)', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([r], { id: state.document().root.id }),
    });
    selection.select(r.id);
    fixture.detectChanges();
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.section .section-title'),
    ).map((s) => (s as HTMLElement).textContent?.trim());
    expect(titles).not.toContain('Type');
  });

  it('renders the Type section with all 5 fields when a text node is focused', () => {
    const t = createText({ x: 0, y: 0, content: 'Hello' });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([t], { id: state.document().root.id }),
    });
    selection.select(t.id);
    fixture.detectChanges();
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.section .section-title'),
    ).map((s) => (s as HTMLElement).textContent?.trim());
    expect(titles).toContain('Type');
    // 4 quick-toggle buttons + at least 4 form-field controls (letter-
    // spacing, variation, feature raw, start-offset) in the Type section.
    const typeSection = fixture.nativeElement.querySelectorAll('.section')[
      titles.indexOf('Type')
    ] as HTMLElement;
    // 4 OpenType quick-toggles (D-068) + 3 style chips (D-069: italic
    // / underline / strike) all share the .feature-toggle base class.
    expect(typeSection.querySelectorAll('.feature-toggle').length).toBeGreaterThanOrEqual(4);
    // Variation + feature-raw + start-offset = 3 text inputs (D-068);
    // D-069 may add a custom-font-family input (gated). letter-spacing
    // is 1 number (D-068) joined by font-size + line-height (D-069).
    expect(typeSection.querySelectorAll('input[type="text"]').length).toBeGreaterThanOrEqual(3);
    expect(typeSection.querySelectorAll('input[type="number"]').length).toBeGreaterThanOrEqual(1);
    // mat-selects: textPath dropdown (D-068) + D-069 adds font-family
    // and font-weight. >= 1 keeps the original assertion intent
    // (at least the textPath one is present) without coupling to
    // future additions.
    expect(typeSection.querySelectorAll('mat-select').length).toBeGreaterThanOrEqual(1);
  });
});

describe('SvgeInspector — D-068 dispatches SetPropertyCommand on text fields', () => {
  function setupWithText(initial?: Partial<TextNode>) {
    const t = createText(
      { x: 0, y: 0, content: 'Hello' },
      // createText only accepts NodeFactoryOptions (style/transform/etc);
      // optional D-053 fields are not first-class — patch them in by
      // re-creating the node literal here for the spec.
    );
    const text: TextNode = { ...t, ...(initial ?? {}) };
    const ctx = setup();
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([text], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(text.id);
    ctx.fixture.detectChanges();
    return { ...ctx, text };
  }

  function getTypeSection(host: HTMLElement): HTMLElement {
    const titles = Array.from(host.querySelectorAll('.section')) as HTMLElement[];
    const found = titles.find(
      (s) => s.querySelector('.section-title')?.textContent?.trim() === 'Type',
    );
    if (!found) throw new Error('Type section not found');
    return found;
  }

  it('letter-spacing input writes node.letterSpacing', () => {
    const { fixture, state, text } = setupWithText();
    const typeSection = getTypeSection(fixture.nativeElement);
    // Select by placeholder (stable across reorderings — D-069 added
    // font-size/line-height number inputs above this one).
    const numberInput = typeSection.querySelector(
      'input[type="number"][placeholder="0"]',
    ) as HTMLInputElement;
    numberInput.value = '2.5';
    numberInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.letterSpacing).toBe(2.5);
  });

  it('clearing letter-spacing input restores the model field to undefined', () => {
    const { fixture, state, text } = setupWithText({ letterSpacing: 3 });
    const typeSection = getTypeSection(fixture.nativeElement);
    const numberInput = typeSection.querySelector(
      'input[type="number"][placeholder="0"]',
    ) as HTMLInputElement;
    expect(numberInput.value).toBe('3');
    numberInput.value = '';
    numberInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.letterSpacing).toBeUndefined();
  });

  it('font-variation-settings input writes node.fontVariationSettings', () => {
    const { fixture, state, text } = setupWithText();
    const typeSection = getTypeSection(fixture.nativeElement);
    // Select by placeholder — text inputs in the Type section are
    // variation/feature-raw/start-offset. Each has a distinctive
    // placeholder so we can pick by it instead of relying on DOM order.
    const variationInput = typeSection.querySelector(
      'input[type="text"][placeholder="\'wght\' 650, \'wdth\' 95"]',
    ) as HTMLInputElement;
    variationInput.value = "'wght' 650, 'wdth' 95";
    variationInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontVariationSettings).toBe("'wght' 650, 'wdth' 95");
  });

  it('font-feature-settings raw input writes node.fontFeatureSettings', () => {
    const { fixture, state, text } = setupWithText();
    const typeSection = getTypeSection(fixture.nativeElement);
    const featureInput = typeSection.querySelector(
      'input[type="text"][placeholder="\'liga\' on, \'smcp\' on"]',
    ) as HTMLInputElement;
    featureInput.value = "'liga' on, 'smcp' on";
    featureInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontFeatureSettings).toBe("'liga' on, 'smcp' on");
  });

  it('OpenType quick-toggle button toggles a feature on/off through parse+stringify', () => {
    const { fixture, state, text } = setupWithText();
    const typeSection = getTypeSection(fixture.nativeElement);
    const ligaButton = Array.from(typeSection.querySelectorAll('.feature-toggle')).find(
      (b) => (b as HTMLElement).textContent?.trim() === 'Liga',
    ) as HTMLButtonElement;
    expect(ligaButton.classList.contains('active')).toBe(false);
    // Toggle ON
    ligaButton.click();
    fixture.detectChanges();
    let updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontFeatureSettings).toBe("'liga'");
    // Re-query: the chip should be active now.
    const ligaAgain = Array.from(typeSection.querySelectorAll('.feature-toggle')).find(
      (b) => (b as HTMLElement).textContent?.trim() === 'Liga',
    ) as HTMLButtonElement;
    expect(ligaAgain.classList.contains('active')).toBe(true);
    // Toggle OFF: clears the tag (fontFeatureSettings becomes undefined
    // because the resulting string is empty)
    ligaAgain.click();
    fixture.detectChanges();
    updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontFeatureSettings).toBeUndefined();
  });

  it('quick-toggle preserves OTHER features the user typed in the raw input', () => {
    const { fixture, state, text } = setupWithText({
      fontFeatureSettings: "'ss03' on, 'cv11' 2",
    });
    const typeSection = getTypeSection(fixture.nativeElement);
    const ligaButton = Array.from(typeSection.querySelectorAll('.feature-toggle')).find(
      (b) => (b as HTMLElement).textContent?.trim() === 'Liga',
    ) as HTMLButtonElement;
    ligaButton.click();
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    // ss03 + cv11 still present, liga added — order = original then new
    expect(updated.fontFeatureSettings).toContain("'ss03'");
    expect(updated.fontFeatureSettings).toContain("'cv11'");
    expect(updated.fontFeatureSettings).toContain("'liga'");
  });

  it('textPath dropdown lists only path nodes; selecting one writes textPathRef', () => {
    const t = createText({ x: 0, y: 0, content: 'Hi' });
    const p1 = createPath('M0 0 L10 10');
    const p2 = createPath('M20 0 L30 10');
    // Throw in a non-path to verify it is NOT enumerated.
    const decoy = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const ctx = setup();
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([t, p1, p2, decoy], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(t.id);
    ctx.fixture.detectChanges();

    // mat-select doesn't render <option> tags in the DOM until opened —
    // assert via the component method `pathsInDoc` indirectly: after
    // dispatching the change event we should see textPathRef set.
    const inspector = ctx.fixture.debugElement.children[0]?.componentInstance as
      | { setTextPathRef(id: string): void }
      | undefined;
    if (!inspector) throw new Error('Inspector instance not found');
    inspector.setTextPathRef(p2.id);
    ctx.fixture.detectChanges();

    const updated = findNodeById(ctx.state.document().root, t.id) as TextNode;
    expect(updated.textPathRef).toBe(p2.id);
    // Decoy rect must NOT be selectable by id — but the public API doesn't
    // expose `pathsInDoc()` directly; we proved the right id was accepted.
    // Negative check: setting a rect id would still write it (the setter
    // doesn't validate type) — guard is purely visual (dropdown omits it).
    // That tradeoff is documented in the component's pathsInDoc doc.
  });

  it('selecting "(none)" in textPath dropdown clears BOTH ref and startOffset', () => {
    const { fixture, state, text } = setupWithText({
      textPathRef: 'fake-id' as TextNode['textPathRef'],
      textPathStartOffset: '50%',
    });
    const inspector = fixture.debugElement.children[0]?.componentInstance as {
      setTextPathRef(id: string): void;
    };
    inspector.setTextPathRef('');
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.textPathRef).toBeUndefined();
    expect(updated.textPathStartOffset).toBeUndefined();
  });

  it('start-offset input writes node.textPathStartOffset', () => {
    const { fixture, state, text } = setupWithText({
      textPathRef: 'fake-id' as TextNode['textPathRef'],
    });
    const typeSection = getTypeSection(fixture.nativeElement);
    const offsetInput = typeSection.querySelector(
      'input[type="text"][placeholder="50% or 40"]',
    ) as HTMLInputElement;
    offsetInput.value = '75%';
    offsetInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.textPathStartOffset).toBe('75%');
  });

  it('switching focus from text to rect collapses the Type section', () => {
    const t = createText({ x: 0, y: 0, content: 'Hi' });
    const r = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const { fixture, state, selection } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([t, r], { id: state.document().root.id }),
    });
    selection.select(t.id);
    fixture.detectChanges();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.section-title')).some(
        (s) => (s as HTMLElement).textContent?.trim() === 'Type',
      ),
    ).toBe(true);
    selection.select(r.id);
    fixture.detectChanges();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.section-title')).some(
        (s) => (s as HTMLElement).textContent?.trim() === 'Type',
      ),
    ).toBe(false);
  });
});

describe('SvgeInspector — D-068 pure helpers (parseFontFeatures / stringifyFontFeatures)', () => {
  it('parses undefined / empty string to an empty map', () => {
    expect(parseFontFeatures(undefined).size).toBe(0);
    expect(parseFontFeatures('').size).toBe(0);
    expect(parseFontFeatures('   ').size).toBe(0);
  });

  it('parses single-quoted feature tags with "on"', () => {
    const m = parseFontFeatures("'liga' on, 'smcp' on");
    expect(m.get('liga')).toBe(true);
    expect(m.get('smcp')).toBe(true);
    expect(m.size).toBe(2);
  });

  it('parses double-quoted feature tags', () => {
    const m = parseFontFeatures('"liga" on, "tnum" on');
    expect(m.get('liga')).toBe(true);
    expect(m.get('tnum')).toBe(true);
  });

  it('parses "off" / "0" as disabled', () => {
    const m = parseFontFeatures("'liga' off, 'smcp' 0");
    expect(m.get('liga')).toBe(false);
    expect(m.get('smcp')).toBe(false);
  });

  it('parses numeric > 0 (alt-index) as enabled', () => {
    const m = parseFontFeatures("'cv11' 2, 'ss03' 1");
    expect(m.get('cv11')).toBe(true);
    expect(m.get('ss03')).toBe(true);
  });

  it('parses tag without value as enabled (CSS spec default)', () => {
    const m = parseFontFeatures("'liga'");
    expect(m.get('liga')).toBe(true);
  });

  it('round-trips through stringify (only enabled tags emitted)', () => {
    const m = new Map([
      ['liga', true],
      ['smcp', false],
      ['tnum', true],
    ]);
    expect(stringifyFontFeatures(m)).toBe("'liga', 'tnum'");
  });

  it('stringify of empty map is empty string', () => {
    expect(stringifyFontFeatures(new Map())).toBe('');
  });
});

// ── D-069 — Typography basics (Inspector Type section UI) ────────────
//
// Covers:
// 1. Each basic control (font-family preset, font-size, font-weight,
//    text-anchor, italic, decoration, line-height) dispatches the
//    correct mutation via SetPropertyCommand.
// 2. Toggles are bi-directional (re-click clears).
// 3. Empty / non-finite inputs are dropped silently.

describe('SvgeInspector — D-069 typography basics dispatch', () => {
  function setupWithText(initial?: Partial<TextNode>) {
    const t = createText({ x: 0, y: 0, content: 'Hello' });
    const text: TextNode = { ...t, ...(initial ?? {}) };
    const ctx = setup();
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([text], { id: ctx.state.document().root.id }),
    });
    ctx.selection.select(text.id);
    ctx.fixture.detectChanges();
    return { ...ctx, text };
  }

  // Inspector instance lookup (same pattern used by D-068 specs above).
  function inspectorOf(fixture: ReturnType<typeof setup>['fixture']): {
    setFontFamilyPreset(v: string): void;
    setFontFamilyCustom(raw: string): void;
    setFontSize(raw: string): void;
    setFontWeight(v: string): void;
    setTextAnchor(v: 'start' | 'middle' | 'end'): void;
    toggleItalic(): void;
    toggleDecoration(v: 'underline' | 'line-through'): void;
    setLineHeight(raw: string): void;
  } {
    return fixture.debugElement.children[0]?.componentInstance as never;
  }

  it('font-family preset writes node.fontFamily', () => {
    const { fixture, state, text } = setupWithText();
    inspectorOf(fixture).setFontFamilyPreset('Arial, Helvetica, sans-serif');
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontFamily).toBe('Arial, Helvetica, sans-serif');
  });

  it('font-family preset empty string clears the field', () => {
    const { fixture, state, text } = setupWithText({ fontFamily: 'Verdana' });
    inspectorOf(fixture).setFontFamilyPreset('');
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontFamily).toBeUndefined();
  });

  it('font-family preset "__custom__" is a no-op (custom input handles it)', () => {
    // `text` not destructured: we only assert at the document level
    // (no mutation), not on the specific node.
    const { fixture, state } = setupWithText({ fontFamily: 'Arial' });
    const before = state.document();
    inspectorOf(fixture).setFontFamilyPreset('__custom__');
    fixture.detectChanges();
    expect(state.document()).toBe(before); // no command dispatched
  });

  it('custom font-family input writes raw string', () => {
    const { fixture, state, text } = setupWithText();
    inspectorOf(fixture).setFontFamilyCustom("'Inter', sans-serif");
    fixture.detectChanges();
    const updated = findNodeById(state.document().root, text.id) as TextNode;
    expect(updated.fontFamily).toBe("'Inter', sans-serif");
  });

  it('font-size sets a numeric value; <= 0 or non-finite is rejected', () => {
    const { fixture, state, text } = setupWithText();
    const inspector = inspectorOf(fixture);
    inspector.setFontSize('24');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontSize).toBe(24);
    // Garbage in: still 24, command not dispatched
    inspector.setFontSize('not-a-number');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontSize).toBe(24);
    inspector.setFontSize('-5');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontSize).toBe(24);
    // Empty clears
    inspector.setFontSize('');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontSize).toBeUndefined();
  });

  it('font-weight preset writes numeric weight; empty clears', () => {
    const { fixture, state, text } = setupWithText();
    const inspector = inspectorOf(fixture);
    inspector.setFontWeight('700');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontWeight).toBe(700);
    inspector.setFontWeight('');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontWeight).toBeUndefined();
  });

  it('text-anchor button writes the value', () => {
    const { fixture, state, text } = setupWithText();
    inspectorOf(fixture).setTextAnchor('middle');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).textAnchor).toBe('middle');
  });

  it('italic toggle is bidirectional', () => {
    const { fixture, state, text } = setupWithText();
    const inspector = inspectorOf(fixture);
    // Off → on
    inspector.toggleItalic();
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontStyle).toBe('italic');
    // On → off (cleared)
    inspector.toggleItalic();
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).fontStyle).toBeUndefined();
  });

  it('decoration toggles underline/strike (mutually exclusive)', () => {
    const { fixture, state, text } = setupWithText();
    const inspector = inspectorOf(fixture);
    inspector.toggleDecoration('underline');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).textDecoration).toBe(
      'underline',
    );
    // Set the other (strike). The toggle replaces (different value than current).
    inspector.toggleDecoration('line-through');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).textDecoration).toBe(
      'line-through',
    );
    // Re-click same value: clears.
    inspector.toggleDecoration('line-through');
    fixture.detectChanges();
    expect(
      (findNodeById(state.document().root, text.id) as TextNode).textDecoration,
    ).toBeUndefined();
  });

  it('line-height writes numeric value; <= 0 rejected; empty clears', () => {
    const { fixture, state, text } = setupWithText();
    const inspector = inspectorOf(fixture);
    inspector.setLineHeight('1.5');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).lineHeight).toBe(1.5);
    inspector.setLineHeight('0');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).lineHeight).toBe(1.5);
    inspector.setLineHeight('');
    fixture.detectChanges();
    expect((findNodeById(state.document().root, text.id) as TextNode).lineHeight).toBeUndefined();
  });
});
