import type { GroupNode } from './group-node';
import { SVGE_KIND_KEY } from './layer';
import type { SvgNode } from './svg-node';

/**
 * **D-074 — Smart Objects.**
 *
 * A *Smart Object* is a `GroupNode` flagged with
 * `metadata.customData.svgeKind === 'smart-object'` — a non-destructive
 * container that wraps imported/composed content as a single editable
 * unit. Mirrors Photoshop's "Smart Object" + Affinity's "Embedded
 * Document" concept: transforms (move, resize, rotate) apply to the
 * wrapper without touching the inner content's structure.
 *
 * **Why a separate kind (not just a group)**: signals INTENT — "this
 * is an asset I imported/composed, treat it as a single thing". The
 * UI surfaces dedicated operations (Edit Contents, Replace Contents,
 * Rasterize) that don't make sense for arbitrary groups. The Layer
 * Panel renders smart objects with a distinct icon so the user
 * recognizes them at a glance.
 *
 * **Why a metadata flag (not a new node type)**: same reasoning as
 * D-056 Live Boolean / D-072 Layer. Adding a `'smart-object'`
 * discriminator to the `SvgNode` union would force every renderer /
 * exporter / spec / library consumer to handle the new type. A
 * metadata flag is invisible to anything that doesn't care.
 *
 * **Relationship to Symbols (D-059)**:
 *
 * - **Symbol** = master definition + N reusable `<use>` instances;
 *   edit master → every instance updates. Use case: logos repeated
 *   across the document, icons.
 * - **Smart Object** = independent container with self-contained
 *   content; no master/instance relationship. Use case: imported
 *   external SVG, composed asset that you want to replace as a unit
 *   without affecting other places.
 *
 * Both concepts coexist in professional editors (Photoshop has Smart
 * Objects + Symbols; Affinity has Symbols + Embedded Documents). They
 * solve different problems and the user picks per case.
 *
 * **Relationship to Layers (D-072)**: layers are TOP-LEVEL
 * organizational containers (one level deep, drag/drop rule). Smart
 * objects can live anywhere in the tree (nested in groups, in
 * layers, ungrouped). They're mutually exclusive (a group is either
 * a layer OR a smart object OR a plain group — `svgeKind` is a
 * single-slot string).
 *
 * **Round-trip**: the exporter emits `data-svge-kind="smart-object"`
 * on the `<g>` element. Importer reads it back. Other editors
 * silently preserve unknown `data-*` attributes (Inkscape /
 * Illustrator / Figma all do), so opening the file elsewhere and
 * re-importing keeps the designation.
 */

/** Value stored at {@link SVGE_KIND_KEY} for a smart-object group. */
export const SVGE_KIND_SMART_OBJECT = 'smart-object' as const;

/**
 * Type-guard: is this node a Smart Object (a group flagged via
 * metadata)? Pure read, allocation-free.
 *
 * Returns `false` for non-group nodes by definition. Also returns
 * `false` for layer-flagged groups (kinds are mutually exclusive on
 * the single `svgeKind` slot).
 */
export function isSmartObject(node: SvgNode): node is GroupNode {
  if (node.type !== 'group') return false;
  const cd = node.metadata.customData;
  if (cd === undefined) return false;
  return cd[SVGE_KIND_KEY] === SVGE_KIND_SMART_OBJECT;
}

/**
 * Produce a copy of `group` with the smart-object flag SET. Preserves
 * every other field including any pre-existing `customData` entries.
 *
 * Replaces any existing `svgeKind` value (so wrapping a layer-flagged
 * group as a smart object converts it — single-slot semantics; the
 * caller is expected to know what they're doing).
 *
 * Pure function — does not mutate input. Returns a new `GroupNode`.
 */
export function withSmartObjectFlag(group: GroupNode): GroupNode {
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: {
        ...(group.metadata.customData ?? {}),
        [SVGE_KIND_KEY]: SVGE_KIND_SMART_OBJECT,
      },
    },
  };
}

/**
 * Produce a copy of `group` with the smart-object flag CLEARED. If
 * `customData` would become empty after removal, the field is dropped
 * entirely so the metadata round-trips cleanly through equality
 * comparisons (`{}` vs `undefined` differ structurally).
 *
 * No-op (returns the same reference) when the group doesn't have the
 * smart-object flag — lets callers skip the conditional.
 */
export function withoutSmartObjectFlag(group: GroupNode): GroupNode {
  const cd = group.metadata.customData;
  if (cd === undefined || cd[SVGE_KIND_KEY] !== SVGE_KIND_SMART_OBJECT) return group;
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
