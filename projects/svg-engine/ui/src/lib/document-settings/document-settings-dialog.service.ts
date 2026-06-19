import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeDocumentSettings } from './document-settings.component';

/**
 * **D-140** — centralized opener for `<svge-document-settings>`.
 *
 * Sibling of {@link SvgeWorkspaceSettingsDialogService}: every consumer
 * that wants to surface the Document Settings dialog (the built-in UI
 * menu plugin, custom routes, third-party apps) calls this one entry
 * point instead of touching `MatDialog.open` directly. It encapsulates
 * the **two cross-cutting concerns** every "open a dialog" call site
 * otherwise re-implements (often inconsistently):
 *
 * 1. **Material dialog configuration** — width / max-height / autofocus /
 *    restoreFocus / panelClass, standardized via `svgeDialogConfig('md')`
 *    so the dialog looks identical regardless of who opened it.
 *
 * 2. **Multi-editor injector wiring (D-042/D-043)** — the rendered
 *    `<svge-document-settings>` reads `ActivePageService` and
 *    `CommandBus` via `inject()`. Without an explicit parent injector,
 *    MatDialog instantiates the dialog with the overlay-root injector,
 *    which in route-scoped apps points at the ROOT services instead of
 *    the active editor's scope — the dialog would read / mutate the
 *    wrong page. This service accepts an optional `parentInjector` and
 *    forwards it via `MatDialogConfig.injector`.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` (needs
 * `MatDialog`). Headless consumers drive the same core page commands
 * against `ActivePageService` directly — no Material required.
 *
 * @internal **Wiring interno** do plugin de menu (`builtinUiMenuContributionsPlugin`)
 * — não faz parte do contrato público estável do svg-engine. Pode mudar sem
 * major bump; consumidores externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeDocumentSettingsDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the Document Settings dialog.
   *
   * @param parentInjector Optional — the consumer's `Injector`.
   * **Strongly recommended** in route-scoped (D-042) apps so the dialog
   * reads/writes the active editor's page. Omitting it defaults to the
   * overlay-root injector. Single-editor apps work either way.
   *
   * Returns the `MatDialogRef` for callers that want close listeners or
   * `afterClosed()`.
   */
  open(parentInjector?: Injector): MatDialogRef<SvgeDocumentSettings> {
    // 'md' = 600px — appropriate for settings forms with multiple
    // grouped fields (same bucket as Workspace Settings).
    return this.dialog.open(
      SvgeDocumentSettings,
      svgeDialogConfig('md', { injector: parentInjector }),
    );
  }
}
