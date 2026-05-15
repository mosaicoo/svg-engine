import {
  IDENTITY_TRANSFORM,
  multiply,
  rotate,
  scale,
  translate,
  type Transform,
} from 'svg-engine/core';

/**
 * Parse an SVG `transform` attribute value (e.g.
 * `"translate(10 20) rotate(45)"`) into a {@link Transform} matrix.
 *
 * Supports the full set of SVG-1.1 transform functions:
 *   - `matrix(a, b, c, d, e, f)`
 *   - `translate(tx)` or `translate(tx, ty)`
 *   - `scale(s)` or `scale(sx, sy)`
 *   - `rotate(angle)` or `rotate(angle, cx, cy)`  (angle in degrees)
 *   - `skewX(angle)` and `skewY(angle)`           (angle in degrees)
 *
 * Multiple functions are composed left-to-right, matching the SVG spec
 * (the leftmost function is the outer-most transform).
 *
 * Returns the identity matrix when:
 *  - the input is empty/whitespace,
 *  - or the input contains a function we cannot parse (in which case we
 *    log a warning to console and fall back to identity, matching the
 *    behaviour of browsers when given a malformed attribute).
 *
 * Rationale for parsing manually: jsdom (used by Vitest in
 * `@angular/build:unit-test`) does not implement
 * `SVGGraphicsElement.transform.baseVal.consolidate()` reliably. A
 * pure-string parser keeps the bbox computation testable in headless
 * environments **and** avoids the global `DOMMatrix` dependency.
 */
export function parseTransformAttr(attr: string | null): Transform {
  if (attr === null || attr.trim() === '') return IDENTITY_TRANSFORM;
  const fnRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let result: Transform = IDENTITY_TRANSFORM;
  let match: RegExpExecArray | null;
  let consumed = false;
  while ((match = fnRegex.exec(attr)) !== null) {
    consumed = true;
    const name = match[1] ?? '';
    const argsRaw = match[2] ?? '';
    const args = parseArgList(argsRaw);
    const m = matrixFor(name, args);
    if (m === null) return IDENTITY_TRANSFORM;
    result = multiply(result, m);
  }
  if (!consumed) return IDENTITY_TRANSFORM;
  return result;
}

function parseArgList(raw: string): readonly number[] {
  if (raw.trim() === '') return [];
  return raw
    .split(/[,\s]+/)
    .filter((s) => s.length > 0)
    .map(Number);
}

function matrixFor(name: string, args: readonly number[]): Transform | null {
  switch (name) {
    case 'matrix':
      if (args.length !== 6) return null;
      return [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!];
    case 'translate':
      if (args.length === 1) return translate(args[0]!, 0);
      if (args.length === 2) return translate(args[0]!, args[1]!);
      return null;
    case 'scale':
      if (args.length === 1) return scale(args[0]!);
      if (args.length === 2) return scale(args[0]!, args[1]!);
      return null;
    case 'rotate': {
      if (args.length === 1) return rotate(degToRad(args[0]!));
      if (args.length === 3) {
        // rotate(a, cx, cy) = T(cx,cy) * R(a) * T(-cx,-cy)
        const [a, cx, cy] = args;
        const r = rotate(degToRad(a!));
        return multiply(multiply(translate(cx!, cy!), r), translate(-cx!, -cy!));
      }
      return null;
    }
    case 'skewX': {
      if (args.length !== 1) return null;
      const t = Math.tan(degToRad(args[0]!));
      return [1, 0, t, 1, 0, 0];
    }
    case 'skewY': {
      if (args.length !== 1) return null;
      const t = Math.tan(degToRad(args[0]!));
      return [1, t, 0, 1, 0, 0];
    }
    default:
      return null;
  }
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
