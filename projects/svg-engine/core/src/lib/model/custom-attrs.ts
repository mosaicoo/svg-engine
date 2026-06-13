import type { SvgNode } from './svg-node';

/**
 * **D-089 — Custom `data-*` attributes.**
 *
 * Lets the user (or a plugin/script) attach arbitrary key/value properties
 * to any {@link SvgNode}. They round-trip to the exported SVG as standard
 * **`data-*`** attributes (`data-<name>="<value>"`) — valid in SVG/HTML and
 * silently preserved by Inkscape / Illustrator / Figma — and the importer
 * reads them back.
 *
 * **Model storage**: a `Record<string, string>` kept under
 * `metadata.customData[SVGE_CUSTOM_ATTRS_KEY]`. The keys are the attribute
 * names WITHOUT the `data-` prefix (e.g. `{ sku: '123' }` ⇄ `data-sku="123"`).
 * Distinct from the engine's own `data-svge-*` round-trip attributes (page /
 * layer / smart-object / animation flags) — those keep their dedicated
 * `customData` slots and are NEVER exposed here.
 *
 * **Why a metadata sub-key (not top-level `customData`)**: keeps user
 * attributes isolated from engine-internal flags, so enumerating them for
 * export/UI is trivial and collisions are impossible.
 *
 * All helpers are **pure** (no mutation; structural sharing) and drop the
 * key/`customData` entirely when empty so node equality round-trips cleanly.
 */

/** `customData` sub-key under which user custom attributes live. */
export const SVGE_CUSTOM_ATTRS_KEY = 'svgeCustomAttrs' as const;

/** Map of attribute NAME (without the `data-` prefix) → string value. */
export type CustomAttrs = Readonly<Record<string, string>>;

/** Prefix every custom attribute carries in the exported SVG. */
export const CUSTOM_ATTR_DATA_PREFIX = 'data-';

/**
 * Reserved sub-prefix the engine uses for its OWN round-trip attributes
 * (`data-svge-*`). User attribute names may not be `svge` or start with
 * `svge-`, so a custom property can never clobber an engine attribute.
 */
const RESERVED_NAME_PREFIX = 'svge';

/**
 * A valid custom-attribute name = a safe `data-*` suffix: starts with a
 * lowercase letter, then lowercase letters / digits / hyphens. Lowercase-
 * only mirrors the HTML `data-*` convention (case is folded there) and
 * keeps SVG (XML, case-sensitive) output predictable.
 */
const VALID_NAME_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Is `name` a valid custom-attribute name? Rejects empties, invalid chars,
 * and the engine-reserved `svge` / `svge-*` prefixes.
 */
export function isValidCustomAttrName(name: string): boolean {
  if (typeof name !== 'string' || !VALID_NAME_RE.test(name)) return false;
  if (name === RESERVED_NAME_PREFIX || name.startsWith(`${RESERVED_NAME_PREFIX}-`)) return false;
  return true;
}

/** `'sku'` → `'data-sku'`. */
export function customAttrToDataName(name: string): string {
  return `${CUSTOM_ATTR_DATA_PREFIX}${name}`;
}

/**
 * `'data-sku'` → `'sku'`, or `null` when `attr` is not a user custom
 * attribute (missing `data-` prefix, or a reserved `data-svge-*` name).
 */
export function dataNameToCustomAttr(attr: string): string | null {
  if (!attr.startsWith(CUSTOM_ATTR_DATA_PREFIX)) return null;
  const name = attr.slice(CUSTOM_ATTR_DATA_PREFIX.length);
  return isValidCustomAttrName(name) ? name : null;
}

/**
 * Read a node's custom attributes (empty object when none). Defensive:
 * silently drops entries with non-string values or invalid names (e.g. a
 * hand-edited AutoSave blob).
 */
export function readCustomAttrs(node: SvgNode): CustomAttrs {
  const raw = node.metadata.customData?.[SVGE_CUSTOM_ATTRS_KEY];
  if (raw === undefined || raw === null || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && isValidCustomAttrName(k)) out[k] = v;
  }
  return out;
}

/** Does `node` carry at least one custom attribute? */
export function hasCustomAttrs(node: SvgNode): boolean {
  return Object.keys(readCustomAttrs(node)).length > 0;
}

/**
 * Pure setter: replace the WHOLE custom-attrs map. Invalid names / non-string
 * values are dropped. When the resulting map is empty, the key (and an
 * otherwise-empty `customData`) is removed so equality round-trips cleanly.
 */
export function withCustomAttrs(node: SvgNode, attrs: CustomAttrs): SvgNode {
  const entries = Object.entries(attrs).filter(
    ([k, v]) => isValidCustomAttrName(k) && typeof v === 'string',
  );
  const nextCd: Record<string, unknown> = { ...(node.metadata.customData ?? {}) };
  if (entries.length === 0) delete nextCd[SVGE_CUSTOM_ATTRS_KEY];
  else nextCd[SVGE_CUSTOM_ATTRS_KEY] = Object.fromEntries(entries);
  const cleanedCd = Object.keys(nextCd).length > 0 ? nextCd : undefined;
  return { ...node, metadata: { ...node.metadata, customData: cleanedCd } } as SvgNode;
}

/** Set/update a single attribute. Returns the node unchanged on invalid name. */
export function setCustomAttr(node: SvgNode, name: string, value: string): SvgNode {
  if (!isValidCustomAttrName(name)) return node;
  return withCustomAttrs(node, { ...readCustomAttrs(node), [name]: value });
}

/** Remove a single attribute. No-op (same reference shape) when absent. */
export function removeCustomAttr(node: SvgNode, name: string): SvgNode {
  const current = readCustomAttrs(node);
  if (!(name in current)) return node;
  const next: Record<string, string> = { ...current };
  delete next[name];
  return withCustomAttrs(node, next);
}

/**
 * Rename a single attribute, preserving its value and position-independent
 * identity. No-op when `from` is absent, `to` is invalid, or `to` already
 * exists (avoids silently overwriting another attribute).
 */
export function renameCustomAttr(node: SvgNode, from: string, to: string): SvgNode {
  const current = readCustomAttrs(node);
  if (!(from in current) || !isValidCustomAttrName(to) || to in current) return node;
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) next[k === from ? to : k] = v;
  return withCustomAttrs(node, next);
}
