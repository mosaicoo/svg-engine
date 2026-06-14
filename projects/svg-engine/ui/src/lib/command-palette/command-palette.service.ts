import { inject, Injectable, type Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeCommandPaletteDialog } from './command-palette.dialog';

/**
 * **Centralized opener for `<svge-command-palette-dialog>`** (Tools ▸
 * Command Palette, Ctrl+Shift+P). Mirrors the sibling dialog services
 * ({@link SvgeKeyboardShortcutsDialogService} et al.): one place that
 * knows the sizing + positioning and threads the consumer's
 * `parentInjector` so the dialog resolves the **route-scoped** editor
 * services (the commands act on the focused editor — D-042/D-043).
 *
 * **Layout choice**: `md` width, anchored near the top of the viewport
 * (`position.top`) so it reads as a floating command bar rather than a
 * centered modal — the Spotlight / VS Code convention. `autoFocus: 'input'`
 * drops the caret straight into the search box so the user can type
 * immediately.
 *
 * @internal Wiring interno do plugin de menu — fora do contrato público
 * estável; pode mudar sem major bump.
 */
@Injectable({ providedIn: 'root' })
export class SvgeCommandPaletteService {
  private readonly dialog = inject(MatDialog);

  open(parentInjector?: Injector): MatDialogRef<SvgeCommandPaletteDialog, void> {
    return this.dialog.open<SvgeCommandPaletteDialog, void, void>(
      SvgeCommandPaletteDialog,
      svgeDialogConfig('md', {
        injector: parentInjector,
        autoFocus: 'input',
        // Float near the top like a command bar (Spotlight/VS Code).
        position: { top: '12vh' },
        ariaLabel: 'Command palette — search and run any command',
      }),
    );
  }
}
