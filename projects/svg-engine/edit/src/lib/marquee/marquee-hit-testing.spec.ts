import { bbox, generateNodeId, type NodeId } from '@mosaicoo/svg-engine/core';
import {
  type MarqueeCandidate,
  nodesInsideMarquee,
  rectContainsRect,
  rectsIntersect,
} from './marquee-hit-testing';

function cand(bx: number, by: number, bw: number, bh: number): MarqueeCandidate {
  return { id: generateNodeId(), bbox: bbox(bx, by, bw, bh) };
}

describe('rectsIntersect', () => {
  it('detects clear overlap', () => {
    expect(rectsIntersect(bbox(0, 0, 10, 10), bbox(5, 5, 10, 10))).toBe(true);
  });

  it('detects full containment as overlap', () => {
    expect(rectsIntersect(bbox(0, 0, 100, 100), bbox(10, 10, 5, 5))).toBe(true);
  });

  it('rejects rects that are strictly apart', () => {
    expect(rectsIntersect(bbox(0, 0, 10, 10), bbox(20, 20, 5, 5))).toBe(false);
    expect(rectsIntersect(bbox(0, 0, 10, 10), bbox(0, 30, 5, 5))).toBe(false);
  });

  it('counts touching edges as overlap (Illustrator/Affinity convention)', () => {
    // a.right === b.left
    expect(rectsIntersect(bbox(0, 0, 10, 10), bbox(10, 0, 5, 10))).toBe(true);
    // b above a, sharing horizontal edge
    expect(rectsIntersect(bbox(0, 10, 10, 10), bbox(0, 0, 10, 10))).toBe(true);
  });
});

describe('rectContainsRect', () => {
  it('inner fully inside outer → true', () => {
    expect(rectContainsRect(bbox(0, 0, 100, 100), bbox(10, 10, 5, 5))).toBe(true);
  });

  it('coincident edges → true (inclusive)', () => {
    expect(rectContainsRect(bbox(0, 0, 10, 10), bbox(0, 0, 10, 10))).toBe(true);
  });

  it('inner partially outside → false', () => {
    expect(rectContainsRect(bbox(0, 0, 10, 10), bbox(5, 5, 10, 10))).toBe(false);
  });

  it('inner completely outside → false', () => {
    expect(rectContainsRect(bbox(0, 0, 10, 10), bbox(20, 20, 5, 5))).toBe(false);
  });
});

describe('nodesInsideMarquee', () => {
  it('returns ids whose bbox intersects (default mode)', () => {
    const a = cand(0, 0, 10, 10); // overlap
    const b = cand(50, 50, 10, 10); // far away
    const c = cand(5, 5, 100, 100); // partially overlapping
    const result = nodesInsideMarquee(bbox(0, 0, 20, 20), [a, b, c]);
    expect(result).toEqual([a.id, c.id]);
  });

  it('contain mode requires full enclosure', () => {
    const a = cand(2, 2, 4, 4); // inside marquee 0..20
    const b = cand(15, 15, 10, 10); // crosses border
    const result = nodesInsideMarquee(bbox(0, 0, 20, 20), [a, b], 'contain');
    expect(result).toEqual([a.id]);
  });

  it('zero-area marquee returns empty array regardless of mode', () => {
    const a = cand(0, 0, 10, 10);
    expect(nodesInsideMarquee(bbox(5, 5, 0, 0), [a], 'intersect')).toEqual([]);
    expect(nodesInsideMarquee(bbox(5, 5, 0, 10), [a], 'contain')).toEqual([]);
    expect(nodesInsideMarquee(bbox(5, 5, 10, 0), [a], 'intersect')).toEqual([]);
  });

  it('preserves input order in the result (stable for snapshot tests)', () => {
    const a = cand(0, 0, 5, 5);
    const b = cand(0, 0, 5, 5);
    const c = cand(0, 0, 5, 5);
    const result = nodesInsideMarquee(bbox(0, 0, 100, 100), [a, b, c]);
    expect(result).toEqual<NodeId[]>([a.id, b.id, c.id]);
  });

  it('empty candidate list returns empty array', () => {
    expect(nodesInsideMarquee(bbox(0, 0, 100, 100), [])).toEqual([]);
  });
});
