import { describe, expect, it } from 'vitest';
import { parsePathToAnchors } from './path-anchors';
import {
  cleanUpPathD,
  joinPathDs,
  reversePathD,
  simplifyPathD,
  splitPathDAtAnchors,
} from './path-ops';
import { offsetPathD } from './path-offset';
import { outlineStrokeToPathD } from './stroke-outline';

/** Bounding box of every anchor point in a `d` (for offset/outline checks). */
function bbox(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sub of parsePathToAnchors(d)) {
    for (const a of sub.anchors) {
      minX = Math.min(minX, a.point.x);
      minY = Math.min(minY, a.point.y);
      maxX = Math.max(maxX, a.point.x);
      maxY = Math.max(maxY, a.point.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

describe('D-090 — reversePathD', () => {
  it('reverses anchor order of an open path', () => {
    const out = reversePathD('M0 0 L10 0 L10 10');
    const [sub] = parsePathToAnchors(out);
    expect(sub!.anchors.map((a) => [a.point.x, a.point.y])).toEqual([
      [10, 10],
      [10, 0],
      [0, 0],
    ]);
  });

  it('preserves the closed flag', () => {
    const out = reversePathD('M0 0 L10 0 L10 10 Z');
    expect(parsePathToAnchors(out)[0]!.closed).toBe(true);
  });
});

describe('D-090 — cleanUpPathD', () => {
  it('collapses a duplicate (zero-length) point', () => {
    const out = cleanUpPathD('M0 0 L0 0 L10 0');
    const [sub] = parsePathToAnchors(out);
    expect(sub!.anchors.map((a) => [a.point.x, a.point.y])).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it('leaves a clean path unchanged', () => {
    const d = 'M0 0 L10 0 L10 10';
    const out = cleanUpPathD(d);
    expect(parsePathToAnchors(out)[0]!.anchors.length).toBe(3);
  });
});

describe('D-090 — simplifyPathD', () => {
  it('drops collinear interior anchors', () => {
    const out = simplifyPathD('M0 0 L5 0 L10 0', 1);
    expect(parsePathToAnchors(out)[0]!.anchors.length).toBe(2);
  });

  it('keeps anchors that deviate beyond tolerance', () => {
    const out = simplifyPathD('M0 0 L5 5 L10 0', 1);
    expect(parsePathToAnchors(out)[0]!.anchors.length).toBe(3);
  });
});

describe('D-090 — joinPathDs', () => {
  it('closes a single open subpath', () => {
    const out = joinPathDs(['M0 0 L10 0 L10 10']);
    expect(out).not.toBeNull();
    expect(parsePathToAnchors(out!)[0]!.closed).toBe(true);
  });

  it('welds two open subpaths at their nearest endpoints', () => {
    const out = joinPathDs(['M0 0 L10 0', 'M10 0 L10 10']);
    expect(out).not.toBeNull();
    const subs = parsePathToAnchors(out!);
    expect(subs.length).toBe(1);
    expect(subs[0]!.anchors.map((a) => [a.point.x, a.point.y])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('returns null when there are no open subpaths to join', () => {
    expect(joinPathDs(['M0 0 L10 0 L10 10 Z'])).toBeNull();
  });
});

describe('D-090 — splitPathDAtAnchors', () => {
  it('splits an open path at an interior anchor into two pieces', () => {
    const pieces = splitPathDAtAnchors('M0 0 L10 0 L20 0', [{ subpathIndex: 0, anchorIndex: 1 }]);
    expect(pieces).not.toBeNull();
    expect(pieces!.length).toBe(2);
    expect(parsePathToAnchors(pieces![0]!)[0]!.anchors.map((a) => a.point.x)).toEqual([0, 10]);
    expect(parsePathToAnchors(pieces![1]!)[0]!.anchors.map((a) => a.point.x)).toEqual([10, 20]);
  });

  it('opens a closed subpath at the cut anchor', () => {
    const pieces = splitPathDAtAnchors('M0 0 L10 0 L10 10 L0 10 Z', [
      { subpathIndex: 0, anchorIndex: 2 },
    ]);
    expect(pieces).not.toBeNull();
    expect(pieces!.length).toBe(1);
    expect(parsePathToAnchors(pieces![0]!)[0]!.closed).toBe(false);
  });

  it('returns null when the cut does not separate anything', () => {
    // Cut at an endpoint of an open path = no real split.
    expect(splitPathDAtAnchors('M0 0 L10 0', [{ subpathIndex: 0, anchorIndex: 0 }])).toBeNull();
  });
});

describe('D-090 — offsetPathD', () => {
  it('grows a closed square outward for a positive distance', () => {
    const out = offsetPathD('M0 0 L10 0 L10 10 L0 10 Z', 2);
    const b = bbox(out);
    expect(b.minX).toBeLessThan(0);
    expect(b.minY).toBeLessThan(0);
    expect(b.maxX).toBeGreaterThan(10);
    expect(b.maxY).toBeGreaterThan(10);
  });

  it('shrinks a closed square inward for a negative distance', () => {
    const out = offsetPathD('M0 0 L10 0 L10 10 L0 10 Z', -2);
    const b = bbox(out);
    expect(b.minX).toBeGreaterThan(0);
    expect(b.maxX).toBeLessThan(10);
  });

  it('returns the input unchanged for ~zero distance', () => {
    const d = 'M0 0 L10 0 L10 10 Z';
    expect(offsetPathD(d, 0)).toBe(d);
  });
});

describe('D-090 — outlineStrokeToPathD', () => {
  it('produces a non-empty closed outline for an open stroke', () => {
    const out = outlineStrokeToPathD('M0 0 L10 0', 4);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('Z');
    // The ribbon spans the stroke half-width on each side of y=0.
    const b = bbox(out);
    expect(b.minY).toBeLessThanOrEqual(-1.9);
    expect(b.maxY).toBeGreaterThanOrEqual(1.9);
  });

  it('emits two rings (donut) for a closed stroke', () => {
    const out = outlineStrokeToPathD('M0 0 L10 0 L10 10 L0 10 Z', 2);
    expect(parsePathToAnchors(out).length).toBe(2);
  });

  it('returns empty string for non-positive width', () => {
    expect(outlineStrokeToPathD('M0 0 L10 0', 0)).toBe('');
  });
});
