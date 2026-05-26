import type { BoundingBox } from '../types/bounding-box';
import type { GroupNode } from './group-node';
import { SVGE_KIND_KEY } from './layer';
import type { SvgNode } from './svg-node';

/**
 * **D-079 — Pages / Artboards.**
 *
 * A *Page* (also called Artboard in Illustrator / Frame in Figma) is a
 * `GroupNode` flagged with `metadata.customData.svgeKind === 'page'`
 * plus a `pageViewBox` rectangle on the same customData slot. Mirrors
 * Illustrator's "Artboard" + Affinity Designer's "Artboard" + Figma's
 * "Frame" — a named, sized canvas area you can swap between.
 *
 * **Why a metadata flag (not a new node type or a `SvgDocument`
 * refactor)**: same reasoning as D-072 Layer / D-074 Smart Object —
 * adding a discriminator to `SvgNode` (or restructuring `SvgDocument`
 * around `pages[]`) would force every renderer / exporter / spec /
 * library consumer to rewrite. A metadata flag is invisible to
 * anything that doesn't care, so all 344 existing pieces keep working
 * unchanged.
 *
 * **Mutually exclusive with Layer / Smart Object**: `svgeKind` is a
 * single-slot string. A group is either a page, a layer, a smart
 * object, or a plain group — never two at once. Documented in D-072
 * comment block.
 *
 * **viewBox**: each page carries its own `pageViewBox` ({x, y, width,
 * height}) in `metadata.customData`. The renderer ({@link
 * ActivePageService} in `svg-engine/edit`) uses this when in "single
 * page" mode to scope the canvas to one page at a time.
 *
 * **Top-level only by convention**: like Layers, Pages should live as
 * direct children of `SvgDocument.root`. The Pages Panel enforces
 * this in the UI. Nesting a page inside a group / layer / smart
 * object is technically possible in the model (the renderer would
 * still walk it) but no UI surfaces it.
 *
 * **Back-compat for legacy documents**: documents with no pages are
 * rendered in "spread mode" (renderer shows everything in the
 * document's `viewBox`). The {@link ActivePageService} auto-creates an
 * implicit Page 1 covering the document's viewBox if the consumer
 * enters "single page" mode without any pages existing.
 *
 * **Round-trip**: the exporter emits `data-svge-kind="page"` +
 * `data-svge-page-viewbox="x y w h"` on the `<g>` element. The
 * importer reads them back. Other editors silently preserve unknown
 * `data-*` attributes — opening the file elsewhere and re-importing
 * keeps the page designation.
 */

/** Value stored at {@link SVGE_KIND_KEY} for a page group. */
export const SVGE_KIND_PAGE = 'page' as const;

/** Key under `metadata.customData` where the page's viewBox lives. */
export const SVGE_PAGE_VIEWBOX_KEY = 'svgePageViewBox' as const;

/** Key under `metadata.customData` where the page's display name lives. */
export const SVGE_PAGE_NAME_KEY = 'svgePageName' as const;

/**
 * Type-guard: is this node a Page (a group flagged via metadata)?
 * Pure read, allocation-free. Returns `false` for non-group nodes by
 * definition. Also returns `false` for layer-flagged or smart-object-
 * flagged groups (kinds are mutually exclusive on the single
 * `svgeKind` slot).
 */
export function isPage(node: SvgNode): node is GroupNode {
  if (node.type !== 'group') return false;
  const cd = node.metadata.customData;
  if (cd === undefined) return false;
  return cd[SVGE_KIND_KEY] === SVGE_KIND_PAGE;
}

/**
 * Read the page's `viewBox` rectangle from metadata. Returns `null`
 * when the node isn't a page OR when the viewBox metadata is missing /
 * malformed. Callers should treat `null` as "use the document's
 * default viewBox" — defensive, since some legacy exports may flag a
 * group as page without populating the viewBox slot.
 */
export function getPageViewBox(node: SvgNode): BoundingBox | null {
  if (!isPage(node)) return null;
  const raw = node.metadata.customData?.[SVGE_PAGE_VIEWBOX_KEY];
  if (raw === undefined) return null;
  // Stored as the BoundingBox object directly — defensive shape check.
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Partial<BoundingBox>;
  if (
    typeof obj.x !== 'number' ||
    typeof obj.y !== 'number' ||
    typeof obj.width !== 'number' ||
    typeof obj.height !== 'number'
  ) {
    return null;
  }
  return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
}

/**
 * Read the page's display name from metadata. Falls back to
 * `metadata.name` (the canonical D-072g layer-name field) when no
 * page-specific name was set; falls back to `'Untitled Page'` when
 * both are absent. The Pages Panel uses this for tab labels.
 */
export function getPageName(node: SvgNode): string {
  if (!isPage(node)) return '';
  const raw = node.metadata.customData?.[SVGE_PAGE_NAME_KEY];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (typeof node.metadata.name === 'string' && node.metadata.name.length > 0) {
    return node.metadata.name;
  }
  return 'Untitled Page';
}

/**
 * Produce a copy of `group` with the page flag SET + viewBox + name.
 * Preserves every other field including pre-existing `customData`
 * entries. Replaces any existing `svgeKind` value (so wrapping a
 * layer-flagged group as a page converts it — single-slot semantics).
 *
 * Pure function — does not mutate input. Returns a new `GroupNode`.
 */
export function withPageFlag(group: GroupNode, viewBox: BoundingBox, name?: string): GroupNode {
  const cd: Record<string, unknown> = {
    ...(group.metadata.customData ?? {}),
    [SVGE_KIND_KEY]: SVGE_KIND_PAGE,
    [SVGE_PAGE_VIEWBOX_KEY]: { ...viewBox },
  };
  if (name !== undefined) cd[SVGE_PAGE_NAME_KEY] = name;
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: cd,
    },
  };
}

/**
 * Produce a copy of `group` with the page flag CLEARED (and any
 * page-specific metadata removed). If `customData` would become empty
 * after removal, the field is dropped entirely so the metadata round-
 * trips cleanly through equality comparisons.
 *
 * No-op (returns the same reference) when the group isn't flagged as
 * a page — lets callers skip the conditional.
 */
export function withoutPageFlag(group: GroupNode): GroupNode {
  const cd = group.metadata.customData;
  if (cd === undefined || cd[SVGE_KIND_KEY] !== SVGE_KIND_PAGE) return group;
  const nextCd: Record<string, unknown> = { ...cd };
  delete nextCd[SVGE_KIND_KEY];
  delete nextCd[SVGE_PAGE_VIEWBOX_KEY];
  delete nextCd[SVGE_PAGE_NAME_KEY];
  const cleanedCd = Object.keys(nextCd).length > 0 ? nextCd : undefined;
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: cleanedCd,
    },
  };
}

/**
 * Produce a copy of `group` with an updated `pageViewBox`. No-op (same
 * ref) when the group isn't a page — caller is expected to know what
 * they're doing.
 */
export function withPageViewBox(group: GroupNode, viewBox: BoundingBox): GroupNode {
  if (!isPage(group)) return group;
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: {
        ...(group.metadata.customData ?? {}),
        [SVGE_PAGE_VIEWBOX_KEY]: { ...viewBox },
      },
    },
  };
}

/**
 * Produce a copy of `group` with an updated page display name. No-op
 * (same ref) when the group isn't a page. Pass empty string to clear
 * the name (Pages Panel will fall back to `metadata.name` or
 * 'Untitled Page').
 */
export function withPageName(group: GroupNode, name: string): GroupNode {
  if (!isPage(group)) return group;
  const cd: Record<string, unknown> = { ...(group.metadata.customData ?? {}) };
  if (name.length === 0) {
    delete cd[SVGE_PAGE_NAME_KEY];
  } else {
    cd[SVGE_PAGE_NAME_KEY] = name;
  }
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: cd,
    },
  };
}
