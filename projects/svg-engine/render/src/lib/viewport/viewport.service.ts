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
