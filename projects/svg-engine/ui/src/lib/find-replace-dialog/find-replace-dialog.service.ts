import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeFindReplaceDialog } from './find-replace-dialog.component';

/**
 * **D-070** — Centralized opener for `<svge-find-replace-dialog>`.
 * Mirrors the pattern from {@link SvgeTraceImageDialogService} and
 * {@link SvgeSvgSourceDialogService}: one place that knows the dialog
 * sizing (`md`) and propagates the consumer's `parentInjector` so the
 * dialog's `inject(EditorStateService)` resolves to the active editor
 * scope (D-042 multi-editor safety).
 *
 * Returns the `MatDialogRef` so callers can subscribe to `afterClosed()`
 * if they want — but the dialog doesn't return a value (everything
 * happens through `CommandBus` dispatch). Most callers just `open()` and
 * forget.
 *
 * @internal **Wiring interno** do plugin de menu (`builtinUiMenuContributionsPlugin`)
 * — não faz parte do contrato público estável do svg-engine. Pode mudar sem
 * major bump; consumidores externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeFindReplaceDialogService {
  private readonly dialog = inject(MatDialog);

  open(parentInjector?: Injector): MatDialogRef<SvgeFindReplaceDialog, void> {
    return this.dialog.open<SvgeFindReplaceDialog, void, void>(
      SvgeFindReplaceDialog,
      svgeDialogConfig('md', { injector: parentInjector }),
    );
  }
}
