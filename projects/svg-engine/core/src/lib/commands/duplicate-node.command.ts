import type { SvgNode } from '../model/svg-node';
import { cloneNodeWithNewIds } from '../tree/clone-with-new-ids';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, translate } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/** Default offset applied to duplicated nodes (Figma convention). */
const DEFAULT_OFFSET: Point = { x: 10, y: 10 };

/**
 * Duplicate one or more nodes — D-044 (UI controls full-functionality follow-up).
 *
 * For each `originalId`, the command:
 *
 * 1. Locates the node and its parent group via {@link findParent}.
 * 2. Deep-clones the node tree with FRESH ids via {@link cloneNodeWithNewIds}.
 * 3. Composes the clone's transform with `translate(offset.x, offset.y)`
 *    so the duplicate is visually offset from the original (default 10px
 *    both axes — Figma / Affinity convention).
 * 4. Inserts the clone into the SAME parent, immediately after the original.
 *
 * **Single undo entry** — undo removes every newly-inserted clone in one
 * step. Compound commands that bundle Copy + Paste + Translate would
 * produce three undo entries; this dedicated command produces one,
 * matching the user's mental model of "I duplicated this".
 *
 * **What this is NOT**:
 *
 * - **Not** a Copy/Paste pipeline. Copy/Paste flow goes through
 *   `ClipboardService` (which CAN be used to paste into different
 *   documents). Duplicate stays within the current document and same
 *   parent — strictly local.
 * - **Not** a "move-clone" gesture (drag while holding Alt). That
 *   gesture would be a transform-aware variant; ergonomics differ.
 *
 * **Edge cases handled**:
 *
 * - Empty `originalIds` → no-op success (matches alignment / nudge
 *   conventions). Lets callers build the command optimistically.
 * - An id that doesn't exist in the document → returns `fail` and
 *   does NOT apply any partial duplication (atomic).
 * - Root node id → returns `fail` (cannot duplicate the document root;
 *   it has no parent to clone into).
 *
 * **Why fresh ids inside `cloneNodeWithNewIds`**: pasting / duplicating
 * a group must NOT share ids with the original, or the document would
 * have duplicate ids breaking selection / hit-testing / persistence.
 */
export class DuplicateNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  /**
   * Filled by `execute` so `undo` knows which inserted nodes to remove.
   * Empty array until execute runs successfully.
   */
  private insertedIds: readonly NodeId[] = [];

  constructor(
    private readonly originalIds: readonly NodeId[],
    private readonly offset: Point = DEFAULT_OFFSET,
  ) {
    this.label = `Duplicate ${originalIds.length} node(s)`;
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
      throw new RangeError(
        `DuplicateNodeCommand: non-finite offset (got ${offset.x}, ${offset.y})`,
      );
    }
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.originalIds.length === 0) {
      this.insertedIds = [];
      return ok();
    }
    const doc = ctx.state.document();
    const rootId = doc.root.id;

    // Pre-validate every id BEFORE mutating, so failure is atomic
    // (matches TranslateManyCommand pattern).
    for (const id of this.originalIds) {
      if (id === rootId) return fail(`DuplicateNodeCommand: cannot duplicate document root`);
      const node = findNodeById(doc.root, id);
      if (node === null) return fail(`DuplicateNodeCommand: node "${id}" not found`);
      const parent = findParent(doc.root, id);
      if (parent === null) {
        // findParent returns null for the root id only — caught above —
        // but also if the tree was mutated mid-loop. Defensive bail.
        return fail(`DuplicateNodeCommand: parent of "${id}" not found`);
      }
    }

    // Apply: clone each, insert right after the original. Newly inserted
    // ids accumulate in `insertedIds` for undo.
    let nextRoot = doc.root;
    const inserted: NodeId[] = [];
    for (const id of this.originalIds) {
      const original = findNodeById(nextRoot, id);
      if (original === null) return fail(`DuplicateNodeCommand: "${id}" disappeared mid-execute`);
      const parent = findParent(nextRoot, id);
      if (parent === null)
        return fail(`DuplicateNodeCommand: parent of "${id}" missing mid-execute`);

      // Deep clone with fresh ids. Then compose the offset transform on
      // the top-level clone — descendants keep their relative transforms,
      // so the group translates as a whole.
      const clone = cloneNodeWithNewIds(original) as SvgNode;
      const offsetClone: SvgNode = {
        ...clone,
        transform: multiply(translate(this.offset.x, this.offset.y), clone.transform),
      };

      // Insert immediately after the original within the same parent.
      const insertIndex = parent.children.findIndex((c) => c.id === id) + 1;
      const updated = insertNode(nextRoot, parent.id, offsetClone, insertIndex);
      if (updated === nextRoot) {
        return fail(`DuplicateNodeCommand: insert of clone failed for "${id}"`);
      }
      nextRoot = updated;
      inserted.push(offsetClone.id);
    }

    this.insertedIds = inserted;
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.insertedIds.length === 0) return ok();
    const doc = ctx.state.document();
    let nextRoot = doc.root;
    for (const id of this.insertedIds) {
      const stripped = removeNode(nextRoot, id);
      // Be lenient: an id removed externally between execute and undo
      // is silently skipped (matches TranslateManyCommand pattern).
      if (stripped !== nextRoot) nextRoot = stripped;
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  /** Test / introspection helper — read the ids inserted by execute. */
  getInsertedIds(): readonly NodeId[] {
    return this.insertedIds;
  }
}
