import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { SVG_ENGINE_VERSION } from '@mosaicoo/svg-engine';
import { SVGE_HELP_LINKS } from '@mosaicoo/svg-engine/edit';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * **`<svge-about-dialog>`** — D-044 follow-up.
 *
 * Material-styled About box that replaces the `alert()`-based fallback
 * previously registered by `builtinMenuContributionsPlugin` (edit-side).
 * Shows library version, tagline, links to GitHub repository + license.
 *
 * **Why a dialog (not a `<dialog>` polyfill or a toast)**:
 *
 * - **A11y**: `MatDialog` ships with role="dialog", focus trap, ESC
 *   close, ARIA-described header — all that the `alert()` lacked.
 * - **Branding**: every other editor surface (Workspace Settings, View
 *   Source, Find/Replace, Smart Object Editor, Trace Image) uses
 *   `<svge-dialog-shell>`. Keeping About on the same chrome means
 *   drag/resize/Close X parity for free.
 * - **Boundary (D-017)**: `MatDialog` lives in `@angular/material/dialog`
 *   which is only importable from `svg-engine/ui`. The edit-side plugin
 *   could only call `alert()` directly because edit-side can't import
 *   `@angular/material`. Moving the menu entry to
 *   `builtinUiMenuContributionsPlugin` closes that gap.
 *
 * **Layout**: uses the `'sm'` (440px) bucket because the content is
 * tiny — name + version + tagline + two links. Anything wider would
 * leave dead space on either side of the centered content.
 *
 * **Version surfacing**: reads `SVG_ENGINE_VERSION` from the public-api.
 * The constant is bumped by `standard-version` (D-031) in the same
 * commit that bumps `package.json` — they stay in lockstep.
 */
@Component({
  selector: 'svge-about-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatButton],
  template: `
    <svge-dialog-shell icon="info" title="SVGEngine" [subtitle]="'Version ' + version">
      <div class="about-body">
        <p class="tagline">Headless-first SVG editor for Angular.</p>
        <p class="description">
          Composable canvas engine + optional Material UI shell. Plugin-driven for tools, libraries,
          exporters, and menu contributions.
        </p>
        <div class="links">
          <a [href]="homepage" target="_blank" rel="noopener noreferrer"> GitHub repository </a>
        </div>
      </div>
      <ng-container svgeDialogFooterActions>
        <button mat-button (click)="ref.close()">Close</button>
      </ng-container>
    </svge-dialog-shell>
  `,
  styles: `
    .about-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.25rem 0;
    }
    .tagline {
      font-size: 1rem;
      font-weight: 500;
      margin: 0;
    }
    .description {
      margin: 0;
      opacity: 0.8;
      line-height: 1.4;
    }
    .links {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.5rem;
    }
    .links a {
      color: var(--mat-sys-primary, #1976d2);
      text-decoration: none;
    }
    .links a:hover {
      text-decoration: underline;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeAboutDialog {
  protected readonly version = SVG_ENGINE_VERSION;
  // D-096 — the repository/homepage link is host-independent: it comes from
  // the DI-configurable SVGE_HELP_LINKS (default → the public GitHub repo).
  // Apps repoint it via provideSvgeHelpLinks (e.g. from their environment).
  protected readonly homepage = inject(SVGE_HELP_LINKS).homepage;
  readonly ref = inject(MatDialogRef<SvgeAboutDialog>);
}
