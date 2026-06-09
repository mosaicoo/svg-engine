import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeAboutDialog } from './about-dialog.component';

/**
 * **Centralized opener for `<svge-about-dialog>`** — D-044 follow-up.
 *
 * Same pattern as the other `Svge*DialogService` openers
 * ({@link SvgeSvgSourceDialogService}, {@link SvgeWorkspaceSettingsDialogService},
 * etc.): every consumer that wants to surface the About box calls this
 * one entry point. Centralizes Material dialog configuration and the
 * multi-editor injector wiring needed by D-042 routes.
 *
 * **About box doesn't actually use scoped services** (it just renders
 * a static version + tagline + links), so the `parentInjector`
 * parameter is **optional and ignored in practice**. We keep the
 * parameter in the signature for consistency with sibling services —
 * a consumer can still pass it without harm, and the future
 * possibility of showing per-editor info (e.g., "Editor scope: …")
 * won't require an API change.
 *
 * **Bucket**: `'sm'` (440px). The content is tiny — name + version +
 * tagline + a couple of links. Anything wider would just stretch
 * negative space.
 *
 * @internal **Wiring interno** do plugin de menu (`builtinUiMenuContributionsPlugin`)
 * — não faz parte do contrato público estável do svg-engine. Pode mudar sem
 * major bump; consumidores externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeAboutDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the About SVGEngine dialog.
   *
   * @param parentInjector Optional. Accepted for API consistency with
   * the sibling dialog services; the dialog content doesn't currently
   * depend on per-editor scope so this is functionally a no-op.
   */
  open(parentInjector?: Injector): MatDialogRef<SvgeAboutDialog> {
    return this.dialog.open(SvgeAboutDialog, svgeDialogConfig('sm', { injector: parentInjector }));
  }
}
