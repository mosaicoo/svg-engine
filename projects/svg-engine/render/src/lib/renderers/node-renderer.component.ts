import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type EllipseNode,
  type ImageNode,
  isGroupNode,
  type LineNode,
  type PathNode,
  type PolygonNode,
  type PolylineNode,
  type RectNode,
  type SvgNode,
  type TextNode,
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
        <svg:rect [svgeRect]="rectNode()" />
      }
      @case ('ellipse') {
        <svg:ellipse [svgeEllipse]="ellipseNode()" />
      }
      @case ('line') {
        <svg:line [svgeLine]="lineNode()" />
      }
      @case ('polygon') {
        <svg:polygon [svgePolygon]="polygonNode()" />
      }
      @case ('polyline') {
        <svg:polyline [svgePolyline]="polylineNode()" />
      }
      @case ('path') {
        <svg:path [svgePath]="pathNode()" />
      }
      @case ('text') {
        <svg:text [svgeText]="textNode()">{{ textNode().content }}</svg:text>
      }
      @case ('image') {
        <svg:image [svgeImage]="imageNode()" />
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

  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));

  protected readonly groupChildren = computed(() => {
    const n = this.node();
    return isGroupNode(n) ? n.children : [];
  });

  protected readonly customComponent = computed(() => this.registry.resolve(this.node().type));

  // Per-type narrowed views. Safe because @switch on `type` guarantees
  // the actual narrowing at the call site; these computeds give the
  // template type-safe access without scattering casts.
  protected readonly rectNode = computed(() => this.node() as RectNode);
  protected readonly ellipseNode = computed(() => this.node() as EllipseNode);
  protected readonly lineNode = computed(() => this.node() as LineNode);
  protected readonly polygonNode = computed(() => this.node() as PolygonNode);
  protected readonly polylineNode = computed(() => this.node() as PolylineNode);
  protected readonly pathNode = computed(() => this.node() as PathNode);
  protected readonly textNode = computed(() => this.node() as TextNode);
  protected readonly imageNode = computed(() => this.node() as ImageNode);
}
