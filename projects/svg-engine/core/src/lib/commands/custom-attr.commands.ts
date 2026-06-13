import {
  isValidCustomAttrName,
  removeCustomAttr,
  renameCustomAttr,
  setCustomAttr,
} from '../model/custom-attrs';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-089 — Custom `data-*` attribute commands.** Undoable CRUD over a
 * node's custom attributes ({@link readCustomAttrs} / {@link withCustomAttrs}).
 * The full editing API so a plugin or script can:
 *
 * - **create / update** → {@link SetCustomAttrCommand}
 * - **remove**          → {@link RemoveCustomAttrCommand}
 * - **rename**          → {@link RenameCustomAttrCommand}
 * - **read**            → the pure `readCustomAttrs(node)` helper (no command)
 *
 * Each command snapshots the document root and restores it verbatim on
 * `undo()` — one history entry, structural sharing keeps the unaffected
 * subtrees referentially equal.
 *
 * @example
 * ```ts
 * bus.dispatch(new SetCustomAttrCommand(nodeId, 'sku', 'ABC-123'));
 * bus.dispatch(new RenameCustomAttrCommand(nodeId, 'sku', 'product-id'));
 * bus.dispatch(new RemoveCustomAttrCommand(nodeId, 'product-id'));
 * ```
 */

/** Shared undo: restore the captured root snapshot. */
function undoSnapshot(ctx: CommandContext, label: string, snapshot: SvgNode | null): CommandResult {
  if (snapshot === null) return fail(`${label} undo: nothing captured`);
  if (snapshot.type !== 'group') return fail(`${label} undo: snapshot root not a group`);
  const doc = ctx.state.document();
  ctx.state.setDocument({ ...doc, root: snapshot });
  return ok();
}

/**
 * Create or update a single custom attribute on a node. Validates the name
 * (lowercase `data-*`-safe; the reserved `svge` prefix is rejected) before
 * mutating.
 */
export class SetCustomAttrCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Set custom attribute';

  private snapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly name: string,
    private readonly value: string,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    if (!isValidCustomAttrName(this.name)) {
      return fail(`${this.label}: invalid attribute name "${this.name}"`);
    }
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    this.snapshot = doc.root;
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) =>
      setCustomAttr(n, this.name, this.value),
    );
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

/** Remove a single custom attribute from a node. No-op when absent. */
export class RemoveCustomAttrCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Remove custom attribute';

  private snapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly name: string,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    this.snapshot = doc.root;
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) =>
      removeCustomAttr(n, this.name),
    );
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

/**
 * Rename a custom attribute (preserving its value). Fails when `from` is
 * absent, `to` is invalid, or `to` already exists — so a rename never
 * silently overwrites another attribute.
 */
export class RenameCustomAttrCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Rename custom attribute';

  private snapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly from: string,
    private readonly to: string,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    if (!isValidCustomAttrName(this.to)) {
      return fail(`${this.label}: invalid attribute name "${this.to}"`);
    }
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    const renamed = renameCustomAttr(node, this.from, this.to);
    if (renamed === node) {
      return fail(`${this.label}: "${this.from}" → "${this.to}" not applicable`);
    }
    this.snapshot = doc.root;
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, () => renamed);
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}
