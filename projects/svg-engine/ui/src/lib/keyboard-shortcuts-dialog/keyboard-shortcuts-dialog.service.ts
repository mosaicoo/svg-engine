import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeKeyboardShortcutsDialog } from './keyboard-shortcuts-dialog.component';

/**
 * **D-087** — Centralized opener for `<svge-keyboard-shortcuts-dialog>`.
 * Mirrors the sibling dialog services ({@link SvgeFindReplaceDialogService}
 * et al.): one place that knows the sizing (`lg` — the list needs room)
 * and forwards the consumer's `parentInjector`.
 *
 * The dialog reads/writes the global `KeybindingsService`
 * (`providedIn: 'root'`), so scope wiring isn't strictly required here —
 * but we still thread `injector` through for consistency with every
 * other dialog (and in case future fields resolve scoped services).
 *
 * @internal Wiring interno do plugin de menu — não faz parte do contrato
 * público estável; pode mudar sem major bump.
 */
@Injectable({ providedIn: 'root' })
export class SvgeKeyboardShortcutsDialogService {
  private readonly dialog = inject(MatDialog);

  open(parentInjector?: Injector): MatDialogRef<SvgeKeyboardShortcutsDialog, void> {
    return this.dialog.open<SvgeKeyboardShortcutsDialog, void, void>(
      SvgeKeyboardShortcutsDialog,
      svgeDialogConfig('lg', { injector: parentInjector }),
    );
  }
}
