import { describe, expect, it } from 'vitest';
import { adaptiveMaxDistance, fuzzyMatchAll, fuzzyMatchAny, fuzzyMatchToken } from './fuzzy-match';

describe('NLU › fuzzy-match', () => {
  describe('adaptiveMaxDistance', () => {
    it('zero for very short terms', () => {
      expect(adaptiveMaxDistance(2)).toBe(0);
      expect(adaptiveMaxDistance(3)).toBe(0);
    });
    it('one for medium terms', () => {
      expect(adaptiveMaxDistance(4)).toBe(1);
      expect(adaptiveMaxDistance(6)).toBe(1);
    });
    it('two for long terms', () => {
      expect(adaptiveMaxDistance(7)).toBe(2);
      expect(adaptiveMaxDistance(20)).toBe(2);
    });
  });

  describe('fuzzyMatchToken', () => {
    it('returns exact match with score 1', () => {
      const m = fuzzyMatchToken('rectangle', ['rectangle', 'ellipse']);
      expect(m?.term).toBe('rectangle');
      expect(m?.distance).toBe(0);
      expect(m?.score).toBe(1);
    });
    it('matches one-typo on long term', () => {
      const m = fuzzyMatchToken('rectangel', ['rectangle', 'ellipse']);
      expect(m?.term).toBe('rectangle');
      expect(m?.distance).toBeLessThanOrEqual(2);
    });
    it('rejects two-typo on short term (adaptive)', () => {
      // 'red' is 3 chars, adaptive max-dist = 0 → 'xed' (dist 1) wouldn't match
      const m = fuzzyMatchToken('xed', ['red']);
      expect(m).toBeNull();
    });
    it('returns null for empty token / empty terms', () => {
      expect(fuzzyMatchToken('', ['red'])).toBeNull();
      expect(fuzzyMatchToken('red', [])).toBeNull();
    });
  });

  describe('fuzzyMatchAny', () => {
    it('finds first exact match across multiple tokens', () => {
      const m = fuzzyMatchAny(['criar', 'retangulo', 'vermelho'], ['retangulo', 'circulo']);
      expect(m?.term).toBe('retangulo');
      expect(m?.distance).toBe(0);
    });
    it('returns null when nothing matches', () => {
      expect(fuzzyMatchAny(['xyz', 'abc'], ['rectangle', 'circle'])).toBeNull();
    });
  });

  describe('fuzzyMatchAll', () => {
    it('returns all matches sorted by score (best first)', () => {
      // 'rectange' vs ['rectangle', 'triangle', 'circle']: 'rectangle'
      // está a dist 1; 'triangle' está a dist >2; 'circle' totalmente
      // fora. Só 'rectangle' deve aparecer.
      const matches = fuzzyMatchAll('rectange', ['rectangle', 'triangle', 'circle']);
      expect(matches.length).toBe(1);
      expect(matches[0].term).toBe('rectangle');
      expect(matches[0].distance).toBe(1);
    });
    it('returns multiple matches sorted by score desc', () => {
      // Query exata 'rect' → distância 0 contra 'rect', maior contra
      // alternativas. Mas 'rect' tem 4 chars (adaptive max-dist=1), e
      // 'reck'/'rest' têm dist 1 — todas devem aparecer, 'rect' primeiro.
      const matches = fuzzyMatchAll('rect', ['rect', 'reck', 'rest', 'xyz']);
      expect(matches.length).toBe(3); // xyz fora (dist >1)
      expect(matches[0].term).toBe('rect'); // exato
      expect(matches[0].score).toBe(1);
    });
  });
});
