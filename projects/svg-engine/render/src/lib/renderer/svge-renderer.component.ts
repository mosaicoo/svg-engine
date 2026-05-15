import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import type { BoundingBox, SvgDocument, SvgNode } from 'svg-engine/core';
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
 * - `viewBox` (optional): explicit viewBox to display. When omitted, the
 *   shared {@link ViewportService} drives the viewBox (allowing pan/zoom
 *   from outside this component).
 * - `width` / `height` (optional): CSS pixel dimensions of the rendered
 *   `<svg>` element. When both are omitted the SVG is sized by its CSS
 *   container.
 *
 * **Side effects**: when `viewBox` is provided, the renderer mirrors it
 * into the {@link ViewportService}'s `contentBox` so external pan/zoom
 * controls stay in sync if the consumer enables them later.
 */
@Component({
  selector: 'svge-renderer',
  standalone: true,
  imports: [SvgeNodeRenderer],
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [attr.viewBox]="viewBoxAttr()"
      [attr.width]="width() ?? null"
      [attr.height]="height() ?? null"
      [attr.role]="'img'"
      [attr.aria-label]="ariaLabel() ?? null"
    >
      <svge-node [node]="tree()" />
    </svg>
  `,
  host: {
    style: 'display: block; width: 100%; height: 100%;',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeRenderer {
  private readonly viewport = inject(ViewportService);

  readonly tree = input.required<SvgNode>();
  readonly viewBox = input<BoundingBox | null>(null);
  readonly width = input<number | null>(null);
  readonly height = input<number | null>(null);
  readonly ariaLabel = input<string | null>(null);

  /**
   * Resolved viewBox: `viewBox` input takes precedence; otherwise the
   * computed `viewport.viewBox()` (which reflects pan/zoom).
   */
  protected readonly viewBoxAttr = computed(() => {
    const explicit = this.viewBox();
    const box = explicit ?? this.viewport.viewBox();
    return `${box.x} ${box.y} ${box.width} ${box.height}`;
  });

  constructor() {
    // Mirror an explicit viewBox into the viewport so external pan/zoom
    // stays consistent if the consumer wires it up.
    effect(() => {
      const explicit = this.viewBox();
      if (explicit) this.viewport.setContentBox(explicit);
    });
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
