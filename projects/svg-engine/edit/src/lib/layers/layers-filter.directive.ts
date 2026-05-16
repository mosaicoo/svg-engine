import { Directive, effect, ElementRef, inject, type OnDestroy } from '@angular/core';
import { LayersService } from './layers.service';

/** Sentinel value we save in the data attribute when we override an inline display. */
const PREV_DISPLAY_ATTR = 'data-svge-prev-display';

/**
 * Apply {@link LayersService.hiddenIds} to the rendered SVG.
 *
 * Walks `[data-node-id]` descendants of its host on every CD cycle and
 * sets `style.display = 'none'` on the ones whose id is in `hiddenIds`.
 * On unhide, restores the previously-set inline display (saved in a
 * sentinel attribute so we don't strip user-set display values).
 *
 * **Why a directive (not a global stylesheet manager in the service)**:
 * - **Opt-in**: consumers who don't care about layers visibility don't
 *   pay any DOM scan cost — just don't attach the directive.
 * - **Scoped**: multiple SVG canvases (e.g., a thumbnail panel) can
 *   each apply their own filter without interfering.
 * - **No global side effects**: the service stays pure state; touching
 *   the DOM is the directive's job.
 *
 * **Cost**: O(n) DOM walk per CD cycle (where n = nodes with
 * `data-node-id` under the host). For typical documents (≤ 1k nodes)
 * this is negligible (sub-millisecond). Optimization for very large
 * documents (10k+) is a Fase 6 perf concern — a likely path is
 * batching via `requestAnimationFrame` and caching the previous
 * `hiddenIds` snapshot to apply diffs only.
 *
 * **Usage** — typically attach to the `<svge-renderer>` host or to a
 * wrapper around it:
 *
 * ```html
 * <svge-workspace-background>
 *   <svge-renderer svgeLayersFilter [tree]="tree()" [viewBox]="viewBox()">
 *     <svg:g svgeSelectionOverlay></svg:g>
 *   </svge-renderer>
 * </svge-workspace-background>
 * ```
 */
@Directive({
  selector: '[svgeLayersFilter]',
  standalone: true,
})
export class LayersFilter implements OnDestroy {
  private readonly elRef = inject(ElementRef<Element>);
  private readonly layers = inject(LayersService);

  /** Snapshot of ids we've hidden — needed so unhide restores correctly. */
  private readonly currentlyHidden = new Set<string>();

  constructor() {
    // `effect()` re-runs whenever a signal read inside changes —
    // here, `LayersService.hiddenIds()`. Fires synchronously on the
    // microtask queue after the signal update. Doesn't depend on
    // Angular CD cycles (works reliably in jsdom + production).
    //
    // **Edge case not covered**: if the consumer's renderer rebuilds
    // a hidden node's DOM element (e.g., after a tree mutation that
    // changes its parent), the new element won't have `display: none`
    // applied until the next signal change. In practice the same
    // mutation usually triggers other signal updates that re-fire
    // this effect. If a real-world scenario hits this, consider
    // adding a doc-version signal to the effect dependency list.
    effect(() => {
      this.applyVisibility();
    });
  }

  ngOnDestroy(): void {
    // Restore everything we hid so the DOM doesn't keep our overrides
    // if the directive is removed but the elements stay (rare but possible).
    for (const id of this.currentlyHidden) {
      this.restoreOne(id);
    }
    this.currentlyHidden.clear();
  }

  private applyVisibility(): void {
    const hiddenSet = this.layers.hiddenIds();
    const root = this.elRef.nativeElement;

    // Pass 1 — hide newly-hidden ids.
    for (const id of hiddenSet) {
      if (this.currentlyHidden.has(id)) continue;
      this.hideOne(id, root);
    }

    // Pass 2 — show ids no longer in the hidden set.
    for (const id of this.currentlyHidden) {
      if (hiddenSet.has(id as never)) continue;
      this.restoreOne(id);
      this.currentlyHidden.delete(id);
    }
  }

  private hideOne(id: string, root: Element): void {
    const nodes = root.querySelectorAll(`[data-node-id="${id}"]`) as NodeListOf<HTMLElement>;
    for (const el of nodes) {
      // Save the original inline display once, so unhide restores it
      // (avoids clobbering a consumer-set `display: block` etc.).
      if (!el.hasAttribute(PREV_DISPLAY_ATTR)) {
        el.setAttribute(PREV_DISPLAY_ATTR, el.style.display ?? '');
      }
      el.style.display = 'none';
    }
    this.currentlyHidden.add(id);
  }

  private restoreOne(id: string): void {
    const root = this.elRef.nativeElement;
    const nodes = root.querySelectorAll(`[data-node-id="${id}"]`) as NodeListOf<HTMLElement>;
    for (const el of nodes) {
      const prev = el.getAttribute(PREV_DISPLAY_ATTR);
      if (prev !== null) {
        el.style.display = prev;
        el.removeAttribute(PREV_DISPLAY_ATTR);
      } else {
        el.style.removeProperty('display');
      }
    }
  }
}
