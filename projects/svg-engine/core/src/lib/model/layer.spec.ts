import { describe, expect, it } from 'vitest';
import { createGroup, createRect, createText } from './node-factory';
import { isLayer, SVGE_KIND_KEY, SVGE_KIND_LAYER, withLayerFlag, withoutLayerFlag } from './layer';

describe('D-072 — Layer model helpers', () => {
  describe('isLayer', () => {
    it('returns false for non-group nodes', () => {
      expect(isLayer(createRect({ x: 0, y: 0, width: 10, height: 10 }))).toBe(false);
      expect(isLayer(createText({ x: 0, y: 0, content: 'hi' }))).toBe(false);
    });

    it('returns false for a plain group (no customData)', () => {
      expect(isLayer(createGroup([]))).toBe(false);
    });

    it('returns false for a group with unrelated customData', () => {
      const g = createGroup([], { metadata: { customData: { foo: 'bar' } } });
      expect(isLayer(g)).toBe(false);
    });

    it('returns true for a group flagged via customData', () => {
      const g = createGroup([], { metadata: { customData: { [SVGE_KIND_KEY]: SVGE_KIND_LAYER } } });
      expect(isLayer(g)).toBe(true);
    });
  });

  describe('withLayerFlag', () => {
    it('returns a new group with the layer flag set', () => {
      const base = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
      const flagged = withLayerFlag(base);
      expect(flagged).not.toBe(base); // new reference
      expect(isLayer(flagged)).toBe(true);
      // Children preserved by reference.
      expect(flagged.children).toBe(base.children);
    });

    it('preserves pre-existing customData entries', () => {
      const base = createGroup([], {
        metadata: { customData: { existingKey: 'value', n: 1 } },
      });
      const flagged = withLayerFlag(base);
      expect(flagged.metadata.customData?.['existingKey']).toBe('value');
      expect(flagged.metadata.customData?.['n']).toBe(1);
      expect(flagged.metadata.customData?.[SVGE_KIND_KEY]).toBe(SVGE_KIND_LAYER);
    });

    it('does not mutate the input group', () => {
      const base = createGroup([]);
      withLayerFlag(base);
      expect(isLayer(base)).toBe(false);
    });
  });

  describe('withoutLayerFlag', () => {
    it('returns the same reference when no layer flag is present', () => {
      const base = createGroup([]);
      expect(withoutLayerFlag(base)).toBe(base);
    });

    it('clears the flag and drops empty customData object', () => {
      const flagged = withLayerFlag(createGroup([]));
      const cleared = withoutLayerFlag(flagged);
      expect(isLayer(cleared)).toBe(false);
      // customData should be undefined after removing the only entry.
      expect(cleared.metadata.customData).toBeUndefined();
    });

    it('preserves other customData entries', () => {
      const base = createGroup([], {
        metadata: {
          customData: { [SVGE_KIND_KEY]: SVGE_KIND_LAYER, otherKey: 'survives' },
        },
      });
      const cleared = withoutLayerFlag(base);
      expect(isLayer(cleared)).toBe(false);
      expect(cleared.metadata.customData?.['otherKey']).toBe('survives');
    });
  });
});
