import type { SvgMetadata } from '../types/metadata';
import type { NodeId } from '../types/node-id';
import type { SvgStyle } from '../types/style';
import type { Transform } from '../types/transform';

/**
 * Fields common to every {@link SvgNode}. Concrete node interfaces extend
 * this and add a `type` discriminator plus their geometry-specific fields.
 *
 * **Immutability**: every field is `readonly`. Mutations produce new
 * objects via factories or {@link updateNode} from `tree-ops`.
 */
export interface SvgNodeBase {
  readonly id: NodeId;
  readonly transform: Transform;
  readonly style: SvgStyle;
  readonly metadata: SvgMetadata;
}
