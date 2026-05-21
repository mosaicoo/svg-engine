import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeWorkspaceSettings } from './workspace-settings.component';

/**
 * **Centralized opener for `<svge-workspace-settings>`** — D-044 follow-up.
 *
 * Sibling of {@link SvgeSvgSourceDialogService}: every consumer that
 * wants to surface the Workspace Settings dialog (built-in menu plugin,
 * custom routes, third-party consumer apps) calls this one entry point
 * instead of touching `MatDialog.open` directly. The service
 * encapsulates the **two cross-cutting concerns** that every "open a
 * dialog" call site otherwise re-implements (often inconsistently):
 *
 * 1. **Material dialog configuration** — width, max-height, autofocus,
 *    restoreFocus, panelClass. Standardized via `svgeDialogConfig('md')`
 *    so the Workspace Settings dialog looks identical regardless of who
 *    opened it.
 *
 * 2. **Multi-editor injector wiring (D-042/D-043)** — the rendered
 *    `<svge-workspace-settings>` reads `WorkspaceService` via
 *    `inject()`. Without an explicit parent injector, MatDialog
 *    instantiates the dialog with the overlay-root injector, which in
 *    route-scoped apps points at the empty ROOT `WorkspaceService`
 *    instead of the active editor's scope — the dialog would show /
 *    mutate the wrong workspace. This service accepts an optional
 *    `parentInjector` and forwards it via `MatDialogConfig.injector`
 *    so the dialog sees the consumer's services.
 *
 * **Why a service instead of "just call MatDialog.open"**: same lesson
 * the source-dialog migration taught — when an action has nontrivial
 * setup that must stay consistent across consumers (dialog config +
 * injector wiring), the fix-once-protect-everywhere is a service.
 * Otherwise every new consumer rediscovers the bug.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` (needs
 * `MatDialog`). Headless consumers (puro) build their own settings
 * surface against `WorkspaceService` directly — no Material required.
 */
@Injectable({ providedIn: 'root' })
export class SvgeWorkspaceSettingsDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the Workspace Settings dialog.
   *
   * @param parentInjector Optional — the consumer's `Injector`.
   * **Strongly recommended** in route-scoped (D-042) apps so the dialog
   * reads/writes the active editor's `WorkspaceService`. Omitting it
   * defaults to the overlay-root injector, which in multi-editor setups
   * will edit the root document's workspace. Single-editor apps (no
   * `provideSvgEngineEditorScope()`) work either way.
   *
   * Returns the `MatDialogRef` for callers that want to wire close
   * listeners or `afterClosed()` observable.
   */
  open(parentInjector?: Injector): MatDialogRef<SvgeWorkspaceSettings> {
    // 'md' = 600px — appropriate for settings forms with multiple
    // grouped fields. See dialog-config.ts for the full sizing rationale.
    return this.dialog.open(
      SvgeWorkspaceSettings,
      svgeDialogConfig('md', { injector: parentInjector }),
    );
  }
}
