import { Directive, effect, ElementRef, inject, type OnDestroy } from '@angular/core';
import { ViewportCullingService } from './viewport-culling.service';

/** Marker attribute (consumed by the globally-injected stylesheet rule). */
const CULLED_ATTR = 'data-svge-culled';

/**
 * Apply {@link ViewportCullingService.culledIds} to the rendered SVG.
 * Sister directive of `[svgeLayersFilter]` — same pattern (walk
 * `[data-node-id]` descendants, diff against previous snapshot) but
 * driven by viewport visibility instead of user-toggled layer state.
 *
 * **Mechanism**: sets `data-svge-culled="1"` on culled elements. The
 * service injects a stylesheet rule
 * `[data-svge-culled="1"] { display: none; }` so the browser skips
 * paint without per-frame `style.display` writes. Removing the attr
 * is the only DOM operation per "now-visible" transition.
 *
 * **Opt-in**: just like `[svgeLayersFilter]`. Consumers who don't want
 * culling (read-only viewers with small docs, no-DOM tests, etc.)
 * simply don't attach this directive — zero runtime cost.
 *
 * **Composition with `[svgeLayersFilter]`**: both directives can be
 * attached to the same renderer. Layers-filter writes
 * `style.display='none'`; culling writes `data-svge-culled='1'`. They
 * don't interfere because they use different mechanisms — an element
 * stays hidden as long as EITHER applies (CSS specificity / cascade
 * doesn't matter because both turn into `display:none`).
 *
 * Usage:
 * ```html
 * <svge-renderer svgeLayersFilter svgeViewportCulling
 *                [tree]="tree()" [viewBox]="viewBox()">
 *   <svg:g svgeSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 *
 * **Cost**: O(changed) per viewport change — only newly-culled and
 * newly-visible ids touch the DOM, not the full child list. For a
 * 16k-node doc with ~200 top-level shapes, even a worst-case sweep
 * touches ≤ 200 elements per frame.
 */
@Directive({
  selector: '[svgeViewportCulling]',
  standalone: true,
})
export class SvgeViewportCullingDirective implements OnDestroy {
  private readonly elRef = inject(ElementRef<Element>);
  private readonly culling = inject(ViewportCullingService);

  /**
   * Pending rAF id when a culling pass is scheduled. Used to coalesce
   * multiple signal-driven re-runs within the same frame into a single
   * DOM-write batch — pan/zoom emits many viewport changes per frame and
   * we don't want to do N DOM walks for N intermediate states.
   */
  private rafId: number | null = null;

  constructor() {
    effect(() => {
      // Read the signal here (inside the effect) so dependencies track,
      // but DEFER the actual DOM work to rAF. The signal value will be
      // re-read inside `applyCulling` against the current state.
      this.culling.culledIds();
      this.scheduleCullingPass();
    });
  }

  ngOnDestroy(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Restore every element we culled so the DOM isn't left in a
    // partially-hidden state if the directive is removed but the
    // elements stay.
    const root = this.elRef.nativeElement;
    const els = root.querySelectorAll(`[${CULLED_ATTR}="1"]`);
    for (const el of els as NodeListOf<Element>) {
      el.removeAttribute(CULLED_ATTR);
    }
  }

  /**
   * rAF-batched culling pass scheduler. Multiple invocations within the
   * same frame collapse into one apply, so a 60-Hz pan/zoom doesn't
   * compound work across intermediate sub-frame signal updates.
   *
   * **Why rAF over microtask**: the visual change we're computing only
   * matters per browser repaint. Microtask-level coalescing would still
   * fire 1× per signal write (potentially many per frame in tight loops).
   */
  private scheduleCullingPass(): void {
    if (this.rafId !== null) return;
    if (typeof requestAnimationFrame !== 'function') {
      // Non-browser env (SSR / jsdom without rAF stub). Apply immediately
      // so semantics stay testable; perf concern doesn't apply here.
      this.applyCulling();
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.applyCulling();
    });
  }

  /**
   * **Single-pass** DOM walk to reconcile culling state. Walks every
   * `[data-node-id]` descendant once per call (NOT per-id-change), reads
   * its current attr state, and toggles only when the desired and
   * actual states differ. Replaces the previous per-id `querySelectorAll`
   * loops that scaled as O(changed_ids × descendants).
   *
   * **Cost**: O(elements-with-data-node-id) per call. For 16k-node
   * Illustrator outputs, ~16k attr reads + at-most-N attr writes per
   * frame is sub-millisecond on modern browsers — well within the
   * 60 FPS budget (16.67 ms/frame).
   *
   * **Correctness**: descendants of culled groups stay in the DOM with
   * no per-element attribute — CSS `display: none` cascades from the
   * group `<g>` (browser skips painting the entire subtree without us
   * touching each child).
   */
  private applyCulling(): void {
    const target = this.culling.culledIds();
    const root = this.elRef.nativeElement;
    const els = root.querySelectorAll('[data-node-id]');
    for (const el of els as NodeListOf<Element>) {
      const id = el.getAttribute('data-node-id');
      if (id === null) continue;
      const shouldBeCulled = target.has(id as never);
      const isCurrentlyCulled = el.getAttribute(CULLED_ATTR) === '1';
      if (shouldBeCulled && !isCurrentlyCulled) {
        el.setAttribute(CULLED_ATTR, '1');
      } else if (!shouldBeCulled && isCurrentlyCulled) {
        el.removeAttribute(CULLED_ATTR);
      }
    }
  }
}
