import type { PathNode } from '../model/path-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-055 (Live Corners) — interactive control.**
 *
 * Set the non-destructive `cornerRadius` on one or more {@link PathNode}s
 * in a single undoable step. `cornerRadius` rounds every "sharp" corner of
 * the path at render/export time (via `roundPathCorners`) WITHOUT touching
 * the authored `d`, so it is fully reversible — setting it back to `0`
 * restores the exact corners.
 *
 * **Semantics**:
 * - `radius` is clamped to `>= 0` (negative / NaN → `0`). `0` means "no
 *   rounding" (sharp corners).
 * - Only `PathNode`s carry `cornerRadius`. Non-path ids in the selection
 *   are **skipped silently**, so dispatching on a mixed selection is safe
 *   (rect/ellipse/etc. keep their own geometry untouched). When no
 *   `PathNode` is targeted the command is a no-op `ok()`.
 * - **Undo** restores each node's prior `cornerRadius`, stripping the field
 *   entirely when it was absent before — keeps the node shape stable for
 *   OnPush shallow-equality checks downstream (same convention as
 *   {@link import('./set-property-on-many.command').SetPropertyOnManyCommand}).
 *
 * **Why a dedicated command** (vs a generic `SetPropertyOnManyCommand`):
 * the clamp (`>= 0`) and the path-only guard are domain rules specific to
 * Live Corners; bundling them here keeps callers (Inspector, NLU, plugins)
 * from re-implementing them and keeps a clean "Set corner radius" undo
 * label.
 */
export class SetCornerRadiusCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Set corner radius';

  /** Target radius, clamped to `>= 0`. */
  private readonly radius: number;

  /** Per-node prior value + presence flag, captured on execute. */
  private previous: ReadonlyMap<NodeId, { value: number | undefined; wasPresent: boolean }> | null =
    null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    radius: number,
  ) {
    this.radius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length === 0) return ok();
    const doc = ctx.state.document();

    // Resolve PathNode targets; skip missing / non-path ids so a mixed
    // selection (path + rect + …) only touches the paths.
    const previous = new Map<NodeId, { value: number | undefined; wasPresent: boolean }>();
    const targets: NodeId[] = [];
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node === null || node.type !== 'path') continue;
      const pn = node as PathNode;
      previous.set(id, {
        value: pn.cornerRadius,
        wasPresent: Object.prototype.hasOwnProperty.call(pn, 'cornerRadius'),
      });
      targets.push(id);
    }
    if (targets.length === 0) return ok(); // nothing roundable → no-op

    this.previous = previous;
    const radius = this.radius;
    let root = doc.root;
    for (const id of targets) {
      const nextRoot = updateNode<PathNode>(root, id, (n) => ({ ...n, cornerRadius: radius }));
      if (nextRoot === root) {
        return fail(`SetCornerRadiusCommand: failed to update "${id}"`);
      }
      root = nextRoot;
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previous === null) return ok(); // execute was a no-op
    const doc = ctx.state.document();
    let root = doc.root;
    for (const [id, snapshot] of this.previous) {
      const nextRoot = updateNode<PathNode>(root, id, (n) => {
        if (!snapshot.wasPresent) {
          // Field was absent → restore by stripping the key (preserves
          // the original node shape).
          const next: Record<string, unknown> = { ...n };
          delete next['cornerRadius'];
          return next as unknown as PathNode;
        }
        return { ...n, cornerRadius: snapshot.value };
      });
      if (nextRoot !== root) root = nextRoot;
      // Node deleted between execute and undo → silently skip.
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}
