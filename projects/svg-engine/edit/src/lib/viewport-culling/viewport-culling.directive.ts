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

  /** Snapshot of ids currently culled — drives diff application on next change. */
  private readonly currentlyCulled = new Set<string>();

  constructor() {
    effect(() => {
      this.applyCulling();
    });
  }

  ngOnDestroy(): void {
    // Restore everything we culled — if the directive is detached but
    // the elements stay, they should become visible again.
    for (const id of this.currentlyCulled) {
      this.uncullOne(id);
    }
    this.currentlyCulled.clear();
  }

  private applyCulling(): void {
    const target = this.culling.culledIds();
    const root = this.elRef.nativeElement;

    // Pass 1 — newly-culled ids (in target but not currently).
    for (const id of target) {
      if (this.currentlyCulled.has(id)) continue;
      this.cullOne(id, root);
    }

    // Pass 2 — newly-visible ids (currently culled but not in target).
    for (const id of this.currentlyCulled) {
      if (target.has(id as never)) continue;
      this.uncullOne(id);
      this.currentlyCulled.delete(id);
    }
  }

  private cullOne(id: string, root: Element): void {
    const els = root.querySelectorAll(`[data-node-id="${id}"]`);
    for (const el of els as NodeListOf<Element>) {
      el.setAttribute(CULLED_ATTR, '1');
    }
    this.currentlyCulled.add(id);
  }

  private uncullOne(id: string): void {
    const root = this.elRef.nativeElement;
    const els = root.querySelectorAll(`[data-node-id="${id}"]`);
    for (const el of els as NodeListOf<Element>) {
      el.removeAttribute(CULLED_ATTR);
    }
  }
}
