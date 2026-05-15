import { computed, Injectable, signal } from '@angular/core';
import { createEmptyDocument } from '../document/document-factory';
import type { SvgDocument } from '../document/svg-document';
import { collectNodes, countNodes } from '../tree/tree-traversal';

/**
 * Single source of truth for the currently edited {@link SvgDocument}.
 * State is exposed as readonly Angular signals; mutations happen
 * exclusively through {@link CommandBus}, which calls {@link setDocument}
 * after a successful command execution.
 *
 * Direct callers should treat this service as read-only — invoking
 * `setDocument` from outside `CommandBus` bypasses history (no undo).
 */
@Injectable({ providedIn: 'root' })
export class EditorStateService {
  private readonly _document = signal<SvgDocument>(createEmptyDocument());
  private readonly _dirty = signal(false);

  /** Current document. Readonly signal — derive computed values from it. */
  readonly document = this._document.asReadonly();

  /** Whether the document has unsaved changes since the last `markClean()`. */
  readonly dirty = this._dirty.asReadonly();

  /** Total node count in the current document (root group included). */
  readonly nodeCount = computed(() => countNodes(this._document().root));

  /** Flat array of every node in the current document (pre-order). */
  readonly allNodes = computed(() => collectNodes(this._document().root));

  /**
   * Replace the current document. Marks the state dirty. Intended for
   * {@link CommandBus} and document-loading flows; direct callers bypass
   * history.
   */
  setDocument(doc: SvgDocument): void {
    this._document.set(doc);
    this._dirty.set(true);
  }

  /**
   * Reset to an empty document (or the supplied one) and clear the dirty
   * flag. Intended for "new document" flows.
   */
  resetDocument(doc: SvgDocument = createEmptyDocument()): void {
    this._document.set(doc);
    this._dirty.set(false);
  }

  /** Clear the dirty flag without changing the document (e.g., after save). */
  markClean(): void {
    this._dirty.set(false);
  }
}
