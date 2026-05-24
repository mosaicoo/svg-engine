import type { SvgNodeBase } from './svg-node-base';

/**
 * Free-form path described by an SVG path data string (the `d` attribute).
 * Maps to SVG `<path>`. Path command parsing/validation is handled by the
 * `svg-engine/io` entry point — `core` treats `d` as opaque text.
 *
 * **D-055 — Live Corners (Item 6.4)**:
 *
 * `cornerRadius` is a NON-DESTRUCTIVE rounding hint. When > 0, the
 * renderer derives an `effectiveD` by rounding every "sharp" corner
 * (a vertex where two straight `L`-style segments meet at a cusp,
 * i.e. handleIn === point === handleOut) with that radius. The
 * authored `d` is preserved — setting `cornerRadius` back to 0/null
 * restores the original corners exactly.
 *
 * **Why a single uniform radius** (vs per-vertex map):
 * - Matches Affinity Designer's "Corner tool" v1 UX (one slider,
 *   applies to all sharp corners).
 * - Per-corner customization can be added later via
 *   `cornerRadii?: Record<vertexIndex, number>` without breaking
 *   this field — uniform stays as the fallback when no per-index
 *   entry exists.
 *
 * **Skipped during rounding**:
 * - Curved corners (handleIn/handleOut ≠ point) — already smooth,
 *   no rounding needed.
 * - Edges shorter than 2× the radius — radius is clamped to
 *   half the shorter neighbor edge to avoid self-intersection
 *   (matches Illustrator clamp behavior).
 * - Open-subpath endpoints (no rounding on a free end).
 *
 * Rounding is computed via `roundPathCorners()` in
 * `svg-engine/core/geometry`. Renderer applies the result; export
 * (svgExporter) emits the rounded `effectiveD` so exported SVGs
 * carry the visual result. The authored `d` survives round-trip
 * because import preserves whatever `d` it gets — fresh imports
 * just won't have `cornerRadius` set (it's a runtime-only enhancement).
 */
export interface PathNode extends SvgNodeBase {
  readonly type: 'path';
  readonly d: string;
  readonly cornerRadius?: number;
}
