import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WorkspaceService } from './workspace.service';

/**
 * Visual background layer for the editor canvas (D-021 — workspace
 * presentation). Wraps the renderer (or any content) and renders a
 * background **behind** it, driven by {@link WorkspaceService.background}.
 *
 * **Why an HTML wrapper, not an SVG `<rect>`**:
 * - Checkerboard patterns are trivial via CSS gradients, painful via
 *   SVG `<pattern>` (markup overhead, sub-pixel snap issues).
 * - Keeps `<svge-renderer>`'s `<svg>` tree pure SVG content — the
 *   exported SVG is unaffected by editor presentation choices.
 * - Sizing follows the consumer's layout naturally (just CSS).
 *
 * **Usage**:
 * ```html
 * <svge-workspace-background>
 *   <svge-renderer [tree]="tree()" [viewBox]="viewBox()">
 *     <svg:g svgeSelectionOverlay></svg:g>
 *     ...
 *   </svge-renderer>
 * </svge-workspace-background>
 * ```
 *
 * **CSS variables**: the background image / color is applied via inline
 * style binding (computed signals), so the component reactively
 * re-renders whenever `WorkspaceService.setBackground(...)` runs. The
 * checkerboard variant uses a static stylesheet (faster than rebuilding
 * the gradient string on every CD cycle).
 */
@Component({
  selector: 'svge-workspace-background',
  standalone: true,
  template: `
    <div
      class="bg"
      [class.transparent]="ws.isTransparentBackground()"
      [style.background-color]="solidColor()"
      [style.background-image]="imageUrl()"
    >
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    .bg {
      position: relative;
      width: 100%;
      height: 100%;
    }
    /* Checkerboard pattern — universal "no background" indicator
       (Photoshop/Illustrator/Affinity/Figma all use this exact look).
       Composited from 4 diagonal gradients on a 16×16 tile. */
    .bg.transparent {
      background-color: #ffffff;
      background-image:
        linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
        linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
        linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
      background-size: 16px 16px;
      background-position:
        0 0,
        0 8px,
        8px -8px,
        -8px 0;
    }
    .bg:not(.transparent) {
      background-repeat: no-repeat;
      background-size: cover;
      background-position: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceBackground {
  protected readonly ws = inject(WorkspaceService);

  /**
   * Inline `background-color` value — only emitted in `solid` mode.
   * Returning `null` ensures the inline style is removed entirely
   * (lets the stylesheet's `transparent` rules apply unimpeded).
   */
  protected readonly solidColor = computed<string | null>(() => {
    const bg = this.ws.background();
    return bg.kind === 'solid' ? bg.color : null;
  });

  /**
   * Inline `background-image` value — only emitted in `image` mode.
   * Wrapping in `url("...")` is required by CSS; the value is the
   * raw href captured in the WorkspaceService config.
   */
  protected readonly imageUrl = computed<string | null>(() => {
    const bg = this.ws.background();
    return bg.kind === 'image' ? `url("${bg.href}")` : null;
  });
}
