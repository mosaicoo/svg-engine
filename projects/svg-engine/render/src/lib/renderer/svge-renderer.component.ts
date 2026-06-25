import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { BoundingBox, SvgDocument, SvgNode } from '@mosaicoo/svg-engine/core';
import { SvgeNodeRenderer } from '../renderers/node-renderer.component';
import { ViewportService } from '../viewport/viewport.service';

/**
 * Top-level SVG renderer. Read-only — does **not** handle selection,
 * editing or interaction (those live in `svg-engine/edit`). Suitable as
 * an embedded viewer in third-party applications (D-017 headless boundary:
 * zero deps on `@angular/material`).
 *
 * **Inputs**:
 * - `tree` (required): the {@link SvgNode} to render. Typically a
 *   {@link SvgDocument} `root`, but any node is valid (single-node
 *   preview, etc.).
 * - `viewBox` (optional): **seed** for {@link ViewportService.contentBox}.
 *   The value is mirrored into the viewport on every change. The actual
 *   viewBox attribute on the `<svg>` element is **always** derived from
 *   `viewport.viewBox()`, so pan/zoom calls on `ViewportService` always
 *   take effect regardless of whether this input is provided.
 * - `width` / `height` (optional): CSS pixel dimensions of the rendered
 *   `<svg>` element. When both are omitted the SVG is sized by its CSS
 *   container (the component sets `:host` and `svg` to `100%/100%` by
 *   default).
 * - `ariaLabel` (optional): accessibility label for the `<svg role="img">`.
 *
 * **Pan/zoom semantics**: at the default viewport state (`zoom=1`,
 * `pan=0`), `viewport.viewBox()` equals `viewport.contentBox()`, so the
 * rendered SVG matches the seed exactly. After a `viewport.zoomIn()`
 * (etc.) call, the rendered viewBox reflects the new state — the
 * displayed content scales/pans accordingly.
 */
@Component({
  selector: 'svge-renderer',
  standalone: true,
  imports: [SvgeNodeRenderer],
  template: `
    <svg
      #svgRoot
      xmlns="http://www.w3.org/2000/svg"
      [attr.viewBox]="viewBoxAttr()"
      [attr.width]="width() ?? null"
      [attr.height]="height() ?? null"
      [attr.role]="'img'"
      [attr.aria-label]="ariaLabel() ?? null"
    >
      <!--
        BEHIND slot: overlays projected with the svgeBehind attribute
        render UNDER the document content. Used for "background" overlays
        like the page rect and the grid — convention from Illustrator /
        Affinity / Figma where the page is the "paper" beneath shapes,
        not a semi-transparent veil over them. Without this slot the
        page rect (which carries a fill) would tint the entire content
        area below it.
      -->
      <ng-content select="[svgeBehind]" />
      <svg:g svgeNode [node]="tree()"></svg:g>
      <!--
        FRONT (default) slot. Anything projected here without a
        svgeBehind attribute renders ON TOP of the content. Used for
        selection handles, marquee, guides, snap indicators, etc.
      -->
      <ng-content />
    </svg>
  `,
  styles: `
    /* Inner <svg> defaults to 300x150 in browsers (HTML replaced-element
       rule) when no width/height attribute is supplied. We make it fill
       the host so consumers can size the renderer purely with CSS on
       <svge-renderer>. Explicit width/height inputs still take precedence
       at the SVG level via [attr.width]/[attr.height]. */
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      /* overflow: visible lets editor overlays (guides, snap guides,
         marquee) render across the pasteboard area that the SVG
         viewBox + preserveAspectRatio="xMidYMid meet" letterboxing
         creates inside the host. Without this, any <line>/<rect> with
         coordinates outside the current viewBox is clipped — which
         makes guides stop short of the ruler edges when the SVG
         viewBox is narrower than its CSS area (common: landscape
         container hosting a portrait document, or any zoom level
         where viewBox aspect ≠ container aspect).

         Side-effect: document shapes living outside the viewBox also
         become visible in the letterbox. This matches the convention
         of every professional editor (Illustrator, Affinity, Figma) —
         the "pasteboard" naturally shows whatever is positioned there,
         not a hard-clipped void at the viewBox boundary. */
      overflow: visible;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeRenderer {
  private readonly viewport = inject(ViewportService);
  private readonly svgRoot = viewChild<ElementRef<SVGSVGElement>>('svgRoot');

  /**
   * **AUDIT-FIX P9** — typed accessor for the rendered `<svg>` element
   * scoped to **this** renderer instance.
   *
   * Returns `null` when the view hasn't been attached yet (early calls
   * during ngOnInit, SSR, jsdom without layout). Consumers should
   * defensively check for null.
   *
   * **Why expose it**: consumers that need to perform DOM measurements
   * on the rendered shapes (bbox, hit-testing, pointer→doc conversion)
   * previously had to call `document.querySelector('svge-renderer svg')`.
   * That global selector breaks the moment a host mounts more than one
   * `<svge-renderer>` on the same page — the first match wins, leaking
   * measurements between editor instances. Using
   * `@ViewChild(SvgeRenderer)` + `svgElement()` keeps the lookup scoped
   * to the component's own tree.
   *
   * @example
   * ```ts
   * @Component({ ... })
   * export class MyHost {
   *   private readonly renderer = viewChild(SvgeRenderer);
   *
   *   measureNode(id: NodeId): BoundingBox | null {
   *     const svg = this.renderer()?.svgElement();
   *     return svg === null ? null : getRenderedNodeBBox(svg, id);
   *   }
   * }
   * ```
   */
  svgElement(): SVGSVGElement | null {
    return this.svgRoot()?.nativeElement ?? null;
  }

  readonly tree = input.required<SvgNode>();
  readonly viewBox = input<BoundingBox | null>(null);
  readonly width = input<number | null>(null);
  readonly height = input<number | null>(null);
  readonly ariaLabel = input<string | null>(null);
  /**
   * Optional reusable-definitions fragment ({@link SvgDocument.defs}).
   * When non-empty, the renderer injects the fragment as the first
   * child of `<svg>` via `insertAdjacentHTML('afterbegin', ...)` so
   * `url(#id)` references inside the tree resolve at paint time.
   *
   * **Why insertAdjacentHTML and not the Angular template**: the
   * fragment can include arbitrary SVG markup (`<linearGradient>`,
   * `<clipPath>`, …) with namespaces and id attributes. Embedding via
   * `[innerHTML]` would run through Angular's sanitizer which can
   * mangle SVG-specific constructs. The fragment was already sanitized
   * at import time (script, event handlers, javascript: hrefs all
   * removed); we trust it as opaque markup here.
   */
  readonly defs = input<string | null>(null);

  /**
   * Rendered viewBox attribute. **Always** derived from
   * `viewport.viewBox()` — which itself is `contentBox` transformed by
   * current zoom and pan. The optional `viewBox` input feeds the
   * viewport's `contentBox` (via the constructor effect), making it the
   * starting point that pan/zoom act upon.
   *
   * This single-source-of-truth approach guarantees that any caller of
   * `ViewportService.zoomIn()`/`pan()`/etc. produces a visible change
   * regardless of whether `viewBox` was supplied as an input.
   */
  protected readonly viewBoxAttr = computed(() => {
    const box = this.viewport.viewBox();
    return `${box.x} ${box.y} ${box.width} ${box.height}`;
  });

  /**
   * Sentinel data attribute applied to the injected `<defs>` block so
   * re-runs can find and replace it idempotently instead of stacking
   * duplicates.
   */
  private static readonly DEFS_MARKER_ATTR = 'data-svge-injected-defs';

  constructor() {
    // Mirror the explicit viewBox input into the viewport's contentBox.
    // This keeps the viewport's coordinate space aligned with whatever
    // document the consumer is showing, so pan/zoom operate over the
    // intended bounds.
    effect(() => {
      const explicit = this.viewBox();
      if (explicit) this.viewport.setContentBox(explicit);
    });
    // Inject (or refresh, or remove) the defs fragment. Runs reactively
    // whenever `defs()` changes — typical case fires once on initial
    // mount with the value passed by the consumer.
    effect(() => {
      this.syncDefs(this.defs());
    });
  }

  /**
   * Idempotently materialize the current `defs()` value as the first
   * child of `<svg>`. Sequence of operations:
   *
   * 1. Locate (and remove) any previous `<defs data-svge-injected-defs="1">`
   *    we wrote on an earlier effect tick.
   * 2. If the new fragment is non-empty, build a fresh `<defs>` element
   *    and set its inner XML via `insertAdjacentHTML`. The marker attr
   *    distinguishes our injection from consumer-provided defs.
   *
   * Safe in jsdom (no-ops when the viewChild ref hasn't resolved yet),
   * SSR (typeof document gate via insertAdjacentHTML availability),
   * and worker contexts (effect simply never runs DOM ops without the
   * viewChild element).
   */
  private syncDefs(fragment: string | null): void {
    const ref = this.svgRoot();
    if (ref === undefined) return;
    const svg = ref.nativeElement;
    const existing = svg.querySelector(`defs[${SvgeRenderer.DEFS_MARKER_ATTR}="1"]`);
    if (existing !== null) existing.remove();
    if (fragment === null || fragment.length === 0) return;
    const wrapper = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs');
    wrapper.setAttribute(SvgeRenderer.DEFS_MARKER_ATTR, '1');
    // insertAdjacentHTML respects the SVG namespace of the host element,
    // so gradient/clipPath markup parses as SVG (not HTML).
    wrapper.insertAdjacentHTML('afterbegin', fragment);
    svg.insertBefore(wrapper, svg.firstChild);
  }
}

/**
 * Convenience helper for consumers that hold a {@link SvgDocument}: returns
 * its `root` and `viewBox` ready to bind to {@link SvgeRenderer}.
 *
 * ```html
 * <svge-renderer [tree]="doc().root" [viewBox]="doc().viewBox" />
 * ```
 */
export function projectDocumentToRenderer(doc: SvgDocument): {
  readonly tree: SvgNode;
  readonly viewBox: BoundingBox;
} {
  return { tree: doc.root, viewBox: doc.viewBox };
}
