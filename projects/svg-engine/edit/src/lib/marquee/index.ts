export {
  MarqueeService,
  // rectFromPoints: normalização interna de retângulo. Interna.
  type MarqueeHitMode,
  type MarqueeMode,
  type MarqueeState,
} from './marquee.service';
export {
  nodesInsideMarquee,
  // rectContainsRect / rectsIntersect: predicados internos de hit-testing. Internos.
  type MarqueeCandidate,
} from './marquee-hit-testing';
