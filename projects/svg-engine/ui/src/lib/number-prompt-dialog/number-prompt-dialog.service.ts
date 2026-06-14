import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import {
  type NumberPromptDialogData,
  SvgeNumberPromptDialog,
} from './number-prompt-dialog.component';

/**
 * **D-093** — Centralized opener for `<svge-number-prompt-dialog>`.
 * Standardized `svgeDialogConfig('sm')` sizing + optional `parentInjector`
 * (D-042 multi-editor scope). Returns the `MatDialogRef` so callers can
 * await `afterClosed()` for the entered `number` (or `null` if cancelled).
 *
 * @internal Wiring interno do `builtinUiMenuContributionsPlugin`.
 */
@Injectable({ providedIn: 'root' })
export class SvgeNumberPromptDialogService {
  private readonly dialog = inject(MatDialog);

  open(
    data: NumberPromptDialogData,
    parentInjector?: Injector,
  ): MatDialogRef<SvgeNumberPromptDialog, number | null> {
    return this.dialog.open<SvgeNumberPromptDialog, NumberPromptDialogData, number | null>(
      SvgeNumberPromptDialog,
      svgeDialogConfig('sm', {
        injector: parentInjector,
        data,
      }),
    );
  }
}
