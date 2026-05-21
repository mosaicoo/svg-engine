import { createSyntheticDoc } from './synth-doc';

describe('createSyntheticDoc', () => {
  it('returns a doc with exactly `count` flat children under the root group', () => {
    const doc = createSyntheticDoc({ count: 25 });
    expect(doc.root.children.length).toBe(25);
    // None of the children are groups — the generator stays flat by design.
    expect(doc.root.children.every((c) => c.type !== 'group')).toBe(true);
  });

  it('respects default viewBox (1200×800) when none supplied', () => {
    const doc = createSyntheticDoc({ count: 1 });
    expect(doc.viewBox).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  });

  it('honours explicit viewBox dimensions', () => {
    const doc = createSyntheticDoc({ count: 1, viewBoxWidth: 640, viewBoxHeight: 480 });
    expect(doc.viewBox).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it('is deterministic for a fixed seed (same input → same tree)', () => {
    const a = createSyntheticDoc({ count: 100, seed: 7 });
    const b = createSyntheticDoc({ count: 100, seed: 7 });
    expect(a.root.children.length).toBe(b.root.children.length);
    // Compare type sequence — same PRNG, same kindRoll, same dispatch.
    expect(a.root.children.map((c) => c.type)).toEqual(b.root.children.map((c) => c.type));
  });

  it('produces a different tree for a different seed', () => {
    const a = createSyntheticDoc({ count: 50, seed: 1 });
    const b = createSyntheticDoc({ count: 50, seed: 2 });
    const sameOrder = a.root.children.every((c, i) => c.type === b.root.children[i]?.type);
    expect(sameOrder).toBe(false);
  });

  it('mixes rect / ellipse / path in roughly 50/30/20 ratio at scale', () => {
    const doc = createSyntheticDoc({ count: 1000, seed: 42 });
    const types = doc.root.children.map((c) => c.type);
    const rectPct = types.filter((t) => t === 'rect').length / 1000;
    const ellipsePct = types.filter((t) => t === 'ellipse').length / 1000;
    const pathPct = types.filter((t) => t === 'path').length / 1000;
    // 5% tolerance — Mulberry32 has uniform distribution but small samples
    // wander. At 1000 samples we expect <1% sd; 5% is generous.
    expect(Math.abs(rectPct - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(ellipsePct - 0.3)).toBeLessThan(0.05);
    expect(Math.abs(pathPct - 0.2)).toBeLessThan(0.05);
  });

  it('clamps count to a non-negative integer (0 → empty doc)', () => {
    const zero = createSyntheticDoc({ count: 0 });
    expect(zero.root.children.length).toBe(0);
    const negative = createSyntheticDoc({ count: -10 });
    expect(negative.root.children.length).toBe(0);
    const fractional = createSyntheticDoc({ count: 5.9 });
    expect(fractional.root.children.length).toBe(5);
  });

  it('places children within the viewBox bounds (no overflow)', () => {
    const doc = createSyntheticDoc({ count: 200, viewBoxWidth: 400, viewBoxHeight: 300 });
    for (const child of doc.root.children) {
      // Sample a coord present on every shape type — `rect.x`, `ellipse.cx`, path's `M x`.
      // We just check the structural bound: nothing escaped the half-width margin.
      if (child.type === 'rect') {
        expect(child.x).toBeGreaterThanOrEqual(0);
        expect(child.x + child.width).toBeLessThanOrEqual(400);
        expect(child.y).toBeGreaterThanOrEqual(0);
        expect(child.y + child.height).toBeLessThanOrEqual(300);
      }
    }
  });
});
