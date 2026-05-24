import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { isGroupNode, type SvgNode, type TextNode } from 'svg-engine/core';
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
               tspans with x reset + dy=1.2em.
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
        } @else if (textIsMultiLine()) {
          <svg:text [svgeText]="$any(node())">
            @for (line of textLines(); track $index) {
              <svg:tspan [attr.x]="textX()" [attr.dy]="$index === 0 ? '0' : '1.2em'">
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
   * Text content access for the `@case ('text')` branch. Returns `''`
   * for non-text nodes (never reached at runtime; appeases the template
   * type checker without scattering `$any` for the string interpolation).
   */
  protected textContent(): string {
    const n = this.node();
    return n.type === 'text' ? (n as TextNode).content : '';
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
}
