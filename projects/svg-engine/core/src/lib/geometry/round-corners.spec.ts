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

  it('uses a TANGENT trim for non-90° corners (trim = r / tan(θ/2), not r)', () => {
    // Equilateral triangle: every interior angle = 60°. For radius 10 the
    // tangent length is 10 / tan(30°) ≈ 17.32 — NOT 10. The old 90°-only
    // code trimmed by exactly `r`, so the first point would land at ≈5;
    // the tangent fillet pushes it out to ≈8.66 (= 17.32 · cos(30°)).
    const d = 'M0 0 L100 0 L50 86.6025 Z';
    const out = roundPathCorners(d, 10);
    // Closed subpath starts the M at the first vertex's tangent point:
    //   V=(0,0), toward prev (50,86.6025) → unit (0.5, 0.8660)
    //   tangent point = 17.3205 · (0.5, 0.8660) ≈ (8.6603, 15.0)
    const m = out.match(/^M([\d.eE+-]+) ([\d.eE+-]+)/);
    expect(m).not.toBeNull();
    const x = Number(m![1]);
    const y = Number(m![2]);
    expect(x).toBeGreaterThan(8); // old (trim = r) would put this at ~5
    expect(x).toBeLessThan(9);
    expect(y).toBeCloseTo(15, 1);
  });

  it('emits the TRUE fillet radius (≈ requested) as the arc rx for a non-90° corner', () => {
    // Equilateral, long edges → no clamp → effective radius == requested.
    const d = 'M0 0 L100 0 L50 86.6025 Z';
    const out = roundPathCorners(d, 10);
    const firstA = out.match(/A([\d.eE+-]+) ([\d.eE+-]+) /);
    expect(firstA).not.toBeNull();
    expect(Number(firstA![1])).toBeCloseTo(10, 1);
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
