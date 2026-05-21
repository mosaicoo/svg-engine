import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialogActions, MatDialogClose, MatDialogContent } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * **`<svge-dialog-shell>`** — D-044 follow-up (UI consistency sprint).
 *
 * Standardized chrome for every Material dialog in SVGEngine. Wrap
 * your dialog content with this component to inherit:
 *
 * - **Header**: optional icon + title + optional subtitle + extras
 *   slot + close (X) button. Layout, spacing, typography, ARIA all
 *   handled — consumer just supplies `icon` / `title` inputs.
 * - **Body**: scrollable `<mat-dialog-content>` with normalized
 *   padding. Long content scrolls; header and footer stay pinned
 *   (matches Material spec).
 * - **Footer**: optional actions slot for buttons (typically right-
 *   aligned). When unused, no footer renders.
 *
 * **Why a shell component instead of per-dialog templates**: every
 * dialog in the library was hand-rolling its own header layout, close
 * button placement, and spacing — divergence accumulated (source
 * dialog had Copy + Close redundantly; workspace settings had no
 * close X; sizes varied). Centralizing here means **future dialogs
 * look consistent by construction**: consumers can't accidentally
 * skip the close button or use different icon placement.
 *
 * **API**:
 *
 * ```html
 * <svge-dialog-shell icon="code" title="SVG source" subtitle="Live exported">
 *   <!-- Optional extra buttons in the header (e.g., Copy):           -->
 *   <ng-container svgeDialogHeaderActions>
 *     <button mat-icon-button (click)="copy()"><mat-icon>content_copy</mat-icon></button>
 *   </ng-container>
 *
 *   <!-- Body content (default slot) -->
 *   <pre>{{ source() }}</pre>
 *
 *   <!-- Optional footer actions (default = no footer) -->
 *   <ng-container svgeDialogFooterActions>
 *     <button mat-button (click)="reset()">Reset</button>
 *     <button mat-flat-button mat-dialog-close>Done</button>
 *   </ng-container>
 *
 *   <!-- Optional footer status text (e.g., size info) -->
 *   <ng-container svgeDialogFooterStatus>
 *     {{ bytes() }} bytes · {{ lines() }} lines
 *   </ng-container>
 * </svge-dialog-shell>
 * ```
 *
 * **Pairs with `svgeDialogConfig(size)`** — open the dialog with the
 * standardized MatDialogConfig and wrap its content with this shell.
 * Two pieces, one consistent look.
 *
 * **Accessibility**: header is a `<header>` landmark. Title is an
 * `<h2>` (the implicit Material default for dialogs). Close button
 * carries `aria-label="Close dialog"` and uses `mat-dialog-close`
 * directive so Esc + outside-click + button-click all dismiss
 * uniformly.
 */
@Component({
  selector: 'svge-dialog-shell',
  standalone: true,
  imports: [MatIcon, MatIconButton, MatTooltip, MatDialogClose, MatDialogContent, MatDialogActions],
  template: `
    <header class="dlg-header" role="region" attr.aria-label="Dialog header — {{ title() }}">
      @if (icon(); as i) {
        <mat-icon class="dlg-header-icon" aria-hidden="true">{{ i }}</mat-icon>
      }
      <div class="dlg-header-titles">
        <h2 class="dlg-title" mat-dialog-title>{{ title() }}</h2>
        @if (subtitle(); as st) {
          <p class="dlg-subtitle">{{ st }}</p>
        }
      </div>
      <span class="dlg-spacer"></span>
      <ng-content select="[svgeDialogHeaderActions]" />
      @if (showClose()) {
        <button
          mat-icon-button
          type="button"
          mat-dialog-close
          matTooltip="Close"
          aria-label="Close dialog"
          class="dlg-close-btn"
        >
          <mat-icon>close</mat-icon>
        </button>
      }
    </header>
    <mat-dialog-content class="dlg-body">
      <ng-content />
    </mat-dialog-content>
    <footer class="dlg-footer">
      <span class="dlg-footer-status">
        <ng-content select="[svgeDialogFooterStatus]" />
      </span>
      <mat-dialog-actions align="end" class="dlg-footer-actions">
        <ng-content select="[svgeDialogFooterActions]" />
      </mat-dialog-actions>
    </footer>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      /* Lets the body grow to fill, header + footer stay natural-height. */
      min-height: 0;
      max-height: inherit;
      /* Tighter inner radius matches the panelClass border-radius from
         svgeDialogConfig — prevents content edges from clipping the
         dialog's rounded corners. */
      border-radius: inherit;
      overflow: hidden;
    }
    .dlg-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 0.75rem 0.75rem 1.25rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
      flex: 0 0 auto;
    }
    .dlg-header-icon {
      flex: 0 0 auto;
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--mat-sys-primary, #1976d2);
    }
    .dlg-header-titles {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }
    .dlg-title {
      margin: 0;
      padding: 0;
      font-size: 16px;
      font-weight: 500;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--mat-sys-on-surface, inherit);
    }
    .dlg-subtitle {
      margin: 0;
      font-size: 12px;
      line-height: 1.3;
      color: var(--mat-sys-on-surface-variant, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dlg-spacer {
      flex: 1 1 auto;
    }
    .dlg-close-btn {
      margin-left: 0.25rem;
    }
    .dlg-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 1rem 1.25rem;
      /* Material default adds extra top padding — normalize to match
         the consistent vertical rhythm with header. */
      margin: 0;
    }
    .dlg-footer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem 0.5rem 1.25rem;
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
      flex: 0 0 auto;
      min-height: 48px;
      box-sizing: border-box;
    }
    .dlg-footer-status {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
      font-variant-numeric: tabular-nums;
      /* Status is empty by default — collapses cleanly */
      display: inline-flex;
      align-items: center;
    }
    .dlg-footer-actions {
      flex: 0 0 auto;
      margin: 0;
      padding: 0;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeDialogShell {
  /** Optional Material icon name shown left of the title. */
  readonly icon = input<string | null>(null);
  /** Required title text — single line, ellipsis when too long. */
  readonly title = input.required<string>();
  /** Optional smaller subtitle below the title. */
  readonly subtitle = input<string | null>(null);
  /**
   * Whether to render the close (X) button at top-right. Default
   * `true`. Set `false` only when the dialog is non-dismissable (rare
   * — confirm dialogs that REQUIRE explicit choice). Esc + outside
   * click are independent of this — they always dismiss unless the
   * MatDialog `disableClose` option is set.
   */
  readonly showClose = input<boolean>(true);
}
