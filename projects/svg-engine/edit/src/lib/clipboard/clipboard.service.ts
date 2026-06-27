import { computed, Injectable, signal } from '@angular/core';
import { cloneNodeWithNewIds, type NodeId, type SvgNode } from '@mosaicoo/svg-engine/core';

/**
 * **In-memory editor clipboard** — D-044 (UI controls full-functionality, follow-up).
 *
 * Holds a snapshot of one or more `SvgNode`s for Copy/Cut/Paste flows.
 * This service is the **in-memory core**: it stores deep-cloned nodes
 * losslessly (ids + metadata preserved), independent of the OS clipboard.
 * Intra-editor Copy/Paste always works through it with zero permission
 * prompts or MIME negotiation.
 *
 * **OS clipboard sync (D-111)** — copy-out to / paste-in from other apps
 * (Illustrator, Inkscape, the browser, …) IS supported, but it lives in a
 * separate **system-clipboard bridge** (`system-clipboard.ts`), NOT here.
 * On copy the bridge writes the serialized SVG to `navigator.clipboard` and
 * records it via {@link setExternalStamp}; on paste it compares the OS
 * clipboard against that stamp — if they match, the OS still holds OUR copy
 * so paste uses these lossless in-memory nodes, otherwise it round-trips the
 * foreign clipboard SVG through `svgImporter`. The bridge needs a secure
 * context + user gesture + clipboard permission; when any is missing, this
 * in-memory core still drives intra-editor Copy/Paste with the trade-offs
 * below.
 *
 * **In-memory-core trade-offs** (independent of the OS bridge):
 * - This signal-backed store is **lost on page reload** (an OS clipboard the
 *   bridge wrote to survives, but this store does not).
 * - `localStorage` persistence for cross-tab paste is still not implemented.
 *
 * **Multi-editor (D-042 scope-aware)**: `ClipboardService` is included in
 * `provideSvgEngineEditorScope()` so each editor instance has its own
 * clipboard. Two editors mounted side-by-side cannot accidentally paste
 * each other's content. To share a clipboard intentionally, consumers can
 * provide the service at root and override the scope's binding.
 *
 * **API**:
 *
 * - `copy(nodes)` — replace the clipboard with deep-cloned snapshots of
 *   `nodes`. Clones use NEW node ids so a later `paste()` produces ids
 *   that don't collide with the originals. Empty input is a no-op
 *   (preserves the current clipboard so a no-op Copy doesn't wipe state).
 * - `paste()` — return deep-cloned copies of the stored nodes, each with
 *   FRESH ids again. Multiple consecutive `paste()` calls return distinct
 *   id sets so they can be inserted into the document side-by-side.
 * - `clear()` — empty the clipboard.
 * - `hasContent` — reactive signal for `disabled` guards (Paste item
 *   should be disabled when empty).
 * - `size` — node count currently held.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly _items = signal<readonly SvgNode[]>([]);

  /**
   * **D-111** — the serialized SVG text we last pushed to the **system**
   * clipboard for the current in-memory copy (set by the system-clipboard
   * bridge). A later Paste compares it against the OS clipboard's text: if they
   * match, the OS clipboard still holds OUR copy, so Paste uses these lossless
   * in-memory nodes (preserving ids/metadata) instead of round-tripping through
   * the importer. `null` when nothing has been pushed, or after a copy that
   * didn't reach the OS clipboard.
   */
  private readonly _externalStamp = signal<string | null>(null);

  /** Reactive snapshot of clipboard contents (for debugging / UI). */
  readonly items = this._items.asReadonly();

  /** The SVG text last written to the OS clipboard for this copy, or `null`. */
  readonly externalStamp = this._externalStamp.asReadonly();

  /** Whether the clipboard currently holds any nodes — drive Paste disabled. */
  readonly hasContent = computed(() => this._items().length > 0);

  /** Number of nodes currently held. */
  readonly size = computed(() => this._items().length);

  /**
   * Replace clipboard with deep-cloned `nodes`. The clones receive NEW
   * ids so the originals stay intact in the document. Empty input is a
   * no-op — a "copy nothing" gesture (e.g., Ctrl+C with no selection)
   * should NOT silently clear a prior clipboard.
   */
  copy(nodes: readonly SvgNode[]): void {
    if (nodes.length === 0) return;
    const clones = nodes.map((n) => cloneNodeWithNewIds(n));
    this._items.set(clones);
    // Invalidate the OS stamp until the system-clipboard bridge writes a fresh
    // one — a copy that never reaches the OS clipboard must NOT keep an old
    // stamp that could falsely match foreign clipboard text on the next Paste.
    this._externalStamp.set(null);
  }

  /**
   * **D-111** — record the SVG text the system-clipboard bridge just wrote to
   * the OS clipboard for the current in-memory copy. See {@link externalStamp}.
   */
  setExternalStamp(svgText: string): void {
    this._externalStamp.set(svgText);
  }

  /**
   * Return fresh deep clones (with NEW ids) of the stored nodes. Caller
   * is responsible for inserting them into the document via
   * `InsertNodeCommand`. Returns `[]` when empty.
   *
   * Each call generates fresh ids so consecutive pastes can coexist in
   * the same document without id collisions.
   */
  paste(): readonly SvgNode[] {
    const items = this._items();
    if (items.length === 0) return [];
    return items.map((n) => cloneNodeWithNewIds(n));
  }

  /** Empty the clipboard. */
  clear(): void {
    this._externalStamp.set(null);
    if (this._items().length === 0) return;
    this._items.set([]);
  }

  /**
   * Imperative inspection helper — read clipboard ids without producing
   * fresh clones. Returns ids of the STORED nodes (each `paste()` produces
   * different ids, so this is for debugging / tests only).
   */
  peekIds(): readonly NodeId[] {
    return this._items().map((n) => n.id);
  }
}
