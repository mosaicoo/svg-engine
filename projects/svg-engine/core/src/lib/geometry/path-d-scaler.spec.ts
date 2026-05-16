import { bakePathD, parsePathD, scalePathSegments, serializePathD } from './path-d-scaler';

const ORIGIN = { x: 0, y: 0 };

describe('parsePathD', () => {
  it('parses a single moveto', () => {
    expect(parsePathD('M 10 20')).toEqual([{ cmd: 'M', args: [10, 20] }]);
  });

  it('parses comma-separated args', () => {
    expect(parsePathD('M10,20 L30,40')).toEqual([
      { cmd: 'M', args: [10, 20] },
      { cmd: 'L', args: [30, 40] },
    ]);
  });

  it('parses tightly-packed negatives (no separator before "-")', () => {
    expect(parsePathD('M10 10-5-5')).toEqual([{ cmd: 'M', args: [10, 10, -5, -5] }]);
  });

  it('parses floats and decimals starting with .', () => {
    expect(parsePathD('M.5 .25 L1.5 -.5')).toEqual([
      { cmd: 'M', args: [0.5, 0.25] },
      { cmd: 'L', args: [1.5, -0.5] },
    ]);
  });

  it('parses scientific notation', () => {
    expect(parsePathD('M1e2 -1.5e-1')).toEqual([{ cmd: 'M', args: [100, -0.15] }]);
  });

  it('parses Z/z', () => {
    expect(parsePathD('M 0 0 L 10 0 Z')).toEqual([
      { cmd: 'M', args: [0, 0] },
      { cmd: 'L', args: [10, 0] },
      { cmd: 'Z', args: [] },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(parsePathD('')).toEqual([]);
  });
});

describe('serializePathD', () => {
  it('roundtrip preserves commands + numbers', () => {
    const d = 'M 10 20 L 30 40 Z';
    expect(serializePathD(parsePathD(d))).toBe('M 10 20 L 30 40 Z');
  });

  it('normalizes -0 to 0', () => {
    const segs = [{ cmd: 'M' as const, args: [-0, -0] }];
    expect(serializePathD(segs)).toBe('M 0 0');
  });

  it('rounds float noise to 6 decimal places', () => {
    const segs = [{ cmd: 'L' as const, args: [0.1 + 0.2, 1] }];
    // 0.1+0.2 = 0.30000000000000004 → rounded to 0.3
    expect(serializePathD(segs)).toBe('L 0.3 1');
  });
});

describe('scalePathSegments — uppercase absolute commands', () => {
  it('M scales coords around anchor', () => {
    const segs = parsePathD('M 10 10');
    const scaled = scalePathSegments(segs, 2, 2, ORIGIN);
    expect(scaled[0]).toEqual({ cmd: 'M', args: [20, 20] });
  });

  it('L scales coords around anchor', () => {
    const segs = parsePathD('M 0 0 L 10 10');
    const scaled = scalePathSegments(segs, 2, 2, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'L', args: [20, 20] });
  });

  it('H scales x only around anchor.x', () => {
    const segs = parsePathD('M 0 5 H 10');
    const scaled = scalePathSegments(segs, 3, 99, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'H', args: [30] });
  });

  it('V scales y only around anchor.y', () => {
    const segs = parsePathD('M 5 0 V 10');
    const scaled = scalePathSegments(segs, 99, 4, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'V', args: [40] });
  });

  it('C scales each of the 3 control/end points', () => {
    const segs = parsePathD('M 0 0 C 5 5 10 10 15 15');
    const scaled = scalePathSegments(segs, 2, 2, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'C', args: [10, 10, 20, 20, 30, 30] });
  });

  it('S scales 2 pairs', () => {
    const segs = parsePathD('M 0 0 S 1 1 2 2');
    const scaled = scalePathSegments(segs, 3, 3, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'S', args: [3, 3, 6, 6] });
  });

  it('Q scales 2 pairs', () => {
    const segs = parsePathD('M 0 0 Q 1 1 2 2');
    const scaled = scalePathSegments(segs, 2, 2, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'Q', args: [2, 2, 4, 4] });
  });

  it('T scales 1 pair', () => {
    const segs = parsePathD('M 0 0 T 5 5');
    const scaled = scalePathSegments(segs, 4, 4, ORIGIN);
    expect(scaled[1]).toEqual({ cmd: 'T', args: [20, 20] });
  });

  it('Z is preserved unchanged', () => {
    const segs = parsePathD('M 0 0 L 10 10 Z');
    const scaled = scalePathSegments(segs, 5, 5, ORIGIN);
    expect(scaled[2]).toEqual({ cmd: 'Z', args: [] });
  });
});

describe('scalePathSegments — lowercase relative commands', () => {
  it('l scales deltas without anchor offset', () => {
    const segs = parsePathD('M 100 100 l 5 5');
    const scaled = scalePathSegments(segs, 2, 2, ORIGIN);
    // M is absolute → scaled around origin = M 200 200
    // l deltas just multiply → l 10 10 (NOT l 200 200)
    expect(scaled[0]).toEqual({ cmd: 'M', args: [200, 200] });
    expect(scaled[1]).toEqual({ cmd: 'l', args: [10, 10] });
  });

  it('h scales x-delta only', () => {
    const segs = parsePathD('M 0 0 h 10');
    expect(scalePathSegments(segs, 3, 5, ORIGIN)[1]).toEqual({ cmd: 'h', args: [30] });
  });

  it('v scales y-delta only', () => {
    const segs = parsePathD('M 0 0 v 7');
    expect(scalePathSegments(segs, 99, 2, ORIGIN)[1]).toEqual({ cmd: 'v', args: [14] });
  });

  it('c scales 3 relative pairs', () => {
    const segs = parsePathD('M 0 0 c 1 1 2 2 3 3');
    expect(scalePathSegments(segs, 2, 2, ORIGIN)[1]).toEqual({
      cmd: 'c',
      args: [2, 2, 4, 4, 6, 6],
    });
  });
});

describe('scalePathSegments — first-m absolute quirk (SVG 1.1 §9.3.3)', () => {
  it('first m: first pair treated as absolute (scaled around anchor)', () => {
    const segs = parsePathD('m 10 10 l 5 5');
    const scaled = scalePathSegments(segs, 2, 2, { x: 0, y: 0 });
    // Parser produces 2 separate segments (m + l); preprocessFirstM
    // rewrites the m as M (no implicit-l split because m had exactly
    // 2 args). The subsequent l scales relatively.
    expect(scaled).toEqual([
      { cmd: 'M', args: [20, 20] },
      { cmd: 'l', args: [10, 10] },
    ]);
  });

  it('first m with implicit relative pairs splits into M + l', () => {
    // 'm 10 10 5 5' = single segment with 4 args (m + implicit l 5 5)
    const segs = parsePathD('m 10 10 5 5');
    const scaled = scalePathSegments(segs, 2, 2, { x: 0, y: 0 });
    // First pair: absolute scaled → M 20 20
    // Rest (1 pair): relative l → l 10 10
    expect(scaled).toEqual([
      { cmd: 'M', args: [20, 20] },
      { cmd: 'l', args: [10, 10] },
    ]);
  });

  it('first m with anchor not at origin: first pair anchors properly', () => {
    const segs = parsePathD('m 10 10');
    const scaled = scalePathSegments(segs, 2, 2, { x: 5, y: 5 });
    // Treated as M 10 10 → scaled around (5,5) → 5 + (10-5)*2 = 15
    expect(scaled[0]).toEqual({ cmd: 'M', args: [15, 15] });
  });

  it('non-first m stays relative', () => {
    const segs = parsePathD('M 0 0 m 5 5');
    const scaled = scalePathSegments(segs, 2, 2, ORIGIN);
    expect(scaled[0]).toEqual({ cmd: 'M', args: [0, 0] });
    expect(scaled[1]).toEqual({ cmd: 'm', args: [10, 10] });
  });
});

describe('scalePathSegments — arc commands', () => {
  it('A: endpoint scaled, radii scaled by |s|, sweep preserved on positive scale', () => {
    const segs = parsePathD('M 0 0 A 5 10 0 0 1 20 30');
    const scaled = scalePathSegments(segs, 2, 3, ORIGIN);
    // rx: 5*2=10; ry: 10*3=30; rotation:0; large-arc:0; sweep:1; x:40 y:90
    expect(scaled[1]).toEqual({ cmd: 'A', args: [10, 30, 0, 0, 1, 40, 90] });
  });

  it('A: radii stay positive under negative scale', () => {
    const segs = parsePathD('M 0 0 A 5 5 0 0 1 10 10');
    const scaled = scalePathSegments(segs, -2, 1, ORIGIN);
    expect(scaled[1]?.args[0]).toBe(10); // |5*-2|
    expect(scaled[1]?.args[1]).toBe(5);
  });

  it('A: flip sweep flag when scaling negative on exactly one axis', () => {
    const segs = parsePathD('M 0 0 A 5 5 0 0 1 10 10');
    const scaled = scalePathSegments(segs, -1, 1, ORIGIN);
    // sweep flag was 1, after one-axis mirror → 0
    expect(scaled[1]?.args[4]).toBe(0);
  });

  it('A: preserve sweep flag when scaling negative on BOTH axes', () => {
    const segs = parsePathD('M 0 0 A 5 5 0 0 1 10 10');
    const scaled = scalePathSegments(segs, -1, -1, ORIGIN);
    expect(scaled[1]?.args[4]).toBe(1);
  });

  it('a (relative arc): endpoint deltas scale, radii by |s|, anchor ignored', () => {
    const segs = parsePathD('M 0 0 a 5 5 0 0 1 10 10');
    const scaled = scalePathSegments(segs, 2, 3, { x: 100, y: 100 });
    // anchor doesn't apply to relative; radii: 10, 15; x: 20, y: 30
    expect(scaled[1]).toEqual({ cmd: 'a', args: [10, 15, 0, 0, 1, 20, 30] });
  });
});

describe('bakePathD — end-to-end', () => {
  it('scales a simple triangle around origin', () => {
    const d = 'M 0 0 L 10 0 L 5 10 Z';
    expect(bakePathD(d, 2, 2, ORIGIN)).toBe('M 0 0 L 20 0 L 10 20 Z');
  });

  it('scales around non-origin anchor', () => {
    const d = 'M 10 10 L 20 10 L 15 20 Z';
    expect(bakePathD(d, 2, 2, { x: 10, y: 10 })).toBe('M 10 10 L 30 10 L 20 30 Z');
  });

  it('empty d returns empty', () => {
    expect(bakePathD('', 5, 5, ORIGIN)).toBe('');
  });

  it('whitespace-only d returns input', () => {
    expect(bakePathD('   ', 5, 5, ORIGIN)).toBe('   ');
  });

  it('preserves the structure (commands stay the same letters)', () => {
    const d = 'M 0 0 c 1 1 2 2 3 3 z';
    const out = bakePathD(d, 2, 2, ORIGIN);
    // c stays c, z stays z
    expect(out).toContain('c ');
    expect(out.toLowerCase()).toContain('z');
  });

  it('round-trip with scale=1 around any anchor is a no-op (modulo formatting)', () => {
    const d = 'M 1 2 L 3 4 C 5 6 7 8 9 10 Z';
    expect(bakePathD(d, 1, 1, { x: 100, y: 100 })).toBe('M 1 2 L 3 4 C 5 6 7 8 9 10 Z');
  });

  it('first-m treated as absolute in real example', () => {
    const d = 'm 10 10 l 5 5 l 5 5';
    // 3 segments: m (rewritten to M, scaled abs), l (scaled rel), l (scaled rel)
    expect(bakePathD(d, 2, 2, ORIGIN)).toBe('M 20 20 l 10 10 l 10 10');
  });
});
