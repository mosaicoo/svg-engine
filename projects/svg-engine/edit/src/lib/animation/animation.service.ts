import { computed, inject, Injectable } from '@angular/core';
import {
  AddKeyframeCommand,
  type AnimatablePropertyDef,
  animatablePropertiesForNode,
  type AnimationDoc,
  type AnimationSample,
  type AnimationTrack,
  CommandBus,
  type CommandResult,
  EditorStateService,
  type EasingSpec,
  emptyAnimationDoc,
  findNodeById,
  type Keyframe,
  MoveKeyframeCommand,
  type NodeId,
  readAnimatableValue,
  readAnimationDoc,
  RemoveKeyframeCommand,
  sampleAnimation,
  SetAnimationDurationCommand,
  SetKeyframeEasingCommand,
} from 'svg-engine/core';
import { ActivePageService } from '../pages/active-page.service';

/**
 * **D-082 (Animation Timeline) — F2.** The engine that reads/edits a page's
 * {@link AnimationDoc}, the editor-facing counterpart to the headless core
 * model (F0/F1). It is the **only** way the UI mutates the animation: every
 * change goes through an undoable {@link CommandBus} command, so Ctrl+Z is
 * unified with the rest of the editor.
 *
 * **Non-destructive by construction**: the AnimationDoc lives on a *container*
 * node's `metadata.customData` (the active page, or the document root when no
 * pages exist). This service never mutates an animated shape's own fields —
 * the displayed values are derived from the playhead at runtime
 * ({@link sample}). When nothing is animated, the base document is unchanged.
 *
 * **Why per-editor scope** (D-042): the animation is editor-specific state
 * (which container, which doc). Provided via `provideSvgEngineEditorScope()`.
 * `ActivePageService` is injected **optionally** so the service still works in
 * a plain `EditorStateService`-only test harness — it falls back to the
 * document root as the container.
 */
@Injectable({ providedIn: 'root' })
export class AnimationService {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  // Optional: pages are a higher-level feature. Without an ActivePageService
  // (headless / minimal scope), the document root is the animation container.
  private readonly activePage = inject(ActivePageService, { optional: true });

  /**
   * The container node id where the AnimationDoc is stored: the **active
   * page** when pages are in use, otherwise the **document root**. Reuses
   * `ActivePageService.effectiveDrawTargetId()` (the same "where does content
   * for the current artboard live?" resolver the drawing tools use), so the
   * timeline always animates the page the user is looking at.
   */
  readonly containerId = computed<NodeId>(() => {
    const fromPage = this.activePage?.effectiveDrawTargetId() ?? null;
    if (fromPage !== null) return fromPage;
    return this.state.document().root.id;
  });

  /**
   * The active container's {@link AnimationDoc} — an empty doc when none is
   * stored yet. Re-derives whenever the document or the active container
   * changes.
   */
  readonly doc = computed<AnimationDoc>(() => {
    const docModel = this.state.document();
    const container = findNodeById(docModel.root, this.containerId());
    return readAnimationDoc(container) ?? emptyAnimationDoc();
  });

  /** The animation's tracks (one per animated `(nodeId, property)`). */
  readonly tracks = computed<readonly AnimationTrack[]>(() => this.doc().tracks);

  /** The animation's total duration, in milliseconds. */
  readonly durationMs = computed<number>(() => this.doc().durationMs);

  // ── CRUD (each dispatches an undoable command on the active container) ──

  /** Add (or replace) a keyframe on `(nodeId, property)`. */
  addKeyframe(nodeId: NodeId, property: string, keyframe: Keyframe): CommandResult {
    return this.bus.dispatch(
      new AddKeyframeCommand(this.containerId(), nodeId, property, keyframe),
    );
  }

  /** Remove the keyframe at `time` on `(nodeId, property)`. */
  removeKeyframe(nodeId: NodeId, property: string, time: number): CommandResult {
    return this.bus.dispatch(new RemoveKeyframeCommand(this.containerId(), nodeId, property, time));
  }

  /**
   * Move the keyframe at `fromTime` to `toTime` on `(nodeId, property)`,
   * optionally replacing its value (the easing is carried over).
   */
  moveKeyframe(
    nodeId: NodeId,
    property: string,
    fromTime: number,
    toTime: number,
    newValue?: number | string,
  ): CommandResult {
    return this.bus.dispatch(
      new MoveKeyframeCommand(this.containerId(), nodeId, property, fromTime, toTime, newValue),
    );
  }

  /** Replace the easing of the keyframe at `time` on `(nodeId, property)`. */
  setKeyframeEasing(
    nodeId: NodeId,
    property: string,
    time: number,
    easing: EasingSpec,
  ): CommandResult {
    return this.bus.dispatch(
      new SetKeyframeEasingCommand(this.containerId(), nodeId, property, time, easing),
    );
  }

  /** Set the timeline duration (clamped to ≥ 0 by the command). */
  setDuration(durationMs: number): CommandResult {
    return this.bus.dispatch(new SetAnimationDurationCommand(this.containerId(), durationMs));
  }

  /**
   * Sample the active animation at `timeMs`, producing the per-node property
   * overrides to apply. Pairs with `applyAnimationToTree` (F1) for the preview
   * (F6): `applyAnimationToTree(baseTree, anim.sample(playhead))`.
   */
  sample(timeMs: number): AnimationSample {
    return sampleAnimation(this.doc(), timeMs);
  }

  // ── F3 — animatable-property catalog (read side, source of timeline rows) ──

  /**
   * The animatable properties of the node `nodeId` — the rows the timeline
   * offers when that shape is expanded (geometry by type + transform + style).
   * Returns `[]` when the node isn't found in the current document.
   */
  animatablePropertiesFor(nodeId: NodeId): readonly AnimatablePropertyDef[] {
    const node = findNodeById(this.state.document().root, nodeId);
    return node === null ? [] : animatablePropertiesForNode(node);
  }

  /**
   * The node's **current** value for `property` — what a "set keyframe at the
   * playhead" action captures (F5). Returns `null` when the node is absent or
   * the property isn't set; callers fall back to the def's `defaultValue`.
   */
  currentValue(nodeId: NodeId, property: string): number | string | null {
    const node = findNodeById(this.state.document().root, nodeId);
    return node === null ? null : readAnimatableValue(node, property);
  }
}
