import type { GroupNode } from './group-node';
import type { SvgNode } from './svg-node';

/**
 * **D-072 — Logical Layers.**
 *
 * A *Layer* is a `GroupNode` that carries a `metadata.customData` flag
 * marking it as a top-level organizational container — the
 * Illustrator / Affinity / Photoshop "Layer" concept. Layers behave
 * exactly like groups for every existing operation (render, hit-test,
 * transform, export) — they ARE groups — but the panel/UI surfaces
 * them with a distinct icon and enforces a "top-level only" rule on
 * drag/drop so the user can rely on layers as a flat organizational
 * spine.
 *
 * **Why metadata.customData (not a new node type)**: same reasoning as
 * D-056 Live Boolean (see `live-boolean.commands.ts` header). Adding a
 * `layer` discriminator to the `SvgNode` union would force every
 * renderer / exporter / spec / library consumer to handle the new
 * type. A metadata flag is invisible to anything that doesn't care.
 *
 * **Round-trip**: the exporter emits `data-svge-kind="layer"` on the
 * `<g>` element when this flag is set, and the importer reads it
 * back. The flag survives a full SVG export → re-import cycle. Other
 * editors silently preserve unknown `data-*` attributes (Inkscape,
 * Illustrator, Figma all do), so opening the file elsewhere and
 * re-importing keeps the layer designation intact.
 *
 * **Customdata key**: `svgeKind` is intentionally generic so future
 * group-like concepts (e.g. a future "artboard" — D-075) can share
 * the slot with different string values (`'layer' | 'artboard' | ...`).
 */

/** Key under `metadata.customData` where the layer flag lives. */
export const SVGE_KIND_KEY = 'svgeKind' as const;

/** Value stored at {@link SVGE_KIND_KEY} for a layer group. */
export const SVGE_KIND_LAYER = 'layer' as const;

/**
 * Type-guard: is this node a Layer (a group flagged via metadata)?
 *
 * Pure read, allocation-free. Safe to call inside `computed()` or
 * tight render loops. Returns `false` for non-group nodes by definition.
 */
export function isLayer(node: SvgNode): node is GroupNode {
  if (node.type !== 'group') return false;
  const cd = node.metadata.customData;
  if (cd === undefined) return false;
  return cd[SVGE_KIND_KEY] === SVGE_KIND_LAYER;
}

/**
 * Produce a copy of `group` with the layer flag SET. Preserves every
 * other field including any pre-existing `customData` entries.
 *
 * Pure function — does not mutate input. Returns a new `GroupNode`.
 */
export function withLayerFlag(group: GroupNode): GroupNode {
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: {
        ...(group.metadata.customData ?? {}),
        [SVGE_KIND_KEY]: SVGE_KIND_LAYER,
      },
    },
  };
}

/**
 * Produce a copy of `group` with the layer flag CLEARED. If
 * `customData` would become empty after removal, the field is dropped
 * entirely so the metadata round-trips cleanly through equality
 * comparisons (`{}` vs `undefined` differ structurally).
 */
export function withoutLayerFlag(group: GroupNode): GroupNode {
  const cd = group.metadata.customData;
  if (cd === undefined || cd[SVGE_KIND_KEY] === undefined) return group;
  const nextCd: Record<string, unknown> = { ...cd };
  delete nextCd[SVGE_KIND_KEY];
  const cleanedCd = Object.keys(nextCd).length > 0 ? nextCd : undefined;
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: cleanedCd,
    },
  };
}
