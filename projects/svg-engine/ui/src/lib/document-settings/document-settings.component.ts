import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  type BoundingBox,
  CommandBus,
  DEFAULT_PAGE_OPTIONS,
  DeletePageCommand,
  getPageName,
  getPageOptions,
  getPageViewBox,
  isPage,
  type PageBackground,
  type PageFormat,
  type PageMargins,
  type PageOrientation,
  RenamePageCommand,
  ResizePageCommand,
  SetPageOptionsCommand,
  type SvgNode,
} from 'svg-engine/core';
import { ActivePageService } from 'svg-engine/edit';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * **D-140** — `<svge-document-settings>`: a File-menu dialog that
 * surfaces every property of the Inspector "Page" tab, but bound to the
 * **active page** (via {@link ActivePageService}) instead of the
 * *focused* node.
 *
 * **Why a second surface for the same data** (deliberate redundancy):
 * the Inspector Page tab is **conditional** — it only renders when the
 * page node itself is the current selection (which normally requires the
 * Page tool, Shift+O). New users don't discover that path, so the
 * document-level controls (size / format / background / margins) felt
 * hidden. `File ▸ Document Settings…` is the Illustrator-style "Document
 * Setup" entry point: always reachable from the menu, no selection
 * dance. The user explicitly accepted the redundancy now, with the plan
 * to retire the Inspector Page tab later if this dialog proves the
 * better UX.
 *
 * **Identical semantics to the Inspector Page tab** — every field reads
 * via the same `getPage*` helpers and writes via the same undoable core
 * commands ({@link RenamePageCommand} / {@link ResizePageCommand} /
 * {@link SetPageOptionsCommand} / {@link DeletePageCommand}). So a value
 * changed here looks identical to the same change made in the Inspector,
 * and Ctrl+Z reverts it the same way.
 *
 * **Active page, not focused node**: the dialog targets
 * `ActivePageService.activePage()`. That's the page the canvas is
 * currently framing (the one the Pages strip highlights), which is what
 * "Document Settings" should configure — no need to first *select* the
 * page. When the document has no pages (legacy single-root doc, or all
 * pages deleted) the dialog shows an empty-state hint instead of dead
 * controls.
 *
 * **Layout** via the shared `<svge-dialog-shell>` (header icon + title +
 * Close X, footer actions). Sizing comes from `svgeDialogConfig('md')`
 * set in {@link SvgeDocumentSettingsDialogService}.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` because it
 * needs `MatDialog`. Headless consumers drive the same core commands
 * against `ActivePageService` directly — no Material required.
 *
 * **Usage**: open via {@link SvgeDocumentSettingsDialogService} so the
 * MatDialogConfig (size + scope-aware injector wiring) stays consistent
 * across every call site.
 */
@Component({
  selector: 'svge-document-settings',
  standalone: true,
  imports: [
    SvgeDialogShell,
    MatDialogClose,
    MatButtonModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
    MatSelectModule,
  ],
  template: `
    <svge-dialog-shell
      icon="description"
      title="Document settings"
      subtitle="Name · Size · Format · Background · Margins"
    >
      @if (page(); as node) {
        <section class="group">
          <h3>Name</h3>
          <div class="name-row">
            <mat-icon class="page-icon" aria-hidden="true">crop_landscape</mat-icon>
            <mat-form-field appearance="outline" class="name-field">
              <mat-label>Name</mat-label>
              <input
                matInput
                type="text"
                [value]="pageName(node)"
                (change)="onPageNameChange(node, $event)"
              />
            </mat-form-field>
          </div>
        </section>

        <section class="group">
          <h3>Size</h3>
          <div class="viewbox-grid">
            <mat-form-field appearance="outline">
              <mat-label>X</mat-label>
              <input
                matInput
                type="number"
                [value]="pageViewBoxField(node, 'x')"
                (change)="onPageViewBoxChange(node, 'x', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Y</mat-label>
              <input
                matInput
                type="number"
                [value]="pageViewBoxField(node, 'y')"
                (change)="onPageViewBoxChange(node, 'y', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Width</mat-label>
              <input
                matInput
                type="number"
                [value]="pageViewBoxField(node, 'width')"
                (change)="onPageViewBoxChange(node, 'width', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Height</mat-label>
              <input
                matInput
                type="number"
                [value]="pageViewBoxField(node, 'height')"
                (change)="onPageViewBoxChange(node, 'height', $event)"
              />
            </mat-form-field>
          </div>
        </section>

        <section class="group">
          <h3>Format &amp; Orientation</h3>
          <div class="format-grid">
            <mat-form-field appearance="outline">
              <mat-label>Format</mat-label>
              <mat-select
                [value]="pageFormat(node)"
                (selectionChange)="onPageFormatChange(node, $event.value)"
              >
                @for (opt of pageFormatOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Orientation</mat-label>
              <mat-select
                [value]="pageOrientation(node)"
                (selectionChange)="onPageOrientationChange(node, $event.value)"
              >
                <mat-option value="landscape">Landscape</mat-option>
                <mat-option value="portrait">Portrait</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
        </section>

        <section class="group">
          <h3>Background</h3>
          <div class="bg-row">
            <mat-form-field appearance="outline" class="bg-kind-field">
              <mat-label>Background</mat-label>
              <mat-select
                [value]="pageBackgroundKind(node)"
                (selectionChange)="onPageBackgroundKindChange(node, $event.value)"
              >
                <mat-option value="transparent">Transparent</mat-option>
                <mat-option value="solid">Solid color</mat-option>
                <mat-option value="image">Image URL</mat-option>
              </mat-select>
            </mat-form-field>
            @if (pageBackgroundKind(node) === 'solid') {
              <div class="bg-solid">
                <input
                  type="color"
                  class="bg-swatch"
                  aria-label="Pick page background color"
                  [value]="pageBackgroundColorHex(node)"
                  (change)="onPageBackgroundColorChange(node, $event)"
                />
                <mat-form-field appearance="outline" class="bg-value-field">
                  <mat-label>Color</mat-label>
                  <input
                    matInput
                    type="text"
                    placeholder="#000000 / rgb() / named"
                    [value]="pageBackgroundColor(node)"
                    (change)="onPageBackgroundColorChange(node, $event)"
                  />
                </mat-form-field>
              </div>
            }
            @if (pageBackgroundKind(node) === 'image') {
              <div class="bg-image">
                <mat-form-field appearance="outline" class="bg-value-field">
                  <mat-label>Image URL</mat-label>
                  <input
                    matInput
                    type="text"
                    placeholder="https://… or data:image/…"
                    [value]="pageBackgroundHref(node)"
                    (change)="onPageBackgroundHrefChange(node, $event)"
                  />
                </mat-form-field>
                @if (pageBackgroundHref(node)) {
                  <img
                    class="bg-image-preview"
                    [src]="pageBackgroundHref(node)"
                    alt="Background preview"
                  />
                }
              </div>
            }
          </div>
          <p class="info">
            The background is part of the artwork — it renders behind the page content and is
            included when you export the page.
          </p>
        </section>

        <section class="group">
          <h3>Margins</h3>
          <div class="margins-grid">
            <mat-form-field appearance="outline">
              <mat-label>Top</mat-label>
              <input
                matInput
                type="number"
                min="0"
                [value]="pageMargin(node, 'top')"
                (change)="onPageMarginChange(node, 'top', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Right</mat-label>
              <input
                matInput
                type="number"
                min="0"
                [value]="pageMargin(node, 'right')"
                (change)="onPageMarginChange(node, 'right', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Bottom</mat-label>
              <input
                matInput
                type="number"
                min="0"
                [value]="pageMargin(node, 'bottom')"
                (change)="onPageMarginChange(node, 'bottom', $event)"
              />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Left</mat-label>
              <input
                matInput
                type="number"
                min="0"
                [value]="pageMargin(node, 'left')"
                (change)="onPageMarginChange(node, 'left', $event)"
              />
            </mat-form-field>
          </div>
        </section>

        <section class="group">
          <h3>Danger zone</h3>
          <button
            mat-stroked-button
            type="button"
            class="danger-btn"
            (click)="deletePage(node)"
            title="Delete this page (children removed; Ctrl+Z to restore)"
          >
            <mat-icon aria-hidden="true">delete_outline</mat-icon>
            Delete Page
          </button>
          <p class="info">Removes the active page and its contents. Reversible with Ctrl+Z.</p>
        </section>
      } @else {
        <section class="group empty-state">
          <mat-icon class="empty-icon" aria-hidden="true">layers_clear</mat-icon>
          <p class="info">
            No active page to configure. Add a page first (the Pages strip below the canvas), then
            reopen Document Settings.
          </p>
        </section>
      }

      <ng-container svgeDialogFooterActions>
        <button mat-flat-button type="button" mat-dialog-close>Done</button>
      </ng-container>
    </svge-dialog-shell>
  `,
  styles: `
    /* Internals only — header / footer / sizing live in <svge-dialog-shell>. */
    .group {
      padding: 12px 0;
      border-top: 1px solid var(--mat-sys-outline-variant, #ddd);
    }
    .group:first-of-type {
      padding-top: 0;
      border-top: 0;
    }
    .group h3 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .name-field {
      flex: 1 1 auto;
    }
    .page-icon {
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .viewbox-grid,
    .margins-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .format-grid,
    .bg-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .format-grid mat-form-field {
      flex: 1 1 160px;
    }
    .bg-kind-field {
      flex: 0 0 180px;
    }
    .bg-value-field {
      flex: 1 1 200px;
    }
    /* Solid / Image rows wrap onto their own line below the kind dropdown. */
    .bg-solid,
    .bg-image {
      display: flex;
      gap: 8px;
      align-items: center;
      flex: 1 1 100%;
      flex-wrap: wrap;
    }
    .bg-swatch {
      width: 40px;
      height: 40px;
      flex: 0 0 auto;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
    }
    .bg-image-preview {
      width: 48px;
      height: 48px;
      flex: 0 0 auto;
      object-fit: cover;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      /* Checkerboard behind transparent PNGs so the preview reads clearly. */
      background-image:
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%);
      background-size: 10px 10px;
      background-position:
        0 0,
        0 5px,
        5px -5px,
        -5px 0;
    }
    .info {
      margin: 8px 0 0;
      color: var(--mat-sys-on-surface-variant, #777);
      font-size: 13px;
    }
    .danger-btn {
      color: var(--mat-sys-error, #b3261e);
    }
    .danger-btn mat-icon {
      margin-right: 4px;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 24px 0;
    }
    .empty-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: var(--mat-sys-on-surface-variant, #999);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeDocumentSettings {
  private readonly pages = inject(ActivePageService);
  private readonly bus = inject(CommandBus);
  /**
   * Injected (even though Done uses `mat-dialog-close`) so callers
   * wiring `afterClosed()` can distinguish dismiss paths if needed.
   */
  protected readonly dialogRef = inject(MatDialogRef<SvgeDocumentSettings>);

  /**
   * The page the dialog configures: the **active** page (what the canvas
   * frames / the Pages strip highlights), or `null` when the document
   * has no pages. Re-derives when the active page or the pages list
   * changes — so a delete-last-page flips the dialog to the empty state.
   */
  protected readonly page = computed<SvgNode | null>(() => this.pages.activePage());

  // ── Readers (identical to the Inspector Page tab) ─────────────────

  /** Display name for the active page. */
  protected pageName(node: SvgNode): string {
    return getPageName(node);
  }

  /**
   * Read one component of the page's viewBox for the number-input
   * binding. Empty string when the viewBox is missing (defensive —
   * the input is editable and a user-cleared field briefly hits here).
   */
  protected pageViewBoxField(node: SvgNode, field: keyof BoundingBox): string {
    const vb = getPageViewBox(node);
    if (vb === null) return '';
    const v = vb[field];
    return Number.isFinite(v) ? String(v) : '';
  }

  /**
   * Static option list bound to the Format `<mat-select>`. Mirrors the
   * `PageFormat` discriminated union exactly (kept in sync with the
   * Inspector Page tab) — print-paper first, then squares, then custom.
   */
  protected readonly pageFormatOptions: readonly { value: PageFormat; label: string }[] = [
    { value: 'a4', label: 'A4' },
    { value: 'a5', label: 'A5' },
    { value: 'a3', label: 'A3' },
    { value: 'letter', label: 'Letter' },
    { value: 'legal', label: 'Legal' },
    { value: 'tabloid', label: 'Tabloid' },
    { value: 'square-1080', label: 'Square 1080' },
    { value: 'square-1200', label: 'Square 1200' },
    { value: 'square-2048', label: 'Square 2048' },
    { value: 'custom', label: 'Custom' },
  ];

  /** Current orientation — defaults via getPageOptions. */
  protected pageOrientation(node: SvgNode): PageOrientation {
    return getPageOptions(node).orientation;
  }

  /** Current format preset — defaults via getPageOptions. */
  protected pageFormat(node: SvgNode): PageFormat {
    return getPageOptions(node).format;
  }

  /** Current background kind ('transparent' | 'solid' | 'image'). */
  protected pageBackgroundKind(node: SvgNode): PageBackground['kind'] {
    return getPageOptions(node).background.kind;
  }

  /** Current background color when kind === 'solid'; empty otherwise. */
  protected pageBackgroundColor(node: SvgNode): string {
    const bg = getPageOptions(node).background;
    return bg.kind === 'solid' ? bg.color : '';
  }

  /**
   * A valid `#rrggbb` hex for the native `<input type="color">` swatch.
   * The stored color may be a named color or `rgb()/hsl()` typed into the
   * text field; the swatch can only render a hex, so non-hex values fall
   * back to white (the text field stays the source of truth for arbitrary
   * CSS colors). 3-digit hex is expanded to 6.
   */
  protected pageBackgroundColorHex(node: SvgNode): string {
    const color = this.pageBackgroundColor(node).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      const r = color[1]!;
      const g = color[2]!;
      const b = color[3]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return '#ffffff';
  }

  /** Current background image URL when kind === 'image'; empty otherwise. */
  protected pageBackgroundHref(node: SvgNode): string {
    const bg = getPageOptions(node).background;
    return bg.kind === 'image' ? bg.href : '';
  }

  /** One component of the margins struct as a string for the input binding. */
  protected pageMargin(node: SvgNode, side: keyof PageMargins): string {
    const v = getPageOptions(node).margins[side];
    return Number.isFinite(v) ? String(v) : '0';
  }

  // ── Mutators (same undoable core commands as the Inspector) ────────

  /** Commit a page rename via {@link RenamePageCommand}. */
  protected onPageNameChange(node: SvgNode, event: Event): void {
    if (!isPage(node)) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const next = target.value.trim();
    this.bus.dispatch(new RenamePageCommand(node.id, next));
  }

  /**
   * Commit a single viewBox-component edit via {@link ResizePageCommand}.
   * Reads the current viewBox first to preserve the other 3 components —
   * the command takes the FULL new viewBox.
   */
  protected onPageViewBoxChange(node: SvgNode, field: keyof BoundingBox, event: Event): void {
    if (!isPage(node)) return;
    const current = getPageViewBox(node);
    if (current === null) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const parsed = Number.parseFloat(target.value);
    if (!Number.isFinite(parsed)) return;
    const next: BoundingBox = { ...current, [field]: parsed };
    this.bus.dispatch(new ResizePageCommand(node.id, next));
  }

  /** Commit an orientation change via {@link SetPageOptionsCommand}. */
  protected onPageOrientationChange(node: SvgNode, value: PageOrientation): void {
    if (!isPage(node)) return;
    this.bus.dispatch(new SetPageOptionsCommand(node.id, { orientation: value }));
  }

  /** Commit a format change via {@link SetPageOptionsCommand}. */
  protected onPageFormatChange(node: SvgNode, value: PageFormat): void {
    if (!isPage(node)) return;
    this.bus.dispatch(new SetPageOptionsCommand(node.id, { format: value }));
  }

  /**
   * Commit a background-kind change. Switching kinds resets the
   * dependent payload (color / href) to a sensible default so a
   * solid → image switch never surfaces an undefined href.
   */
  protected onPageBackgroundKindChange(node: SvgNode, kind: PageBackground['kind']): void {
    if (!isPage(node)) return;
    let background: PageBackground;
    if (kind === 'transparent') background = { kind: 'transparent' };
    else if (kind === 'solid') background = { kind: 'solid', color: '#ffffff' };
    else background = { kind: 'image', href: '' };
    this.bus.dispatch(new SetPageOptionsCommand(node.id, { background }));
  }

  /** Commit a color change to the current solid background. */
  protected onPageBackgroundColorChange(node: SvgNode, event: Event): void {
    if (!isPage(node)) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const color = target.value.trim();
    if (color.length === 0) return;
    this.bus.dispatch(new SetPageOptionsCommand(node.id, { background: { kind: 'solid', color } }));
  }

  /** Commit a URL change to the current image background. */
  protected onPageBackgroundHrefChange(node: SvgNode, event: Event): void {
    if (!isPage(node)) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const href = target.value.trim();
    this.bus.dispatch(new SetPageOptionsCommand(node.id, { background: { kind: 'image', href } }));
  }

  /**
   * Commit a single margin-side edit. Reads the full margins struct
   * first because SetPageOptionsCommand REPLACES the whole sub-struct
   * (the patch field is `margins`, not `margins.top`).
   */
  protected onPageMarginChange(node: SvgNode, side: keyof PageMargins, event: Event): void {
    if (!isPage(node)) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const parsed = Number.parseFloat(target.value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const current = getPageOptions(node).margins ?? DEFAULT_PAGE_OPTIONS.margins;
    const next: PageMargins = { ...current, [side]: parsed };
    this.bus.dispatch(new SetPageOptionsCommand(node.id, { margins: next }));
  }

  /**
   * Delete the active page via {@link DeletePageCommand}. The
   * ActivePageService auto-recovery effect picks a remaining page (or
   * flips this dialog to the empty state when none remain). Reversible
   * with Ctrl+Z.
   */
  protected deletePage(node: SvgNode): void {
    if (!isPage(node)) return;
    this.bus.dispatch(new DeletePageCommand(node.id));
  }
}
