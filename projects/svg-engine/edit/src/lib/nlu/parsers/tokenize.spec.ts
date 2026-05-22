import { describe, expect, it } from 'vitest';
import { STOPWORDS } from '../dictionaries/stopwords';
import { deaccent, normalize, tokenize, tokenizeWithoutStopwords } from './tokenize';

describe('NLU › tokenize', () => {
  describe('deaccent', () => {
    it('removes Portuguese diacritics', () => {
      expect(deaccent('círculo')).toBe('circulo');
      expect(deaccent('ação')).toBe('acao');
      expect(deaccent('vermelho')).toBe('vermelho'); // no diacritics
      expect(deaccent('coração')).toBe('coracao');
      expect(deaccent('árvore')).toBe('arvore');
    });
    it('preserves ASCII intact', () => {
      expect(deaccent('rectangle')).toBe('rectangle');
      expect(deaccent('100x50')).toBe('100x50');
    });
    it('handles empty string', () => {
      expect(deaccent('')).toBe('');
    });
  });

  describe('normalize', () => {
    it('lowercases and deaccents', () => {
      expect(normalize('CRIAR Retângulo Vermelho')).toBe('criar retangulo vermelho');
      expect(normalize('GROUP')).toBe('group');
    });
  });

  describe('tokenize', () => {
    it('splits on whitespace and normalizes', () => {
      expect(tokenize('criar retângulo vermelho')).toEqual(['criar', 'retangulo', 'vermelho']);
    });
    it('preserves numbers including decimals (pt and en)', () => {
      expect(tokenize('100 1.5 1,5')).toEqual(['100', '1.5', '1,5']);
    });
    it('preserves dimensions like 100x50', () => {
      expect(tokenize('criar 100x50')).toEqual(['criar', '100x50']);
    });
    it('preserves hex colors', () => {
      expect(tokenize('fill #ff0000')).toEqual(['fill', '#ff0000']);
    });
    it('strips punctuation', () => {
      expect(tokenize('criar, um retângulo!')).toEqual(['criar', 'um', 'retangulo']);
    });
    it('returns [] for empty / non-string input', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
      // @ts-expect-error testing defensive runtime
      expect(tokenize(null)).toEqual([]);
    });
  });

  describe('tokenizeWithoutStopwords', () => {
    it('drops PT stopwords', () => {
      expect(tokenizeWithoutStopwords('criar um retângulo de cor vermelha', STOPWORDS)).toEqual([
        'criar',
        'retangulo',
        'cor',
        'vermelha',
      ]);
    });
    it('drops EN stopwords', () => {
      expect(tokenizeWithoutStopwords('add a red rectangle to the canvas', STOPWORDS)).toEqual([
        'add',
        'red',
        'rectangle',
        'canvas',
      ]);
    });
  });
});
