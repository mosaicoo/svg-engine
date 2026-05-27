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
 * **PAGES-REFACTOR Fase 3** — Key under `metadata.customData` for the
 * per-page presentation options (background, margins, format,
 * orientation). Separate from `pageViewBox` because viewBox is the
 * geometric authority while options describe how the artboard is
 * presented / hinted to consumers (Inspector, print preview,
 * Workspace Settings dialog).
 */
export const SVGE_PAGE_OPTIONS_KEY = 'svgePageOptions' as const;

/**
 * Background mode for a page's "paper" — same conceptual variants as
 * `WorkspaceService.BackgroundConfig` but **per-page** and persisted
 * via the page node's metadata.
 *
 * - `transparent` (default): checkerboard pattern via PageOverlay.
 * - `solid`: a CSS color string (named / hex / rgb / hsl). Not validated
 *   client-side — browser's job.
 * - `image`: a tile / background URL.
 */
export type PageBackground =
  | { readonly kind: 'transparent' }
  | { readonly kind: 'solid'; readonly color: string }
  | { readonly kind: 'image'; readonly href: string };

/**
 * Inner safe-area inset (top / right / bottom / left) in document
 * units. Drives the dashed margin rect in `PageOverlay` and informs
 * future print-preview / cropping pipelines. Each field >= 0.
 */
export interface PageMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Page orientation hint. Independent from the viewBox's actual W/H
 * shape — when they disagree, consumers may swap (the legacy
 * `pageBoundsIn` helper in WorkspaceService does this).
 */
export type PageOrientation = 'portrait' | 'landscape';

/**
 * Optional named-format hint for the page. Used by the Inspector's
 * format dropdown ("A4", "Letter", "Tabloid", "Square", "Custom") to
 * round-trip the user's choice without forcing the model to derive
 * format from W/H every time.
 *
 * `null` (or absent) means "no preset" — the dimensions are custom.
 * The Inspector shows "Custom" when this slot is null or unknown.
 */
export type PageFormat =
  | 'a4'
  | 'a5'
  | 'a3'
  | 'letter'
  | 'legal'
  | 'tabloid'
  | 'square-1080'
  | 'square-1200'
  | 'square-2048'
  | 'custom';

/**
 * **PAGES-REFACTOR Fase 3** — full per-page presentation options.
 * Persisted in `metadata.customData.svgePageOptions`. All fields are
 * optional; absent fields use the documented defaults.
 *
 * **Defaults** (applied by {@link getPageOptions} when the slot is
 * missing OR partial):
 * - `background`: `{ kind: 'transparent' }`
 * - `margins`:    `{ top: 0, right: 0, bottom: 0, left: 0 }`
 * - `orientation`: `'landscape'`
 * - `format`:     `'custom'`
 *
 * **Why one struct (not 4 metadata slots)**: keeps the metadata
 * footprint compact, makes round-trip JSON.stringify trivial, and
 * lets the Inspector / Workspace Settings dialog edit the whole
 * struct in a single `SetPageOptionsCommand`.
 */
export interface PageOptions {
  readonly background: PageBackground;
  readonly margins: PageMargins;
  readonly orientation: PageOrientation;
  readonly format: PageFormat;
}

/** Default applied when a page has no options metadata or partial options. */
export const DEFAULT_PAGE_OPTIONS: PageOptions = {
  background: { kind: 'transparent' },
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  orientation: 'landscape',
  format: 'custom',
};

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

/**
 * **PAGES-REFACTOR Fase 3** — read the page's full presentation
 * options. Returns {@link DEFAULT_PAGE_OPTIONS} (a frozen object) when
 * the slot is missing OR for non-page inputs. Always returns a fully-
 * populated struct so consumers can read `.background.kind`,
 * `.margins.top`, etc. without guards.
 *
 * For each field, if the stored value is malformed (wrong shape, wrong
 * type), the default for that field is substituted — partial reads
 * never throw. This is the same defensive pattern as
 * {@link getPageViewBox}.
 */
export function getPageOptions(node: SvgNode): PageOptions {
  if (!isPage(node)) return DEFAULT_PAGE_OPTIONS;
  const raw = node.metadata.customData?.[SVGE_PAGE_OPTIONS_KEY];
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PAGE_OPTIONS;
  const obj = raw as Partial<PageOptions>;
  const background = isValidPageBackground(obj.background)
    ? obj.background
    : DEFAULT_PAGE_OPTIONS.background;
  const margins = isValidPageMargins(obj.margins) ? obj.margins : DEFAULT_PAGE_OPTIONS.margins;
  const orientation =
    obj.orientation === 'portrait' || obj.orientation === 'landscape'
      ? obj.orientation
      : DEFAULT_PAGE_OPTIONS.orientation;
  const format = isValidPageFormat(obj.format) ? obj.format : DEFAULT_PAGE_OPTIONS.format;
  return { background, margins, orientation, format };
}

/**
 * **PAGES-REFACTOR Fase 3** — produce a copy of `group` with the
 * given page options patched. Partial input — only the fields in
 * `patch` are overwritten; the rest are read from the existing
 * options. No-op (same ref) when the group isn't a page.
 *
 * **Why patch (not full replace)**: matches the `patchPage` semantics
 * users were used to from `WorkspaceService.patchPage`. UIs typically
 * change one field at a time (e.g., toggle orientation) — forcing
 * them to assemble the full struct would be tedious and error-prone.
 */
export function withPageOptions(group: GroupNode, patch: Partial<PageOptions>): GroupNode {
  if (!isPage(group)) return group;
  const current = getPageOptions(group);
  const next: PageOptions = {
    background: patch.background ?? current.background,
    margins: patch.margins ?? current.margins,
    orientation: patch.orientation ?? current.orientation,
    format: patch.format ?? current.format,
  };
  return {
    ...group,
    metadata: {
      ...group.metadata,
      customData: {
        ...(group.metadata.customData ?? {}),
        [SVGE_PAGE_OPTIONS_KEY]: next,
      },
    },
  };
}

// ── Validation helpers ─────────────────────────────────────────────

function isValidPageBackground(value: unknown): value is PageBackground {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { kind?: unknown; color?: unknown; href?: unknown };
  switch (v.kind) {
    case 'transparent':
      return true;
    case 'solid':
      return typeof v.color === 'string' && v.color.length > 0;
    case 'image':
      return typeof v.href === 'string' && v.href.length > 0;
    default:
      return false;
  }
}

function isValidPageMargins(value: unknown): value is PageMargins {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown };
  return (
    isNonNegFinite(v.top) &&
    isNonNegFinite(v.right) &&
    isNonNegFinite(v.bottom) &&
    isNonNegFinite(v.left)
  );
}

function isValidPageFormat(value: unknown): value is PageFormat {
  return (
    value === 'a4' ||
    value === 'a5' ||
    value === 'a3' ||
    value === 'letter' ||
    value === 'legal' ||
    value === 'tabloid' ||
    value === 'square-1080' ||
    value === 'square-1200' ||
    value === 'square-2048' ||
    value === 'custom'
  );
}

function isNonNegFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}
