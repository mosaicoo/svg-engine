import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  EditorStateService,
  findNodeById,
  HistoryService,
  InsertNodeCommand,
  type NodeId,
} from '@mosaicoo/svg-engine/core';
import {
  builtinEffectsPlugin,
  parseEffectFilterId,
  provideSvgEnginePlugin,
  SelectionService,
} from '@mosaicoo/svg-engine/edit';
import { SvgeEffectsPanel } from './effects-panel.component';

const BLUR = 'svge.builtin.effect.blur';
const SEPIA = 'svge.builtin.effect.sepia';

@Component({
  standalone: true,
  imports: [SvgeEffectsPanel],
  template: `<svge-effects-panel></svge-effects-panel>`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({
    imports: [TestHost],
    providers: [provideSvgEnginePlugin(builtinEffectsPlugin)],
  });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const selection = TestBed.inject(SelectionService);
  selection.clear();
  TestBed.inject(HistoryService).clear();
  const bus = TestBed.inject(CommandBus);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, state, selection, bus, host };
}

function addAndSelectRect(
  bus: CommandBus,
  state: EditorStateService,
  selection: SelectionService,
): NodeId {
  const rect = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#000' } });
  bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
  selection.select(rect.id);
  return rect.id;
}

function filterOf(state: EditorStateService, id: NodeId): string | undefined {
  return findNodeById(state.document().root, id)?.style.filter;
}

/**
 * Add an effect via the picker chip whose label matches `name`. The picker
 * is collapsed by default (D-146 accordion), so open it first.
 */
function clickChip(fixture: { nativeElement: unknown; detectChanges(): void }, name: string): void {
  const host = fixture.nativeElement as HTMLElement;
  const toggle = host.querySelector<HTMLButtonElement>('.add-toggle');
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') {
    toggle.click();
    fixture.detectChanges();
  }
  const chip = Array.from(host.querySelectorAll<HTMLButtonElement>('.chip')).find(
    (b) => b.textContent?.includes(name) && !b.disabled,
  );
  if (!chip) throw new Error(`picker chip "${name}" not found / disabled`);
  chip.click();
  fixture.detectChanges();
}

describe('SvgeEffectsPanel — selection gating', () => {
  it('prompts to select a node when nothing is selected', () => {
    const { host } = setup();
    expect(host.querySelector('.empty')?.textContent).toContain('Select a node');
    expect(host.querySelector('.pipeline')).toBeNull();
  });

  it('shows a collapsed picker once a node is selected; opens on demand', () => {
    const { fixture, host, state, selection, bus } = setup();
    addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    const toggle = host.querySelector<HTMLButtonElement>('.add-toggle');
    expect(toggle).not.toBeNull();
    expect(host.querySelectorAll('.chip').length).toBe(0); // collapsed by default
    toggle!.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.chip').length).toBeGreaterThan(0);
    expect(host.querySelector('.pipeline')).toBeNull(); // none applied yet
  });
});

describe('SvgeEffectsPanel — applying effects', () => {
  it('adding an effect writes a plain url(#effectId) filter (compat)', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();
    expect(filterOf(state, id)).toBe(`url(#${BLUR})`);
    // pipeline now renders one stage with the blur radius control.
    expect(host.querySelectorAll('.pipeline-item').length).toBe(1);
    expect(host.querySelector('.param-range')).not.toBeNull();
  });

  it('adding two effects (defaults) writes a chain url, not a parametric id', () => {
    const { fixture, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();
    clickChip(fixture, 'Sepia');
    fixture.detectChanges();
    const filter = filterOf(state, id)!;
    expect(filter).toContain('url(#svge-chain-');
    expect(filter).toContain(BLUR);
    expect(filter).toContain(SEPIA);
  });

  it('editing a param switches the node to a parametric svge-fx- id', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();

    const number = host.querySelector<HTMLInputElement>('.param-number')!;
    number.value = '12';
    number.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const filter = filterOf(state, id)!;
    const m = /^url\(#(.+)\)$/.exec(filter)!;
    const instances = parseEffectFilterId(m[1]!);
    expect(instances).toEqual([{ effectId: BLUR, params: { radius: 12 } }]);
  });

  it('applying a preset bakes the preset params into the id', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();

    const strong = Array.from(host.querySelectorAll<HTMLButtonElement>('.preset-chip')).find((b) =>
      b.textContent?.includes('Strong'),
    )!;
    strong.click();
    fixture.detectChanges();

    const m = /^url\(#(.+)\)$/.exec(filterOf(state, id)!)!;
    expect(parseEffectFilterId(m[1]!)).toEqual([{ effectId: BLUR, params: { radius: 8 } }]);
  });

  it('resetting params returns to the plain url(#effectId) reference', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();

    // customise → parametric, then Reset → plain.
    const number = host.querySelector<HTMLInputElement>('.param-number')!;
    number.value = '20';
    number.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(filterOf(state, id)).toContain('svge-fx-');

    const reset = host.querySelector<HTMLButtonElement>('.preset-chip.reset')!;
    reset.click();
    fixture.detectChanges();
    expect(filterOf(state, id)).toBe(`url(#${BLUR})`);
  });

  it('removing the only effect clears the filter (undefined)', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('.step-btn-remove')!.click();
    fixture.detectChanges();
    expect(filterOf(state, id)).toBeUndefined();
    expect(host.querySelector('.pipeline')).toBeNull();
  });
});

describe('SvgeEffectsPanel — undo integration', () => {
  it('a param edit is a single undoable command', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();

    const number = host.querySelector<HTMLInputElement>('.param-number')!;
    number.value = '7';
    number.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(filterOf(state, id)).toContain('svge-fx-');

    bus.undo(); // back to plain blur reference
    expect(filterOf(state, id)).toBe(`url(#${BLUR})`);
  });
});

describe('SvgeEffectsPanel — mute / enable toggle (D-146)', () => {
  function muteButton(host: HTMLElement): HTMLButtonElement {
    const btn = host.querySelector<HTMLButtonElement>(
      '.step-actions button[aria-label^="Disable"], .step-actions button[aria-label^="Enable"]',
    );
    if (!btn) throw new Error('mute toggle not found');
    return btn;
  }

  it('muting an effect encodes enabled:false (parametric id) without removing it', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();
    expect(filterOf(state, id)).toBe(`url(#${BLUR})`);

    muteButton(host).click(); // disable
    fixture.detectChanges();

    const m = /^url\(#(.+)\)$/.exec(filterOf(state, id)!)!;
    expect(parseEffectFilterId(m[1]!)).toEqual([{ effectId: BLUR, enabled: false }]);
    // still in the pipeline (slot kept, just muted)
    expect(host.querySelectorAll('.pipeline-item').length).toBe(1);
    expect(host.querySelector('.pipeline-item.muted')).not.toBeNull();
  });

  it('unmuting restores the plain url(#effectId) reference', () => {
    const { fixture, host, state, selection, bus } = setup();
    const id = addAndSelectRect(bus, state, selection);
    fixture.detectChanges();
    clickChip(fixture, 'Blur');
    fixture.detectChanges();

    muteButton(host).click(); // disable → svge-fx-
    fixture.detectChanges();
    expect(filterOf(state, id)).toContain('svge-fx-');

    muteButton(host).click(); // enable → plain
    fixture.detectChanges();
    expect(filterOf(state, id)).toBe(`url(#${BLUR})`);
  });
});
