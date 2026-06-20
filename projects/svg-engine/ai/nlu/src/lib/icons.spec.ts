import { describe, expect, it } from 'vitest';

import { BUILTIN_ICON_DRAWERS, drawIcon, ICON_NAMES, resolveIconName } from './icons';

describe('icons (D-093 Fase 8)', () => {
  it('resolves canonical names as-is', () => {
    expect(resolveIconName('trending-up')).toBe('trending-up');
    expect(resolveIconName('bar-chart')).toBe('bar-chart');
    expect(resolveIconName('user')).toBe('user');
  });

  it('resolves PT/EN/semantic aliases (deaccented, case-insensitive)', () => {
    expect(resolveIconName('gráfico')).toBe('bar-chart');
    expect(resolveIconName('GRAFICO')).toBe('bar-chart');
    expect(resolveIconName('tendência')).toBe('trending-up');
    expect(resolveIconName('usuário')).toBe('user');
    expect(resolveIconName('ok')).toBe('check');
  });

  it('returns null for unknown / empty names', () => {
    expect(resolveIconName('definitely-not-an-icon')).toBeNull();
    expect(resolveIconName('')).toBeNull();
    expect(resolveIconName(undefined)).toBeNull();
  });

  it('drawIcon returns a path `d` for every canonical icon, null for unknown', () => {
    for (const name of ICON_NAMES) {
      const d = drawIcon(name, 100, 100, 24);
      expect(typeof d).toBe('string');
      expect(d && d.startsWith('M')).toBe(true);
    }
    expect(drawIcon('nope', 0, 0, 24)).toBeNull();
  });

  it('every drawer produces only finite numeric coordinates (no NaN/undefined)', () => {
    for (const name of Object.keys(BUILTIN_ICON_DRAWERS)) {
      const d = BUILTIN_ICON_DRAWERS[name](50, 60, 32);
      expect(d).not.toMatch(/NaN|undefined/);
      // every numeric token is finite
      for (const tok of d.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number.isFinite(Number(tok))).toBe(true);
      }
    }
  });

  it('scales/centers: a larger size yields a wider coordinate span around the center', () => {
    const span = (d: string) => {
      const xs = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      return Math.max(...xs) - Math.min(...xs);
    };
    const small = BUILTIN_ICON_DRAWERS['arrow-right'](100, 100, 16);
    const large = BUILTIN_ICON_DRAWERS['arrow-right'](100, 100, 48);
    expect(span(large)).toBeGreaterThan(span(small));
  });
});
