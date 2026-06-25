import { Injectable, signal } from '@angular/core';
import type { NodeId } from '@mosaicoo/svg-engine/core';

/**
 * Coordinates the inline text-editing gesture between the
 * {@link TextTool} (which creates the placeholder node + asks for
 * edit mode) and the {@link InlineTextEditor} overlay component
 * (which renders the editable surface positioned over the node).
 *
 * **Decoupled by design**: the tool doesn't know how the editor
 * renders (foreignObject vs portal vs separate input) and the editor
 * doesn't know which tool initiated the edit. Both communicate via
 * the `editingId` signal — the editor activates when it sees a
 * matching id; the tool moves on as soon as it calls `beginEdit`.
 *
 * **Why a service** (not direct component coupling): the editor lives
 * inside the renderer's `<ng-content>` slot — it's a sibling of the
 * text node visually, not a child of the tool. Signals + DI are the
 * cleanest cross-cutting channel in Angular.
 *
 * **Lifecycle**: `root`-provided. The editor commits its current text
 * before `editingId` flips (so any pending edits aren't lost when
 * switching to a different text node).
 *
 * @internal **Cross-entry-point**: exportado para os overlays/painéis de
 * `svg-engine/ui` consumirem do pacote buildado. Fora do contrato público
 * estável — pode mudar sem major bump; consumidores externos não devem
 * depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class InlineTextEditorService {
  private readonly _editingId = signal<NodeId | null>(null);
  /**
   * `true` when the node being edited was inserted FRESH by the
   * TextTool (vs editing an existing text node). Used to drive
   * cancel-deletes-placeholder semantics — Esc on a fresh node
   * removes it; Esc on a pre-existing node just exits edit mode.
   */
  private readonly _isPlaceholder = signal(false);

  readonly editingId = this._editingId.asReadonly();
  readonly isPlaceholder = this._isPlaceholder.asReadonly();

  /**
   * Enter inline-edit mode for a text node. `placeholder=true` when
   * the node was just inserted by the TextTool — its initial content
   * is a hint string the user is expected to replace; if they cancel
   * without typing anything, we remove the empty placeholder.
   */
  beginEdit(id: NodeId, placeholder: boolean): void {
    this._editingId.set(id);
    this._isPlaceholder.set(placeholder);
  }

  /**
   * Exit edit mode. The editor calls this after committing or
   * cancelling its current value. Idempotent — safe to call when
   * nothing is being edited.
   */
  endEdit(): void {
    this._editingId.set(null);
    this._isPlaceholder.set(false);
  }

  // ── TOOL-OPT-C preference signals ────────────────────────────────
  // Defaults consumed by TextTool when creating a new text node.
  // Defaults match the prior hardcoded values (fontSize comes from
  // DEFAULT_FONT_SIZE in text-tool.plugin.ts; other fields stay
  // undefined so the renderer's defaults apply unchanged).

  private readonly _fontFamily = signal<string | null>(null);
  private readonly _fontSize = signal<number | null>(null);
  private readonly _fontWeight = signal<number | null>(null);
  private readonly _fontStyle = signal<'italic' | null>(null);
  private readonly _textAnchor = signal<'start' | 'middle' | 'end'>('start');
  private readonly _fill = signal<string>('#000000');

  readonly fontFamily = this._fontFamily.asReadonly();
  readonly fontSize = this._fontSize.asReadonly();
  readonly fontWeight = this._fontWeight.asReadonly();
  readonly fontStyle = this._fontStyle.asReadonly();
  readonly textAnchor = this._textAnchor.asReadonly();
  readonly fill = this._fill.asReadonly();

  setFontFamily(v: string | null): void {
    this._fontFamily.set(v);
  }
  setFontSize(v: number | null): void {
    if (v === null) {
      this._fontSize.set(null);
      return;
    }
    if (Number.isFinite(v) && v > 0) this._fontSize.set(Math.min(400, v));
  }
  setFontWeight(v: number | null): void {
    this._fontWeight.set(v);
  }
  setItalic(on: boolean): void {
    this._fontStyle.set(on ? 'italic' : null);
  }
  setTextAnchor(v: 'start' | 'middle' | 'end'): void {
    this._textAnchor.set(v);
  }
  setFill(v: string): void {
    this._fill.set(v);
  }
}
