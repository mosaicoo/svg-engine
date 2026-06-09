import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import type { NodeId } from 'svg-engine/core';
import { svgeDialogConfig } from '../dialog-shell';
import {
  type SmartObjectEditorDialogData,
  SvgeSmartObjectEditorDialog,
} from './smart-object-dialog.component';

/**
 * **D-074 — Centralized opener for `<svge-smart-object-editor-dialog>`.**
 *
 * Same pattern as `SvgeSvgSourceDialogService`: encapsulates the
 * Material dialog config (size, focus management) AND the multi-editor
 * injector wiring (D-042/D-043/D-044). Consumers (built-in UI menu
 * plugin, custom routes) call this single entry point; bug-fixes
 * around dialog config propagate everywhere automatically.
 *
 * @internal **Wiring interno** do plugin de menu (`builtinUiMenuContributionsPlugin`)
 * — não faz parte do contrato público estável do svg-engine. Pode mudar sem
 * major bump; consumidores externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeSmartObjectEditorDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Open the Smart Object editor dialog for the given wrapper id.
   *
   * @param nodeId id of the smart-object wrapper to edit.
   * @param parentInjector consumer's `Injector`. Forward this in
   *   route-scoped apps so the dialog reads the active editor's
   *   `EditorStateService` (D-042 multi-editor scope). Omitting it
   *   falls back to the overlay-root injector — fine for single-editor
   *   apps; will read the empty root document in multi-editor.
   */
  open(nodeId: NodeId, parentInjector?: Injector): MatDialogRef<SvgeSmartObjectEditorDialog> {
    const data: SmartObjectEditorDialogData = { nodeId };
    return this.dialog.open(
      SvgeSmartObjectEditorDialog,
      svgeDialogConfig('lg', { injector: parentInjector, data }),
    );
  }
}
