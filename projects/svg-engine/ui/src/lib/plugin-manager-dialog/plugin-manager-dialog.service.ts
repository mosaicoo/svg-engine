import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgePluginManagerDialog } from './plugin-manager-dialog.component';

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

  /** Open the plugin manager dialog. Returns the `MatDialogRef`. */
  open(parentInjector?: Injector): MatDialogRef<SvgePluginManagerDialog> {
    return this.dialog.open(
      SvgePluginManagerDialog,
      svgeDialogConfig('md', { injector: parentInjector }),
    );
  }
}
