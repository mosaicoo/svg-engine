import { describe, expect, it } from 'vitest';

import { mergeDefsFragments } from './defs-merge';

/** A `<linearGradient>` fragment with the given id (one stop, minimal). */
function grad(id: string): string {
  return `<linearGradient id="${id}"><stop offset="0" stop-color="#000000"/></linearGradient>`;
}

describe('mergeDefsFragments (D-097)', () => {
  it('returns existing verbatim when incoming is empty/undefined', () => {
    expect(mergeDefsFragments(grad('a'), '')).toBe(grad('a'));
    expect(mergeDefsFragments(grad('a'), undefined)).toBe(grad('a'));
    expect(mergeDefsFragments(undefined, undefined)).toBe('');
  });

  it('returns incoming when existing is empty/undefined', () => {
    expect(mergeDefsFragments('', grad('a'))).toBe(grad('a'));
    expect(mergeDefsFragments(undefined, grad('a'))).toBe(grad('a'));
  });

  it('appends an incoming element with a NEW id', () => {
    const merged = mergeDefsFragments(grad('a'), grad('b'));
    expect(merged).toContain('id="a"');
    expect(merged).toContain('id="b"');
  });

  it('skips an incoming element whose id already exists (no duplicate; existing wins)', () => {
    const existing = grad('a');
    const merged = mergeDefsFragments(existing, grad('a'));
    // Nothing new → original returned unchanged (reference-preserving).
    expect(merged).toBe(existing);
    expect(merged.match(/id="a"/g)?.length).toBe(1);
  });

  it('from a multi-element incoming fragment, merges only the new ids', () => {
    const merged = mergeDefsFragments(grad('a'), grad('a') + grad('c'));
    expect(merged.match(/id="a"/g)?.length).toBe(1); // existing kept, not duplicated
    expect(merged).toContain('id="c"'); // new one appended
  });

  it('always appends id-less elements (no id to dedup on)', () => {
    const idless = '<filter><feGaussianBlur stdDeviation="2"/></filter>';
    const merged = mergeDefsFragments(grad('a'), idless);
    expect(merged).toContain('id="a"');
    expect(merged).toContain('feGaussianBlur');
  });

  it('preserves the seven-gradient scene defs end-to-end (regression for the reported SVG)', () => {
    const sceneDefs = ['skyGrad', 'groundGrad', 'redGrad', 'wheelGrad'].map(grad).join('');
    // Re-applying the SAME defs (Edit Contents round-trip) must NOT duplicate.
    const merged = mergeDefsFragments(sceneDefs, sceneDefs);
    expect(merged).toBe(sceneDefs);
    for (const id of ['skyGrad', 'groundGrad', 'redGrad', 'wheelGrad']) {
      expect(merged.match(new RegExp(`id="${id}"`, 'g'))?.length).toBe(1);
    }
  });
});
