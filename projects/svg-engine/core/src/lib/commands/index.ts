export { fail, ok, type Command, type CommandContext, type CommandResult } from './command';
export {
  type AnchorRef,
  ConvertAnchorTypeCommand,
  InsertAnchorCommand,
  MoveAnchorCommand,
  RemoveAnchorCommand,
} from './anchor.commands';
export { ConvertNodeToPathCommand, nodeToPathD } from './convert-to-path.command';
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
export { InsertNodeCommand } from './insert-node.command';
export { MoveNodeCommand } from './move-node.command';
export { MoveNodeInTreeCommand } from './move-node-in-tree.command';
export { RemoveNodeCommand } from './remove-node.command';
export { type ReorderDirection, ReorderNodeCommand } from './reorder-node.command';
export { composeAnchoredScale, ResizeNodeCommand } from './resize-node.command';
export { composePivotRotation, RotateNodeCommand } from './rotate-node.command';
export { SetPropertyCommand } from './set-property.command';
export { SetPropertyOnManyCommand } from './set-property-on-many.command';
export { SetStylePropertyOnManyCommand } from './set-style-property-on-many.command';
export { TranslateManyCommand } from './translate-many.command';
export { UngroupCommand } from './ungroup.command';
