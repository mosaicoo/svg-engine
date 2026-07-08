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
   * **D-149 — Authored element `id` preservation.** The `id` attribute an
   * external tool (Illustrator / Inkscape / Figma) wrote on the source
   * element, captured verbatim on import. Distinct from:
   *
   * - {@link SvgNodeBase.id} — the engine's runtime UUID (internal, never a
   *   stable external reference);
   * - {@link name} — the human-readable layer name (emitted as `<title>`);
   *
   * Kept so it can be re-emitted as `id="..."` on export (opt-in via
   * `exportPreferences.emitAuthoredIds`, default on-when-present), letting
   * downstream systems that bind data/thresholds to element ids survive an
   * import → edit → export round-trip. Nodes CREATED in the editor have no
   * `sourceId`, so editor output stays free of runtime-id noise.
   */
  readonly sourceId?: string;
  /**
   * Extension point for consumers to attach arbitrary data without losing
   * type-safety on the rest of the model. Plugin authors may declare module
   * augmentations to type their slice of `customData`.
   */
  readonly customData?: Readonly<Record<string, unknown>>;
}

/** Empty metadata (defaults: visible, unlocked, no name). */
export const EMPTY_METADATA: SvgMetadata = Object.freeze({});
