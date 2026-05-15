import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { isGroupNode, type SvgNode } from 'svg-engine/core';
import { NodeRendererRegistry } from '../registry/node-renderer-registry.service';
import { renderTransformAttr } from '../util/transform-attr';
import { SvgeEllipseRenderer } from './ellipse-renderer.component';
import { SvgeImageRenderer } from './image-renderer.component';
import { SvgeLineRenderer } from './line-renderer.component';
import { SvgePathRenderer } from './path-renderer.component';
import { SvgePolygonRenderer } from './polygon-renderer.component';
import { SvgePolylineRenderer } from './polyline-renderer.component';
import { SvgeRectRenderer } from './rect-renderer.component';
import { SvgeTextRenderer } from './text-renderer.component';

/**
 * Dispatch a single {@link SvgNode} to the correct per-type renderer.
 *
 * - Built-in types (`rect`, `ellipse`, `line`, `polygon`, `polyline`,
 *   `path`, `text`, `image`) delegate to their dedicated standalone
 *   component.
 * - `group` is handled **inline** here: it is the recursive case and
 *   embedding it avoids a circular import between the group renderer and
 *   the dispatcher.
 * - Unknown types fall through to {@link NodeRendererRegistry} (D-020 plugin
 *   extensibility) and are mounted via `NgComponentOutlet`. When no
 *   renderer is registered, the dispatcher emits an SVG comment so the
 *   omission is visible in DOM inspection without breaking the document.
 */
@Component({
  selector: 'svge-node',
  standalone: true,
  imports: [
    SvgeRectRenderer,
    SvgeEllipseRenderer,
    SvgeLineRenderer,
    SvgePolygonRenderer,
    SvgePolylineRenderer,
    SvgePathRenderer,
    SvgeTextRenderer,
    SvgeImageRenderer,
    NgComponentOutlet,
  ],
  template: `
    @switch (node().type) {
      @case ('rect') {
        <svge-rect [node]="$any(node())" />
      }
      @case ('ellipse') {
        <svge-ellipse [node]="$any(node())" />
      }
      @case ('line') {
        <svge-line [node]="$any(node())" />
      }
      @case ('polygon') {
        <svge-polygon [node]="$any(node())" />
      }
      @case ('polyline') {
        <svge-polyline [node]="$any(node())" />
      }
      @case ('path') {
        <svge-path [node]="$any(node())" />
      }
      @case ('text') {
        <svge-text [node]="$any(node())" />
      }
      @case ('image') {
        <svge-image [node]="$any(node())" />
      }
      @case ('group') {
        <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
          @for (child of groupChildren(); track child.id) {
            <svge-node [node]="child" />
          }
        </svg:g>
      }
      @default {
        @if (customComponent(); as comp) {
          <ng-container *ngComponentOutlet="comp; inputs: { node: node() }" />
        }
      }
    }
  `,
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
}
