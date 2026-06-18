import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { type BoundingBox, isGroupNode, type SvgDocument, type SvgNode } from 'svg-engine/core';
import { svgExporter } from 'svg-engine/io';
import { WorkspaceService } from './workspace.service';

/** Largest canvas dimension we'll rasterize to (perf/memory guard). */
const MAX_RASTER_DIM = 4096;

/**
 * **`svgePixelPreviewRaster`** (D-131) — the **pixel-accurate ("chunky")**
 * variant of Pixel Preview. Where {@link PixelPreviewFilter} (D-130) only
 * disables anti-aliasing via CSS, this rasterizes the active page to a bitmap
 * at the document's **native** resolution (1 doc unit = 1 px) and displays it
 * scaled by the current zoom with `image-rendering: pixelated` — so zooming in
 * shows real chunky device pixels, exactly like Illustrator's Pixel Preview.
 *
 * **Alignment is free**: this is an `<svg:g>` projected INTO the renderer's
 * `<svg>`, so the `<image>` (placed in document coordinates) is transformed by
 * the renderer's viewport viewBox automatically — no manual pan/zoom math, and
 * **no re-raster on zoom/pan** (only on document/defs edits).
 *
 * **Source of truth**: the bitmap is produced from the document MODEL via
 * {@link svgExporter} (the same serializer the File ▸ Export SVG uses), not the
 * live DOM — so hiding the live art for display never affects the raster.
 *
 * **Graceful degradation**: when the Canvas API is unavailable (SSR / jsdom) or
 * rasterization fails, it renders nothing and leaves `pixelPreviewRasterReady`
 * false — the shell then keeps the live (smooth) art visible. So a failure is a
 * no-op, never a blank canvas.
 *
 * **Fidelity caveats** (inherent to SVG→canvas rasterization, documented):
 * web/variable fonts and `<foreignObject>` may not render, and external
 * `<image href="http…">` is blocked / taints the canvas. Embedded shapes,
 * paths, gradients/patterns (inline defs) and data-URI images rasterize fine.
 *
 * **Opt-in / default off**: gated by `WorkspaceService.pixelPreviewRaster()`.
 * Self-gated — zero footprint when off.
 *
 * **Usage** (front projection slot of `<svge-renderer>`):
 * ```html
 * <svg:g svgePixelPreviewRaster [tree]="tree()" [viewBox]="viewBox()" [defs]="defs()"></svg:g>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgePixelPreviewRaster]',
  standalone: true,
  template: `
    @if (bitmap(); as href) {
      @if (box(); as b) {
        <svg:image
          [attr.x]="b.x"
          [attr.y]="b.y"
          [attr.width]="b.width"
          [attr.height]="b.height"
          [attr.href]="href"
          preserveAspectRatio="none"
          style="image-rendering: pixelated"
          aria-hidden="true"
        />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePixelPreviewRaster {
  private readonly ws = inject(WorkspaceService);
  private readonly document = inject(DOCUMENT);

  /** The page content to rasterize (same value fed to `<svge-renderer [tree]>`). */
  readonly tree = input.required<SvgNode>();
  /** The page native viewBox (same value fed to `<svge-renderer [viewBox]>`). */
  readonly viewBox = input<BoundingBox | null>(null);
  /** The composed `<defs>` fragment (same value fed to `<svge-renderer [defs]>`). */
  readonly defs = input<string | null>(null);

  /** Current rasterized PNG data-URL, or null until the first raster is ready. */
  private readonly _bitmap = signal<string | null>(null);
  protected readonly bitmap = this._bitmap.asReadonly();

  /** Where to paint the bitmap, in document coordinates (the page viewBox). */
  protected readonly box = computed<BoundingBox | null>(() => this.viewBox());

  /**
   * Monotonic token to discard stale async results: each raster captures the
   * current value; a late `image.onload` whose token no longer matches is
   * ignored (the document changed again before it finished decoding).
   */
  private rasterToken = 0;

  constructor() {
    effect(() => {
      // Register ONLY the intended dependencies (the toggle + the source
      // inputs) in the reactive context by reading them here, tracked.
      const on = this.ws.pixelPreviewRaster();
      const tree = this.tree();
      const viewBox = this.viewBox();
      const defs = this.defs();
      // **D-131-fix** — On EVERY change (toggle / edit / undo / redo) first
      // reveal the live art and drop the previous bitmap, THEN (if on) kick off
      // a fresh raster which re-hides the art only once it actually paints.
      // This is correct-by-construction: we can never get stuck showing a
      // stale/blank bitmap over hidden art — the exact failure undo/redo
      // exposed (the old code kept the bitmap + `ready` sticky across
      // re-rasters, so any bail/empty/failed re-raster left the vector hidden
      // and never returned).
      //
      // **D-131-fix2** — run the side-effects UNTRACKED. `reset()` calls the
      // guarded `setPixelPreviewRasterReady(false)`, whose `if (current === v)`
      // guard READS `pixelPreviewRasterReady`; `rasterize()` likewise touches
      // signals while serializing. Without `untracked` those reads would become
      // effect dependencies — and since the async `image.onload` later flips
      // `pixelPreviewRasterReady` back to `true`, the effect would re-run on
      // every completed raster, an infinite re-rasterization loop (confirmed in
      // the browser at hundreds of rasters/sec). `untracked` keeps the effect
      // depending solely on `on`/`tree`/`viewBox`/`defs`.
      untracked(() => {
        this.reset();
        if (on) this.rasterize(tree, viewBox, defs);
      });
    });

    inject(DestroyRef).onDestroy(() => this.reset());
  }

  /**
   * Reveal the live art again: invalidate any in-flight load, drop the bitmap
   * (removes the `<svg:image>`), and clear readiness (un-hides `[data-node-id]`
   * in the shell). Called on every source change and on destroy.
   */
  private reset(): void {
    this.rasterToken++; // invalidate any in-flight load
    this._bitmap.set(null);
    this.ws.setPixelPreviewRasterReady(false);
  }

  private rasterize(tree: SvgNode, viewBox: BoundingBox | null, defs: string | null): void {
    // Every bail here just leaves the live art visible — `reset()` already ran
    // in the effect, so there is no stale bitmap to worry about.
    // svgExporter renders `document.root.children`; the page/root is always a
    // group in practice — bail otherwise rather than risk a throw.
    if (viewBox === null || !isGroupNode(tree)) return;
    const w = viewBox.width;
    const h = viewBox.height;
    if (!(w > 0) || !(h > 0)) return;

    const ctx = this.makeContext(w, h);
    if (ctx === null) return; // Canvas API unavailable (SSR / jsdom).
    const { canvas, context } = ctx;

    let svg: string;
    try {
      // `Exporter.export` is typed as `string | Promise<…>` (PNG is async);
      // the SVG exporter is synchronous and returns a string — narrow + bail.
      const exported = svgExporter.export({ root: tree, viewBox, defs } as unknown as SvgDocument);
      if (typeof exported !== 'string') return;
      svg = exported;
    } catch {
      return; // serialization failed — live art stays visible.
    }

    // `reset()` (in the effect) already bumped the token; capture the current
    // value so a later change that bumps it again discards this stale load.
    const token = this.rasterToken;
    const image = new Image();
    image.onload = (): void => {
      if (token !== this.rasterToken) return; // superseded by a newer change.
      try {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        this._bitmap.set(canvas.toDataURL('image/png'));
        this.ws.setPixelPreviewRasterReady(true);
      } catch {
        // Tainted canvas (external <image>) — leave the live art visible.
      }
    };
    image.onerror = (): void => {
      /* decode failed — live art stays visible (reset already revealed it). */
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /**
   * Build a canvas + 2D context sized to the page (capped at
   * {@link MAX_RASTER_DIM} — a capped bitmap simply upscales to even chunkier
   * pixels). Returns null when the Canvas API isn't usable.
   */
  private makeContext(
    w: number,
    h: number,
  ): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
    const canvas = this.document.createElement('canvas');
    const context = canvas.getContext?.('2d') ?? null;
    if (context === null) return null;
    const scale = Math.min(1, MAX_RASTER_DIM / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    return { canvas, context };
  }
}
