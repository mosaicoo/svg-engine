import {
  ANIMATION_KEY,
  emptyAnimationDoc,
  type Keyframe,
  readAnimationDoc,
  upsertKeyframe,
} from '../animation';
import type { SvgMetadata } from '../types/metadata';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-082 (Animation Timeline) — F0.** Add (or replace) a keyframe in the
 * page's animation, undoably.
 *
 * The {@link import('../animation').AnimationDoc} lives **non-destructively**
 * on a *container* node's `metadata.customData[ANIMATION_KEY]` (the active
 * page, or the document root). This command only writes that metadata key —
 * it **never** touches the animated shape's own fields. The displayed values
 * are derived from the playhead at runtime (`sampleAnimation`), so the base
 * document is unaffected when the timeline isn't playing.
 *
 * **Container vs node**: `containerId` is where the AnimationDoc is stored
 * (the page); `nodeId` is the shape being animated. F0 keeps `containerId`
 * explicit so core stays headless — the service layer (F2) resolves it to the
 * active page.
 *
 * **Undo** restores the container's prior `customData` verbatim, stripping it
 * entirely when it was absent before (stable node shape for OnPush; same
 * convention as the other metadata-writing commands).
 */
export class AddKeyframeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Add keyframe';

  private previousCustomData: SvgMetadata['customData'];
  private hadCustomData = false;

  constructor(
    private readonly containerId: NodeId,
    private readonly nodeId: NodeId,
    private readonly property: string,
    private readonly keyframe: Keyframe,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const container = findNodeById(doc.root, this.containerId);
    if (container === null) {
      return fail(`AddKeyframeCommand: container "${this.containerId}" not found`);
    }
    this.previousCustomData = container.metadata.customData;
    this.hadCustomData = Object.prototype.hasOwnProperty.call(container.metadata, 'customData');

    const current = readAnimationDoc(container) ?? emptyAnimationDoc();
    const next = upsertKeyframe(current, this.nodeId, this.property, this.keyframe);

    const nextRoot = updateNode(doc.root, this.containerId, (n) => ({
      ...n,
      metadata: {
        ...n.metadata,
        customData: { ...(n.metadata.customData ?? {}), [ANIMATION_KEY]: next },
      },
    }));
    if (nextRoot === doc.root) {
      return fail(`AddKeyframeCommand: failed to update "${this.containerId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const prev = this.previousCustomData;
    const had = this.hadCustomData;
    const nextRoot = updateNode(doc.root, this.containerId, (n) => {
      if (!had) {
        // customData was absent → strip the key (preserve original shape).
        const meta: Record<string, unknown> = { ...n.metadata };
        delete meta['customData'];
        return { ...n, metadata: meta as unknown as SvgMetadata };
      }
      return { ...n, metadata: { ...n.metadata, customData: prev } };
    });
    if (nextRoot === doc.root) {
      return fail(`AddKeyframeCommand undo: container "${this.containerId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
