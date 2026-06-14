import { describe, expect, it } from 'vitest';
import { DEFAULT_HIT_TOLERANCE_PX, geometricHitTestElement } from './geometric-hit-test';

/**
 * `isPointInFill` / `isPointInStroke` / `getScreenCTM` are real-browser
 * SVG APIs absent from happy-dom, so we exercise the iteration / z-order /
 * fill-vs-stroke / tolerance-ring logic with fakes. The fake CTM is the
 * identity (matrixTransform passes the screen point through unchanged), so
 * predicates receive the raw click/sample coordinates.
 */

interface Pt {
  x: number;
  y: number;
}

function fakeEl(opts: {
  fill?: (p: Pt) => boolean;
  stroke?: (p: Pt) => boolean;
  probeable?: boolean;
}): unknown {
  if (opts.probeable === false) {
    // Missing the geometry methods → isProbeable() must skip it.
    return {};
  }
  return {
    isPointInFill: (p: Pt) => opts.fill?.(p) ?? false,
    isPointInStroke: (p: Pt) => opts.stroke?.(p) ?? false,
    getScreenCTM: () => ({ inverse: () => ({}) }),
  };
}

function fakeSvg(els: readonly unknown[]): SVGSVGElement {
  return {
    querySelectorAll: () => els,
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform(): Pt {
        return { x: this.x, y: this.y };
      },
    }),
  } as unknown as SVGSVGElement;
}

describe('D-091 — geometricHitTestElement', () => {
  it('returns null when nothing is under the point', () => {
    const svg = fakeSvg([fakeEl({}), fakeEl({})]);
    expect(geometricHitTestElement(svg, 5, 5, 0)).toBeNull();
  });

  it('selects an element by its FILL area (unfilled-shape case)', () => {
    const el = fakeEl({ fill: (p) => p.x === 5 && p.y === 5 });
    const svg = fakeSvg([el]);
    expect(geometricHitTestElement(svg, 5, 5, 0)).toBe(el);
  });

  it('selects an element by its STROKE', () => {
    const el = fakeEl({ stroke: (p) => p.x === 0 && p.y === 0 });
    const svg = fakeSvg([el]);
    expect(geometricHitTestElement(svg, 0, 0, 0)).toBe(el);
  });

  it('returns the front-most (last in document order) when several overlap', () => {
    const back = fakeEl({ fill: () => true });
    const front = fakeEl({ fill: () => true });
    const svg = fakeSvg([back, front]);
    expect(geometricHitTestElement(svg, 1, 1, 0)).toBe(front);
  });

  it('applies the tolerance ring: a near-stroke click within tolerance hits', () => {
    // Stroke "line" at x≈0; click at x=4 misses the centre but the ring
    // point at (4 - 4) = 0 lands on it.
    const el = fakeEl({ stroke: (p) => Math.abs(p.x) < 0.5 });
    const svg = fakeSvg([el]);
    expect(geometricHitTestElement(svg, 4, 0, 4)).toBe(el);
  });

  it('does NOT hit beyond the tolerance (zero tolerance = exact only)', () => {
    const el = fakeEl({ stroke: (p) => Math.abs(p.x) < 0.5 });
    const svg = fakeSvg([el]);
    expect(geometricHitTestElement(svg, 4, 0, 0)).toBeNull();
  });

  it('skips elements without the geometry-probe methods', () => {
    const notProbeable = fakeEl({ probeable: false });
    const real = fakeEl({ fill: () => true });
    const svg = fakeSvg([real, notProbeable]);
    // Front-most is notProbeable but it's skipped → falls back to `real`.
    expect(geometricHitTestElement(svg, 1, 1, 0)).toBe(real);
  });

  it('exposes a sane default tolerance', () => {
    expect(DEFAULT_HIT_TOLERANCE_PX).toBeGreaterThan(0);
  });
});
