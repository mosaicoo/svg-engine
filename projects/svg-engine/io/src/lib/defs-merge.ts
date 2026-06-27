/**
 * **D-097 — merge two `<defs>` fragments by top-level id.**
 *
 * A `<defs>` fragment is the literal inner XML of a `<defs>` block: zero
 * or more top-level reusable elements (`<linearGradient>`, `<radialGradient>`,
 * `<filter>`, `<pattern>`, `<clipPath>`, …), each typically carrying an `id`
 * that shapes reference via `fill="url(#id)"`.
 *
 * Merging is needed whenever imported content (e.g. replacing/editing a Smart
 * Object's contents, D-097) brings its own defs that must join the document's
 * shared defs so the references keep resolving. Naive string concatenation
 * would duplicate definitions every time the same SVG is re-imported/edited;
 * this dedups by id:
 *
 * - **Existing** fragment is kept verbatim (it owns its ids).
 * - From **incoming**, each top-level element is appended ONLY when its `id`
 *   is not already present in existing. Id-less elements are always appended.
 *
 * Returns the original `existing` string (reference-preserving) when there is
 * nothing new to add, so callers can cheaply skip a state write. Best-effort:
 * if parsing is unavailable/fails (non-DOM env, malformed fragment) it falls
 * back to plain concatenation rather than throwing.
 *
 * **Id collisions across SVGs**: ids are document-global in SVG, so two
 * unrelated SVGs that both define `id="grad"` would clash — and because this
 * function dedups by id, the FIRST (existing) definition wins and the incoming
 * one is dropped. The import pipeline guards against that by running
 * {@link import('./defs-namespace').namespaceCollidingDefs} (D-101) BEFORE this
 * merge, renaming the incoming colliding ids + every reference so both survive.
 * `mergeDefsFragments` on its own does NOT namespace — it only dedups by id.
 */
export function mergeDefsFragments(
  existing: string | undefined,
  incoming: string | undefined,
): string {
  const add = (incoming ?? '').trim();
  if (add.length === 0) return existing ?? '';
  const base = (existing ?? '').trim();
  if (base.length === 0) return add;

  const existingIds = collectTopLevelIds(base);
  const incomingEls = topLevelElements(add);
  // Parsing failed (no DOM / malformed) → fall back to naive concat so the
  // references at least have a chance to resolve.
  if (incomingEls === null) return `${base}\n${add}`;

  const additions: string[] = [];
  for (const el of incomingEls) {
    const id = el.getAttribute('id');
    if (id !== null && id.length > 0 && existingIds.has(id)) continue;
    additions.push(el.outerHTML);
  }
  if (additions.length === 0) return existing ?? '';
  return `${base}\n${additions.join('\n')}`;
}

/** Parse a defs fragment's top-level elements; `null` when DOM is unavailable or parse fails. */
function topLevelElements(fragment: string): readonly Element[] | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`,
      'image/svg+xml',
    );
    const root = doc.documentElement;
    if (root === null || root.getElementsByTagName('parsererror').length > 0) return null;
    return Array.from(root.children);
  } catch {
    return null;
  }
}

/** Collect the `id`s of a fragment's top-level elements (empty set on parse failure). */
function collectTopLevelIds(fragment: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const els = topLevelElements(fragment);
  if (els === null) return ids;
  for (const el of els) {
    const id = el.getAttribute('id');
    if (id !== null && id.length > 0) ids.add(id);
  }
  return ids;
}
