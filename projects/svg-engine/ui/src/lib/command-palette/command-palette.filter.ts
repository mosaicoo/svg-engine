/**
 * **Command Palette — pure search/ranking core.**
 *
 * Extracted from the dialog component so the matching + ordering logic is
 * unit-testable without Angular / DOM. The dialog feeds in lightweight
 * descriptors ({@link PaletteCommandLike}) built from the
 * `MenuContributionRegistry`, and gets back the filtered list in
 * relevance order.
 *
 * **Ranking** (highest first) — a deliberately simple, predictable scale
 * (no external fuzzy-search dep, no NLU): exact label > label prefix >
 * word-boundary prefix > label substring > substring anywhere
 * (group/keywords) > subsequence. Ties keep the input order (stable),
 * which preserves the registry's `order` grouping.
 */

/** Minimal shape the ranking needs — the dialog maps menu entries to this. */
export interface PaletteCommandLike {
  /** Primary text shown + matched first (the menu item label). */
  readonly label: string;
  /** Human group name (e.g. "File", "Edit") — searchable, lower weight. */
  readonly group?: string;
  /** Extra search text (tooltip / shortcut hint) — searchable, lowest weight. */
  readonly keywords?: string;
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 800;
const SCORE_WORD_PREFIX = 600;
const SCORE_LABEL_SUBSTR = 400;
const SCORE_HAYSTACK_SUBSTR = 200;
const SCORE_SUBSEQUENCE = 100;

/**
 * Relevance score for `item` against `query`, or `null` when it doesn't
 * match at all. An empty/whitespace query scores `0` for everything
 * (the dialog then shows the full list in registry order).
 */
export function scorePaletteCommand(query: string, item: PaletteCommandLike): number | null {
  const q = query.trim().toLowerCase();
  if (q === '') return 0;

  const label = item.label.toLowerCase();
  if (label === q) return SCORE_EXACT;
  if (label.startsWith(q)) return SCORE_PREFIX;
  if (anyWordStartsWith(label, q)) return SCORE_WORD_PREFIX;
  if (label.includes(q)) return SCORE_LABEL_SUBSTR;

  const haystack = `${label} ${item.group ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  if (haystack.includes(q)) return SCORE_HAYSTACK_SUBSTR;
  if (isSubsequence(haystack, q)) return SCORE_SUBSEQUENCE;

  return null;
}

/**
 * Filter + rank `items` by `query`. Empty query → all items in their
 * original order (so the palette opens showing every command grouped as
 * the registry ordered them). Stable: equal scores keep input order.
 */
export function filterPaletteCommands<T extends PaletteCommandLike>(
  items: readonly T[],
  query: string,
): T[] {
  if (query.trim() === '') return [...items];
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = scorePaletteCommand(query, item);
    if (score !== null) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.item);
}

/** True when any whitespace/punctuation-delimited token of `text` starts with `q`. */
function anyWordStartsWith(text: string, q: string): boolean {
  for (const token of text.split(/[^a-z0-9]+/i)) {
    if (token.length > 0 && token.startsWith(q)) return true;
  }
  return false;
}

/** Classic two-pointer subsequence test — every char of `q` appears in order in `text`. */
function isSubsequence(text: string, q: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

/**
 * Friendly group label for a canonical `MENU_SLOT` id (e.g. `menu.file`
 * → `File`). Unknown slots fall back to a Title-Cased last segment
 * (`toolbar.main` → `Main`), so plugin-invented slots still read sensibly.
 * Pure — kept here (not the dialog) so it's covered by the filter spec.
 */
export function humanizeMenuSlot(slot: string): string {
  const known: Record<string, string> = {
    'menu.file': 'File',
    'menu.edit': 'Edit',
    'menu.view': 'View',
    'menu.insert': 'Insert',
    'menu.object': 'Object',
    'menu.path': 'Path',
    'menu.tools': 'Tools',
    'menu.window': 'Window',
    'menu.help': 'Help',
  };
  const hit = known[slot];
  if (hit !== undefined) return hit;
  const last = slot.split('.').pop() ?? slot;
  return last.length === 0 ? slot : last.charAt(0).toUpperCase() + last.slice(1);
}
