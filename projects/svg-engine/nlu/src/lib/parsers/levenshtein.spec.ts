import { describe, expect, it } from 'vitest';
import { bestMatch, levenshtein } from './levenshtein';

describe('NLU › levenshtein', () => {
  describe('levenshtein', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshtein('rect', 'rect')).toBe(0);
      expect(levenshtein('', '')).toBe(0);
    });
    it('returns length when one is empty', () => {
      expect(levenshtein('', 'abc')).toBe(3);
      expect(levenshtein('abc', '')).toBe(3);
    });
    it('counts single substitution', () => {
      expect(levenshtein('cat', 'bat')).toBe(1);
      expect(levenshtein('vermelo', 'vermelho')).toBe(1); // missing 'h'
    });
    it('counts insertions / deletions', () => {
      expect(levenshtein('rect', 'rects')).toBe(1);
      expect(levenshtein('rectt', 'rect')).toBe(1);
    });
    it('classic 3-distance example', () => {
      expect(levenshtein('kitten', 'sitting')).toBe(3);
    });
    it('returns Infinity when maxDist is exceeded (early termination)', () => {
      expect(levenshtein('completely', 'different', 2)).toBe(Infinity);
    });
    it('returns exact distance when maxDist not exceeded', () => {
      expect(levenshtein('rect', 'rects', 2)).toBe(1);
    });
    it('handles length-diff lower bound short-circuit', () => {
      expect(levenshtein('a', 'abcdef', 2)).toBe(Infinity);
    });
  });

  describe('bestMatch', () => {
    it('returns null when no candidate is close enough', () => {
      expect(bestMatch('xyz', ['rectangle', 'circle'], 2)).toBeNull();
    });
    it('returns the closest match', () => {
      const m = bestMatch('rectagle', ['rectangle', 'circle', 'ellipse'], 2);
      expect(m?.match).toBe('rectangle');
      expect(m?.distance).toBe(1);
    });
    it('short-circuits on exact match', () => {
      const m = bestMatch('circle', ['rectangle', 'circle', 'ellipse'], 2);
      expect(m?.match).toBe('circle');
      expect(m?.distance).toBe(0);
    });
    it('returns null on empty candidates', () => {
      expect(bestMatch('rect', [], 2)).toBeNull();
    });
  });
});
