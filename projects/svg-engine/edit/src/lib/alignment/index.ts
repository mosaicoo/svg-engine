export {
  type AlignAxis,
  computeAlignDeltas,
  computeAlignToReferenceDeltas,
  computeDistributeDeltas,
  type DistributeAxis,
  type NodeBBox,
  resolveAlignReference,
  unionBBox,
} from './alignment-math';
export { AlignmentService } from './alignment.service';
// D-094 — "Align to Key Object" per-editor state.
export { KeyObjectService } from './key-object.service';
