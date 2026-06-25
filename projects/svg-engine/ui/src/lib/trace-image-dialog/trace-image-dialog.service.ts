import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import type { NodeId } from '@mosaicoo/svg-engine/core';
import { svgeDialogConfig } from '../dialog-shell';
import {
  SvgeTraceImageDialog,
  type TraceImageDialogData,
  type TraceImageDialogResult,
} from './trace-image-dialog.component';

/**
 * **D-066c** — Centralized opener for `<svge-trace-image-dialog>`.
 *
 * Mirrors {@link SvgeSvgSourceDialogService} structurally:
 *
 * - Wraps `MatDialog.open` with the standardized `svgeDialogConfig`
 *   sizing (sm bucket — fits naturally; this dialog has no large
 *   content area).
 * - Forwards an optional `parentInjector` (D-042 multi-editor scope
 *   safety) so dialogs opened in a route-scoped app see the active
 *   editor's services.
 *
 * Returns the `MatDialogRef` so callers can await `afterClosed()` for
 * the user's `TraceImageDialogResult` (or `null` if cancelled).
 *
 * @internal **Wiring interno** do plugin de menu (`builtinUiMenuContributionsPlugin`)
 * — não faz parte do contrato público estável do svg-engine. Pode mudar sem
 * major bump; consumidores externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class SvgeTraceImageDialogService {
  private readonly dialog = inject(MatDialog);

  open(
    imageNodeId: NodeId,
    parentInjector?: Injector,
  ): MatDialogRef<SvgeTraceImageDialog, TraceImageDialogResult | null> {
    return this.dialog.open<
      SvgeTraceImageDialog,
      TraceImageDialogData,
      TraceImageDialogResult | null
    >(
      SvgeTraceImageDialog,
      svgeDialogConfig('sm', {
        injector: parentInjector,
        data: { imageNodeId },
      }),
    );
  }
}
