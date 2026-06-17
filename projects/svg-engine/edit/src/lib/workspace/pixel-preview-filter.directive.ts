import { Directive, effect, ElementRef, inject, type OnDestroy } from '@angular/core';
import { WorkspaceService } from './workspace.service';

/**
 * Toggles **Pixel Preview** (Illustrator's `Alt+Ctrl+Y`) on the host SVG.
 * When `WorkspaceService.pixelPreview()` is `true`, two inherited SVG/CSS
 * rendering hints are set on the renderer's **root `<svg>`** (so they cascade
 * to every shape, including ones added later):
 *
 * - `shape-rendering: crispEdges` — disables anti-aliasing on vector geometry,
 *   so edges render hard/aliased the way they would once rasterized to the
 *   pixel grid (no sub-pixel smoothing).
 * - `image-rendering: pixelated` — nearest-neighbour scaling for embedded
 *   raster `<image>` content, so bitmaps show chunky device pixels when zoomed
 *   in instead of being smoothed.
 *
 * When toggled off, the previous inline values are restored (or removed when
 * none were set), so authored styling comes back intact.
 *
 * **Opt-in directive** (mirrors {@link OutlineFilter} / `IsolationFilter`):
 * consumers attach `svgePixelPreviewFilter` to the renderer host they want
 * affected; multiple canvases toggle independently. Setting the hints on the
 * root `<svg>` (rather than per-shape) means the effect is inheritance-driven
 * — robust across document edits with no re-application needed.
 *
 * **Usage**:
 * ```html
 * <svge-renderer svgeOutlineFilter svgePixelPreviewFilter [tree]="tree()">
 *   ...
 * </svge-renderer>
 * ```
 */
@Directive({
  selector: '[svgePixelPreviewFilter]',
  standalone: true,
})
export class PixelPreviewFilter implements OnDestroy {
  private readonly elRef = inject(ElementRef<Element>);
  private readonly ws = inject(WorkspaceService);
  private currentlyOn = false;
  private prevShapeRendering = '';
  private prevImageRendering = '';

  constructor() {
    effect(() => {
      const on = this.ws.pixelPreview();
      if (on === this.currentlyOn) return;
      this.currentlyOn = on;
      if (on) this.applyOn();
      else this.restore();
    });
  }

  ngOnDestroy(): void {
    if (this.currentlyOn) {
      this.restore();
      this.currentlyOn = false;
    }
  }

  /** The renderer's root `<svg>` (the host itself when it IS an svg). */
  private rootSvg(): SVGSVGElement | null {
    const host = this.elRef.nativeElement;
    if (host instanceof SVGSVGElement) return host;
    return host.querySelector('svg') as SVGSVGElement | null;
  }

  private applyOn(): void {
    const svg = this.rootSvg();
    if (svg === null) return;
    this.prevShapeRendering = svg.style.getPropertyValue('shape-rendering');
    this.prevImageRendering = svg.style.getPropertyValue('image-rendering');
    svg.style.setProperty('shape-rendering', 'crispEdges');
    svg.style.setProperty('image-rendering', 'pixelated');
  }

  private restore(): void {
    const svg = this.rootSvg();
    if (svg === null) return;
    if (this.prevShapeRendering) svg.style.setProperty('shape-rendering', this.prevShapeRendering);
    else svg.style.removeProperty('shape-rendering');
    if (this.prevImageRendering) svg.style.setProperty('image-rendering', this.prevImageRendering);
    else svg.style.removeProperty('image-rendering');
    this.prevShapeRendering = '';
    this.prevImageRendering = '';
  }
}
