import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  EditorStateService,
  InsertNodeCommand,
  SetStylePropertyOnManyCommand,
  type NodeId,
} from '@mosaicoo/svg-engine/core';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import { builtinEffectsPlugin } from './builtin-effects.plugin';
import {
  CHAIN_FILTER_ID_PREFIX,
  CHAIN_FILTER_SEPARATOR,
  ChainFilterRegistry,
  composeChainFilter,
  extractChainFilterId,
  makeChainFilterId,
  parseChainFilterId,
} from './chain-filter';
import { EffectRegistry } from './effect-registry.service';
import type { Effect } from './effect';

function mkEffect(id: string, body: string): Effect {
  return {
    id,
    name: `Effect ${id}`,
    buildFilterMarkup: () => `<filter id="${id}">${body}</filter>`,
  };
}

describe('chain-filter — id helpers', () => {
  it('makeChainFilterId joins effect ids with the separator and prefix', () => {
    const id = makeChainFilterId(['a', 'b', 'c']);
    expect(id).toBe(
      `${CHAIN_FILTER_ID_PREFIX}a${CHAIN_FILTER_SEPARATOR}b${CHAIN_FILTER_SEPARATOR}c`,
    );
  });

  it('parseChainFilterId reverses makeChainFilterId', () => {
    const ids = ['svge.builtin.effect.blur', 'svge.builtin.effect.drop-shadow'];
    const parsed = parseChainFilterId(makeChainFilterId(ids));
    expect(parsed).toEqual(ids);
  });

  it('parseChainFilterId returns null for non-chain ids', () => {
    expect(parseChainFilterId('svge.builtin.effect.blur')).toBeNull();
    expect(parseChainFilterId('arbitrary-id')).toBeNull();
  });

  it('parseChainFilterId returns [] for empty chain (just the prefix)', () => {
    expect(parseChainFilterId(CHAIN_FILTER_ID_PREFIX)).toEqual([]);
  });

  it('extractChainFilterId pulls chain id out of url(#...)', () => {
    const url = `url(#${makeChainFilterId(['a', 'b'])})`;
    expect(extractChainFilterId(url)).toBe(makeChainFilterId(['a', 'b']));
  });

  it('extractChainFilterId returns null for non-chain filter urls', () => {
    expect(extractChainFilterId('url(#some-single-effect)')).toBeNull();
    expect(extractChainFilterId('none')).toBeNull();
    expect(extractChainFilterId(undefined)).toBeNull();
  });
});

describe('composeChainFilter — markup composition', () => {
  it('empty list returns an empty <filter>', () => {
    const out = composeChainFilter([], 'svge-chain-empty');
    expect(out).toBe('<filter id="svge-chain-empty"></filter>');
  });

  it('single effect produces a filter whose output is the effect itself (no trailing alpha capture)', () => {
    const e = mkEffect('a', '<feGaussianBlur stdDeviation="3" />');
    const out = composeChainFilter([e], 'svge-chain-a');
    expect(out).toContain('id="svge-chain-a"');
    expect(out).toContain('feGaussianBlur');
    // D-145 regression: the LAST (here only) step must NOT get the alpha-only
    // output captures appended — otherwise the alpha `feColorMatrix` becomes
    // the filter's visible output and the shape renders as a black silhouette.
    expect(out).not.toContain('result="step0-out"');
    expect(out).not.toContain('result="step0-out-alpha"');
  });

  it('D-145: the composed filter does NOT end with an alpha-only feColorMatrix (no black silhouette)', () => {
    const a = mkEffect('a', '<feGaussianBlur in="SourceGraphic" stdDeviation="3" />');
    const b = mkEffect('b', '<feColorMatrix in="SourceGraphic" type="saturate" values="2" />');
    // The alpha-extraction matrix used for inter-step captures must never be
    // the LAST primitive — that is what produced the black-shape bug.
    const alphaMatrix = 'values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"';
    for (const out of [
      composeChainFilter([a], 'svge-chain-a'),
      composeChainFilter([a, b], 'svge-chain-a__b'),
    ]) {
      const lastPrimitive = out.slice(out.lastIndexOf('<fe'));
      expect(lastPrimitive).not.toContain(alphaMatrix);
    }
  });

  it('two-step chain rewrites SourceGraphic in step 2 to point at step 1 output', () => {
    const a = mkEffect('a', '<feGaussianBlur in="SourceGraphic" stdDeviation="3" />');
    const b = mkEffect('b', '<feColorMatrix in="SourceGraphic" type="saturate" values="2" />');
    const out = composeChainFilter([a, b], 'svge-chain-a__b');
    // Step 0 keeps SourceGraphic literal
    expect(out).toMatch(/<feGaussianBlur[^>]*in="SourceGraphic"/);
    // Step 1 should reference step0-out, NOT SourceGraphic
    expect(out).toMatch(/<feColorMatrix[^>]*in="step0-out"/);
  });

  it('prefixes result and matching in references to avoid collisions across steps', () => {
    // Both effects use a result named "blur"
    const a = mkEffect(
      'a',
      '<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" /><feOffset in="blur" dx="3" dy="3" />',
    );
    const b = mkEffect(
      'b',
      '<feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" /><feOffset in="blur" dx="5" dy="5" />',
    );
    const out = composeChainFilter([a, b], 'svge-chain-a__b');
    expect(out).toContain('result="step0-blur"');
    expect(out).toContain('in="step0-blur"');
    expect(out).toContain('result="step1-blur"');
    expect(out).toContain('in="step1-blur"');
    // Original unprefixed "blur" should not appear in collision-prone attributes
    expect(out).not.toMatch(/result="blur"/);
    expect(out).not.toMatch(/in="blur"/);
  });

  it('rewrites SourceAlpha to previous step alpha when chained', () => {
    const a = mkEffect('a', '<feGaussianBlur in="SourceGraphic" stdDeviation="3" />');
    const b = mkEffect(
      'b',
      '<feGaussianBlur in="SourceAlpha" stdDeviation="3" /><feOffset dx="4" dy="4" />',
    );
    const out = composeChainFilter([a, b], 'svge-chain-a__b');
    expect(out).toContain('in="step0-out-alpha"');
  });

  it('opens the filter region beyond default to accommodate halos', () => {
    const e = mkEffect('a', '<feGaussianBlur stdDeviation="3" />');
    const out = composeChainFilter([e], 'svge-chain-a');
    expect(out).toContain('x="-50%"');
    expect(out).toContain('y="-50%"');
    expect(out).toContain('width="200%"');
    expect(out).toContain('height="200%"');
  });
});

describe('ChainFilterRegistry — derives active chains from the document', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(builtinEffectsPlugin)],
    });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const bus = TestBed.inject(CommandBus);
    const effects = TestBed.inject(EffectRegistry);
    const chains = TestBed.inject(ChainFilterRegistry);
    return { state, bus, effects, chains };
  }

  function addRectWithFilter(bus: CommandBus, state: EditorStateService, filter: string): NodeId {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: '#000', filter } },
    );
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    return rect.id;
  }

  it('activeChains is empty when no node references a chain', () => {
    const { chains } = setup();
    expect(chains.activeChains()).toEqual([]);
    expect(chains.buildAllChainsMarkup()).toBe('');
  });

  it('activeChains includes chain IDs referenced via style.filter', () => {
    const { state, bus, chains } = setup();
    const chainId = makeChainFilterId([
      'svge.builtin.effect.blur',
      'svge.builtin.effect.drop-shadow',
    ]);
    addRectWithFilter(bus, state, `url(#${chainId})`);
    expect(chains.activeChains()).toEqual([chainId]);
  });

  it('deduplicates: same chain referenced by N nodes appears once', () => {
    const { state, bus, chains } = setup();
    const chainId = makeChainFilterId(['svge.builtin.effect.blur', 'svge.builtin.effect.sepia']);
    addRectWithFilter(bus, state, `url(#${chainId})`);
    addRectWithFilter(bus, state, `url(#${chainId})`);
    expect(chains.activeChains()).toEqual([chainId]);
  });

  it('skips chains whose effects are NOT registered (defensive)', () => {
    const { state, bus, chains } = setup();
    const chainId = makeChainFilterId(['no.such.effect', 'svge.builtin.effect.blur']);
    addRectWithFilter(bus, state, `url(#${chainId})`);
    expect(chains.activeChains()).toEqual([]);
  });

  it('ignores non-chain filter values (single effect URL)', () => {
    const { state, bus, chains } = setup();
    addRectWithFilter(bus, state, 'url(#svge.builtin.effect.blur)');
    expect(chains.activeChains()).toEqual([]);
  });

  it('buildAllChainsMarkup returns composed <filter> for each unique chain', () => {
    const { state, bus, chains } = setup();
    const chainId = makeChainFilterId([
      'svge.builtin.effect.blur',
      'svge.builtin.effect.drop-shadow',
    ]);
    addRectWithFilter(bus, state, `url(#${chainId})`);
    const markup = chains.buildAllChainsMarkup();
    expect(markup).toContain(`id="${chainId}"`);
    // Should include primitives from both effects
    expect(markup).toContain('feGaussianBlur');
    expect(markup).toContain('feOffset');
    expect(markup).toContain('feMerge');
    // Step 1 should have rewritten SourceAlpha (drop-shadow uses it)
    expect(markup).toContain('in="step0-out-alpha"');
  });

  it('re-derives reactively when the document changes', () => {
    const { state, bus, chains } = setup();
    expect(chains.activeChains().length).toBe(0);
    const chainId = makeChainFilterId(['svge.builtin.effect.blur', 'svge.builtin.effect.sepia']);
    const id = addRectWithFilter(bus, state, `url(#${chainId})`);
    expect(chains.activeChains().length).toBe(1);
    // Remove the filter from the node (single-node case uses the
    // "many" command with a 1-element array — the single-node helper
    // does not exist yet by design).
    bus.dispatch(new SetStylePropertyOnManyCommand([id], 'filter', undefined));
    expect(chains.activeChains().length).toBe(0);
  });
});
