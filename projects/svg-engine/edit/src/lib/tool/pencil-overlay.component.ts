import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { pointsToPathD } from './builtin-tools';
import { PencilToolService } from './pencil-tool.service';

/**
 * Visual preview for the {@link PencilTool} — renders the freehand
 * stroke being drawn so the user can see the trace in real-time during
 * the press-drag-release gesture, instead of having to release first
 * to see what they drew.
 *
 * **What it draws**: a single `<path>` using the same `pointsToPathD`
 * serialiser the tool uses on commit, so the preview is bit-for-bit
 * what the final inserted node will be. Style is a solid primary-blue
 * stroke (slightly transparent so the user can still see what's
 * underneath while drawing).
 *
 * **Render gating**: only renders when `PencilToolService.hasDraft()`
 * is true (drawing + ≥ 2 points). A bare pointerdown without movement
 * draws nothing — matches the tool's no-op-on-single-click semantics.
 *
 * **Pointer-events disabled**: decorative overlay, never intercepts
 * canvas pointer routing. The active tool's `onPointerMove` is what
 * keeps feeding points into the service.
 *
 * Usage (inside an `<svge-renderer>`):
 * ```html
 * <svg:g svgePencilOverlay></svg:g>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgePencilOverlay]',
  standalone: true,
  // Decorative-only feedback during the gesture. The semantic outcome
  // (a new path inserted) is announced via the document change in
  // EditorStateService; the overlay itself adds no SR value.
  host: { 'aria-hidden': 'true' },
  template: `
    @if (previewD(); as d) {
      <svg:path class="pencil-draft" [attr.d]="d"></svg:path>
    }
  `,
  styles: `
    .pencil-draft {
      fill: none;
      stroke: #1976d2;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
      opacity: 0.85;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PencilOverlay {
  private readonly pencil = inject(PencilToolService);

  /**
   * SVG `d` string for the in-progress stroke. Returns `null` when
   * there's no draft to render — the `@if` gate hides the entire
   * overlay element. Reuses {@link pointsToPathD} so the preview
   * matches the eventual committed path's `d` exactly.
   */
  protected readonly previewD = computed<string | null>(() => {
    if (!this.pencil.hasDraft()) return null;
    return pointsToPathD(this.pencil.points());
  });
}
