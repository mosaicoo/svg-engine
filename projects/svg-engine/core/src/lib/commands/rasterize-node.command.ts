import type { ImageNode } from '../model/image-node';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-109** — replace a vector node with a pre-rendered raster `<image>`
 * (Illustrator's *Object ▸ Rasterize*). The bitmap itself is produced
 * asynchronously by the caller (canvas-based `renderPng`); this command only
 * performs the **synchronous tree surgery** — swap `nodeId` for `image` at the
 * exact same parent slot, keeping the original node's **id** so selection,
 * layer-panel expansion and animation pointers survive the conversion.
 *
 * **Lossy + undoable**: vector data is replaced by pixels (`isDestructive`),
 * but `undo()` restores the original node at its captured z-order index. The
 * caller is expected to pass an `image` whose `x/y/width/height` reproduce the
 * node's bounds in its parent's coordinate space (so it lands exactly where
 * the vector was). The id on `image` is ignored — the command forces the
 * target's id.
 *
 * Mirrors {@link ConvertNodeToPathCommand}'s remove+insert pattern (the
 * canonical "change a node's type in place" surgery — `updateNode` forbids
 * type changes).
 */
export class RasterizeNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Rasterize';
  readonly isDestructive = true;

  private previousNode: SvgNode | null = null;
  private previousParentId: NodeId | null = null;
  private previousIndex = -1;

  constructor(
    private readonly nodeId: NodeId,
    private readonly image: ImageNode,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`RasterizeNodeCommand: node "${this.nodeId}" not found`);
    }
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) {
      return fail(`RasterizeNodeCommand: node "${this.nodeId}" has no parent (root?)`);
    }
    const index = parent.children.findIndex((c) => c.id === this.nodeId);
    if (index < 0) {
      return fail(`RasterizeNodeCommand: index lookup failed for "${this.nodeId}"`);
    }

    this.previousNode = target;
    this.previousParentId = parent.id;
    this.previousIndex = index;

    // Force the original id so external references survive the swap.
    const next: ImageNode = { ...this.image, id: target.id };
    const afterRemove = removeNode(doc.root, this.nodeId);
    if (afterRemove === doc.root) {
      return fail(`RasterizeNodeCommand: remove failed for "${this.nodeId}"`);
    }
    const nextRoot = insertNode(afterRemove, parent.id, next, index);
    if (nextRoot === afterRemove) {
      return fail(`RasterizeNodeCommand: insert failed for "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousNode === null || this.previousParentId === null || this.previousIndex < 0) {
      return fail('RasterizeNodeCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    const afterRemove = removeNode(doc.root, this.nodeId);
    if (afterRemove === doc.root) {
      return fail(`RasterizeNodeCommand undo: remove failed for "${this.nodeId}"`);
    }
    const nextRoot = insertNode(
      afterRemove,
      this.previousParentId,
      this.previousNode,
      this.previousIndex,
    );
    if (nextRoot === afterRemove) {
      return fail(`RasterizeNodeCommand undo: insert failed for "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
