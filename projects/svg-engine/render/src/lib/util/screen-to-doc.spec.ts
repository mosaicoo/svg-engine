import { screenToDoc } from './screen-to-doc';

/**
 * Synthesize an SVG with a known CTM by stubbing the methods. Lets us
 * test the projection math without needing a real layout pass (jsdom
 * doesn't run one). Each stub is small and named so a failing assertion
 * points at the right protocol step.
 */
function makeStubSvg(
  ctm: { a: number; b: number; c: number; d: number; e: number; f: number } | null,
): SVGSVGElement {
  const inverse = ctm === null ? null : invertCtm(ctm);
  return {
    getScreenCTM: () => (ctm === null ? null : { ...ctm, inverse: () => inverse }),
    createSVGPoint: () => {
      const pt = { x: 0, y: 0, matrixTransform: (m: typeof inverse) => applyMatrix(pt, m) };
      return pt;
    },
  } as unknown as SVGSVGElement;
}

function invertCtm(m: { a: number; b: number; c: number; d: number; e: number; f: number }) {
  const det = m.a * m.d - m.b * m.c;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

function applyMatrix(
  pt: { x: number; y: number },
  m: { a: number; b: number; c: number; d: number; e: number; f: number } | null,
) {
  if (m === null) return { x: 0, y: 0 };
  return { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f };
}

describe('screenToDoc — defensive guards', () => {
  it('returns null when svg is null', () => {
    expect(screenToDoc(null, 10, 20)).toBeNull();
  });

  it('returns null when getScreenCTM is missing (jsdom / SSR)', () => {
    const svg = { createSVGPoint: () => ({}) } as unknown as SVGSVGElement;
    expect(screenToDoc(svg, 0, 0)).toBeNull();
  });

  it('returns null when getScreenCTM returns null (detached svg)', () => {
    expect(screenToDoc(makeStubSvg(null), 0, 0)).toBeNull();
  });

  it('returns null when createSVGPoint is missing', () => {
    const svg = {
      getScreenCTM: () => ({ inverse: () => ({}) }),
    } as unknown as SVGSVGElement;
    expect(screenToDoc(svg, 0, 0)).toBeNull();
  });
});

describe('screenToDoc — projection math', () => {
  it('identity CTM projects client coords unchanged (offset only)', () => {
    // Identity scale, no translation: doc = screen
    const svg = makeStubSvg({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(screenToDoc(svg, 100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('translation-only CTM subtracts the translation on inverse', () => {
    // CTM translates doc by (50, 30) → inverse subtracts (50, 30)
    const svg = makeStubSvg({ a: 1, b: 0, c: 0, d: 1, e: 50, f: 30 });
    const out = screenToDoc(svg, 75, 130);
    expect(out).toEqual({ x: 25, y: 100 });
  });

  it('uniform scale CTM divides on inverse', () => {
    // CTM scales doc by 2× → inverse divides screen by 2
    const svg = makeStubSvg({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    const out = screenToDoc(svg, 200, 400);
    expect(out).toEqual({ x: 100, y: 200 });
  });

  it('combined scale + translate composes correctly', () => {
    // CTM: doc point (x, y) -> screen (2x + 10, 2y + 5)
    // Inverse: screen (X, Y) -> doc ((X - 10)/2, (Y - 5)/2)
    const svg = makeStubSvg({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 5 });
    const out = screenToDoc(svg, 30, 25);
    expect(out).toEqual({ x: 10, y: 10 });
  });
});
