import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { MatIcon } from '@angular/material/icon';
import {
  CommandBus,
  EditorStateService,
  InsertNodeCommand,
  type NodeId,
  type PathNode,
  SetStylePropertyOnManyCommand,
  type SvgStyle,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import {
  AssetManagerService,
  BrushLibraryService,
  BrushSelectionService,
  expandStrokeWithProfile,
  GradientLibraryService,
  InsertSymbolInstanceCommand,
  SymbolLibraryService,
  GraphicStyleLibraryService,
  PatternLibraryService,
  SelectionService,
  ShapeLibraryService,
  TemplateLibraryService,
} from 'svg-engine/edit';
import { SvgePanelGroup, SvgePanelGroupTab } from '../panel-group';

/**
 * Unified Libraries Panel (D-048 + **D-061 reorg**) — single drop-in
 * surfacing all the fully-functional libraries. Implemented as a
 * `<svge-panel-group compact>` whose tabs are one per library
 * category (Shapes, Templates, Gradients, Patterns, Styles, Symbols,
 * Brushes, Assets). Only one library's grid is visible at a time —
 * the user clicks a tab in the strip to switch.
 *
 * **Why tabs instead of stacked collapsible sections** (D-061):
 * - Eight libraries collapsed vertically dominate the rail and force
 *   the user to scroll just to see what's available. Industry
 *   practice (Illustrator's "Libraries" panel, Affinity's "Assets"
 *   studio) keeps each category as a tab so only one grid is
 *   visible — focus stays on the active library.
 * - The tab strip uses icon-only chips (with tooltips) in `compact`
 *   mode so all 8 libraries fit in the standard 220px rail.
 * - The strip auto-hides when only one library has items (handled by
 *   `<svge-panel-group>`).
 *
 * **Headless boundary**: imports only `MatIcon` + `<svge-panel-group>`
 * (also Material-light) — no `MatTabGroup` (animation overhead +
 * lazy-load machinery we don't need).
 *
 * **Action semantics per library** (unchanged from D-048):
 * - **Shapes** — click inserts a new node at viewport center via
 *   `InsertNodeCommand`. Single undo.
 * - **Templates** — click resets the entire document (confirms when
 *   the canvas isn't empty).
 * - **Gradients / Patterns** — click sets `style.fill = url(#id)` on
 *   every selected node (single undo via
 *   `SetStylePropertyOnManyCommand`). When nothing selected, button
 *   disables.
 * - **Graphic styles** — click applies the style preset (each
 *   non-undefined property dispatched as a single command bundle).
 * - **Symbols (D-059)** — click inserts a `SymbolUseNode` referencing
 *   the master. Edits to the master propagate to every instance.
 * - **Brushes (D-060)** — click toggles the active brush; subsequent
 *   Pencil strokes are expanded through the brush's widthProfile.
 * - **Assets** — file input → `AssetManagerService.addFromFile` →
 *   list. Click list entry → `insertIntoDocument`.
 */
@Component({
  selector: 'svge-libraries-panel',
  standalone: true,
  imports: [MatIcon, SvgePanelGroup, SvgePanelGroupTab],
  template: `
    <svge-panel-group title="Libraries" [compact]="true">
      <!-- SHAPES -->
      @if (shapesItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="shapes"
          label="Shapes"
          icon="category"
          tooltip="Shapes"
        >
          <div class="grid">
            @for (item of shapePreviews(); track item.id) {
              <button type="button" class="cell" [title]="item.name" (click)="insertShape(item.id)">
                <svg
                  class="shape-thumb"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                >
                  <path
                    [attr.d]="item.d"
                    fill="#90caf9"
                    stroke="#1565c0"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- TEMPLATES -->
      @if (templatesItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="templates"
          label="Templates"
          icon="view_quilt"
          tooltip="Templates"
        >
          <div class="list">
            @for (item of templatePreviews(); track item.id) {
              <button
                type="button"
                class="list-item"
                [title]="'Replace document with ' + item.name"
                (click)="applyTemplate(item.id)"
              >
                <span
                  class="template-thumb"
                  [style.aspect-ratio]="item.aspectRatio"
                  aria-hidden="true"
                ></span>
                <span class="list-name">{{ item.name }}</span>
                @if (item.dimensions) {
                  <span class="list-meta">{{ item.dimensions }}</span>
                }
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- GRADIENTS -->
      @if (gradientsItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="gradients"
          label="Gradients"
          icon="gradient"
          tooltip="Gradients"
        >
          <div class="grid">
            @for (item of gradientsItems(); track item.id) {
              <button
                type="button"
                class="cell"
                [title]="'Apply ' + item.name + ' as fill'"
                [disabled]="!hasSelection()"
                (click)="applyFillUrl(item.id, 'gradient')"
              >
                <span class="cell-swatch" [style.background]="gradientSwatchCss(item.id)"></span>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- PATTERNS -->
      @if (patternsItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="patterns"
          label="Patterns"
          icon="texture"
          tooltip="Patterns"
        >
          <div class="grid">
            @for (item of patternPreviews(); track item.id) {
              <button
                type="button"
                class="cell"
                [title]="'Apply ' + item.name + ' as fill'"
                [disabled]="!hasSelection()"
                (click)="applyFillUrl(item.id, 'pattern')"
              >
                <svg
                  class="pattern-thumb"
                  viewBox="0 0 40 40"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                  [innerHTML]="item.svgInner"
                ></svg>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- GRAPHIC STYLES -->
      @if (graphicStylesItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="styles"
          label="Styles"
          icon="style"
          tooltip="Graphic styles"
        >
          <div class="grid">
            @for (item of graphicStylesItems(); track item.id) {
              <button
                type="button"
                class="cell"
                [title]="'Apply ' + item.name + ' to selection'"
                [disabled]="!hasSelection()"
                (click)="applyGraphicStyle(item.id)"
              >
                <span
                  class="cell-swatch"
                  [style.background]="$any(item.style)['fill'] ?? 'transparent'"
                  [style.border]="'2px solid ' + ($any(item.style)['stroke'] ?? 'rgba(0,0,0,0.1)')"
                ></span>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- SYMBOLS (D-059) -->
      @if (symbolsItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="symbols"
          label="Symbols"
          icon="star_outline"
          tooltip="Symbols (master / instance)"
        >
          <div class="grid">
            @for (item of symbolsItems(); track item.id) {
              <button
                type="button"
                class="cell"
                [title]="'Insert ' + item.name + ' instance'"
                (click)="insertSymbolInstance(item.id)"
              >
                <mat-icon class="symbol-thumb" aria-hidden="true">{{
                  symbolThumbIcon(item.id)
                }}</mat-icon>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- BRUSHES (D-060) -->
      @if (brushesItems().length > 0) {
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="brushes"
          label="Brushes"
          icon="brush"
          tooltip="Brushes (Pencil expansion)"
        >
          <div class="grid">
            @for (item of brushesItems(); track item.id) {
              <button
                type="button"
                class="cell"
                [class.brush-active]="activeBrushId() === item.id"
                [title]="
                  activeBrushId() === item.id
                    ? 'Active brush — click again to deselect'
                    : 'Activate ' + item.name + ' brush (Pencil tool will use it)'
                "
                (click)="toggleBrush(item.id)"
              >
                <svg
                  class="brush-thumb"
                  viewBox="0 0 80 24"
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                >
                  <path [attr.d]="brushThumbD(item.id)" fill="currentColor"></path>
                </svg>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        </ng-template>
      }

      <!-- ASSETS (always present — even an empty registry can accept uploads) -->
      <ng-template
        svgePanelGroupTab
        svgePanelGroupTabId="assets"
        label="Assets"
        icon="image"
        tooltip="Assets (user-imported images)"
      >
        <div class="assets-body">
          <label class="upload-btn">
            <input
              type="file"
              accept="image/*"
              (change)="onAssetFile($event)"
              aria-label="Upload image asset"
            />
            <mat-icon aria-hidden="true">upload</mat-icon>
            Upload image
          </label>
          @if (assetEntries().length === 0) {
            <p class="empty">No assets imported yet.</p>
          } @else {
            <div class="grid">
              @for (a of assetEntries(); track a.id) {
                <button
                  type="button"
                  class="cell asset-cell"
                  [title]="'Insert ' + a.name"
                  (click)="insertAsset(a.id)"
                >
                  <img class="asset-thumb" [src]="a.href" [alt]="a.name" />
                  <span class="cell-label">{{ a.name }}</span>
                </button>
              }
            </div>
          }
        </div>
      </ng-template>
    </svge-panel-group>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      width: 100%;
      height: 100%;
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
    }
    svge-panel-group {
      flex: 1 1 auto;
      min-height: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 8px;
    }
    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 4px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.1));
      background: var(--mat-sys-surface-container-low, #fff);
      color: var(--mat-sys-on-surface, inherit);
      cursor: pointer;
      font-size: 10px;
      transition: background 0.1s;
    }
    .cell:hover:not(:disabled) {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .cell:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .shape-thumb {
      display: block;
      width: 32px;
      height: 32px;
    }
    .pattern-thumb {
      display: block;
      width: 32px;
      height: 32px;
      border-radius: 2px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.1));
    }
    .template-thumb {
      display: inline-block;
      flex-shrink: 0;
      max-height: 28px;
      max-width: 28px;
      min-height: 18px;
      min-width: 18px;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.06));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.18));
      border-radius: 2px;
    }
    .cell-swatch {
      display: block;
      width: 32px;
      height: 18px;
      border-radius: 3px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.1));
    }
    .cell-label {
      font-size: 10px;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .symbol-thumb {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--mat-sys-on-surface, #444);
    }
    .brush-thumb {
      width: 64px;
      height: 20px;
      color: var(--mat-sys-on-surface, #444);
    }
    .cell.brush-active {
      background: var(--mat-sys-primary-container, #d6e4ff);
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -1px;
    }
    .cell.brush-active .brush-thumb {
      color: var(--mat-sys-on-primary-container, #1a3370);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px;
    }
    .list-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.1));
      background: var(--mat-sys-surface-container-low, #fff);
      color: var(--mat-sys-on-surface, inherit);
      cursor: pointer;
      text-align: left;
      font-size: 12px;
    }
    .list-item:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .list-name {
      flex: 1 1 auto;
    }
    .list-meta {
      font-size: 10px;
      opacity: 0.55;
      font-variant-numeric: tabular-nums;
    }
    .assets-body {
      padding: 8px;
    }
    .upload-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px dashed var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      background: var(--mat-sys-surface-container-low, #fff);
      cursor: pointer;
      font-size: 11px;
      margin-bottom: 6px;
    }
    .upload-btn input[type='file'] {
      display: none;
    }
    .upload-btn:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .upload-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
      font-style: italic;
      font-size: 11px;
      margin: 4px 0;
    }
    .asset-thumb {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: 3px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.1));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeLibrariesPanel {
  private readonly shapes = inject(ShapeLibraryService);
  private readonly templates = inject(TemplateLibraryService);
  private readonly gradients = inject(GradientLibraryService);
  private readonly patterns = inject(PatternLibraryService);
  private readonly graphicStyles = inject(GraphicStyleLibraryService);
  private readonly symbols = inject(SymbolLibraryService);
  // D-060 — brushes catalog + per-editor selection state. Click on a
  // brush cell selects/deselects it; Pencil strokes from then on are
  // expanded through the brush's widthProfile until deselected.
  private readonly brushes = inject(BrushLibraryService);
  private readonly brushSelection = inject(BrushSelectionService);
  private readonly assets = inject(AssetManagerService);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly bus = inject(CommandBus);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly shapesItems = this.shapes.items;
  protected readonly templatesItems = this.templates.items;
  protected readonly gradientsItems = this.gradients.items;
  protected readonly patternsItems = this.patterns.items;
  protected readonly graphicStylesItems = this.graphicStyles.items;
  protected readonly symbolsItems = this.symbols.items;
  protected readonly brushesItems = this.brushes.items;
  protected readonly activeBrushId = this.brushSelection.selectedBrushId;
  protected readonly assetEntries = this.assets.catalog;

  protected readonly hasSelection = computed(() => this.selection.selectedIds().size > 0);

  /**
   * Shape items enriched with their `d` attribute for inline preview.
   * `build()` is called once per item per render (memoized by the
   * computed) — the resulting nodes are then disposed; only the
   * geometry `d` string survives for the SVG thumbnail.
   */
  protected readonly shapePreviews = computed<readonly { id: string; name: string; d: string }[]>(
    () => {
      return this.shapesItems().map((item) => {
        const node = item.build() as PathNode;
        return { id: item.id, name: item.name, d: node.d };
      });
    },
  );

  /**
   * Template items enriched with an aspect-ratio for a mini page
   * preview rect. Parses the `dimensions` "W×H" hint string when
   * present; falls back to 1 (square) when missing.
   */
  protected readonly templatePreviews = computed<
    readonly { id: string; name: string; dimensions: string | undefined; aspectRatio: string }[]
  >(() => {
    return this.templatesItems().map((item) => ({
      id: item.id,
      name: item.name,
      dimensions: item.dimensions,
      aspectRatio: parseAspectRatio(item.dimensions),
    }));
  });

  /**
   * Pattern items enriched with the inner SVG markup of the pattern
   * (defs + a 40×40 rect filled with `url(#patternId)`) so the
   * thumbnail shows the actual tiling. Bound via `[innerHTML]`.
   */
  protected readonly patternPreviews = computed<
    readonly { id: string; name: string; svgInner: SafeHtml }[]
  >(() => {
    return this.patternsItems().map((item) => {
      const inner = `<defs>${item.buildMarkup()}</defs><rect width="40" height="40" fill="url(#${item.id})" />`;
      // bypassSecurityTrustHtml is required so Angular's DomSanitizer
      // doesn't strip <defs>/<pattern> from the [innerHTML] binding.
      // Source is our own builtin pattern markup — trusted by design.
      return {
        id: item.id,
        name: item.name,
        svgInner: this.sanitizer.bypassSecurityTrustHtml(inner),
      };
    });
  });

  /** Insert a shape from the library into the document root. */
  protected insertShape(id: string): void {
    const item = this.shapes.get(id);
    if (item === null) return;
    const node = item.build();
    this.bus.dispatch(new InsertNodeCommand(this.state.document().root.id, node));
  }

  /**
   * **D-059** — insert a symbol INSTANCE (SymbolUseNode referencing
   * the master) at the visible viewport center. Distinct from
   * `insertShape` which clones a Shape tree — symbol instances are
   * live references; editing the master propagates to every instance.
   */
  protected insertSymbolInstance(id: string): void {
    const item = this.symbols.get(id);
    if (item === null) return;
    // Default size = 64px at the visible viewport center. Matches the
    // D-052 Insert > Shape sizing rationale (clamped to 25% of visible
    // dim) so instances always land at a sensible scale.
    const vb = this.viewport.viewBox();
    const naturalW = item.viewBox?.width ?? 64;
    const naturalH = item.viewBox?.height ?? 64;
    const targetSize = Math.max(40, Math.min(400, Math.min(vb.width, vb.height) * 0.2));
    const scale = targetSize / Math.max(naturalW, naturalH);
    const w = naturalW * scale;
    const h = naturalH * scale;
    const cx = vb.x + vb.width / 2;
    const cy = vb.y + vb.height / 2;
    this.bus.dispatch(new InsertSymbolInstanceCommand(id, cx - w / 2, cy - h / 2, w, h));
  }

  /**
   * Material icon for a symbol's thumbnail in the panel. We hand-map
   * the builtin ids to their semantically-closest Material glyph so
   * the user gets a recognizable preview without rasterizing the
   * master. Unknown ids fall back to a generic "star_outline".
   */
  protected symbolThumbIcon(id: string): string {
    if (id.endsWith('.star')) return 'star';
    if (id.endsWith('.arrow')) return 'arrow_forward';
    if (id.endsWith('.heart')) return 'favorite';
    if (id.endsWith('.gear')) return 'settings';
    return 'star_outline';
  }

  /**
   * **D-060** — toggle a brush selection (click to activate, click
   * the active brush to deactivate → Pencil reverts to centerline).
   */
  protected toggleBrush(id: string): void {
    const current = this.brushSelection.selectedBrushId();
    this.brushSelection.select(current === id ? null : id);
  }

  /**
   * Thumbnail preview `d` for a brush — runs the actual
   * `expandStrokeWithProfile` algorithm on a horizontal centerline
   * (sampled across the thumb's 80×24 viewBox). The user sees EXACTLY
   * the silhouette that their Pencil stroke would get — no separate
   * approximation logic to drift from the runtime behavior.
   */
  protected brushThumbD(id: string): string {
    const item = this.brushes.get(id);
    if (item === null) return '';
    // Horizontal centerline from (6, 12) to (74, 12), 21 evenly-spaced
    // sample points. The expand algorithm picks up the per-point width
    // from the profile; 21 points is dense enough to see the curve.
    const centerline = Array.from({ length: 21 }, (_, i) => ({
      x: 6 + (i / 20) * 68,
      y: 12,
    }));
    // Thumb base width = 14 (about 60% of thumb height) — gives
    // enough visual room for the tapered profile to show its shape.
    return expandStrokeWithProfile(centerline, 14, item.widthProfile);
  }

  /**
   * Replace the whole document with a template + reset the viewport
   * so the new page fits the canvas. Also clears the selection (stale
   * ids from the old document would otherwise dangle).
   *
   * Confirms before replacing when the current document has content —
   * applying a template wipes everything in the canvas, which a user
   * mid-design would not appreciate.
   */
  protected applyTemplate(id: string): void {
    const item = this.templates.get(id);
    if (item === null) return;
    // Confirm only when the current document already has shapes
    // (empty doc → no-op confirmation makes the UX feel paranoid).
    const root = this.state.document().root;
    if (root.type === 'group' && root.children.length > 0) {
      const ok =
        typeof window !== 'undefined'
          ? window.confirm(
              `Replace current document with template "${item.name}"? This will discard all unsaved shapes.`,
            )
          : true;
      if (!ok) return;
    }
    this.state.resetDocument(item.build());
    // Reset viewport so the new page (which may have a very different
    // viewBox) fits the canvas — without this, the user keeps the old
    // zoom and may not even see the new page.
    this.viewport.reset();
    // Clear stale selection — ids from the old document no longer
    // exist in the new tree.
    this.selection.clear();
  }

  /**
   * Apply a gradient OR pattern as `fill` on every selected node.
   * Single undo entry via `SetStylePropertyOnManyCommand`.
   */
  protected applyFillUrl(id: string, kind: 'gradient' | 'pattern'): void {
    const selected = Array.from(this.selection.selectedIds()) as NodeId[];
    if (selected.length === 0) return;
    const label = `Apply ${kind} ${id}`;
    this.bus.dispatch(
      new SetStylePropertyOnManyCommand(selected, 'fill' as keyof SvgStyle, `url(#${id})`, label),
    );
  }

  /**
   * Apply a graphic-style preset: dispatch one
   * SetStylePropertyOnManyCommand per non-undefined style entry. Each
   * is a separate undo entry — wrapping into a single composite
   * command is a future polish.
   */
  protected applyGraphicStyle(id: string): void {
    const item = this.graphicStyles.get(id);
    if (item === null) return;
    const selected = Array.from(this.selection.selectedIds()) as NodeId[];
    if (selected.length === 0) return;
    for (const [key, value] of Object.entries(item.style)) {
      if (value === undefined) continue;
      // The graphic-style preset values come from a loose
      // `Record<string, ...>` (so plugins can add future style props
      // without breaking the contract). Each entry that survives the
      // undefined-skip is dispatched as a standard style update —
      // the cast is sound because graphic-style authors are expected
      // to use SvgStyle camelCase keys (enforced by docstrings on
      // GraphicStyleLibraryItem.style).
      const styleKey = key as keyof SvgStyle;
      const styleValue = value as SvgStyle[keyof SvgStyle];
      this.bus.dispatch(
        new SetStylePropertyOnManyCommand(
          selected,
          styleKey,
          styleValue,
          `Apply style ${id}: ${key}`,
        ),
      );
    }
  }

  /** File input handler — import the picked image into the asset catalog. */
  protected async onAssetFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.assets.addFromFile(file);
    // Reset the input so picking the same file again triggers (change).
    input.value = '';
  }

  /** Insert an asset from the catalog into the document. */
  protected insertAsset(id: string): void {
    const entry = this.assets.catalog().find((e) => e.id === id);
    if (entry === undefined) return;
    this.assets.insertIntoDocument(entry);
  }

  /**
   * CSS `background` value for a gradient swatch preview. We render
   * a simple CSS approximation from the gradient stops (CSS gradients
   * are a superset of SVG gradient syntax for our purposes — close
   * enough for a thumbnail).
   */
  protected gradientSwatchCss(id: string): string {
    const g = this.gradients.get(id);
    if (g === null) return 'transparent';
    const stopsCss = g.stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(0)}%`).join(', ');
    return g.kind === 'linear'
      ? `linear-gradient(to right, ${stopsCss})`
      : `radial-gradient(circle, ${stopsCss})`;
  }
}

/**
 * Parse a "W×H" or "WxH" dimensions string into a CSS `aspect-ratio`
 * value (`"<w> / <h>"`). Returns `'1'` (square) when parsing fails so
 * the thumbnail always has a fallback shape.
 */
function parseAspectRatio(dims: string | undefined): string {
  if (dims === undefined) return '1';
  const m = /(\d+)\s*[×x]\s*(\d+)/.exec(dims);
  if (m === null) return '1';
  return `${m[1]} / ${m[2]}`;
}
