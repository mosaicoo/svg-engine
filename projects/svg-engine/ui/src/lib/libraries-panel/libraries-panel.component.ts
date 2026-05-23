import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import {
  CommandBus,
  EditorStateService,
  InsertNodeCommand,
  type NodeId,
  SetStylePropertyOnManyCommand,
  type SvgStyle,
} from 'svg-engine/core';
import {
  AssetManagerService,
  GradientLibraryService,
  GraphicStyleLibraryService,
  PatternLibraryService,
  SelectionService,
  ShapeLibraryService,
  TemplateLibraryService,
} from 'svg-engine/edit';

/**
 * Unified Libraries Panel (D-048) — single drop-in surfacing all 6
 * fully-functional libraries: shapes, templates, gradients, patterns,
 * graphic styles, assets. Each library renders as a collapsible
 * section; clicking an item applies it to the current selection (or
 * inserts into the document, depending on the library type).
 *
 * **Why one panel, multiple sections** (not 6 separate panels):
 * - In a side-bar context the user expects "browse all libraries in
 *   one place" rather than tab-switching between 6 separate panels.
 * - Per-library panels would still exist as exported sub-components
 *   in a future iteration (consumers can compose à la carte). For v1
 *   the consolidated panel covers the dominant use case.
 *
 * **Headless boundary**: imports only `MatIcon` + `MatIconButton` —
 * no `MatExpansionPanel` to keep the bundle thin (collapse state
 * is a local signal).
 *
 * **Action semantics per library**:
 *
 * - **Shapes** — click inserts a new node at viewport center via
 *   `InsertNodeCommand`. Single undo.
 * - **Templates** — click resets the entire document. Confirmation
 *   prompt is the caller's responsibility (kept simple in v1).
 * - **Gradients / Patterns** — click sets `style.fill = url(#id)`
 *   on every selected node (single undo via
 *   `SetStylePropertyOnManyCommand`). When nothing selected, no-op.
 * - **Graphic styles** — click applies the style preset (each
 *   non-undefined property dispatched as a single command bundle).
 * - **Assets** — file input → AssetManagerService.addFromFile → list.
 *   Click list entry → AssetManagerService.insertIntoDocument.
 */
@Component({
  selector: 'svge-libraries-panel',
  standalone: true,
  imports: [MatIcon, MatIconButton],
  template: `
    <header class="lib-header">Libraries</header>

    <!-- SHAPES -->
    @if (shapesItems().length > 0) {
      <section class="lib-section">
        <button class="section-head" type="button" (click)="toggle('shapes')">
          <mat-icon class="caret">{{ open().shapes ? 'expand_more' : 'chevron_right' }}</mat-icon>
          <span>Shapes</span>
          <span class="count">{{ shapesItems().length }}</span>
        </button>
        @if (open().shapes) {
          <div class="grid">
            @for (item of shapesItems(); track item.id) {
              <button type="button" class="cell" [title]="item.name" (click)="insertShape(item.id)">
                <span class="cell-icon">▢</span>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        }
      </section>
    }

    <!-- TEMPLATES -->
    @if (templatesItems().length > 0) {
      <section class="lib-section">
        <button class="section-head" type="button" (click)="toggle('templates')">
          <mat-icon class="caret">{{
            open().templates ? 'expand_more' : 'chevron_right'
          }}</mat-icon>
          <span>Templates</span>
          <span class="count">{{ templatesItems().length }}</span>
        </button>
        @if (open().templates) {
          <div class="list">
            @for (item of templatesItems(); track item.id) {
              <button
                type="button"
                class="list-item"
                [title]="'Replace document with ' + item.name"
                (click)="applyTemplate(item.id)"
              >
                <span class="list-name">{{ item.name }}</span>
                @if (item.dimensions) {
                  <span class="list-meta">{{ item.dimensions }}</span>
                }
              </button>
            }
          </div>
        }
      </section>
    }

    <!-- GRADIENTS -->
    @if (gradientsItems().length > 0) {
      <section class="lib-section">
        <button class="section-head" type="button" (click)="toggle('gradients')">
          <mat-icon class="caret">{{
            open().gradients ? 'expand_more' : 'chevron_right'
          }}</mat-icon>
          <span>Gradients</span>
          <span class="count">{{ gradientsItems().length }}</span>
        </button>
        @if (open().gradients) {
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
        }
      </section>
    }

    <!-- PATTERNS -->
    @if (patternsItems().length > 0) {
      <section class="lib-section">
        <button class="section-head" type="button" (click)="toggle('patterns')">
          <mat-icon class="caret">{{ open().patterns ? 'expand_more' : 'chevron_right' }}</mat-icon>
          <span>Patterns</span>
          <span class="count">{{ patternsItems().length }}</span>
        </button>
        @if (open().patterns) {
          <div class="grid">
            @for (item of patternsItems(); track item.id) {
              <button
                type="button"
                class="cell"
                [title]="'Apply ' + item.name + ' as fill'"
                [disabled]="!hasSelection()"
                (click)="applyFillUrl(item.id, 'pattern')"
              >
                <span class="cell-icon">▦</span>
                <span class="cell-label">{{ item.name }}</span>
              </button>
            }
          </div>
        }
      </section>
    }

    <!-- GRAPHIC STYLES -->
    @if (graphicStylesItems().length > 0) {
      <section class="lib-section">
        <button class="section-head" type="button" (click)="toggle('graphicStyles')">
          <mat-icon class="caret">
            {{ open().graphicStyles ? 'expand_more' : 'chevron_right' }}
          </mat-icon>
          <span>Graphic styles</span>
          <span class="count">{{ graphicStylesItems().length }}</span>
        </button>
        @if (open().graphicStyles) {
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
        }
      </section>
    }

    <!-- ASSETS -->
    <section class="lib-section">
      <button class="section-head" type="button" (click)="toggle('assets')">
        <mat-icon class="caret">{{ open().assets ? 'expand_more' : 'chevron_right' }}</mat-icon>
        <span>Assets</span>
        <span class="count">{{ assetEntries().length }}</span>
      </button>
      @if (open().assets) {
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
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
    }
    .lib-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      margin-bottom: 8px;
    }
    .lib-section {
      margin-bottom: 4px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
    }
    .lib-section:last-child {
      border-bottom: none;
    }
    .section-head {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 4px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: var(--mat-sys-on-surface, inherit);
      text-align: left;
    }
    .section-head:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.03));
    }
    .section-head .caret {
      font-size: 18px;
      width: 18px;
      height: 18px;
      opacity: 0.65;
    }
    .section-head .count {
      margin-left: auto;
      font-size: 10px;
      opacity: 0.55;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 1px 6px;
      border-radius: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 4px 0 8px;
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
    .cell-icon {
      font-size: 18px;
      line-height: 1;
      opacity: 0.7;
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
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 0 8px;
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
      padding: 4px 0 8px;
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
  private readonly assets = inject(AssetManagerService);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  /** Reactive section open/closed state. Shapes start open as the
   *  most-frequently-used library; others collapsed by default to
   *  keep the panel compact. */
  protected readonly open = signal({
    shapes: true,
    templates: false,
    gradients: false,
    patterns: false,
    graphicStyles: false,
    assets: false,
  });

  protected readonly shapesItems = this.shapes.items;
  protected readonly templatesItems = this.templates.items;
  protected readonly gradientsItems = this.gradients.items;
  protected readonly patternsItems = this.patterns.items;
  protected readonly graphicStylesItems = this.graphicStyles.items;
  protected readonly assetEntries = this.assets.catalog;

  protected readonly hasSelection = computed(() => this.selection.selectedIds().size > 0);

  protected toggle(key: keyof ReturnType<typeof this.open>): void {
    this.open.update((s) => ({ ...s, [key]: !s[key] }));
  }

  /** Insert a shape from the library into the document root. */
  protected insertShape(id: string): void {
    const item = this.shapes.get(id);
    if (item === null) return;
    const node = item.build();
    this.bus.dispatch(new InsertNodeCommand(this.state.document().root.id, node));
  }

  /** Replace the whole document with a template. */
  protected applyTemplate(id: string): void {
    const item = this.templates.get(id);
    if (item === null) return;
    this.state.resetDocument(item.build());
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
