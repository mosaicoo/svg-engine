import { Directive, effect, ElementRef, inject, type OnDestroy } from '@angular/core';
import { WorkspaceService } from './workspace.service';

/** Sentinel attribute marking elements we've overridden, so restore is clean. */
const MARKER_ATTR = 'data-svge-outline-mode';

/**
 * Toggles **Outline view mode** (Illustrator / Affinity convention)
 * on the host SVG. When `WorkspaceService.outlineMode()` is `true`:
 *
 * - Every rendered shape (`rect`, `ellipse`, `path`, `polygon`,
 *   `polyline`, `line`, `text`, `image`) loses its `fill` (forced
 *   to `none`) and gets a 1px outline stroke if it didn't have one
 *   already. Works regardless of the document's authored fill/stroke
 *   — useful for tracing dense or overlapping geometry.
 *
 * When toggled off, every override is restored from the marker
 * attribute so the consumer's authored styling comes back intact.
 *
 * **Opt-in directive** (mirrors `LayersFilter` / `IsolationFilter`):
 * consumers attach `svgeOutlineFilter` to the renderer host they want
 * affected. Multiple SVG canvases can independently toggle.
 *
 * **Usage**:
 * ```html
 * <svge-renderer svgeLayersFilter svgeIsolationFilter svgeOutlineFilter [tree]="tree()">
 *   ...
 * </svge-renderer>
 * ```
 */
@Directive({
  selector: '[svgeOutlineFilter]',
  standalone: true,
})
export class OutlineFilter implements OnDestroy {
  private readonly elRef = inject(ElementRef<Element>);
  private readonly ws = inject(WorkspaceService);
  private currentlyOn = false;

  constructor() {
    effect(() => {
      const on = this.ws.outlineMode();
      if (on === this.currentlyOn) return;
      this.currentlyOn = on;
      if (on) this.applyOn();
      else this.restore();
    });
  }

  ngOnDestroy(): void {
    if (this.currentlyOn) {
      this.restore();
      this.currentlyOn = false;
    }
  }

  private applyOn(): void {
    const host = this.elRef.nativeElement;
    // Target only the renderable geometry inside [data-node-id] wrappers;
    // overlays (selection handles, snap guides, etc.) live elsewhere in
    // the SVG and shouldn't be touched.
    const shapes = host.querySelectorAll(
      '[data-node-id] > rect,' +
        ' [data-node-id] > ellipse,' +
        ' [data-node-id] > path,' +
        ' [data-node-id] > polygon,' +
        ' [data-node-id] > polyline,' +
        ' [data-node-id] > line,' +
        ' [data-node-id] > text,' +
        ' [data-node-id] > image',
    ) as NodeListOf<SVGElement>;
    for (const el of shapes) {
      // Snapshot the inline + computed values once so restore is exact.
      const inlineFill = el.style.fill;
      const inlineStroke = el.style.stroke;
      const inlineStrokeWidth = el.style.strokeWidth;
      el.setAttribute(
        MARKER_ATTR,
        JSON.stringify({
          fill: inlineFill,
          stroke: inlineStroke,
          strokeWidth: inlineStrokeWidth,
        }),
      );
      el.style.fill = 'none';
      // If the element had no visible stroke, give it a 1px outline so
      // it remains discoverable. We don't override authored strokes —
      // those stay at the user's color/width.
      const computed = window.getComputedStyle(el);
      const hasStroke = computed.stroke !== 'none' && computed.stroke !== 'rgba(0, 0, 0, 0)';
      if (!hasStroke) {
        el.style.stroke = '#1976d2';
        el.style.strokeWidth = '1';
      }
    }
  }

  private restore(): void {
    const host = this.elRef.nativeElement;
    const marked = host.querySelectorAll(`[${MARKER_ATTR}]`) as NodeListOf<SVGElement>;
    for (const el of marked) {
      const raw = el.getAttribute(MARKER_ATTR);
      el.removeAttribute(MARKER_ATTR);
      if (raw === null) continue;
      let snapshot: { fill?: string; stroke?: string; strokeWidth?: string } = {};
      try {
        snapshot = JSON.parse(raw) as typeof snapshot;
      } catch {
        // Malformed snapshot — drop all our overrides and rely on
        // computed styling from CSS / authored attributes.
      }
      el.style.fill = snapshot.fill ?? '';
      el.style.stroke = snapshot.stroke ?? '';
      el.style.strokeWidth = snapshot.strokeWidth ?? '';
      // Clear empty strings so the inline attribute disappears.
      if (el.style.fill === '') el.style.removeProperty('fill');
      if (el.style.stroke === '') el.style.removeProperty('stroke');
      if (el.style.strokeWidth === '') el.style.removeProperty('stroke-width');
    }
  }
}
