import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-070** — Set the same TOP-LEVEL property value across MULTIPLE
 * nodes in a single undoable step. Mirror of
 * {@link import('./set-style-property-on-many.command').SetStylePropertyOnManyCommand}
 * but for top-level fields (e.g. `fontFamily`, `fontSize`, `fontWeight`,
 * `x`, `y` on text nodes — fields that live directly on the node, NOT
 * inside `style`).
 *
 * **Why a dedicated multi-node command instead of N `SetPropertyCommand`s**:
 * dispatching N commands would push N entries onto the undo stack — a
 * single Ctrl+Z would only restore one node. Bundling here gives the
 * expected "one user action = one undo step" semantics.
 *
 * **Usage** (Find & Replace, batch operations):
 * ```ts
 * bus.dispatch(
 *   new SetPropertyOnManyCommand(textIds, 'fontFamily', 'Arial, sans-serif'),
 * );
 * ```
 *
 * **Type safety**: the `TNode` and `K` parameters preserve the
 * per-node-type field types — `fontFamily` on `TextNode` checks at
 * compile time. Cannot mutate reserved fields `id` or `type` (same
 * guard as {@link import('./set-property.command').SetPropertyCommand}).
 *
 * **Validation**:
 * - empty `nodeIds` → no-op `ok()` (callers can build commands
 *   optimistically without size guards)
 * - any node not found on execute → `fail` + no partial mutation
 *   (atomic — undo never sees half-applied state)
 *
 * **Undo**: per-node snapshot of the prior value + a "was present" flag
 * so restoring `undefined` on a node that originally lacked the field
 * doesn't pollute the node shape. Nodes deleted between execute and
 * undo are silently skipped (same convention as
 * `SetStylePropertyOnManyCommand` / `TranslateManyCommand`).
 */
export class SetPropertyOnManyCommand<
  TNode extends SvgNode,
  K extends keyof TNode,
> implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private previousValues: ReadonlyMap<
    NodeId,
    { value: TNode[K] | undefined; wasPresent: boolean }
  > | null = null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    private readonly property: K,
    private readonly value: TNode[K],
    label?: string,
  ) {
    if (property === 'id' || property === 'type') {
      throw new Error(
        `SetPropertyOnManyCommand: cannot mutate reserved property "${String(property)}"`,
      );
    }
    this.label = label ?? `Set ${String(property)} (${nodeIds.length} nodes)`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length === 0) return ok();
    const doc = ctx.state.document();
    // Validate FIRST — never partial-apply.
    const previous = new Map<NodeId, { value: TNode[K] | undefined; wasPresent: boolean }>();
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id) as TNode | null;
      if (node === null) {
        return fail(`SetPropertyOnManyCommand: node "${id}" not found`);
      }
      previous.set(id, {
        value: node[this.property],
        wasPresent: Object.prototype.hasOwnProperty.call(node, this.property),
      });
    }
    this.previousValues = previous;

    // Apply.
    const value = this.value;
    const property = this.property;
    let root = doc.root;
    for (const id of this.nodeIds) {
      const nextRoot = updateNode<TNode>(root, id, (n) => ({ ...n, [property]: value }));
      if (nextRoot === root) {
        return fail(`SetPropertyOnManyCommand: failed to update "${id}"`);
      }
      root = nextRoot;
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousValues === null) {
      return fail('SetPropertyOnManyCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    const property = this.property;
    let root = doc.root;
    for (const [id, snapshot] of this.previousValues) {
      // Property was absent → restore by stripping the key; preserves
      // the original node shape (relevant for shallow-equality checks
      // in OnPush change-detection downstream).
      const nextRoot = updateNode<TNode>(root, id, (n) => {
        if (!snapshot.wasPresent) {
          const next: Record<string, unknown> = { ...n };
          delete next[property as string];
          return next as TNode;
        }
        return { ...n, [property]: snapshot.value };
      });
      if (nextRoot !== root) root = nextRoot;
      // Node deleted between execute and undo → silently skip.
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}
