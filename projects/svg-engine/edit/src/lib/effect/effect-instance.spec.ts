import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  EditorStateService,
  InsertNodeCommand,
  type NodeId,
} from '@mosaicoo/svg-engine/core';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import { builtinEffectsPlugin } from './builtin-effects.plugin';
import {
  encodeEffectFilterId,
  extractEffectFilterId,
  PARAM_FILTER_ID_PREFIX,
  ParametricEffectRegistry,
  parseEffectFilterId,
  type EffectInstance,
} from './effect-instance';

describe('effect-instance — id encode/parse', () => {
  it('round-trips a single instance with params', () => {
    const instances: EffectInstance[] = [
      { effectId: 'svge.builtin.effect.blur', params: { radius: 8 } },
    ];
    const id = encodeEffectFilterId(instances);
    expect(id.startsWith(PARAM_FILTER_ID_PREFIX)).toBe(true);
    expect(parseEffectFilterId(id)).toEqual(instances);
  });

  it('round-trips a multi-effect parametric pipeline', () => {
    const instances: EffectInstance[] = [
      { effectId: 'svge.builtin.effect.blur', params: { radius: 2 } },
      { effectId: 'svge.builtin.effect.drop-shadow', params: { color: '#ff0000', opacity: 0.8 } },
    ];
    expect(parseEffectFilterId(encodeEffectFilterId(instances))).toEqual(instances);
  });

  it('omits the params key when empty (compact, params-less entry)', () => {
    const parsed = parseEffectFilterId(
      encodeEffectFilterId([{ effectId: 'svge.builtin.effect.blur', params: {} }]),
    );
    expect(parsed).toEqual([{ effectId: 'svge.builtin.effect.blur' }]);
  });

  it('produces an XML-id-safe id (only [A-Za-z0-9-_])', () => {
    const id = encodeEffectFilterId([
      { effectId: 'svge.builtin.effect.drop-shadow', params: { color: '#abcdef', offsetX: -3 } },
    ]);
    expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
  });

  it('parseEffectFilterId returns null for non-parametric and malformed ids', () => {
    expect(parseEffectFilterId('svge.builtin.effect.blur')).toBeNull();
    expect(parseEffectFilterId('svge-chain-a__b')).toBeNull();
    expect(parseEffectFilterId(`${PARAM_FILTER_ID_PREFIX}@@@not-base64@@@`)).toBeNull();
  });

  it('extractEffectFilterId pulls the id out of url(#...) only for parametric ids', () => {
    const id = encodeEffectFilterId([
      { effectId: 'svge.builtin.effect.blur', params: { radius: 5 } },
    ]);
    expect(extractEffectFilterId(`url(#${id})`)).toBe(id);
    expect(extractEffectFilterId('url(#svge.builtin.effect.blur)')).toBeNull();
    expect(extractEffectFilterId(undefined)).toBeNull();
  });
});

describe('ParametricEffectRegistry — derives instance filters from the document', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(builtinEffectsPlugin)],
    });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const bus = TestBed.inject(CommandBus);
    const reg = TestBed.inject(ParametricEffectRegistry);
    return { state, bus, reg };
  }

  function addRectWithFilter(bus: CommandBus, state: EditorStateService, filter: string): NodeId {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: '#000', filter } },
    );
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    return rect.id;
  }

  it('is empty when no node references a parametric instance', () => {
    const { reg } = setup();
    expect(reg.activeInstances()).toEqual([]);
    expect(reg.buildAllInstancesMarkup()).toBe('');
  });

  it('builds the composed <filter> with the custom param value baked in', () => {
    const { state, bus, reg } = setup();
    const id = encodeEffectFilterId([
      { effectId: 'svge.builtin.effect.blur', params: { radius: 8 } },
    ]);
    addRectWithFilter(bus, state, `url(#${id})`);
    const markup = reg.buildAllInstancesMarkup();
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain('stdDeviation="8"'); // custom radius, not the default 3
    // D-145 regression: a single parametric instance must output RGBA, not the
    // alpha-only silhouette (that bug made every customized shape render black).
    const lastPrimitive = markup.slice(markup.lastIndexOf('<fe'));
    expect(lastPrimitive).not.toContain('0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0');
  });

  it('deduplicates identical instances referenced by multiple nodes', () => {
    const { state, bus, reg } = setup();
    const id = encodeEffectFilterId([
      { effectId: 'svge.builtin.effect.blur', params: { radius: 6 } },
    ]);
    addRectWithFilter(bus, state, `url(#${id})`);
    addRectWithFilter(bus, state, `url(#${id})`);
    expect(reg.activeInstances()).toEqual([id]);
  });

  it('skips instances whose effect is not registered (defensive)', () => {
    const { state, bus, reg } = setup();
    const id = encodeEffectFilterId([{ effectId: 'no.such.effect', params: { x: 1 } }]);
    addRectWithFilter(bus, state, `url(#${id})`);
    expect(reg.activeInstances()).toEqual([]);
    expect(reg.buildAllInstancesMarkup()).toBe('');
  });

  it('ignores plain single-effect and chain filter URLs', () => {
    const { state, bus, reg } = setup();
    addRectWithFilter(bus, state, 'url(#svge.builtin.effect.blur)');
    addRectWithFilter(
      bus,
      state,
      'url(#svge-chain-svge.builtin.effect.blur__svge.builtin.effect.sepia)',
    );
    expect(reg.activeInstances()).toEqual([]);
  });
});
