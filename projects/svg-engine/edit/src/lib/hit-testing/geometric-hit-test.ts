/**
 * **D-091 — Geometric hit-test with tolerance (hit slop).**
 *
 * The primary selection path uses the browser's native DOM hit-testing
 * (`event.target`): exact, fast, z-order-correct, and respecting paint.
 * But with `pointer-events: visiblePainted` (the default), an **unfilled**
 * shape (`fill: none`) is only hittable on its painted stroke — often a
 * 1px line — so the user has to click exactly on it. Professional editors
 * (Illustrator with "Object Selection by Path Only" off, Figma, Inkscape)
 * instead let you click the shape's **area** even when unfilled, plus a
 * few-pixel **tolerance** band around thin strokes.
 *
 * This module is the **fallback** used only when the native hit lands on
 * background. It probes candidate geometry elements with the browser's own
 * geometry engine — `isPointInFill` (area, regardless of paint) and
 * `isPointInStroke` (the stroke), plus a screen-space tolerance ring — so
 * the result is guaranteed consistent with what's actually drawn (curves,
 * arcs, fill-rule, transforms all handled by the UA). Filled shapes are
 * unaffected: the native path already caught them.
 *
 * **DOM-native by design**: relies on `SVGGeometryElement.isPointInFill/
 * isPointInStroke` + `getScreenCTM`, which only exist in a real browser
 * (not jsdom/happy-dom), so this isn't unit-tested directly — the pure
 * resolution/z-order/scope logic it feeds (`resolveSelectableNodeIdFromElement`)
 * is. Verified via build + manual canvas testing.
 */

/** Default tolerance (CSS px) around strokes — matches Illustrator's ~3-4px. */
export const DEFAULT_HIT_TOLERANCE_PX = 4;

/** SVG geometry elements that expose `isPointInFill` / `isPointInStroke`. */
const GEOMETRY_SELECTOR = 'path, rect, circle, ellipse, line, polygon, polyline';

/** A geometry element narrowed to the methods we need. */
interface Probeable extends SVGGraphicsElement {
  isPointInFill(point: DOMPointInit): boolean;
  isPointInStroke(point: DOMPointInit): boolean;
}

function isProbeable(el: Element): el is Probeable {
  return (
    typeof (el as Partial<Probeable>).isPointInFill === 'function' &&
    typeof (el as Partial<Probeable>).isPointInStroke === 'function' &&
    typeof (el as Partial<SVGGraphicsElement>).getScreenCTM === 'function'
  );
}

/**
 * Find the top-most geometry element whose fill area, stroke, or a
 * `tolerancePx` band around either contains the screen point
 * `(clientX, clientY)`. Returns `null` when nothing is within tolerance
 * (caller then treats the click as empty canvas).
 *
 * Iterates candidates in **reverse document order** = top-most first
 * (SVG paint order: later siblings draw on top), so the returned element
 * is the visually front-most match — same precedence a painted click has.
 *
 * @param svgRoot  the rendered `<svg>` (used to create SVG points).
 * @param tolerancePx  hit slop in CSS pixels (default {@link DEFAULT_HIT_TOLERANCE_PX}).
 */
export function geometricHitTestElement(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number,
  tolerancePx: number = DEFAULT_HIT_TOLERANCE_PX,
): SVGGraphicsElement | null {
  const candidates = svgRoot.querySelectorAll<SVGElement>(GEOMETRY_SELECTOR);
  // Reverse = front-most first.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i]!;
    if (!isProbeable(el)) continue;
    if (hitsWithinTolerance(svgRoot, el, clientX, clientY, tolerancePx)) {
      return el;
    }
  }
  return null;
}

/**
 * Whether `el`'s fill/stroke (inflated by `tolerancePx` in screen space)
 * contains the screen point. Samples the centre plus a ring of points at
 * radius `tolerancePx` so the slop is uniform on screen regardless of the
 * element's zoom/rotation (each sample is mapped back into the element's
 * local user space via the inverse screen CTM).
 */
function hitsWithinTolerance(
  svgRoot: SVGSVGElement,
  el: Probeable,
  clientX: number,
  clientY: number,
  tolerancePx: number,
): boolean {
  const ctm = el.getScreenCTM();
  if (ctm === null) return false;
  const inv = ctm.inverse();

  const probe = (sx: number, sy: number): boolean => {
    const local = applyToPoint(svgRoot, inv, sx, sy);
    return el.isPointInFill(local) || el.isPointInStroke(local);
  };

  // Centre first (the common case: clicked the area / on the stroke).
  if (probe(clientX, clientY)) return true;
  if (tolerancePx <= 0) return false;

  // 8-point ring at the tolerance radius — cheap and catches near-stroke
  // clicks from any direction.
  const r = tolerancePx;
  const diag = r * 0.70710678; // r / √2
  const ring: readonly [number, number][] = [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
    [diag, diag],
    [diag, -diag],
    [-diag, diag],
    [-diag, -diag],
  ];
  for (const [dx, dy] of ring) {
    if (probe(clientX + dx, clientY + dy)) return true;
  }
  return false;
}

/** Map a screen point through `matrix` into an SVG point (element local space). */
function applyToPoint(
  svgRoot: SVGSVGElement,
  matrix: DOMMatrix,
  clientX: number,
  clientY: number,
): DOMPoint {
  const pt = svgRoot.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(matrix);
}
