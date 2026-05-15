/**
 * Editor-facing metadata attached to every {@link SvgNode}. Distinct from
 * SVG-spec presentation attributes (those live in {@link SvgStyle}).
 */
export interface SvgMetadata {
  /** Human-readable name shown in the layers panel. */
  readonly name?: string;
  /** When `true`, the node cannot be modified through commands. */
  readonly locked?: boolean;
  /**
   * Editor visibility (toggle in layers panel). Distinct from
   * {@link SvgStyle.visibility} which controls SVG rendering.
   */
  readonly visible?: boolean;
  /**
   * Extension point for consumers to attach arbitrary data without losing
   * type-safety on the rest of the model. Plugin authors may declare module
   * augmentations to type their slice of `customData`.
   */
  readonly customData?: Readonly<Record<string, unknown>>;
}

/** Empty metadata (defaults: visible, unlocked, no name). */
export const EMPTY_METADATA: SvgMetadata = Object.freeze({});
