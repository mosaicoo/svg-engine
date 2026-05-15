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
      xmlns="http://www.w3.org/2000/svg"
      [attr.viewBox]="viewBoxAttr()"
      [attr.width]="width() ?? null"
      [attr.height]="height() ?? null"
      [attr.role]="'img'"
      [attr.aria-label]="ariaLabel() ?? null"
    >
      <svg:g svgeNode [node]="tree()"></svg:g>
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
    }
  `,
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

  constructor() {
    // Mirror the explicit viewBox input into the viewport's contentBox.
    // This keeps the viewport's coordinate space aligned with whatever
    // document the consumer is showing, so pan/zoom operate over the
    // intended bounds.
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
