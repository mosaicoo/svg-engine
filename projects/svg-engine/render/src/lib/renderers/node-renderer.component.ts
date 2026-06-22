import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  isGroupNode,
  type SvgNode,
  type SvgStyle,
  type TextNode,
  type TextRun,
} from 'svg-engine/core';
import { NodeRendererRegistry } from '../registry/node-renderer-registry.service';
import { renderTransformAttr } from '../util/transform-attr';
import { SvgeEllipseDirective } from './ellipse-renderer.directive';
import { SvgeImageDirective } from './image-renderer.directive';
import { SvgeLineDirective } from './line-renderer.directive';
import { SvgePathDirective } from './path-renderer.directive';
import { SvgePolygonDirective } from './polygon-renderer.directive';
import { SvgePolylineDirective } from './polyline-renderer.directive';
import { SvgeRectDirective } from './rect-renderer.directive';
import { SvgeSymbolUseDirective } from './symbol-use-renderer.directive';
import { SvgeTextDirective } from './text-renderer.directive';

/**
 * Dispatch a single {@link SvgNode} to the correct attribute-binding
 * directive on the appropriate SVG element.
 *
 * **Why an attribute selector** (`g[svgeNode]`):
 *
 * The dispatcher's host is itself a `<svg:g>` (the wrapper that carries
 * `data-node-id` and the node's `transform`). Using a custom-element
 * selector like `<svge-node>` would inject a non-SVG element into the
 * SVG render tree, and SVG painters do not paint through unknown
 * non-SVG elements — geometry inside would silently fail to render.
 * Attribute selector + `<svg:g>` host keeps the entire DOM in the SVG
 * namespace.
 *
 * Built-in dispatch:
 * - 8 leaf types are bound by per-type directives (`[svgeRect]`,
 *   `[svgeEllipse]`, …) on their native SVG element.
 * - `group` is handled inline (recursive case) — each child becomes a
 *   nested `<svg:g svgeNode>`.
 * - Unknown types fall through to {@link NodeRendererRegistry} (D-020
 *   plugin extensibility).
 *
 * Usage (top-level):
 * ```html
 * <svg:g svgeNode [node]="root" />
 * ```
 */
@Component({
  // Hybrid element+attribute selector applied to a real SVG `<g>`. The
  // angular-eslint `component-selector` rule wants element selectors
  // prefixed with `svge`, but this is the only safe way to keep the
  // dispatcher inside the SVG namespace (custom HTML wrappers break the
  // SVG render tree). The attribute name (`svgeNode`) carries the prefix.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeNode]',
  standalone: true,
  imports: [
    SvgeRectDirective,
    SvgeEllipseDirective,
    SvgeLineDirective,
    SvgePolygonDirective,
    SvgePolylineDirective,
    SvgePathDirective,
    SvgeTextDirective,
    SvgeImageDirective,
    SvgeSymbolUseDirective,
    NgComponentOutlet,
  ],
  template: `
    @switch (node().type) {
      @case ('rect') {
        <svg:rect [svgeRect]="$any(node())" />
      }
      @case ('ellipse') {
        <svg:ellipse [svgeEllipse]="$any(node())" />
      }
      @case ('line') {
        <svg:line [svgeLine]="$any(node())" />
      }
      @case ('polygon') {
        <svg:polygon [svgePolygon]="$any(node())" />
      }
      @case ('polyline') {
        <svg:polyline [svgePolyline]="$any(node())" />
      }
      @case ('path') {
        <svg:path [svgePath]="$any(node())" />
      }
      @case ('text') {
        <!--
          Rendering order of precedence:
            1. textPathRef set → wrap content in <textPath href="#id">
               (D-053). textPath ignores newlines, so multi-line is
               flattened — see TextNode JSDoc for rationale.
            2. Multi-line content (
 in content) → tspan per line.
               SVG does NOT honor
 in plain text, so we emit explicit
               tspans with x reset + dy=lineHeight em (D-069 — default
               1.2 when node.lineHeight is undefined).
            3. Single-line content → bare interpolation. Preserves the
               minimal element structure that existing specs assert on.
        -->
        @if (textPathHref()) {
          <svg:text [svgeText]="$any(node())">
            <svg:textPath
              [attr.href]="textPathHref()"
              [attr.startOffset]="textPathStartOffset() ?? null"
            >
              {{ textPathFlattened() }}
            </svg:textPath>
          </svg:text>
        } @else if (textHasRuns()) {
          <!--
            D-100 — rich text. Emit one inline tspan per run, each
            carrying its own style overrides; fields a run omits inherit
            from the parent text. The run text is bound via [textContent]
            (NOT template interpolation) so the exact run string is set
            imperatively — template indentation/reformatting can't inject
            spurious leading/trailing whitespace between inline runs
            (which, unlike the multi-line dy path, are position-sensitive).
          -->
          <svg:text [svgeText]="$any(node())">
            @for (run of textRuns(); track $index) {
              <svg:tspan
                [attr.fill]="run.fill ?? null"
                [attr.font-family]="run.fontFamily ?? null"
                [attr.font-size]="run.fontSize ?? null"
                [attr.font-weight]="run.fontWeight ?? null"
                [attr.font-style]="run.fontStyle ?? null"
                [attr.text-decoration]="run.textDecoration ?? null"
                [style.letter-spacing]="
                  run.letterSpacing !== undefined ? run.letterSpacing + 'px' : null
                "
                [style.font-variation-settings]="run.fontVariationSettings ?? null"
                [style.font-feature-settings]="run.fontFeatureSettings ?? null"
                [textContent]="run.text"
              ></svg:tspan>
            }
          </svg:text>
        } @else if (textIsMultiLine()) {
          <svg:text [svgeText]="$any(node())">
            @for (line of textLines(); track $index) {
              <svg:tspan [attr.x]="textX()" [attr.dy]="$index === 0 ? '0' : textLineDy()">
                {{ line }}
              </svg:tspan>
            }
          </svg:text>
        } @else {
          <svg:text [svgeText]="$any(node())">{{ textContent() }}</svg:text>
        }
      }
      @case ('image') {
        <svg:image [svgeImage]="$any(node())" />
      }
      @case ('symbol-use') {
        <!--
          D-059 — Symbol instance via SVG use href. The symbol
          definition is contributed to defs by ActiveSymbolsService
          (svg-engine/edit) when this id appears in the document tree.
          Browser handles the expansion + transform/style inheritance.
        -->
        <svg:use [svgeSymbolUse]="$any(node())" />
      }
      @case ('group') {
        <!--
          PAGES-REFACTOR Fase 4 — the page hit-target rect that used
          to live here (PAGES-FIX-4) was removed because it was
          rendered inside the page's wrapper g and re-mounted on
          every selection change, producing the visible "flicker"
          the user reported. The same affordance now lives on the
          projected svgePageOverlay (edit/workspace/): its existing
          paper rect now carries data-node-id={pageId} +
          pointer-events: all when a D-079 page is active, so it
          serves as a persistent hit-target without re-mounting on
          selection change. See Fase 4 in
          docs/08-historico-de-alteracoes.md.
        -->
        @for (child of groupChildren(); track child.id) {
          <svg:g svgeNode [node]="child"></svg:g>
        }
      }
      @default {
        @if (customComponent(); as comp) {
          <ng-container *ngComponentOutlet="comp; inputs: { node: node() }" />
        }
      }
    }
  `,
  host: {
    '[attr.data-node-id]': 'node().id',
    '[attr.transform]': 'transformAttr()',
    // D-049 (Composition / Clipping): clipPath, mask, and mixBlendMode
    // belong on the wrapper <g> rather than the inner painted element.
    //
    // **Why the wrapper, not the inner element**:
    // - For GROUPS, the wrapper IS the only element — putting these on
    //   the inner is impossible because there is no single inner element.
    // - For LEAF nodes, the wrapper carries the node's `transform`. The
    //   SVG spec evaluates `clip-path` in the user coordinate space of
    //   the element it's applied to. Applying it on the wrapper means
    //   the clip path is in the PARENT's coordinate space (the natural
    //   user expectation — "clip this shape against this clipPath in
    //   document coords"). Applying it on the inner would evaluate the
    //   clip in the wrapper's TRANSFORMED coordinate space, which gives
    //   surprising results once you rotate or translate the node.
    // - Mix-blend-mode similarly composites against the parent backdrop;
    //   the wrapper is the right node for the blend boundary.
    //
    // Filter stays on the inner because effects are deeply tied to the
    // paint operations (they read SourceGraphic = the painted pixels).
    // Moving filter to the wrapper would change current behaviour and
    // is out of scope for D-049.
    '[attr.clip-path]': 'node().style.clipPath ?? null',
    '[attr.mask]': 'node().style.mask ?? null',
    '[style.mix-blend-mode]': 'node().style.mixBlendMode ?? null',
    // **GROUP-STYLE-FIX (A)** — paint + non-inherited presentation
    // attributes on the GROUP wrapper <g>. The wrapper IS the group, so:
    //   - filter / opacity are NOT inherited — they apply to the group as
    //     a flattened unit (correct SVG group semantics), exactly what the
    //     Effects panel + Inspector opacity expect for a selected group.
    //   - fill / stroke / stroke-* ARE inherited — set here they cascade
    //     to descendants without an explicit value of their own (e.g.
    //     imported <g fill=...><rect/></g> content). Descendants WITH their
    //     own value override per SVG inheritance; the Inspector propagates
    //     group paint edits down to those leaves separately (GROUP-STYLE-
    //     FIX B in inspector.component.ts) so the change is always visible.
    // Gated to groups via groupStyle(): for LEAF nodes the per-type
    // directive ([svgeRect]/[svgePath]/...) paints style on the inner
    // element, so binding here too would DOUBLE-apply filter/opacity on the
    // leaf wrapper. groupStyle() returns null for leaves -> no attribute.
    // Mirrors the exporter, which already emits these on <g> (render/export
    // parity — svg-exporter.ts styleAttrs).
    '[attr.fill]': 'groupStyle()?.fill ?? null',
    '[attr.fill-opacity]': 'groupStyle()?.fillOpacity ?? null',
    '[attr.fill-rule]': 'groupStyle()?.fillRule ?? null',
    '[attr.stroke]': 'groupStyle()?.stroke ?? null',
    '[attr.stroke-width]': 'groupStyle()?.strokeWidth ?? null',
    '[attr.stroke-opacity]': 'groupStyle()?.strokeOpacity ?? null',
    '[attr.stroke-linecap]': 'groupStyle()?.strokeLinecap ?? null',
    '[attr.stroke-linejoin]': 'groupStyle()?.strokeLinejoin ?? null',
    '[attr.stroke-miterlimit]': 'groupStyle()?.strokeMiterlimit ?? null',
    '[attr.stroke-dasharray]': 'groupDashArray()',
    '[attr.stroke-dashoffset]': 'groupStyle()?.strokeDashoffset ?? null',
    '[attr.opacity]': 'groupStyle()?.opacity ?? null',
    '[attr.filter]': 'groupStyle()?.filter ?? null',
    '[attr.visibility]': 'groupStyle()?.visibility ?? null',
    // D-099 — a group's vector-effect inherits to descendant strokes; emit when
    // set (imported groups carry it; editor groups leave it null).
    '[attr.vector-effect]': 'groupStyle()?.vectorEffect ?? null',
    // D-056 follow-up — `metadata.visible === false` hides the node
    // from rendering at the DOCUMENT level. Distinct from
    // `LayersService.hiddenIds` (which is editor-session only, applied
    // imperatively by `[svgeLayersFilter]`): `metadata.visible` is
    // persisted in the doc, survives export/import, and applies
    // regardless of which renderer the consumer wired up.
    //
    // **Use cases**:
    // - Boolean Live (D-056): inputs are kept as children for
    //   editability but should not paint (the derived result paints).
    // - Future: doc-level "always hidden" layers (e.g., reference
    //   guides authored in the document, not just session state).
    //
    // **Why `display: none` (not `visibility: hidden`)**: full hide,
    // collapses hit-testing too — exactly what we want for boolean
    // inputs (otherwise the user could click them through the result).
    // `visibility: hidden` leaves them hit-testable, which is wrong here.
    //
    // Only applies when explicitly `false` — `undefined` (the default)
    // leaves the node visible (treats absence as "no hide preference").
    '[style.display]': "node().metadata.visible === false ? 'none' : null",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeNodeRenderer {
  private readonly registry = inject(NodeRendererRegistry);

  readonly node = input.required<SvgNode>();

  /** Host-bound transform attr; runs once per input change (OnPush). */
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));

  /**
   * Custom-component lookup stays computed because the
   * {@link NodeRendererRegistry} signal can change at runtime (plugin
   * install/uninstall) and we want the @switch default branch to react.
   */
  protected readonly customComponent = computed(() => this.registry.resolve(this.node().type));

  /**
   * **GROUP-STYLE-FIX (A)** — the node's style ONLY when it's a group,
   * else `null`. Drives the group-wrapper paint/filter/opacity host
   * bindings (see the `host` block). Leaf nodes return `null` here so
   * those bindings emit no attribute on the leaf wrapper (the per-type
   * directive paints the leaf's style on its inner element instead).
   */
  protected readonly groupStyle = computed<SvgStyle | null>(() => {
    const n = this.node();
    return isGroupNode(n) ? n.style : null;
  });

  /**
   * `stroke-dasharray` for the group wrapper, formatted as the SVG
   * space-separated string. `null` (no attribute) when this isn't a
   * group or the group has no dash pattern. Mirrors the exporter's
   * `strokeDasharray.map(fmt).join(' ')`.
   */
  protected groupDashArray(): string | null {
    const s = this.groupStyle();
    if (s?.strokeDasharray === undefined || s.strokeDasharray.length === 0) return null;
    return s.strokeDasharray.join(' ');
  }

  /**
   * Text content access for the `@case ('text')` branch. Returns `''`
   * for non-text nodes (never reached at runtime; appeases the template
   * type checker without scattering `$any` for the string interpolation).
   */
  protected textContent(): string {
    const n = this.node();
    return n.type === 'text' ? (n as TextNode).content : '';
  }

  /**
   * **D-100** — `true` when the text node has a non-empty `runs` array.
   * Gates the rich-text (inline styled tspans) render branch. Sits below
   * the `textPathRef` branch in precedence (text on a path with per-run
   * styling is out of scope) and above the multi-line `\n` path.
   */
  protected textHasRuns(): boolean {
    const n = this.node();
    return (
      n.type === 'text' && (n as TextNode).runs !== undefined && (n as TextNode).runs!.length > 0
    );
  }

  /** Runs for the rich-text branch; `[]` when the node has none. */
  protected textRuns(): readonly TextRun[] {
    const n = this.node();
    return n.type === 'text' ? ((n as TextNode).runs ?? []) : [];
  }

  /**
   * `true` when the text node's content contains newline characters —
   * the renderer switches to the multi-line tspan path. Single-line
   * text keeps the simpler plain interpolation.
   */
  protected textIsMultiLine(): boolean {
    return this.textContent().includes('\n');
  }

  /**
   * Split text content into lines for the multi-line tspan path.
   * Returns `[]` for non-text nodes (defensive — branch is gated by
   * `textIsMultiLine`).
   */
  protected textLines(): readonly string[] {
    const c = this.textContent();
    if (c.length === 0) return [];
    return c.split('\n');
  }

  /**
   * X position of the text node — every tspan inherits this value
   * via its own `x` attribute (the default behaviour of tspan without
   * explicit `x` is to continue from the previous tspan's end, which
   * is NOT what we want for multi-line — we want each line to start
   * at the same horizontal anchor).
   */
  protected textX(): number {
    const n = this.node();
    return n.type === 'text' ? (n as TextNode).x : 0;
  }

  /**
   * **D-069** — `dy` value (in `em`s) for non-first tspans in the
   * multi-line text path. Reads `node().lineHeight` and falls back to
   * `1.2` (the pre-D-069 hardcoded default) when undefined — preserves
   * backward compatibility for existing docs/specs.
   *
   * Returned as a CSS-style string with `em` unit so it composes with
   * the `font-size` already on the parent `<text>` (the tspan inherits).
   * Choosing `em` over `px` keeps line spacing proportional when the
   * user later changes the font size — same behavior as CSS
   * `line-height: <number>` (unitless multiplier).
   */
  protected textLineDy(): string {
    const n = this.node();
    if (n.type !== 'text') return '1.2em';
    const lh = (n as TextNode).lineHeight;
    const factor = typeof lh === 'number' && Number.isFinite(lh) && lh > 0 ? lh : 1.2;
    return `${factor}em`;
  }

  // D-053 — Text on path helpers ──────────────────────────────────────
  //
  // `textPathRef` is a NodeId, but `<textPath href>` needs a `'#id'`
  // anchor (SVG 2) — we prepend the `#` here so consumers store just
  // the id (consistent with how filter/clipPath store the bare id
  // elsewhere via builders). Returns null when the node isn't text or
  // has no textPathRef — that disables the textPath branch in the
  // template @if.

  protected textPathHref(): string | null {
    const n = this.node();
    if (n.type !== 'text') return null;
    const ref = (n as TextNode).textPathRef;
    if (ref === undefined || ref === null || ref === '') return null;
    return `#${ref}`;
  }

  protected textPathStartOffset(): string | null {
    const n = this.node();
    if (n.type !== 'text') return null;
    return (n as TextNode).textPathStartOffset ?? null;
  }

  /**
   * `<textPath>` does NOT honor `\n` — embedded newlines render as
   * a single literal space (per SVG spec: whitespace collapse). We
   * pre-collapse so the user sees what they get instead of a stretched
   * "  word " gap from the raw newline character.
   */
  protected textPathFlattened(): string {
    return this.textContent().replace(/\s+/g, ' ');
  }

  /**
   * Children iteration for the `@case ('group')` branch. Same template-
   * type-checker rationale as {@link textContent}. Empty array for
   * non-group nodes (never reached).
   */
  protected groupChildren(): readonly SvgNode[] {
    const n = this.node();
    return isGroupNode(n) ? n.children : [];
  }

  // **PAGES-REFACTOR Fase 4** — the page hit-target helper that
  // used to live here was removed; the same affordance is provided
  // by `<g svgePageOverlay svgeBehind>` (`svg-engine/edit/workspace/
  // page-overlay.component.ts`), whose paper rect carries
  // `data-node-id={pageId}` and `pointer-events: all` when a D-079
  // page is active. It renders outside the page's `<g>` (in the
  // svgeBehind projection slot) so it never re-mounts on selection
  // change → no flicker.
}
