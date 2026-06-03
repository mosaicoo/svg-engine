export {
  fail,
  ok,
  type Command,
  type CommandContext,
  type CommandResult,
  type InsertParentResolver,
} from './command';
// PAGES-REFACTOR Fase 1 — DI token for the InsertParentResolver
// implementation. Provided by `svg-engine/edit`'s scope.
export { INSERT_PARENT_RESOLVER } from './insert-parent-resolver.token';
export {
  type AnchorRef,
  ConvertAnchorTypeCommand,
  InsertAnchorCommand,
  MoveAnchorCommand,
  RemoveAnchorCommand,
} from './anchor.commands';
export { ConvertNodeToPathCommand, nodeToPathD } from './convert-to-path.command';
export { BatchConvertToPathCommand } from './batch-convert-to-path.command';
// D-054 — Compound paths (Item 6.2)
export {
  bakeTransformIntoPathD,
  MakeCompoundPathCommand,
  ReleaseCompoundPathCommand,
  splitPathDIntoSubpaths,
} from './compound-path.commands';
// D-056 — Boolean Live (Item 6.1)
export {
  getLiveBooleanOp,
  isLiveBooleanGroup,
  LIVE_BOOLEAN_KEY,
  LIVE_BOOLEAN_ROLE_KEY,
  type LiveBooleanOp,
  MakeLiveBooleanCommand,
  RefreshLiveBooleanCommand,
  ReleaseLiveBooleanCommand,
} from './live-boolean.commands';
export { DuplicateNodeCommand } from './duplicate-node.command';
export {
  DivideCommand,
  ExcludeCommand,
  IntersectCommand,
  SubtractCommand,
  UnionCommand,
} from './pathfinder.commands';
export { GroupSelectionCommand } from './group-selection.command';
export { AUTO_PARENT, InsertNodeCommand, type ParentRef } from './insert-node.command';
export { MoveNodeCommand } from './move-node.command';
export { MoveNodeInTreeCommand } from './move-node-in-tree.command';
export { RemoveNodeCommand } from './remove-node.command';
export { type ReorderDirection, ReorderNodeCommand } from './reorder-node.command';
export { composeAnchoredScale, ResizeNodeCommand } from './resize-node.command';
export { type ResizeNodesEntry, ResizeNodesCommand } from './resize-nodes.command';
export { composePivotRotation, RotateNodeCommand } from './rotate-node.command';
export { type RotateNodesEntry, RotateNodesCommand } from './rotate-nodes.command';
// D-078 — Flip horizontal/vertical (mirror across an axis through pivot).
export { composePivotFlip, type FlipAxis, FlipNodeCommand } from './flip-node.command';
// KNIFE-FIX — real path cut (auto-converts shapes, splits into 2 paths,
// honours snap-to-nodes + tolerance).
export { KnifeCutPathCommand } from './knife-cut.command';

// D-079 — Pages / Artboards: 4 commands (Create/Delete/Rename/Resize)
// over the metadata-flag model (see core/lib/model/page.ts).
// PAGES-REFACTOR Fase 3 — adds SetPageOptionsCommand for the new
// per-page background/margins/orientation/format struct.
// PAGES-REFACTOR Fase 6 — adds MovePageCommand for the drag-the-handle
// gesture wired in the page selection overlay.
export {
  CreatePageCommand,
  DeletePageCommand,
  MovePageCommand,
  RenamePageCommand,
  ResizePageCommand,
  SetPageOptionsCommand,
} from './page.commands';
// PAGES-FIX-2 — idempotent bootstrap of Page 1 (migrates loose root
// shapes into the new page). Called by shells that opt into the
// multi-page workflow from mount (e.g. `<svge-shell-pro>`).
export { EnsureDefaultPageCommand } from './ensure-default-page.command';
export { SetPropertyCommand } from './set-property.command';
export { SetPropertyOnManyCommand } from './set-property-on-many.command';
// D-055 — Live Corners: set the non-destructive cornerRadius on PathNodes.
export { SetCornerRadiusCommand } from './set-corner-radius.command';
// D-082 — Animation Timeline: undoable keyframe/duration edits on the page
// animation. F0 = AddKeyframe; F2 = Move/Remove/SetEasing/SetDuration.
export {
  AddKeyframeCommand,
  MoveKeyframeCommand,
  RemoveKeyframeCommand,
  SetAnimationDurationCommand,
  SetKeyframeEasingCommand,
} from './animation.commands';
export { SetStylePropertyOnManyCommand } from './set-style-property-on-many.command';
export { TranslateManyCommand } from './translate-many.command';
export { UngroupCommand } from './ungroup.command';
// D-072 — Logical Layers
export { CreateLayerCommand, MakeLayerCommand, UnmakeLayerCommand } from './layer.commands';
// D-073 — History Snapshots
export { RestoreSnapshotCommand } from './restore-snapshot.command';
// D-074 — Smart Objects
export {
  EditSmartObjectContentsCommand,
  MakeSmartObjectCommand,
  RasterizeSmartObjectCommand,
  ReplaceSmartObjectContentsCommand,
} from './smart-object.commands';
