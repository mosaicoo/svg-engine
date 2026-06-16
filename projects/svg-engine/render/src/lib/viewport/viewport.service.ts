import { computed, Injectable, signal } from '@angular/core';
import { bbox, type BoundingBox } from 'svg-engine/core';

const DEFAULT_MIN_ZOOM = 0.05;
const DEFAULT_MAX_ZOOM = 32;
const DEFAULT_ZOOM_STEP = 1.2;

/**
 * Viewport state for the SVG renderer: zoom level and pan offset over a
 * base "content" {@link BoundingBox}. Exposed as Angular signals so the
 * renderer can recompute the displayed `viewBox` reactively.
 *
 * Coordinate model:
 * - `contentBox` is the original document space ("what to show at zoom 1").
 * - `zoom` scales the visible window: `>1` zooms in (smaller window),
 *   `<1` zooms out (larger window).
 * - `panX`/`panY` translate the visible window in **content units**.
 *
 * The resulting visible {@link BoundingBox} is exposed via {@link viewBox},
 * suitable for binding to `<svg [attr.viewBox]>`.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly _contentBox = signal<BoundingBox>(bbox(0, 0, 800, 600));
  private readonly _zoom = signal(1);
  private readonly _panX = signal(0);
  private readonly _panY = signal(0);
  private readonly _minZoom = signal(DEFAULT_MIN_ZOOM);
  private readonly _maxZoom = signal(DEFAULT_MAX_ZOOM);

  readonly contentBox = this._contentBox.asReadonly();
  readonly zoom = this._zoom.asReadonly();
  readonly panX = this._panX.asReadonly();
  readonly panY = this._panY.asReadonly();
  readonly minZoom = this._minZoom.asReadonly();
  readonly maxZoom = this._maxZoom.asReadonly();

  /**
   * Visible window in content coordinates, derived from `contentBox`,
   * `zoom`, `panX`, `panY`. Bind directly to `<svg [attr.viewBox]>`.
   */
  readonly viewBox = computed<BoundingBox>(() => {
    const base = this._contentBox();
    const z = this._zoom();
    const w = base.width / z;
    const h = base.height / z;
    return {
      x: base.x + this._panX() + (base.width - w) / 2,
      y: base.y + this._panY() + (base.height - h) / 2,
      width: w,
      height: h,
    };
  });

  /** Replace the base content box (e.g., when loading a new document). */
  setContentBox(box: BoundingBox): void {
    this._contentBox.set(box);
  }

  /** Replace zoom directly (clamped to `[minZoom, maxZoom]`). */
  setZoom(zoom: number): void {
    this._zoom.set(this.clampZoom(zoom));
  }

  /** Multiply current zoom by `factor` (clamped). */
  multiplyZoom(factor: number): void {
    this._zoom.update((z) => this.clampZoom(z * factor));
  }

  /** Zoom in by the configured step factor. */
  zoomIn(step: number = DEFAULT_ZOOM_STEP): void {
    this.multiplyZoom(step);
  }

  /** Zoom out by the configured step factor. */
  zoomOut(step: number = DEFAULT_ZOOM_STEP): void {
    this.multiplyZoom(1 / step);
  }

  /** Replace pan offset directly (in content units). */
  setPan(x: number, y: number): void {
    this._panX.set(x);
    this._panY.set(y);
  }

  /** Translate the current pan by `(dx, dy)` in content units. */
  pan(dx: number, dy: number): void {
    this._panX.update((x) => x + dx);
    this._panY.update((y) => y + dy);
  }

  /**
   * Zoom by `factor` while keeping `anchor` (in document coordinates)
   * stationary on screen. Used by wheel-zoom (anchor = cursor) and
   * "zoom to selection" (anchor = selection centre).
   *
   * **Math**: pre-zoom relative position of the anchor inside the
   * visible viewBox must equal post-zoom relative position. Solving
   * for the new pan and applying both `zoom` and `pan` atomically
   * makes the visible viewBox preserve the anchor.
   *
   * **No-op-safe**: if `factor` would push zoom past min/max limits,
   * the clamped zoom may equal the current zoom — pan adjusts to a
   * zero delta, anchor stays put (no observable change).
   */
  zoomAt(factor: number, anchor: { readonly x: number; readonly y: number }): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const oldVb = this.viewBox();
    const cb = this._contentBox();
    const newZoom = this.clampZoom(this._zoom() * factor);
    const newW = cb.width / newZoom;
    const newH = cb.height / newZoom;
    // Relative position of anchor in the OLD visible viewBox.
    const relX = oldVb.width > 0 ? (anchor.x - oldVb.x) / oldVb.width : 0.5;
    const relY = oldVb.height > 0 ? (anchor.y - oldVb.y) / oldVb.height : 0.5;
    // Desired NEW viewBox top-left so that anchor preserves relX/relY.
    const newX = anchor.x - relX * newW;
    const newY = anchor.y - relY * newH;
    // Invert the viewBox computed (vb.x = cb.x + panX + (cb.w - newW)/2)
    // to recover the matching pan.
    const newPanX = newX - cb.x - (cb.width - newW) / 2;
    const newPanY = newY - cb.y - (cb.height - newH) / 2;
    this._zoom.set(newZoom);
    this._panX.set(newPanX);
    this._panY.set(newPanY);
  }

  /** Reset zoom to 1 and pan to origin (centered on content). */
  reset(): void {
    this._zoom.set(1);
    this._panX.set(0);
    this._panY.set(0);
  }

  /**
   * Reset to fit the content box exactly. Identical to {@link reset}
   * today; reserved for future "fit to selection" / "fit to bounds"
   * variants.
   */
  fit(): void {
    this.reset();
  }

  /**
   * **D-118** — frame `target` (in document/content coordinates) in the visible
   * viewBox: zoom so the box fits with `paddingFraction` margin on each side,
   * and pan so it's centered. Powers `View ▸ Zoom ▸ Fit Selection`.
   *
   * The visible viewBox always keeps the content aspect ratio, so the box is
   * fit "meet"-style — the limiting dimension touches the padded edge, the other
   * has extra room. Zoom is clamped to `[minZoom, maxZoom]`. A degenerate
   * (zero-area) target only re-centers, preserving the current zoom.
   */
  fitBox(target: BoundingBox, paddingFraction = 0.1): void {
    const cb = this._contentBox();
    // Center the visible window on the target's center. The viewBox center is
    // `cb.{x,y} + cb.{w,h}/2 + pan`, independent of zoom — so this holds at any
    // zoom level (see the `viewBox` formula).
    const tcx = target.x + target.width / 2;
    const tcy = target.y + target.height / 2;
    this._panX.set(tcx - cb.x - cb.width / 2);
    this._panY.set(tcy - cb.y - cb.height / 2);
    // Inflate the target by the margin, then pick the zoom whose visible window
    // (cb.{w,h}/z) just contains it on the limiting axis.
    const margin = 1 + 2 * Math.max(0, paddingFraction);
    const fitW = Math.abs(target.width) * margin;
    const fitH = Math.abs(target.height) * margin;
    if (!(fitW > 0) && !(fitH > 0)) return; // degenerate point: keep zoom
    const zByW = fitW > 0 ? cb.width / fitW : Infinity;
    const zByH = fitH > 0 ? cb.height / fitH : Infinity;
    this._zoom.set(this.clampZoom(Math.min(zByW, zByH)));
  }

  /** Configure clamping bounds for zoom. Throws on invalid input. */
  setZoomLimits(min: number, max: number): void {
    if (!(min > 0) || !(max > 0) || min >= max) {
      throw new RangeError(
        `ViewportService.setZoomLimits: require 0 < min < max (got ${min}, ${max})`,
      );
    }
    this._minZoom.set(min);
    this._maxZoom.set(max);
    this._zoom.update((z) => this.clampZoom(z));
  }

  private clampZoom(z: number): number {
    if (!Number.isFinite(z)) return 1;
    return Math.max(this._minZoom(), Math.min(this._maxZoom(), z));
  }
}
