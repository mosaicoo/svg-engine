import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { MatIcon } from '@angular/material/icon';
import {
  AUTO_PARENT,
  CommandBus,
  EditorStateService,
  EnsureDefaultPageCommand,
  findNodeById,
  getPageViewBox,
  InsertNodeCommand,
  isPage,
  type NodeId,
  type PathNode,
  ResizePageCommand,
  SetStylePropertyOnManyCommand,
  type SvgNode,
  type SvgStyle,
  type Transform,
} from '@mosaicoo/svg-engine/core';
import { ViewportService } from '@mosaicoo/svg-engine/render';
import {
  ActivePageService,
  AssetManagerService,
  BrushLibraryService,
  BrushSelectionService,
  expandStrokeWithProfile,
  type GradientGeometry,
  GradientLibraryService,
  GRADIENT_TOOL_ID,
  InsertSymbolInstanceCommand,
  SymbolLibraryService,
  SymbolSelectionService,
  SYMBOL_SPRAYER_TOOL_ID,
  GraphicStyleLibraryService,
  PatternLibraryService,
  SelectionService,
  ShapeLibraryService,
  TemplateLibraryService,
  ToolHostService,
} from '@mosaicoo/svg-engine/edit';
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
 * - **Vertical strip on the LEFT** (D-061 follow-up): with 8 tabs
 *   the horizontal strip felt cramped even in compact mode. Vertical
 *   side rail (Photoshop / Affinity convention) gives each icon a
 *   comfortable square click target without eating canvas width and
 *   the active tab's label surfaces in the body header (no need to
 *   hover icons to know what's showing).
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
    <svge-panel-group
      title="Libraries"
      [compact]="true"
      orientation="vertical"
      [activeTab]="activeTab()"
      (activeTabChange)="onTabChange($event)"
      [collapsible]="true"
      [collapsed]="collapsed()"
      (collapsedChange)="collapsedChange.emit($event)"
    >
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
                [title]="
                  item.name + (item.dimensions ? ' — ' + formatDimensions(item.dimensions) : '')
                "
                (click)="applyTemplate(item.id)"
              >
                <span
                  class="template-thumb"
                  [style.aspect-ratio]="item.aspectRatio"
                  aria-hidden="true"
                ></span>
                <span class="list-text">
                  <span class="list-name">{{ item.name }}</span>
                  @if (item.dimensions) {
                    <span class="list-meta">{{ formatDimensions(item.dimensions) }}</span>
                  }
                </span>
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
                [class.gradient-active]="appliedGradientId() === item.id"
                [title]="
                  appliedGradientId() === item.id
                    ? item.name + ' — currently applied to selection'
                    : 'Apply ' + item.name + ' as fill'
                "
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
                [class.symbol-active]="isSymbolSprayerActive() && activeSymbolId() === item.id"
                [title]="
                  isSymbolSprayerActive()
                    ? activeSymbolId() === item.id
                      ? 'Active for Sprayer — click again to deselect'
                      : 'Activate ' + item.name + ' for Symbol Sprayer'
                    : 'Insert ' + item.name + ' instance'
                "
                (click)="onSymbolCellClick(item.id)"
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
          <div class="grid grid--brushes">
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
      min-width: 0;
      width: 100%;
      height: 100%;
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
    }
    svge-panel-group {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
    }
    /* Responsive grid (D-061 follow-up — fixes overflow in narrow side
       rail). auto-fill + minmax lets the column count adapt to the
       available width instead of forcing 3 columns.
       Sizing math: a 220px libraries rail minus the 36px vertical
       strip = 184px shell width; minus the panel-body intrinsic
       1px border + 16px padding ≈ 167px content area. With a 50px
       minimum + 4px gap, auto-fill picks 3 cols at ~53px each
       (mirrors the previous fixed repeat 3 1fr layout but adapts
       to wider rails: a 280px rail fits 4 cols). */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
      gap: 4px;
      padding: 8px;
    }
    /* Brushes need wider cells because the silhouette thumb is 64px
       wide; cramming 3 brush cells into a 167px content area cuts
       both the thumb and the labels ("Calligraphic" → "C..."). 75px
       min keeps the thumb visible and gives 2 cols at ~81px in the
       standard rail. */
    .grid--brushes {
      grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
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
      /* min-width: 0 allows the cell to shrink below its intrinsic
         content width — critical for the label ellipsis to kick in
         instead of the cell pushing the grid wider than its track. */
      min-width: 0;
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
      width: 100%;
      min-width: 0;
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
    .cell.symbol-active {
      background: var(--mat-sys-primary-container, #d6e4ff);
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -1px;
    }
    .cell.symbol-active .symbol-thumb {
      color: var(--mat-sys-on-primary-container, #1a3370);
    }
    /* D-062-fix — visually flag the gradient cell that's currently
       applied to the selection. Helps the user immediately see "this
       is what's painted on my shape" when the auto-routing snaps the
       panel to the Gradients tab. Same look as brush-active /
       symbol-active for consistency. */
    .cell.gradient-active {
      background: var(--mat-sys-primary-container, #d6e4ff);
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -1px;
    }
    .brush-thumb {
      /* Responsive: take full cell width up to 64px so the silhouette
         stays sharp on the standard rail but doesn't overflow when
         the cell shrinks below 75px (e.g. user resized a wider
         consumer rail). */
      width: 100%;
      max-width: 64px;
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
      /* min-width: 0 allows the inner name/meta to truncate instead
         of pushing the row wider than the rail. */
      min-width: 0;
    }
    .list-item:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    /* Name + dimensions stack vertically (name on top, size below) so
       both stay readable even in a narrow rail — the dimensions used to
       sit inline to the right and got hidden under 200px. */
    .list-text {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      gap: 1px;
    }
    .list-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .list-meta {
      font-size: 10px;
      opacity: 0.55;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
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
  // D-062a — when the Symbol Sprayer tool is active, clicking a
  // symbol cell SELECTS it for spraying instead of inserting a
  // single instance. Lets the user pick "what to spray" via the
  // same panel they'd use to insert one-off.
  private readonly symbolSelection = inject(SymbolSelectionService);
  private readonly toolHost = inject(ToolHostService);
  private readonly assets = inject(AssetManagerService);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly bus = inject(CommandBus);
  // PAGES-FIX-4: library inserts now target the active page (so the
  // shape lands INSIDE the artboard the user is editing) AND are
  // centered on the visible viewport clamped to the page's viewBox
  // (Figma/Affinity convention — the new shape appears under the
  // user's eyes, never half off-screen).
  private readonly activePage = inject(ActivePageService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly shapesItems = this.shapes.items;
  protected readonly templatesItems = this.templates.items;
  protected readonly gradientsItems = this.gradients.items;
  protected readonly patternsItems = this.patterns.items;
  protected readonly graphicStylesItems = this.graphicStyles.items;
  protected readonly symbolsItems = this.symbols.items;
  protected readonly brushesItems = this.brushes.items;
  protected readonly activeBrushId = this.brushSelection.selectedBrushId;
  protected readonly activeSymbolId = this.symbolSelection.selectedSymbolId;
  protected readonly isSymbolSprayerActive = computed(
    () => this.toolHost.activeId() === SYMBOL_SPRAYER_TOOL_ID,
  );
  protected readonly assetEntries = this.assets.catalog;

  protected readonly hasSelection = computed(() => this.selection.selectedIds().size > 0);

  // ─── D-062-fix: auto-routing + applied-gradient detection ───────────

  /**
   * Controlled active tab for the inner `<svge-panel-group>`. The
   * panel switches tabs in two cases:
   *
   * 1. **Tool activation** (`onActivate`-like effect below): when
   *    the user activates Symbol Sprayer or Gradient tool, the
   *    library panel snaps to the matching tab — this is the
   *    discoverability flow ("I just picked the tool, now I see
   *    what to pick").
   * 2. **Selection change with applied library gradient**: when the
   *    user clicks a shape that has `fill="url(#libGradientId)"`,
   *    we snap to Gradients tab so the cell that's painting the
   *    shape gets visible (it's highlighted with `.gradient-active`
   *    for instant recognition).
   *
   * Manual clicks on tab headers (via `onTabChange`) override these
   * auto-routes — once the user has picked a tab manually, the
   * panel respects their choice until the next auto-route trigger.
   */
  /**
   * **COLLAPSE** — passthrough to the inner `<svge-panel-group>`'s
   * collapse feature. The shell owns the state + persistence (it owns
   * the layout column), so this component just forwards the controlled
   * `collapsed` input down and the `collapsedChange` request back up.
   * Defaults to expanded; a consumer that doesn't wire these gets the
   * original non-collapsible panel.
   */
  readonly collapsed = input<boolean>(false);
  readonly collapsedChange = output<boolean>();

  private readonly _activeTab = signal<string | null>(null);
  protected readonly activeTab = this._activeTab.asReadonly();

  /**
   * Id of the gradient (from `GradientLibraryService`) currently
   * painting at least one selected node — `null` if no selection or
   * if the selection's fill isn't a `url(#…)` reference to a known
   * gradient. Used to highlight the matching cell in the Gradients
   * tab and to drive the auto-route effect.
   */
  protected readonly appliedGradientId = computed<string | null>(() => {
    const ids = Array.from(this.selection.selectedIds()) as NodeId[];
    if (ids.length === 0) return null;
    const root = this.state.document().root;
    // Single-pass: first selected node whose fill matches a library
    // gradient id wins. (Multi-selection with mixed gradients picks
    // the first; the user can disambiguate by selecting one shape.)
    const gradientIds = new Set(this.gradientsItems().map((g) => g.id));
    for (const id of ids) {
      const node = findNodeById(root, id);
      if (node === null) continue;
      const fill = node.style?.fill;
      if (typeof fill !== 'string') continue;
      const match = /^url\(#([^)]+)\)$/.exec(fill);
      if (match === null) continue;
      const gid = match[1]!;
      if (gradientIds.has(gid)) return gid;
    }
    return null;
  });

  constructor() {
    // Auto-route on tool activation: Symbol Sprayer → Symbols tab
    // (+ auto-select first symbol if nothing picked yet); Gradient
    // tool → Gradients tab. Runs untracked of manual tab changes —
    // user clicks override the snap until the next activation.
    effect(() => {
      const tool = this.toolHost.activeId();
      if (tool === SYMBOL_SPRAYER_TOOL_ID) {
        this._activeTab.set('symbols');
        // Pre-select the first available symbol so the user can
        // immediately drag-spray. Only when nothing's already
        // selected — preserves a deliberate prior pick.
        if (this.symbolSelection.selectedSymbolId() === null) {
          const first = this.symbolsItems()[0];
          if (first !== undefined) {
            this.symbolSelection.select(first.id);
          }
        }
      } else if (tool === GRADIENT_TOOL_ID) {
        this._activeTab.set('gradients');
      }
    });

    // Auto-route on selection change to a library-gradient-filled
    // node. Independent of tool activation — gives the user "here's
    // what's painting your shape" feedback whenever they select
    // something with a known gradient, regardless of active tool.
    effect(() => {
      const gid = this.appliedGradientId();
      if (gid !== null) {
        this._activeTab.set('gradients');
      }
    });
  }

  /**
   * Manual tab click — the user pressed a tab in the strip. We
   * surface this back to the controlled signal so subsequent
   * auto-routes start from the user's pick rather than the panel's
   * default.
   */
  protected onTabChange(id: string): void {
    this._activeTab.set(id);
  }

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
   * Format a template's `dimensions` hint ("W×H" / "WxH") for display as
   * "W × H" (spaced multiplication sign). Presentation-only — the raw
   * value is kept untouched for {@link parseAspectRatio}.
   */
  protected formatDimensions(dimensions: string): string {
    return dimensions.replace(/\s*[×x]\s*/i, ' × ');
  }

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

  /**
   * Insert a shape from the library.
   *
   * **PAGES-FIX-4** — two changes:
   *
   * 1. Drop into the **active page** (via
   *    `ActivePageService.effectiveDrawTargetId()`) instead of the
   *    document root. Without this, the shape would land as a sibling
   *    of the page and the page-filter renderer would hide it.
   * 2. **Translate the shape** so its 100×100 author bbox center
   *    lands at the visible viewport center, clamped to the active
   *    page bounds (matches Insert ▸ Shape menu convention from D-052).
   *    Pre-translation composes with any existing transform by adding
   *    to the matrix's e/f components — affine-safe for plugin shapes
   *    that ship a non-identity transform.
   */
  protected insertShape(id: string): void {
    const item = this.shapes.get(id);
    if (item === null) return;
    const node = item.build();
    const { cx, cy } = this.insertCenter();
    const positioned = translateNode(node, cx - 50, cy - 50);
    // **PAGES-REFACTOR Fase 1**: AUTO_PARENT — CommandBus resolves the
    // page via INSERT_PARENT_RESOLVER. `activePage` is still injected
    // because `insertCenter()` reads the page's viewBox to clamp the
    // centering position (UX concern, not parent-resolution concern).
    this.bus.dispatch(new InsertNodeCommand(AUTO_PARENT, positioned));
  }

  /**
   * Center for fresh library inserts: viewport center, clamped to the
   * active page's viewBox when there is one. Without the page clamp
   * the user could be zoomed-in on the workspace background and the
   * new shape would land off-artboard (PAGES-FIX-4).
   */
  private insertCenter(): { cx: number; cy: number } {
    const vb = this.viewport.viewBox();
    let cx = vb.x + vb.width / 2;
    let cy = vb.y + vb.height / 2;
    const page = this.activePage.activePage();
    const pvb = page !== null ? getPageViewBox(page) : null;
    if (pvb !== null) {
      cx = Math.min(Math.max(cx, pvb.x), pvb.x + pvb.width);
      cy = Math.min(Math.max(cy, pvb.y), pvb.y + pvb.height);
    }
    return { cx, cy };
  }

  /**
   * **D-062a** — dual-mode click handler:
   * - When the Symbol Sprayer tool is active, toggles the
   *   {@link SymbolSelectionService} so the tool knows what to
   *   spray.
   * - Otherwise (any other active tool), falls back to the D-059
   *   single-shot insert at the viewport center.
   */
  protected onSymbolCellClick(id: string): void {
    if (this.isSymbolSprayerActive()) {
      const current = this.symbolSelection.selectedSymbolId();
      this.symbolSelection.select(current === id ? null : id);
      return;
    }
    this.insertSymbolInstance(id);
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
    // **PAGES-REFACTOR Fase 1**: center clamped to active page (UX);
    // parent omitted = AUTO_PARENT → CommandBus resolver lands the
    // symbol use inside the active page automatically.
    const { cx, cy } = this.insertCenter();
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
   * Apply a template by **resizing the active page** to the template's
   * dimensions — like every other library, the action targets the page
   * the user is editing (D-079 active page), NOT the whole document.
   *
   * **Semantics** (Illustrator / Affinity "resize artboard"):
   * - Keeps the page's origin `(x, y)` fixed; the template only drives
   *   `width` / `height` (so the far corner `x2, y2` moves).
   * - Content is left untouched — `ResizePageCommand` changes only the
   *   page's `pageViewBox`; shapes keep their coordinates.
   * - Non-destructive + undoable (goes through the `CommandBus`).
   *
   * **Fallback — no page exists** (legacy single-root doc / 0 pages):
   * bootstrap a Page 1 via {@link EnsureDefaultPageCommand} (which also
   * migrates any loose top-level shapes into it), then resize that page.
   *
   * **Why not `resetDocument` anymore**: the previous implementation
   * replaced the entire document with a blank one, which (a) wiped all
   * content + every other page, (b) dropped the editor out of pages-mode
   * (0 pages → no active page → the page paper fell back to the legacy
   * 800×600 default — the "template não aplica" bug), and (c) bypassed
   * the CommandBus (no undo). Resizing the active page fixes all three.
   *
   * Viewport re-framing after the resize is intentionally NOT done here
   * (it felt like an unexpected zoom change) — deferred follow-up.
   */
  protected applyTemplate(id: string): void {
    const item = this.templates.get(id);
    if (item === null) return;
    // Templates are size presets; we only need their dimensions, read
    // from the freshly-built document's viewBox.
    const tpl = item.build().viewBox;
    if (tpl.width <= 0 || tpl.height <= 0) return;

    // Resolve the target page: the active page, else bootstrap one.
    let page = this.activePage.activePage();
    if (page === null) {
      this.bus.dispatch(new EnsureDefaultPageCommand());
      page = this.state.document().root.children.find(isPage) ?? null;
    }
    if (page === null) return;

    // Keep the origin fixed; apply the template's width/height only.
    const current = getPageViewBox(page);
    const x = current?.x ?? 0;
    const y = current?.y ?? 0;
    this.bus.dispatch(
      new ResizePageCommand(page.id, { x, y, width: tpl.width, height: tpl.height }),
    );
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
    if (g.kind !== 'linear') {
      return `radial-gradient(circle, ${stopsCss})`;
    }
    // Derive the CSS sweep direction from the item's D-058 geometry so
    // horizontal / vertical / diagonal presets read distinctly in the
    // thumbnail. Items without geometry (the pre-D-058 builtins) keep the
    // historical left-to-right default.
    const dir = linearCssDirection(g.geometry);
    return `linear-gradient(${dir}, ${stopsCss})`;
  }
}

/**
 * Map a {@link GradientGeometry} linear vector `(x1,y1)→(x2,y2)` (in
 * objectBoundingBox 0..1) to a CSS `linear-gradient` direction. CSS
 * angles run clockwise with 0deg pointing UP, whereas SVG's y axis
 * points DOWN, so `atan2(dx, -dy)` already yields the CSS angle. Falls
 * back to `to right` when geometry is absent (pre-D-058 builtins).
 */
function linearCssDirection(geometry: GradientGeometry | undefined): string {
  if (geometry === undefined) return 'to right';
  const x1 = geometry.x1 ?? 0;
  const y1 = geometry.y1 ?? 0;
  const x2 = geometry.x2 ?? 1;
  const y2 = geometry.y2 ?? 0;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return 'to right';
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  // Normalize to [0, 360) and round — CSS accepts any angle but a clean
  // integer keeps the inline style tidy.
  const norm = ((Math.round(deg) % 360) + 360) % 360;
  return `${norm}deg`;
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

/**
 * **PAGES-FIX-4** — pre-translate a node by `(dx, dy)` by adding to
 * the matrix's `e/f` entries. `translate(dx,dy) * M` applied to point
 * `(x,y)` yields `(ax+cy+e+dx, bx+dy+f+dy)`, which is mathematically
 * identical to adding `(dx,dy)` to `(e,f)` — affine-safe for nodes
 * that already carry a non-identity transform (rotation, scale, etc).
 *
 * Pure: returns a new node, leaves input untouched.
 */
function translateNode<T extends SvgNode>(node: T, dx: number, dy: number): T {
  const [a, b, c, d, e, f] = node.transform;
  const next: Transform = [a, b, c, d, e + dx, f + dy];
  return { ...node, transform: next };
}
