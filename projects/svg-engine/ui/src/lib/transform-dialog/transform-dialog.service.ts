import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import {
  SvgeTransformDialog,
  type TransformDialogData,
  type TransformDialogMode,
  type TransformDialogResult,
} from './transform-dialog.component';

/**
 * **D-093** — Centralized opener for `<svge-transform-dialog>` (Rotate /
 * Scale / Skew). Mirrors {@link SvgeTraceImageDialogService} structurally:
 * standardized `svgeDialogConfig('sm')` sizing + an optional
 * `parentInjector` (D-042 multi-editor scope) so a route-scoped app's
 * dialog resolves the active editor's services.
 *
 * Returns the `MatDialogRef` so callers can await `afterClosed()` for the
 * user's {@link TransformDialogResult} (or `null` if cancelled).
 *
 * @internal Wiring interno do `builtinUiMenuContributionsPlugin` — não faz
 * parte do contrato público estável; consumidores externos não devem
 * depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeTransformDialogService {
  private readonly dialog = inject(MatDialog);

  open(
    mode: TransformDialogMode,
    parentInjector?: Injector,
  ): MatDialogRef<SvgeTransformDialog, TransformDialogResult | null> {
    return this.dialog.open<SvgeTransformDialog, TransformDialogData, TransformDialogResult | null>(
      SvgeTransformDialog,
      svgeDialogConfig('sm', {
        injector: parentInjector,
        data: { mode },
      }),
    );
  }
}
