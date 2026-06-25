import { bbox } from '@mosaicoo/svg-engine/core';
import { allAnchors, anchorPoint, BBOX_ANCHORS, findNearestAnchor } from './bbox-anchors';

describe('BBOX_ANCHORS', () => {
  it('lists exactly 9 anchors in row-major TL→BR order', () => {
    expect(BBOX_ANCHORS).toEqual(['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']);
    expect(BBOX_ANCHORS).toHaveLength(9);
  });
});

describe('anchorPoint', () => {
  const b = bbox(10, 20, 100, 50);

  it('TL = (left, top)', () => expect(anchorPoint(b, 'tl')).toEqual({ x: 10, y: 20 }));
  it('TC = (centerX, top)', () => expect(anchorPoint(b, 'tc')).toEqual({ x: 60, y: 20 }));
  it('TR = (right, top)', () => expect(anchorPoint(b, 'tr')).toEqual({ x: 110, y: 20 }));
  it('ML = (left, centerY)', () => expect(anchorPoint(b, 'ml')).toEqual({ x: 10, y: 45 }));
  it('MC = (centerX, centerY)', () => expect(anchorPoint(b, 'mc')).toEqual({ x: 60, y: 45 }));
  it('MR = (right, centerY)', () => expect(anchorPoint(b, 'mr')).toEqual({ x: 110, y: 45 }));
  it('BL = (left, bottom)', () => expect(anchorPoint(b, 'bl')).toEqual({ x: 10, y: 70 }));
  it('BC = (centerX, bottom)', () => expect(anchorPoint(b, 'bc')).toEqual({ x: 60, y: 70 }));
  it('BR = (right, bottom)', () => expect(anchorPoint(b, 'br')).toEqual({ x: 110, y: 70 }));
});

describe('allAnchors', () => {
  it('returns all 9 anchors keyed correctly', () => {
    const b = bbox(0, 0, 100, 100);
    const a = allAnchors(b);
    expect(Object.keys(a).sort()).toEqual([...BBOX_ANCHORS].sort());
    expect(a.tl).toEqual({ x: 0, y: 0 });
    expect(a.br).toEqual({ x: 100, y: 100 });
    expect(a.mc).toEqual({ x: 50, y: 50 });
  });
});

describe('findNearestAnchor', () => {
  const b = bbox(0, 0, 100, 100);

  it('snaps to TL when point is near top-left', () => {
    expect(findNearestAnchor(b, { x: 2, y: 1 }, 5)).toBe('tl');
  });

  it('snaps to MC when point is at center within radius', () => {
    expect(findNearestAnchor(b, { x: 51, y: 50 }, 5)).toBe('mc');
  });

  it('returns null when no anchor is within radius', () => {
    expect(findNearestAnchor(b, { x: 25, y: 25 }, 3)).toBeNull();
  });

  it('returns null when radius is non-positive', () => {
    expect(findNearestAnchor(b, { x: 0, y: 0 }, 0)).toBeNull();
    expect(findNearestAnchor(b, { x: 0, y: 0 }, -1)).toBeNull();
  });

  it('picks the absolute closest when multiple anchors are within radius', () => {
    // Point (49, 49) is near both TL (distance ≈ 69) and MC (distance ≈ 1.4)
    // Only MC is within radius 5
    expect(findNearestAnchor(b, { x: 49, y: 49 }, 5)).toBe('mc');
  });
});
