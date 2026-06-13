import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import { isLayer, withLayerFlag, withoutLayerFlag } from '../model/layer';
import { isPage } from '../model/page';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { multiply } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-072 — Logical Layers**: commands to convert groups into layers,
 * release layers back into plain groups, and create fresh empty
 * layers at the top of the document.
 *
 * **Top-level invariant**: layers may ONLY live as direct children of a
 * **layer container** — the document root (legacy, page-less docs) or a
 * **page** (D-079, where the root holds only page groups). The UI
 * enforces this on drag/drop, but the commands also reject illegal
 * placements at dispatch time as a last line of defense — a
 * misconfigured plugin or programmatic caller cannot bypass the rule.
 *
 * **Undo model**: commands snapshot the prior root before mutating.
 * `undo()` restores the snapshot. Memory cost is one root reference
 * per layer op — acceptable given the low command frequency
 * (converting a group to a layer is a rare, deliberate action).
 *
 * **Why a separate file** (not in `live-boolean.commands.ts` next to
 * other metadata-flag commands): keeps the layer concept discoverable
 * — anyone grepping for "layer" finds the entire feature surface in
 * this one file. Live Boolean stays its own concern.
 */

/**
 * Convert an existing group into a Layer. The target group MUST be a
 * direct child of a **layer container** — the document root or a page
 * (D-079) — otherwise the command fails (the UI prevents this gesture,
 * but a programmatic caller could try it).
 *
 * Idempotent: converting an already-layer group is a no-op (returns
 * ok without dispatching).
 */
export class MakeLayerCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Convert to Layer';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly nodeId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (node.type !== 'group') {
      return fail(`${this.label}: node "${this.nodeId}" is "${node.type}", not a group`);
    }
    if (isLayer(node)) return ok(); // idempotent — no history entry needed
    if (isPage(node)) {
      return fail(`${this.label}: node "${this.nodeId}" is a page, not a convertible group`);
    }
    // Enforce top-level invariant: the parent must be a "layer container",
    // i.e. the document root OR a page (D-079). Pre-Pages, layers lived
    // directly under root; with Pages, the root holds only page groups and
    // a top-level layer is a direct child of the active page. Accepting
    // both keeps legacy (page-less) documents working too.
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null || (parent.id !== doc.root.id && !isPage(parent))) {
      return fail(
        `${this.label}: only top-level groups can become layers (node "${this.nodeId}" is nested)`,
      );
    }
    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) => withLayerFlag(g));
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

/**
 * Release a Layer back into a plain group. Inverse of
 * {@link MakeLayerCommand}.
 *
 * **Single-child layers dissolve instead of demoting**: a layer wrapping
 * exactly ONE node isn't a meaningful group — conceptually there's nothing
 * to group with a single element. So when the layer has one child, the
 * command **promotes that child** into the layer's slot (preserving paint
 * order) and **bakes the layer's transform** into it (so the render is
 * unchanged) instead of leaving behind a pointless 1-element group. A layer
 * with 2+ children keeps the plain group (a real grouping); an empty layer
 * keeps the empty group (no child to promote). Mirrors {@link UngroupCommand}'s
 * transform-baking for the dissolve path.
 *
 * Idempotent on non-layer groups (returns ok without dispatching).
 *
 * **Undo**: snapshots the whole root before mutating and restores it —
 * one mechanism covering both the flag-flip and the dissolve paths.
 */
export class UnmakeLayerCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Convert to Group';

  private previousRootSnapshot: SvgNode | null = null;
  /**
   * The node that represents the post-convert result: the same group
   * (flag-flip path) or the promoted child (single-child dissolve path).
   * `null` before a successful `execute` (or after a no-op idempotent
   * call). Exposed so the UI can re-select the right node — the layer id
   * no longer exists after a dissolve.
   */
  private resultNodeId: NodeId | null = null;

  constructor(private readonly nodeId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (node.type !== 'group') {
      return fail(`${this.label}: node "${this.nodeId}" is "${node.type}", not a group`);
    }
    if (!isLayer(node)) return ok(); // idempotent

    // Single-child layer → dissolve (promote the only child) rather than
    // leave a meaningless 1-element group. Bake the layer transform so the
    // promoted child renders identically.
    if (node.children.length === 1) {
      const parent = findParent(doc.root, this.nodeId);
      if (parent === null) {
        return fail(`${this.label}: layer "${this.nodeId}" has no parent`);
      }
      const index = parent.children.findIndex((c) => c.id === this.nodeId);
      if (index < 0) return fail(`${this.label}: failed to locate layer within parent`);
      const child = node.children[0]!;
      const baked: SvgNode = { ...child, transform: multiply(node.transform, child.transform) };
      this.previousRootSnapshot = doc.root;
      let nextRoot = removeNode(doc.root, this.nodeId);
      if (nextRoot === doc.root) {
        return fail(`${this.label}: failed to detach layer "${this.nodeId}"`);
      }
      try {
        nextRoot = insertNode(nextRoot, parent.id, baked, index);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      this.resultNodeId = child.id;
      ctx.state.setDocument({ ...doc, root: nextRoot });
      return ok();
    }

    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) => withoutLayerFlag(g));
    this.resultNodeId = this.nodeId;
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }

  /**
   * The node representing the post-convert result, available AFTER a
   * successful `execute()`: the same group id (flag-flip) or the promoted
   * child id (single-child dissolve). `null` before execution or after a
   * no-op idempotent call. Lets the UI re-select the surviving node.
   */
  getResultNodeId(): NodeId | null {
    return this.resultNodeId;
  }
}

/**
 * Create a fresh empty Layer and insert it at the FRONT of the document
 * root's children (top-most in the layers panel). Matches Illustrator
 * convention: the new layer appears above everything else and becomes
 * the natural target for the next drawing action.
 *
 * The new layer carries a default name like "Layer 3" — derived by
 * counting existing layers in the document plus one. Users can rename
 * via the panel's F2 / dblclick gesture (D-066-rename).
 */
export class CreateLayerCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'New Layer';

  /** Id of the layer this command created — exposed so callers (UI) can select it. */
  private createdLayerId: NodeId | null = null;

  /**
   * @param parentId target parent for the new layer (front of its
   * children). Defaults to the document root. With the Pages model
   * (D-079) the layers panel is rooted at the **active page**, so the UI
   * passes the active page id — otherwise the layer would be created at
   * `doc.root` as a sibling of the pages and never show up in the
   * page-rooted panel (the "+ does nothing" symptom).
   */
  constructor(private readonly parentId: NodeId | null = null) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const parentId = this.parentId ?? doc.root.id;
    const parent = findNodeById(doc.root, parentId);
    if (parent === null || parent.type !== 'group') {
      return fail(`${this.label}: parent "${parentId}" not found or not a group`);
    }
    // Count current layers in the target parent to pick the next default name.
    let layerCount = 0;
    for (const child of parent.children) {
      if (isLayer(child)) layerCount += 1;
    }
    const baseLayer = createGroup([], {
      metadata: { name: `Layer ${layerCount + 1}` },
    });
    const layer = withLayerFlag(baseLayer);
    this.createdLayerId = layer.id;
    const nextRoot = insertNode(doc.root, parentId, layer, 0);
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.createdLayerId === null) return fail(`${this.label} undo: nothing to remove`);
    const doc = ctx.state.document();
    const nextRoot = removeNode(doc.root, this.createdLayerId);
    if (nextRoot === doc.root) {
      return fail(`${this.label} undo: created layer "${this.createdLayerId}" already gone`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  /**
   * Id of the layer this command created, available AFTER `execute()`
   * returned ok. Returns `null` before execution (or after a failed
   * one). Used by the UI to focus + select the new layer.
   */
  getCreatedLayerId(): NodeId | null {
    return this.createdLayerId;
  }
}
