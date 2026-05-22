import { describe, expect, it } from 'vitest';
import { tokenize } from '../parsers/tokenize';
import { detectLanguage } from './language-detect';

describe('NLU › detectLanguage', () => {
  it('detects PT from typical Portuguese command', () => {
    const result = detectLanguage(tokenize('criar um retangulo vermelho'));
    expect(result.language).toBe('pt');
    expect(result.hits.pt).toBeGreaterThan(result.hits.en);
  });

  it('detects EN from typical English command', () => {
    const result = detectLanguage(tokenize('create a square'));
    expect(result.language).toBe('en');
    expect(result.hits.en).toBeGreaterThan(result.hits.pt);
  });

  it('returns "unknown" for empty input', () => {
    expect(detectLanguage([]).language).toBe('unknown');
  });

  it('returns "unknown" for pure numbers / hex', () => {
    const result = detectLanguage(tokenize('100x50 #ff0000'));
    expect(result.language).toBe('unknown');
    expect(result.hits.pt).toBe(0);
    expect(result.hits.en).toBe(0);
  });

  it('counts only language-discriminating tokens (ignores universal CSS keywords)', () => {
    // 'navy' está SÓ em EN; 'azul' está SÓ em PT.
    // CSS-only keywords como hex / dígitos não contam.
    const result = detectLanguage(tokenize('navy 100'));
    expect(result.language).toBe('en');
    expect(result.hits.en).toBe(1);
    expect(result.hits.pt).toBe(0);
  });

  it('returns "unknown" on tie', () => {
    // 'azul' (PT) + 'square' (EN) = empate.
    const result = detectLanguage(tokenize('azul square'));
    expect(result.language).toBe('unknown');
    expect(result.hits.pt).toBe(result.hits.en);
  });
});
