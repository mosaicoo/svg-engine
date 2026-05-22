import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize';
import {
  extractSlots,
  parseColorToken,
  parseDimensionToken,
  parseNumberToken,
} from './slot-extractor';

describe('NLU › slot-extractor', () => {
  describe('parseNumberToken', () => {
    it('parses integers and decimals (en/pt)', () => {
      expect(parseNumberToken('100')).toBe(100);
      expect(parseNumberToken('1.5')).toBe(1.5);
      expect(parseNumberToken('1,5')).toBe(1.5);
      expect(parseNumberToken('-10')).toBe(-10);
    });
    it('accepts px / pt units (despreza)', () => {
      expect(parseNumberToken('100px')).toBe(100);
      expect(parseNumberToken('12pt')).toBe(12);
    });
    it('returns first number from dimension token', () => {
      expect(parseNumberToken('100x50')).toBe(100);
    });
    it('returns null for non-numeric tokens', () => {
      expect(parseNumberToken('rect')).toBeNull();
      expect(parseNumberToken('')).toBeNull();
    });
  });

  describe('parseDimensionToken', () => {
    it('parses 100x50', () => {
      expect(parseDimensionToken('100x50')).toEqual({ width: 100, height: 50 });
    });
    it('returns null for non-dimension', () => {
      expect(parseDimensionToken('100')).toBeNull();
      expect(parseDimensionToken('rect')).toBeNull();
    });
  });

  describe('parseColorToken', () => {
    it('resolves hex direto', () => {
      expect(parseColorToken('#ff0000')).toBe('#ff0000');
      expect(parseColorToken('#FF0000')).toBe('#ff0000');
      expect(parseColorToken('#f00')).toBe('#f00');
    });
    it('resolves named colors PT', () => {
      expect(parseColorToken('vermelho')).toBe('#e53935');
      expect(parseColorToken('azul')).toBe('#1e88e5');
    });
    it('resolves named colors EN', () => {
      expect(parseColorToken('red')).toBe('#e53935');
      expect(parseColorToken('blue')).toBe('#1e88e5');
    });
    it('fuzzy-resolves typos', () => {
      // 'vermelo' (1 typo) → 'vermelho'
      expect(parseColorToken('vermelo')).toBe('#e53935');
    });
    it('returns null for unknown tokens', () => {
      expect(parseColorToken('xyz')).toBeNull();
    });
  });

  describe('extractSlots', () => {
    it('extracts number and color slots positionally', () => {
      const tokens = tokenize('criar retângulo vermelho 100');
      const slots = extractSlots(tokens, {
        fill: { kind: 'color', optional: true },
        size: { kind: 'number', optional: true },
      });
      expect(slots['fill']).toBe('#e53935');
      expect(slots['size']).toBe(100);
    });

    it('extracts width/height from a single 100x50 dimension token', () => {
      const tokens = tokenize('rect 100x50');
      const slots = extractSlots(tokens, {
        width: { kind: 'number', optional: true },
        height: { kind: 'number', optional: true },
      });
      expect(slots['width']).toBe(100);
      expect(slots['height']).toBe(50);
    });

    it('extracts enum value', () => {
      const tokens = tokenize('alinhar à esquerda');
      const slots = extractSlots(tokens, {
        side: { kind: 'enum', values: ['esquerda', 'direita', 'topo'], optional: true },
      });
      expect(slots['side']).toBe('esquerda');
    });

    it('applies defaults for unfilled optional slots', () => {
      const tokens = tokenize('criar retângulo');
      const slots = extractSlots(tokens, {
        width: { kind: 'number', optional: true, default: 100 },
        height: { kind: 'number', optional: true, default: 100 },
      });
      expect(slots['width']).toBe(100);
      expect(slots['height']).toBe(100);
    });

    it('leaves unfilled required slots undefined', () => {
      const tokens = tokenize('criar retângulo');
      const slots = extractSlots(tokens, {
        color: { kind: 'color', optional: false },
      });
      expect(slots['color']).toBeUndefined();
    });

    it('does not double-consume the same token', () => {
      const tokens = tokenize('criar 100 azul');
      const slots = extractSlots(tokens, {
        size: { kind: 'number', optional: true },
        sizeAlt: { kind: 'number', optional: true },
      });
      // só um number existe — só size é preenchido
      expect(slots['size']).toBe(100);
      expect(slots['sizeAlt']).toBeUndefined();
    });

    it('ignores stopwords', () => {
      const tokens = tokenize('criar um retângulo de cor vermelha');
      const slots = extractSlots(tokens, {
        color: { kind: 'color', optional: false },
      });
      expect(slots['color']).toBe('#e53935');
    });
  });
});
