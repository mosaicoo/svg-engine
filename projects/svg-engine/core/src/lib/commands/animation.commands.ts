import {
  ANIMATION_KEY,
  type AnimationDoc,
  emptyAnimationDoc,
  type EasingSpec,
  type Keyframe,
  moveKeyframe,
  readAnimationDoc,
  removeKeyframe,
  removeTrack,
  setAnimationDuration,
  setKeyframeEasing,
  upsertKeyframe,
} from '../animation';
import type { SvgMetadata } from '../types/metadata';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-082 (Animation Timeline) — F0/F2.** Shared base for every command that
 * edits a page's {@link AnimationDoc}.
 *
 * **Where the doc lives**: non-destructively on a *container* node's
 * `metadata.customData[ANIMATION_KEY]` (the active page, or the document root
 * when there are no pages). These commands ONLY write that metadata key — they
 * **never** touch the animated shapes' own fields. The displayed values are
 * derived from the playhead at runtime (`sampleAnimation`), so the base
 * document is unaffected when the timeline isn't playing.
 *
 * **Container vs node**: `containerId` is where the AnimationDoc is stored (the
 * page); the per-command target node/property/time identify what inside that
 * doc to change. Core keeps `containerId` explicit so it stays headless — the
 * `AnimationService` (F2) resolves it to the active page.
 *
 * Subclasses implement {@link nextDoc}: a pure transform from the current
 * AnimationDoc (an empty one when none exists yet) to the next. Returning the
 * **same reference** signals a no-op → the command fails (and is therefore not
 * pushed onto the history stack by `CommandBus`).
 *
 * **Undo** restores the container's prior `customData` verbatim, stripping it
 * entirely when it was absent before (stable node shape for OnPush; same
 * convention as the other metadata-writing commands).
 */
abstract class AnimationDocCommand implements Command {
  readonly id: string = generateNodeId();
  abstract readonly label: string;

  private previousCustomData: SvgMetadata['customData'];
  private hadCustomData = false;

  protected constructor(protected readonly containerId: NodeId) {}

  /** Pure transform of the container's AnimationDoc. Same ref ⇒ no-op. */
  protected abstract nextDoc(current: AnimationDoc): AnimationDoc;

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const container = findNodeById(doc.root, this.containerId);
    if (container === null) {
      return fail(`${this.label}: container "${this.containerId}" not found`);
    }
    const current = readAnimationDoc(container) ?? emptyAnimationDoc();
    const next = this.nextDoc(current);
    if (next === current) {
      // Pure helper reported "nothing changed" — don't pollute history.
      return fail(`${this.label}: no change to apply`);
    }
    this.previousCustomData = container.metadata.customData;
    this.hadCustomData = Object.prototype.hasOwnProperty.call(container.metadata, 'customData');

    const nextRoot = updateNode(doc.root, this.containerId, (n) => ({
      ...n,
      metadata: {
        ...n.metadata,
        customData: { ...(n.metadata.customData ?? {}), [ANIMATION_KEY]: next },
      },
    }));
    if (nextRoot === doc.root) {
      return fail(`${this.label}: failed to update "${this.containerId}"`);
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
      return fail(`${this.label} undo: container "${this.containerId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}

/**
 * **F0.** Add (or replace) a keyframe on `(nodeId, property)`, undoably. A
 * keyframe at the same time is replaced (upsert); otherwise it's inserted
 * keeping the track sorted.
 */
export class AddKeyframeCommand extends AnimationDocCommand {
  readonly label = 'Add keyframe';

  constructor(
    containerId: NodeId,
    private readonly nodeId: NodeId,
    private readonly property: string,
    private readonly keyframe: Keyframe,
  ) {
    super(containerId);
  }

  protected nextDoc(current: AnimationDoc): AnimationDoc {
    return upsertKeyframe(current, this.nodeId, this.property, this.keyframe);
  }
}

/**
 * **F2.** Move the keyframe at `fromTime` on `(nodeId, property)` to `toTime`,
 * optionally replacing its value (the easing is carried over). Fails as a
 * no-op when there is no keyframe at `fromTime`, or when the move is an
 * identity (same time + same value).
 */
export class MoveKeyframeCommand extends AnimationDocCommand {
  readonly label = 'Move keyframe';

  constructor(
    containerId: NodeId,
    private readonly nodeId: NodeId,
    private readonly property: string,
    private readonly fromTime: number,
    private readonly toTime: number,
    private readonly newValue?: number | string,
  ) {
    super(containerId);
  }

  protected nextDoc(current: AnimationDoc): AnimationDoc {
    return moveKeyframe(
      current,
      this.nodeId,
      this.property,
      this.fromTime,
      this.toTime,
      this.newValue,
    );
  }
}

/**
 * **F2.** Remove the keyframe at `time` on `(nodeId, property)`. The track is
 * dropped when it becomes empty. Fails as a no-op when nothing matches.
 */
export class RemoveKeyframeCommand extends AnimationDocCommand {
  readonly label = 'Remove keyframe';

  constructor(
    containerId: NodeId,
    private readonly nodeId: NodeId,
    private readonly property: string,
    private readonly time: number,
  ) {
    super(containerId);
  }

  protected nextDoc(current: AnimationDoc): AnimationDoc {
    return removeKeyframe(current, this.nodeId, this.property, this.time);
  }
}

/**
 * **F2.** Replace the `easing` of the keyframe at `time` on
 * `(nodeId, property)`. Fails as a no-op when the keyframe is absent.
 */
export class SetKeyframeEasingCommand extends AnimationDocCommand {
  readonly label = 'Set keyframe easing';

  constructor(
    containerId: NodeId,
    private readonly nodeId: NodeId,
    private readonly property: string,
    private readonly time: number,
    private readonly easing: EasingSpec,
  ) {
    super(containerId);
  }

  protected nextDoc(current: AnimationDoc): AnimationDoc {
    return setKeyframeEasing(current, this.nodeId, this.property, this.time, this.easing);
  }
}

/**
 * **F2.** Set the timeline `durationMs` (clamped to ≥ 0). Fails as a no-op when
 * the duration is unchanged.
 */
export class SetAnimationDurationCommand extends AnimationDocCommand {
  readonly label = 'Set animation duration';

  constructor(
    containerId: NodeId,
    private readonly durationMs: number,
  ) {
    super(containerId);
  }

  protected nextDoc(current: AnimationDoc): AnimationDoc {
    return setAnimationDuration(current, this.durationMs);
  }
}

/**
 * **F5 follow-up.** Remove an entire track `(nodeId, property)` — all its
 * keyframes at once — in a single undoable step. Fails as a no-op when the
 * track is absent.
 */
export class RemoveTrackCommand extends AnimationDocCommand {
  readonly label = 'Remove track';

  constructor(
    containerId: NodeId,
    private readonly nodeId: NodeId,
    private readonly property: string,
  ) {
    super(containerId);
  }

  protected nextDoc(current: AnimationDoc): AnimationDoc {
    return removeTrack(current, this.nodeId, this.property);
  }
}
