import { describe, expect, it } from 'vitest';
import { roundPathCorners } from './round-corners';

/**
 * D-055 — Live Corners (Item 6.4). Verifies that the corner-rounding
 * derivation behaves sanely:
 *   - no-op when radius is 0 or negative
 *   - no-op when there are no sharp corners
 *   - rounds a square's 4 corners with arcs of the requested radius
 *   - clamps radius to half the shorter neighbor edge
 *   - leaves curves untouched
 */

describe('roundPathCorners', () => {
  it('returns input unchanged when radius is 0', () => {
    const d = 'M0 0 L10 0 L10 10 L0 10 Z';
    expect(roundPathCorners(d, 0)).toBe(d);
  });

  it('returns input unchanged when radius is negative', () => {
    const d = 'M0 0 L10 0 L10 10 L0 10 Z';
    expect(roundPathCorners(d, -5)).toBe(d);
  });

  it('returns input unchanged on empty d', () => {
    expect(roundPathCorners('', 5)).toBe('');
  });

  it('rounds a square — output contains A commands for each corner', () => {
    const d = 'M0 0 L100 0 L100 100 L0 100 Z';
    const out = roundPathCorners(d, 10);
    // 4 arcs (4 corners). Each arc is `A r r 0 0 ? x y`.
    const arcCount = (out.match(/A/g) ?? []).length;
    expect(arcCount).toBe(4);
  });

  it('clamps radius to half the shorter neighbor edge', () => {
    // A 20-wide rect with radius 100 must clamp to 10 (=20/2).
    const d = 'M0 0 L20 0 L20 100 L0 100 Z';
    const out = roundPathCorners(d, 100);
    // First arc radius (rx) appears right after `A`.
    const firstA = out.match(/A([\d.]+) ([\d.]+) /);
    expect(firstA).not.toBeNull();
    expect(Number(firstA![1])).toBeLessThanOrEqual(10.01);
  });

  it('leaves a curve-only path untouched (no sharp corners → short-circuit)', () => {
    // Pure cubic — every anchor has non-degenerate handles.
    const d = 'M0 0 C10 0 20 10 20 20 C20 30 10 40 0 40 Z';
    expect(roundPathCorners(d, 5)).toBe(d);
  });

  it('does not blow up on malformed input — returns input', () => {
    const garbage = 'M0 0 L L L oops Z';
    // Should NOT throw; output may equal input or be cleaned, but the call
    // must return without raising.
    expect(() => roundPathCorners(garbage, 5)).not.toThrow();
  });
});
