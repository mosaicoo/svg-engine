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
        <svg:text [svgeText]="$any(node())">{{ textContent() }}</svg:text>
      }
      @case ('image') {
        <svg:image [svgeImage]="$any(node())" />
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
   * Children iteration for the `@case ('group')` branch. Same template-
   * type-checker rationale as {@link textContent}. Empty array for
   * non-group nodes (never reached).
   */
  protected groupChildren(): readonly SvgNode[] {
    const n = this.node();
    return isGroupNode(n) ? n.children : [];
  }
}
