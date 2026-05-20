import { Directive, ElementRef, inject, type OnDestroy } from '@angular/core';
import type { Point } from 'svg-engine/core';
import { screenToDoc, ViewportService } from 'svg-engine/render';
import { capturePointer, releasePointer } from '../pointer';
import { WorkspaceService, wheelZoomSensitivityFromSpeed } from '../workspace/workspace.service';

/**
 * Maximum zoom factor allowed per single wheel event. Even with extreme
 * deltaY (touchpad pinch, fast wheel flick), clamping to [0.5, 2.0]
 * keeps a single event from leaping multiple zoom levels and disorienting
 * the user.
 */
const PER_EVENT_FACTOR_MIN = 0.5;
const PER_EVENT_FACTOR_MAX = 2.0;

/**
 * `deltaMode` normalizers (W3C UI Events spec): convert line/page-mode
 * deltas to pixel-mode equivalents so the sensitivity formula behaves
 * the same regardless of how the browser reports the wheel event.
 * Pixel-mode is the modern default; line/page modes appear on older
 * Firefox + some accessibility shells.
 */
const DELTA_MODE_PIXEL_SCALE = 1;
const DELTA_MODE_LINE_SCALE = 16; // ~one CSS line ≈ 16 CSS px
const DELTA_MODE_PAGE_SCALE = 800; // ~one viewport-page ≈ 800 px

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
  private readonly workspace = inject(WorkspaceService);

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

    // Normalize deltaY to "approximate CSS pixels" so the same
    // sensitivity coefficient works across deltaMode variants.
    const scale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? DELTA_MODE_LINE_SCALE
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? DELTA_MODE_PAGE_SCALE
          : DELTA_MODE_PIXEL_SCALE;
    const normalizedDelta = event.deltaY * scale;

    // Exponential mapping: factor = exp(-delta * sensitivity).
    // - sensitivity ∈ [0.0002, 0.002] from `wheelZoomSpeed` 1-10
    // - delta ≈ 100 (one mouse-wheel notch in pixel mode)
    // - speed=5 (default) → exp(-100 * 0.001) = exp(-0.1) ≈ 0.905 → ~10% zoom out
    // - speed=1 → exp(-100 * 0.0002) = exp(-0.02) ≈ 0.980 → ~2% zoom out
    // - speed=10 → exp(-100 * 0.002) = exp(-0.2) ≈ 0.819 → ~18% zoom out
    //
    // Old behaviour (1.1 per notch ignoring magnitude) hit the user's
    // reported "5% to 226% in light scroll" because a single trackpad
    // gesture can fire 5+ wheel events, each with deltaY ~100+. The
    // exponential formula stays calibrated regardless of event density.
    const sensitivity = wheelZoomSensitivityFromSpeed(this.workspace.interaction().wheelZoomSpeed);
    const rawFactor = Math.exp(-normalizedDelta * sensitivity);

    // Clamp the per-event factor so even an extreme delta (touchpad
    // pinch reporting deltaY = 1000+) can't leap multiple zoom levels
    // in one event.
    const factor = Math.max(PER_EVENT_FACTOR_MIN, Math.min(PER_EVENT_FACTOR_MAX, rawFactor));
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
    // Best-effort capture via the shared util (D-036). When the browser
    // refuses (Safari on disabled / Firefox edge cases), fall back to
    // listening on `target` directly — the listeners below cover both
    // captured and uncaptured paths.
    capturePointer(event);
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
    // Synthesize an event-shape with the stored target+pointerId so the
    // shared `releasePointer` util (D-036) can be used uniformly. The
    // stored target is the same one we captured on `pointerdown`; the
    // stored id is the same pointerId from that event. Cast via
    // `unknown` because we're not constructing a real PointerEvent
    // (which has 60+ readonly fields we don't touch); only `target`
    // and `pointerId` are read by the util.
    releasePointer({ target: s.target, pointerId: s.pointerId } as unknown as PointerEvent);
    this.panState = null;
  }

  // ── Coordinate conversion ─────────────────────────────────────────

  /**
   * Convert a screen-pixel point to document coordinates. Delegates to
   * the canonical `screenToDoc` util in svg-engine/render (D-036); this
   * wrapper resolves the inner `<svg>` from the host element so callers
   * don't need to plumb the SVG ref.
   *
   * Returns null when the SVG isn't present yet (jsdom / SSR / mount
   * race) — callers no-op gracefully.
   */
  private screenToDoc(clientX: number, clientY: number): Point | null {
    // `host.nativeElement` is typed as `Element` by Angular's stricter
    // ElementRef generic in v21; `querySelector` on plain `Element` is
    // overload-less, so we narrow the result via a final cast instead
    // of the generic. Same SVG ref the directive originally used.
    const svg = this.host.nativeElement.querySelector('svg') as SVGSVGElement | null;
    return screenToDoc(svg, clientX, clientY);
  }
}
