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
    // tangent length is 10 / tan(30°) ≈ 17.32 — NOT 10. A closed subpath
    // starts the M at the first vertex's OUTGOING tangent point:
    //   V=(0,0), toward next (100,0) → unit (1,0) → M ≈ (17.32, 0).
    // The old 90°-only code trimmed by exactly r=10 → would be (10, 0), so
    // an x ≈ 17.32 proves the tangent trim is in effect.
    const d = 'M0 0 L100 0 L50 86.6025 Z';
    const out = roundPathCorners(d, 10);
    const m = out.match(/^M([\d.eE+-]+) ([\d.eE+-]+)/);
    expect(m).not.toBeNull();
    const x = Number(m![1]);
    const y = Number(m![2]);
    expect(x).toBeGreaterThan(15); // old (trim = r = 10) would be 10
    expect(x).toBeLessThan(19);
    expect(y).toBeCloseTo(0, 1);
  });

  it('closes a rounded path cleanly — last corner arc ends at M (no leftover chord/lens)', () => {
    // Regression for the closing-vertex bug: a closed subpath must start the
    // M at the first vertex's OUTGOING tangent point so the final corner arc
    // (vertex 0) lands exactly on M and the closing Z is zero-length. The old
    // code started M at the INCOMING tangent point, so Z drew a stray chord
    // and vertex 0's arc + that chord formed a detached "lens" at the start
    // vertex (visible as a leaf/spike on closed shapes).
    const out = roundPathCorners('M0 0 L100 0 L100 100 L0 100 Z', 10);
    const m = out.match(/^M([\d.eE+-]+) ([\d.eE+-]+)/);
    expect(m).not.toBeNull();
    // Last "A rx ry rot largeArc sweep x y" before the closing Z.
    const arcs = [...out.matchAll(/A[\d.eE+-]+ [\d.eE+-]+ \d+ \d+ \d+ ([\d.eE+-]+) ([\d.eE+-]+)/g)];
    expect(arcs.length).toBeGreaterThan(0);
    const last = arcs[arcs.length - 1]!;
    expect(Number(last[1])).toBeCloseTo(Number(m![1]), 3);
    expect(Number(last[2])).toBeCloseTo(Number(m![2]), 3);
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
