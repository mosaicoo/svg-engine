import { Injectable, signal } from '@angular/core';

/**
 * **D-062a** — per-editor "currently-selected symbol" state for the
 * Symbol Sprayer tool. Mirrors {@link BrushSelectionService} (D-060):
 * a tiny signal-backed service that lets the Libraries panel pick a
 * symbol "to spray" without entangling the panel and the tool with
 * a shared state machine.
 *
 * **Selection workflow**:
 * 1. User opens the Libraries panel → Symbols tab.
 * 2. Click a symbol cell **with the Symbol Sprayer tool active**.
 *    The cell toggles `selectedSymbolId` to that item.
 * 3. The Sprayer tool reads `selectedSymbolId()` on each pointer
 *    move/down to know which master to instantiate.
 * 4. Click the active cell again to deselect → Sprayer becomes a
 *    no-op until another symbol is picked.
 *
 * **Why per-editor scope** (D-042): two side-by-side editors should
 * be free to spray different symbols independently. Without scoping
 * a brush/spray choice in editor A leaks into editor B.
 *
 * **Provider**: registered both at root (zero-config single editor)
 * and in `provideSvgEngineEditorScope()` (multi-editor apps).
 */
@Injectable({ providedIn: 'root' })
export class SymbolSelectionService {
  private readonly _selectedSymbolId = signal<string | null>(null);
  readonly selectedSymbolId = this._selectedSymbolId.asReadonly();

  /** Set the active symbol id, or pass `null` to clear the selection. */
  select(symbolId: string | null): void {
    this._selectedSymbolId.set(symbolId);
  }
}
