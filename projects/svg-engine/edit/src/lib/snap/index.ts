export {
  // gridTargetsNear / rectsToSnapTargets / guidesToSnapTargets: geradores
  // puros de alvos de snap (anunciados na referência pública,
  // 09-api-publica.md).
  gridTargetsNear,
  guidesToSnapTargets,
  rectsToSnapTargets,
  resolveSnap,
  type SnapAxis,
  type SnapGuide,
  type SnapResult,
  type SnapSource,
  type SnapTarget,
} from './snap-resolver';
export { SnapService, type SnapMode } from './snap.service';
