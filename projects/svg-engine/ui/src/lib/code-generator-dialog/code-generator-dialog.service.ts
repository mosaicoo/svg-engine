import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeCodeGeneratorDialog } from './code-generator-dialog.component';

/**
 * **D-110 — Centralized opener for `<svge-code-generator-dialog>`.** Mirrors
 * {@link SvgeSvgSourceDialogService}: one entry point that owns the Material
 * dialog config (size bucket) and the multi-editor injector wiring
 * (D-042/D-043), so every call site (the built-in menu, custom routes,
 * consumer apps) opens the dialog identically and the dialog's
 * `inject(EditorStateService)` resolves the **active editor scope**.
 *
 * @internal wiring interno do `codeGeneratorsPlugin` — não faz parte do
 * contrato público estável.
 */
@Injectable({ providedIn: 'root' })
export class SvgeCodeGeneratorDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the code-generation dialog.
   *
   * @param parentInjector the consumer's `Injector` — strongly recommended in
   *   route-scoped (D-042) apps so the dialog reads the active editor's
   *   `EditorStateService`. Without it the dialog falls back to the overlay
   *   root injector (empty root document in multi-editor setups).
   */
  open(parentInjector?: Injector): MatDialogRef<SvgeCodeGeneratorDialog> {
    // 'lg' = 720px — appropriate for content viewers (source / code preview).
    return this.dialog.open(
      SvgeCodeGeneratorDialog,
      svgeDialogConfig('lg', { injector: parentInjector }),
    );
  }
}
