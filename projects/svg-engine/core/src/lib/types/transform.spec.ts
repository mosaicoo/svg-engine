import {
  applyTransform,
  IDENTITY_TRANSFORM,
  isIdentity,
  multiply,
  rotate,
  scale,
  translate,
  type Transform,
} from './transform';

describe('Transform', () => {
  it('IDENTITY_TRANSFORM is the identity matrix', () => {
    expect(IDENTITY_TRANSFORM).toEqual([1, 0, 0, 1, 0, 0]);
    expect(isIdentity(IDENTITY_TRANSFORM)).toBe(true);
  });

  describe('translate', () => {
    it('returns a translation-only transform', () => {
      expect(translate(10, 20)).toEqual([1, 0, 0, 1, 10, 20]);
    });

    it('moves a point by the translation vector', () => {
      const t = translate(5, 7);
      expect(applyTransform(t, 3, 4)).toEqual({ x: 8, y: 11 });
    });
  });

  describe('scale', () => {
    it('uses a single argument for uniform scale', () => {
      expect(scale(2)).toEqual([2, 0, 0, 2, 0, 0]);
    });

    it('accepts independent X / Y scales', () => {
      expect(scale(2, 3)).toEqual([2, 0, 0, 3, 0, 0]);
    });
  });

  describe('rotate', () => {
    it('produces the expected matrix at 90 degrees', () => {
      const m = rotate(Math.PI / 2);
      // cos(90)=0, sin(90)=1
      expect(m[0]).toBeCloseTo(0);
      expect(m[1]).toBeCloseTo(1);
      expect(m[2]).toBeCloseTo(-1);
      expect(m[3]).toBeCloseTo(0);
    });

    it('rotates a point around the origin', () => {
      const m = rotate(Math.PI / 2);
      const p = applyTransform(m, 1, 0);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(1);
    });
  });

  describe('multiply', () => {
    it('identity * X = X', () => {
      const t = translate(7, 9);
      expect(multiply(IDENTITY_TRANSFORM, t)).toEqual(t);
    });

    it('X * identity = X', () => {
      const t = translate(7, 9);
      expect(multiply(t, IDENTITY_TRANSFORM)).toEqual(t);
    });

    it('composes translate then scale (T * S applied to point)', () => {
      // newTransform = T(10, 20) * S(2)  =>  point (1,1) → first scale to (2,2) then translate to (12, 22)
      const composed: Transform = multiply(translate(10, 20), scale(2));
      expect(applyTransform(composed, 1, 1)).toEqual({ x: 12, y: 22 });
    });

    it('composes scale then translate (S * T applied to point)', () => {
      // newTransform = S(2) * T(10, 20)  =>  point (1,1) → first translate to (11, 21) then scale to (22, 42)
      const composed: Transform = multiply(scale(2), translate(10, 20));
      expect(applyTransform(composed, 1, 1)).toEqual({ x: 22, y: 42 });
    });
  });

  describe('isIdentity', () => {
    it('detects exact identity', () => {
      expect(isIdentity([1, 0, 0, 1, 0, 0])).toBe(true);
    });

    it('detects near-identity within epsilon', () => {
      expect(isIdentity([1.0000000001, 0, 0, 1, 0, 0])).toBe(true);
    });

    it('rejects slight non-identity past epsilon', () => {
      expect(isIdentity([1.001, 0, 0, 1, 0, 0])).toBe(false);
    });
  });
});
