import { isGroupNode, type SvgNode, type SvgStyle } from 'svg-engine/core';

/**
 * **D-101 — defs id-namespacing (cross-SVG collision fix).**
 *
 * `<defs>` ids (`<linearGradient id="grad">`, `<filter id="f">`, `<clipPath>`,
 * `<symbol>`, …) are **document-global** in SVG. When two independently-authored
 * SVGs are merged into one document (e.g. *File ▸ Import ▸ SVG* placing a second
 * graphic, or the LLM "draw this" flow), both might define `id="grad"`. The
 * browser resolves a `url(#grad)` reference to the **first** match, so the second
 * graphic silently paints with the first's gradient — the long-documented
 * engine-wide limitation.
 *
 * This module fixes it by **renaming, on merge, only the incoming ids that
 * collide** with ids already in the destination document, and rewriting every
 * reference to those renamed ids — both inside the defs fragment (gradient
 * `xlink:href` stop-inheritance, nested `url(#…)`, `<use href>`) and across the
 * imported node tree (`style.fill/stroke/filter/clipPath/mask` `url(#…)`,
 * `symbol-use` `symbolId`). Non-colliding ids are left untouched, so a single
 * import stays byte-stable (no gratuitous churn) — collisions are the only case
 * that changes.
 *
 * **Scope**: only ids *defined in this defs fragment* are candidates. A
 * reference to an id NOT defined here (a dangling `url(#missing)`, or a
 * `symbol-use` pointing at a library master) is left alone — we only rewrite
 * what we own. Node-tree `id`s (UUIDs) and `textPathRef` (which targets a path
 * *node*, not a def) are out of scope.
 */

/** Matches `url(#id)` with optional whitespace; captures the bare id. */
const URL_REF = /url\(\s*#([^)\s"']+)\s*\)/g;

/** SvgStyle fields that can hold a `url(#id)` paint/effect reference. */
const REF_STYLE_FIELDS = ['fill', 'stroke', 'filter', 'clipPath', 'mask'] as const;

/** Replace every `url(#old)` whose id was renamed; others pass through. */
function rewriteUrlRefs(value: string, rename: ReadonlyMap<string, string>): string {
  return value.replace(URL_REF, (whole, id: string) => {
    const next = rename.get(id);
    return next !== undefined ? `url(#${next})` : whole;
  });
}

/**
 * Collect every element `id` defined inside a `<defs>` fragment string.
 * Returns an empty set when the fragment is empty or `DOMParser` is
 * unavailable (non-browser). Best-effort regex fallback if parsing fails.
 */
export function collectDefsIds(defs: string | undefined | null): ReadonlySet<string> {
  const out = new Set<string>();
  if (defs === undefined || defs === null || defs.length === 0) return out;
  if (typeof DOMParser === 'undefined') return collectIdsViaRegex(defs, out);
  const doc = new DOMParser().parseFromString(wrapDefs(defs), 'image/svg+xml');
  if (doc.querySelector('parsererror') !== null) return collectIdsViaRegex(defs, out);
  const defsEl = doc.querySelector('defs');
  if (defsEl === null) return out;
  for (const el of Array.from(defsEl.querySelectorAll('*'))) {
    const id = el.getAttribute('id');
    if (id !== null && id.length > 0) out.add(id);
  }
  return out;
}

/** Result of {@link namespaceCollidingDefs}. */
export interface NamespacedDefs {
  /** The node tree with references to renamed ids rewritten (same ref when none). */
  readonly root: SvgNode;
  /** The defs fragment with colliding ids + their internal refs rewritten. */
  readonly defs: string;
  /** `oldId → newId` for every renamed id (empty when there was no collision). */
  readonly renamed: ReadonlyMap<string, string>;
}

/**
 * **D-101** — namespace the incoming `(root, defs)` so it can be merged into a
 * document that already owns the ids in `taken`, without collision. Only ids in
 * `defs` that are ALSO in `taken` are renamed (to `prefix + id`); every
 * reference to them is rewritten in both the defs fragment and the node tree.
 *
 * Pure: never mutates its inputs. When nothing collides, returns the inputs
 * unchanged (same references) with an empty `renamed` map — so the common
 * single-import path is a no-op.
 *
 * @param root   the imported content (typically a group) whose nodes may
 *               reference defs ids via style `url(#…)` or `symbol-use`.
 * @param defs   the incoming `<defs>` inner fragment (as produced by the importer).
 * @param taken  ids already present in the destination document's defs
 *               (see {@link collectDefsIds}).
 * @param prefix unique-per-merge prefix applied to colliding ids (caller-supplied
 *               so the function stays deterministic / testable).
 */
export function namespaceCollidingDefs(
  root: SvgNode,
  defs: string,
  taken: ReadonlySet<string>,
  prefix: string,
): NamespacedDefs {
  const rename = new Map<string, string>();
  for (const id of collectDefsIds(defs)) {
    if (taken.has(id)) rename.set(id, `${prefix}${id}`);
  }
  if (rename.size === 0) return { root, defs, renamed: rename };
  return {
    root: rewriteNodeRefs(root, rename),
    defs: rewriteDefsString(defs, rename),
    renamed: rename,
  };
}

// ── internals ───────────────────────────────────────────────────────

function wrapDefs(defs: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${defs}</defs></svg>`;
}

/** Rewrite ids + references inside the defs fragment (DOM-based; regex fallback). */
function rewriteDefsString(defs: string, rename: ReadonlyMap<string, string>): string {
  if (typeof DOMParser === 'undefined') return rewriteDefsViaRegex(defs, rename);
  const doc = new DOMParser().parseFromString(wrapDefs(defs), 'image/svg+xml');
  if (doc.querySelector('parsererror') !== null) return rewriteDefsViaRegex(defs, rename);
  const defsEl = doc.querySelector('defs');
  if (defsEl === null) return rewriteDefsViaRegex(defs, rename);
  for (const el of Array.from(defsEl.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === 'id') {
        const next = rename.get(attr.value);
        if (next !== undefined) el.setAttribute(attr.name, next);
        continue;
      }
      if ((name === 'href' || name === 'xlink:href') && attr.value.startsWith('#')) {
        const next = rename.get(attr.value.slice(1));
        if (next !== undefined) {
          el.setAttribute(attr.name, `#${next}`);
          continue;
        }
      }
      if (attr.value.includes('url(#')) {
        const nv = rewriteUrlRefs(attr.value, rename);
        if (nv !== attr.value) el.setAttribute(attr.name, nv);
      }
    }
  }
  return Array.from(defsEl.children)
    .map((c) => c.outerHTML)
    .join('\n');
}

/** Recursively rewrite a node tree's references to renamed defs ids. */
function rewriteNodeRefs(node: SvgNode, rename: ReadonlyMap<string, string>): SvgNode {
  let next: SvgNode = node;

  const style = rewriteStyle(node.style, rename);
  if (style !== node.style) next = { ...next, style };

  if (next.type === 'symbol-use') {
    const renamed = rename.get(next.symbolId);
    if (renamed !== undefined) next = { ...next, symbolId: renamed };
  }

  if (isGroupNode(next)) {
    const group = next;
    const children = group.children.map((c) => rewriteNodeRefs(c, rename));
    if (children.some((c, i) => c !== group.children[i])) next = { ...group, children };
  }
  return next;
}

/** Rewrite `url(#…)` style fields; returns the SAME object when nothing changed. */
function rewriteStyle(style: SvgStyle, rename: ReadonlyMap<string, string>): SvgStyle {
  let next: Record<string, unknown> | null = null;
  for (const field of REF_STYLE_FIELDS) {
    const value = style[field];
    if (typeof value === 'string' && value.includes('url(#')) {
      const nv = rewriteUrlRefs(value, rename);
      if (nv !== value) {
        next ??= { ...style };
        next[field] = nv;
      }
    }
  }
  return next === null ? style : (next as SvgStyle);
}

// ── regex fallbacks (used only when DOMParser is unavailable / parse fails) ──

function collectIdsViaRegex(defs: string, out: Set<string>): ReadonlySet<string> {
  const re = /\sid\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(defs)) !== null) out.add(m[1]!);
  return out;
}

function rewriteDefsViaRegex(defs: string, rename: ReadonlyMap<string, string>): string {
  let out = defs;
  for (const [oldId, newId] of rename) {
    const esc = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`(\\sid\\s*=\\s*")${esc}(")`, 'g'), `$1${newId}$2`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*")#${esc}(")`, 'g'), `$1#${newId}$2`)
      .replace(new RegExp(`url\\(\\s*#${esc}\\s*\\)`, 'g'), `url(#${newId})`);
  }
  return out;
}
