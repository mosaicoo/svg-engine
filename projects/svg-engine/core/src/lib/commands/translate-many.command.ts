import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Translate **multiple** nodes by per-node offsets in a single
 * undoable step. Each node `id` in `translations` is moved by
 * `(translations[id].x, translations[id].y)`.
 *
 * Why a dedicated multi-node command instead of dispatching N
 * `MoveNodeCommand`s: alignment / distribution / "nudge selection"
 * style operations affect a whole group; the user expects exactly
 * **one** undo entry that covers the lot. Bundling them here keeps
 * the {@link import('./command').Command#undo} contract simple
 * (one execute, one undo, atomic).
 *
 * Translation is applied **after** each node's existing transform
 * (`new = translate(dx, dy) * old`), matching SVG transform-attribute
 * semantics (rightmost matrix runs first on local coords).
 *
 * Construction-time validation:
 * - throws `RangeError` when any delta is non-finite.
 * - **does not** validate that the ids exist (deferred to execute, so
 *   the command can be built before the document is read).
 *
 * Execute-time behaviour:
 * - missing-id → returns `fail` and does NOT apply any partial change.
 * - empty `translations` map → no-op success (allows callers to build
 *   commands optimistically without size guards).
 *
 * Captures `previousTransform` for every affected node on execute, so
 * undo restores them exactly. A node deleted between execute and undo
 * is silently skipped on undo (its restore is a no-op).
 */
export class TranslateManyCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private previousTransforms: ReadonlyMap<NodeId, Transform> | null = null;

  constructor(
    private readonly translations: ReadonlyMap<NodeId, Point>,
    label = 'Translate many',
  ) {
    for (const [id, p] of translations) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new RangeError(
          `TranslateManyCommand: non-finite delta for node "${id}" (got ${p.x}, ${p.y})`,
        );
      }
    }
    this.label = label;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.translations.size === 0) {
      this.previousTransforms = new Map();
      return ok();
    }

    const doc = ctx.state.document();
    // First pass: validate every id exists. Bail out atomically if any is missing.
    for (const id of this.translations.keys()) {
      if (findNodeById(doc.root, id) === null) {
        return fail(`TranslateManyCommand: node "${id}" not found`);
      }
    }

    // Second pass: apply, capturing previous transforms.
    const captured = new Map<NodeId, Transform>();
    let nextRoot = doc.root;
    for (const [id, delta] of this.translations) {
      const target = findNodeById(nextRoot, id);
      if (target === null) {
        // Should not happen — validated above — but defend against tree-ops
        // surprises (e.g., updateNode shadowing the same id twice).
        return fail(`TranslateManyCommand: node "${id}" disappeared mid-execute`);
      }
      captured.set(id, target.transform);
      const newTransform = multiply(translate(delta.x, delta.y), target.transform);
      const updated = updateNode<SvgNode>(nextRoot, id, (n) => ({
        ...n,
        transform: newTransform,
      }));
      if (updated === nextRoot) {
        return fail(`TranslateManyCommand: failed to update node "${id}"`);
      }
      nextRoot = updated;
    }
    this.previousTransforms = captured;
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousTransforms === null) {
      return fail('TranslateManyCommand undo: nothing captured (was execute called?)');
    }
    const doc = ctx.state.document();
    let nextRoot = doc.root;
    for (const [id, prev] of this.previousTransforms) {
      const updated = updateNode<SvgNode>(nextRoot, id, (n) => ({ ...n, transform: prev }));
      // A node deleted between execute and undo is silently skipped — undo
      // is "best effort" in that case (restoring a non-existent node is a no-op).
      if (updated !== nextRoot) nextRoot = updated;
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
