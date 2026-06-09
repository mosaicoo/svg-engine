import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeSvgSourceDialog } from './svg-source-dialog.component';

/**
 * **Centralized opener for `<svge-svg-source-dialog>`** — D-044 follow-up.
 *
 * Mirrors the {@link SvgeContextMenuService} pattern: every consumer
 * that wants to surface the SVG source viewer (built-in menu plugin,
 * custom routes, third-party consumer apps) calls this one entry
 * point. The service encapsulates **two concerns** that were
 * previously re-implemented at every call site:
 *
 * 1. **Material dialog configuration** — width, max-height, autofocus,
 *    restoreFocus. Standardized here so every "View Source" looks the
 *    same regardless of who opened it.
 *
 * 2. **Multi-editor injector wiring (D-042/D-043)** — the rendered
 *    `<svge-svg-source-dialog>` reads `EditorStateService` inside its
 *    template via `inject()`. Without an explicit parent injector,
 *    MatDialog instantiates the dialog with the overlay-root injector,
 *    which in route-scoped apps points at the empty ROOT
 *    EditorStateService instead of the active editor's scope — the
 *    dialog comes back blank. This service accepts an optional
 *    `parentInjector` and forwards it via `MatDialogConfig.injector`
 *    so the dialog sees the consumer's services.
 *
 * **Why a service instead of "just call MatDialog.open"**: same lesson
 * as `SvgeContextMenuService` — when an action has nontrivial setup
 * that must stay consistent across consumers (dialog config + injector
 * wiring), the fix-once-protect-everywhere is a service. Otherwise
 * every new consumer rediscovers the bug — exactly what happened with
 * the playground custom-editor route, which opened `MatDialog.open`
 * directly with subtly different config (and missing injector) until
 * this centralization.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` (needs
 * `MatDialog`). Consumers in headless puro don't import `svg-engine/ui`
 * — they don't have Material loaded — so they wouldn't want a Material
 * dialog anyway. They build their own viewer with the same
 * `EditorStateService` + `svgExporter` primitives directly.
 *
 * @internal **Wiring interno** do plugin de menu (`builtinUiMenuContributionsPlugin`)
 * — não faz parte do contrato público estável do svg-engine. Pode mudar sem
 * major bump; consumidores externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeSvgSourceDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the SVG source viewer dialog.
   *
   * @param parentInjector Optional — the consumer's `Injector`.
   * **Strongly recommended** in route-scoped (D-042) apps so the
   * dialog reads the active editor's `EditorStateService`. Omitting it
   * defaults to the overlay-root injector, which in multi-editor
   * setups will show the empty root document. Single-editor apps (no
   * `provideSvgEngineEditorScope()`) work either way.
   *
   * Returns the `MatDialogRef` for callers that want to wire close
   * listeners or `afterClosed()` observable.
   */
  open(parentInjector?: Injector): MatDialogRef<SvgeSvgSourceDialog> {
    // 'lg' = 720px — appropriate for content viewers (source code,
    // preview). See dialog-config.ts for the full sizing rationale.
    return this.dialog.open(
      SvgeSvgSourceDialog,
      svgeDialogConfig('lg', { injector: parentInjector }),
    );
  }
}
