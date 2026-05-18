import { Directive, ElementRef, inject, type OnDestroy } from '@angular/core';
import type { Point } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';

/** Multiplicative factor applied per wheel notch (≈ 10% zoom step). */
const WHEEL_ZOOM_FACTOR = 1.1;

/**
 * Pro-editor canvas gestures — Fase 6 UX polish.
 *
 * Wires two universally-expected interactions onto its host element:
 *
 * 1. **Middle-mouse-button pan** (Figma / Illustrator / Affinity
 *    convention): press the middle button and drag to translate the
 *    visible viewBox. Pan delta is converted from screen-pixel
 *    movement to document units using the current viewBox/host width
 *    ratio, so the cursor stays "stuck" to the doc point under it.
 * 2. **Mouse-wheel zoom** (idem): scroll up zooms in, down zooms out,
 *    anchored on the cursor — the doc point under the cursor stays
 *    at the same screen position through the zoom (`viewport.zoomAt`).
 *
 * **Why an opt-in directive (not built into `<svge-renderer>`)**: not
 * every consumer wants browser-native pan/zoom. Embedded thumbnail
 * viewers, modal previews, and presentation contexts often want
 * static, no-interaction rendering. Attaching the gestures via a
 * separate directive keeps the renderer pure and gives consumers
 * the choice — same pattern as `[svgeLayersFilter]` and
 * `[svgeViewportCulling]`.
 *
 * **Where to attach**: on the canvas WRAPPER element — usually the
 * same `<section>` / `<div>` that hosts the `<svge-renderer>`. The
 * directive auto-discovers the inner `<svg>` via `querySelector('svg')`
 * to perform screen-to-doc coordinate conversion for zoom anchoring.
 *
 * **Pointer-capture pattern** for middle-mouse: capture on
 * `pointerdown`, listen for `pointermove`/`pointerup` on the captured
 * element, release on up/cancel. Standard pattern; no global listeners
 * to leak.
 *
 * **Co-existence with selection / marquee / transform gestures**: this
 * directive only handles `button === 1` (middle) — left-button drags
 * pass through to consumers' own pointer handlers untouched. Consumers
 * SHOULD early-return on `event.button !== 0` in their handlers to
 * avoid spurious marquee selection while the user middle-pans.
 *
 * **No interference with text selection**: middle-click on text fires
 * the browser's "open-in-new-tab" intent (in some browsers) and
 * starts auto-scroll (in others). Calling `preventDefault` on the
 * pointerdown blocks both.
 *
 * Usage:
 * ```html
 * <section class="canvas" svgeCanvasGestures>
 *   <svge-renderer [tree]="tree()" [viewBox]="viewBox()" />
 * </section>
 * ```
 */
@Directive({
  selector: '[svgeCanvasGestures]',
  standalone: true,
})
export class SvgeCanvasGestures implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly viewport = inject(ViewportService);

  private boundOnWheel = (e: WheelEvent): void => this.onWheel(e);
  private boundOnPointerDown = (e: PointerEvent): void => this.onPointerDown(e);

  /**
   * Active middle-mouse pan state. `null` when no pan is in progress.
   * Captured at gesture start so move deltas can be applied additively
   * to the pre-gesture pan offsets without accumulated float drift.
   */
  private panState: {
    readonly pointerId: number;
    readonly startScreenX: number;
    readonly startScreenY: number;
    readonly startPanX: number;
    readonly startPanY: number;
    readonly target: Element;
  } | null = null;

  constructor() {
    const el = this.host.nativeElement;
    // `{ passive: false }` is required because wheel-zoom calls
    // `preventDefault` to suppress page scroll. Angular's `(wheel)`
    // event binding can't opt out of passive on its own, so we attach
    // manually.
    el.addEventListener('wheel', this.boundOnWheel, { passive: false });
    el.addEventListener('pointerdown', this.boundOnPointerDown);
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('wheel', this.boundOnWheel);
    el.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.cleanupPanIfActive();
  }

  // ── Wheel zoom ────────────────────────────────────────────────────

  private onWheel(event: WheelEvent): void {
    // Always preventDefault so the page doesn't scroll while the user
    // is interacting with the canvas. Even when zoom is at its limit
    // and the call is effectively a no-op, suppressing the page-scroll
    // is the correct behaviour (Figma / Illustrator do the same).
    event.preventDefault();
    const anchor = this.screenToDoc(event.clientX, event.clientY);
    if (anchor === null) return;
    // deltaY > 0 = scroll DOWN = zoom OUT (smaller). The factor flips
    // accordingly. deltaMode is ignored (line vs pixel) — every notch
    // is one step regardless of trackpad vs mouse to keep the feel
    // consistent.
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
    this.viewport.zoomAt(factor, anchor);
  }

  // ── Middle-mouse pan ──────────────────────────────────────────────

  private onPointerDown(event: PointerEvent): void {
    // Only the middle button initiates pan. Left (0) and right (2)
    // pass through untouched — left-click is selection / drag /
    // marquee (consumer's domain), right-click is the browser's
    // context menu (we don't override).
    if (event.button !== 1) return;
    event.preventDefault();
    const target = event.target as Element;
    if (
      typeof (target as Element & { setPointerCapture?: unknown }).setPointerCapture === 'function'
    ) {
      try {
        (target as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(
          event.pointerId,
        );
      } catch {
        // Some elements / browsers refuse capture — fall back to listening
        // on the document. Acceptable degradation.
      }
    }
    this.panState = {
      pointerId: event.pointerId,
      startScreenX: event.clientX,
      startScreenY: event.clientY,
      startPanX: this.viewport.panX(),
      startPanY: this.viewport.panY(),
      target,
    };
    target.addEventListener('pointermove', this.onPanMove as EventListener);
    target.addEventListener('pointerup', this.onPanEnd as EventListener);
    target.addEventListener('pointercancel', this.onPanEnd as EventListener);
  }

  private onPanMove = (event: PointerEvent): void => {
    const s = this.panState;
    if (s === null || event.pointerId !== s.pointerId) return;
    const dx = event.clientX - s.startScreenX;
    const dy = event.clientY - s.startScreenY;
    // Convert screen-pixel delta to document units using the ratio of
    // visible viewBox width to the host element's CSS-pixel width.
    // This keeps the cursor "stuck" to the doc point it grabbed,
    // regardless of zoom level.
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const vb = this.viewport.viewBox();
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    // Pan is INVERSE to drag direction (drag right → world moves
    // right under cursor → viewBox shifts LEFT → panX decreases).
    this.viewport.setPan(s.startPanX - dx * scaleX, s.startPanY - dy * scaleY);
  };

  private onPanEnd = (event: PointerEvent): void => {
    const s = this.panState;
    if (s === null || event.pointerId !== s.pointerId) return;
    this.cleanupPanIfActive();
  };

  private cleanupPanIfActive(): void {
    const s = this.panState;
    if (s === null) return;
    s.target.removeEventListener('pointermove', this.onPanMove as EventListener);
    s.target.removeEventListener('pointerup', this.onPanEnd as EventListener);
    s.target.removeEventListener('pointercancel', this.onPanEnd as EventListener);
    if (
      typeof (s.target as Element & { releasePointerCapture?: unknown }).releasePointerCapture ===
      'function'
    ) {
      try {
        (
          s.target as Element & { releasePointerCapture: (id: number) => void }
        ).releasePointerCapture(s.pointerId);
      } catch {
        /* already released */
      }
    }
    this.panState = null;
  }

  // ── Coordinate conversion ─────────────────────────────────────────

  /**
   * Convert a screen-pixel point to document coordinates by walking the
   * inner `<svg>`'s `getScreenCTM` inverse. Returns null when the SVG
   * isn't present yet or layout dimensions are zero (typical in jsdom
   * tests — caller no-ops gracefully).
   */
  private screenToDoc(clientX: number, clientY: number): Point | null {
    const svg = this.host.nativeElement.querySelector('svg');
    if (svg === null) return null;
    if (typeof (svg as SVGSVGElement).getScreenCTM !== 'function') return null;
    const ctm = (svg as SVGSVGElement).getScreenCTM();
    if (ctm === null) return null;
    const pt = (svg as SVGSVGElement).createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const inv = pt.matrixTransform(ctm.inverse());
    return { x: inv.x, y: inv.y };
  }
}
