import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import {
  SvgePluginManagerDialog,
  type SvgePluginManagerDialogData,
} from './plugin-manager-dialog.component';

/** Options for {@link SvgePluginManagerDialogService.open}. */
export interface SvgePluginManagerOpenOptions {
  /** **D-099** — start with the "Install from URL…" form open (deep-link). */
  readonly openInstall?: boolean;
}

/**
 * **Centralized opener for `<svge-plugin-manager-dialog>`** (D-083 Fase 1).
 *
 * Sibling of {@link SvgeWorkspaceSettingsDialogService}: one entry point
 * for "open the plugin manager dialog" so config (size `'md'`) and the
 * multi-editor injector wiring stay consistent across every call site
 * (the built-in UI menu plugin, custom routes, third-party consumers).
 *
 * Note the plugin manager reads **root** services (`PluginManagerService`
 * is `providedIn: 'root'`), so the injector wiring is not strictly
 * required here — it's forwarded anyway for parity with the other dialog
 * services and to stay correct if the panel ever grows a scoped
 * dependency.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` (needs
 * `MatDialog`). Headless consumers mount `<svge-plugin-manager>` directly.
 *
 * @internal Wiring interno do plugin de menu (`builtinUiMenuContributionsPlugin`).
 */
@Injectable({ providedIn: 'root' })
export class SvgePluginManagerDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the plugin manager dialog. Returns the `MatDialogRef`.
   *
   * `height` gives the pane a definite initial size so the panel opens
   * comfortably tall; the body (`.pmd-body`) flex-fills it and follows
   * the user's resize from there (the dialog-shell resize grabber
   * rewrites the pane height live).
   */
  open(
    parentInjector?: Injector,
    options?: SvgePluginManagerOpenOptions,
  ): MatDialogRef<SvgePluginManagerDialog> {
    return this.dialog.open(
      SvgePluginManagerDialog,
      svgeDialogConfig<SvgePluginManagerDialogData>('md', {
        injector: parentInjector,
        height: 'min(70vh, 600px)',
        data: { openInstall: options?.openInstall ?? false },
      }),
    );
  }
}
