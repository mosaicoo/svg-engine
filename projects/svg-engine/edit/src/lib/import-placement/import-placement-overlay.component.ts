import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
} from '@angular/core';
import { type BoundingBox, type Point, type SvgNode } from 'svg-engine/core';
import { screenToDoc, SvgeNodeRenderer, ViewportService } from 'svg-engine/render';

import { capturePointer, releasePointer } from '../pointer';
import { ImportPlacementService } from './import-placement.service';

/** Marker on the locally-injected `<defs>` so the effect can replace it idempotently. */
const GHOST_DEFS_MARKER = 'data-svge-import-ghost-defs';

/**
 * **D-107 / D-108** — `<svg:g svgeImportPlacementOverlay>` — the interactive
 * placement surface for `File ▸ Import ▸ SVG` in *place* mode (Illustrator's
 * *Place*).
 *
 * **Self-capturing**: when a placement is pending
 * ({@link ImportPlacementService.pending}) it renders a transparent
 * full-viewport `<rect>` with `pointer-events: all` (a crosshair cursor)
 * that captures its OWN pointer drag — so it never touches the central
 * selection/marquee directive ([svgeShellInteractions]); when nothing is
 * pending it renders no DOM at all (zero footprint). `Esc` cancels.
 *
 * **D-108 — live ghost + Shift**: while dragging it shows a faithful,
 * half-opacity **ghost** of the imported art rendered with the EXACT
 * transform that committing would apply ({@link ImportPlacementService.placedTransform}),
 * so the user sees the result before releasing. Holding `Shift` toggles
 * proportional fit ↔ distort-to-fill in real time (the rectangle and the
 * ghost are always shown, independent of `Shift`). The imported `<defs>`
 * are injected **locally** into this overlay's `<g>` (never into the
 * document) so `url(#id)` references resolve in the ghost; on cancel/commit
 * they are removed cleanly, leaving zero residue in the document.
 *
 * Project it FRONT-most inside an `<svge-renderer>` (after content + other
 * overlays) so the capture surface sits on top during placement:
 *
 * ```html
 * <svg:g svgeImportPlacementOverlay></svg:g>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeImportPlacementOverlay]',
  standalone: true,
  imports: [SvgeNodeRenderer],
  host: { 'aria-hidden': 'true' },
  template: `
    @if (pending()) {
      <svg:rect
        class="ip-capture"
        [attr.x]="capture().x"
        [attr.y]="capture().y"
        [attr.width]="capture().width"
        [attr.height]="capture().height"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
      />
      @if (rect(); as r) {
        @if (ghostNode(); as gn) {
          <!-- Faithful half-opacity preview of the art at its commit transform. -->
          <svg:g class="ip-ghost">
            <svg:g svgeNode [node]="gn"></svg:g>
          </svg:g>
        }
        <svg:rect
          class="ip-band"
          [attr.x]="r.x"
          [attr.y]="r.y"
          [attr.width]="r.width"
          [attr.height]="r.height"
        />
      }
    }
  `,
  styles: `
    .ip-capture {
      fill: transparent;
      pointer-events: all;
      cursor: crosshair;
    }
    .ip-ghost {
      opacity: 0.5;
      pointer-events: none;
    }
    .ip-band {
      fill: color-mix(in srgb, #1976d2 8%, transparent);
      stroke: #1976d2;
      stroke-width: 1;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeImportPlacementOverlay {
  private readonly placement = inject(ImportPlacementService);
  private readonly viewport = inject(ViewportService);
  private readonly hostRef = inject(ElementRef) as ElementRef<SVGGElement>;

  protected readonly pending = this.placement.pending;
  protected readonly rect = this.placement.rect;
  /** Capture surface covers the currently-visible viewport (doc coords). */
  protected readonly capture = computed<BoundingBox>(() => this.viewport.viewBox());

  /**
   * **D-108** — the imported art with the live commit transform applied,
   * ready to render as the ghost. `null` when nothing is being placed, OR
   * (D-108 fix) while the gesture is still a bare click — no drag rectangle
   * yet. Without that guard, pressing down (a zero-size rect) would flash
   * the art at natural size before the user starts dragging.
   */
  protected readonly ghostNode = computed<SvgNode | null>(() => {
    const p = this.placement.pending();
    const transform = this.placement.placedTransform();
    if (p === null || transform === null || !this.placement.hasDragRect()) return null;
    return { ...p.group, transform };
  });

  constructor() {
    // **D-108** — keep a local <defs> with the imported fragment inside THIS
    // overlay <g> while a placement is pending, so url(#id) refs in the ghost
    // resolve. Reacts to `pending()`: injected on begin, removed on
    // cancel/commit. Never writes to the document → Esc leaves no residue.
    effect(() => {
      this.syncGhostDefs(this.placement.pending()?.defs ?? null);
    });
  }

  protected onDown(e: PointerEvent): void {
    const p = this.toDoc(e);
    if (p === null) return;
    e.preventDefault();
    e.stopPropagation();
    capturePointer(e);
    this.placement.setStretch(e.shiftKey);
    this.placement.beginDrag(p);
  }

  protected onMove(e: PointerEvent): void {
    const p = this.toDoc(e);
    if (p === null) return;
    this.placement.setStretch(e.shiftKey);
    this.placement.updateDrag(p);
  }

  protected onUp(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    releasePointer(e);
    this.placement.setStretch(e.shiftKey);
    this.placement.commitDrag();
  }

  /** Esc aborts an in-progress placement (matches the canvas Esc convention). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.placement.isActive) this.placement.cancel();
  }

  /**
   * **D-108** — `Shift` toggles distort-to-fill while a placement is active,
   * even without moving the mouse. `keydown`/`keyup` both report the modifier
   * via `e.shiftKey`, so a single handler covers press AND release.
   */
  @HostListener('document:keydown', ['$event'])
  @HostListener('document:keyup', ['$event'])
  protected onShiftKey(e: KeyboardEvent): void {
    if (this.placement.isActive && e.key === 'Shift') this.placement.setStretch(e.shiftKey);
  }

  private toDoc(e: PointerEvent): Point | null {
    const svg = (e.target as SVGElement).ownerSVGElement;
    return screenToDoc(svg, e.clientX, e.clientY);
  }

  /**
   * Idempotently materialize `fragment` as a marked `<defs>` that is the
   * first child of this overlay's `<g>`. Mirrors `SvgeRenderer.syncDefs`:
   * removes any prior injection, then injects the new fragment via
   * `insertAdjacentHTML` (which respects the SVG namespace). Local to the
   * overlay — the document's `defs` are untouched until commit.
   */
  private syncGhostDefs(fragment: string | null): void {
    const host = this.hostRef.nativeElement;
    const existing = host.querySelector(`defs[${GHOST_DEFS_MARKER}="1"]`);
    if (existing !== null) existing.remove();
    if (fragment === null || fragment.length === 0) return;
    const defs = host.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.setAttribute(GHOST_DEFS_MARKER, '1');
    defs.insertAdjacentHTML('afterbegin', fragment);
    host.insertBefore(defs, host.firstChild);
  }
}
