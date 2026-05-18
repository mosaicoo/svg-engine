import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import type { SvgStyle } from '../types/style';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Set the SAME value of a {@link SvgStyle} field across MULTIPLE
 * nodes in a single undoable step. Powers multi-edit in the inspector
 * (Item 1 — débito 4c): with N selected nodes, changing fill / stroke
 * / opacity in the inspector applies the value to all of them at
 * once and produces exactly ONE undo entry.
 *
 * **Why a dedicated multi-node command instead of N `SetPropertyCommand`s**:
 * dispatching N commands would push N entries onto the undo stack —
 * single Ctrl+Z would only restore one node. Bundling here gives the
 * expected "one user action = one undo step" semantics.
 *
 * **Validation**:
 * - empty `nodeIds` → no-op `ok()` (lets callers build commands
 *   optimistically without size guards)
 * - any node id not found on execute → `fail` + no partial mutation
 *   (atomic — undo never sees half-applied state)
 *
 * **Undo**: per-node snapshot of the FULL prior style object,
 * captured pre-mutation. A node deleted between execute and undo is
 * silently skipped (its restore is a no-op — same convention as
 * `TranslateManyCommand`).
 */
export class SetStylePropertyOnManyCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private previousStyles: ReadonlyMap<NodeId, SvgStyle> | null = null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    private readonly key: keyof SvgStyle,
    private readonly value: SvgStyle[keyof SvgStyle],
    label?: string,
  ) {
    this.label = label ?? `Set ${key} (${nodeIds.length} nodes)`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length === 0) return ok();
    const doc = ctx.state.document();
    // Validate FIRST — never partial-apply.
    const previous = new Map<NodeId, SvgStyle>();
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node === null) {
        return fail(`SetStylePropertyOnManyCommand: node "${id}" not found`);
      }
      previous.set(id, node.style);
    }
    this.previousStyles = previous;

    // Apply.
    let root = doc.root;
    for (const id of this.nodeIds) {
      const nextRoot = updateNode<SvgNode>(root, id, (n) => ({
        ...n,
        style: { ...n.style, [this.key]: this.value },
      }));
      if (nextRoot === root) {
        return fail(`SetStylePropertyOnManyCommand: failed to update "${id}"`);
      }
      root = nextRoot;
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousStyles === null) {
      return fail('SetStylePropertyOnManyCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    let root = doc.root;
    for (const [id, prevStyle] of this.previousStyles) {
      const nextRoot = updateNode<SvgNode>(root, id, (n) => ({ ...n, style: prevStyle }));
      if (nextRoot !== root) root = nextRoot;
      // Node deleted between execute and undo → silently skip
      // (same convention as TranslateManyCommand).
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}
