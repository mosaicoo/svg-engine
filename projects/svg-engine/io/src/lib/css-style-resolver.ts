/**
 * **D-112 — CSS class / `<style>` stylesheet resolution.**
 *
 * Many real-world SVGs (CorelDRAW, Adobe Illustrator, Inkscape) paint
 * their shapes through CSS *classes* defined in a document `<style>`
 * block rather than through inline `fill=` / `style=` attributes:
 *
 * ```svg
 * <defs><style type="text/css"><![CDATA[
 *   .fil0 { fill: #4E6E80 }
 *   .fil1 { fill: none }
 * ]]></style></defs>
 * <path class="fil0" d="..."/>
 * ```
 *
 * Before D-112 the importer ignored both `class` and the `<style>`
 * sheet, so every such shape imported with an *undefined* fill and
 * rendered as the SVG default (black) — the file looked "empty" on a
 * dark canvas. This module parses the author stylesheet into a small,
 * specificity-aware rule set and resolves the winning declarations for
 * any element, honouring the CSS cascade.
 *
 * **Scope (intentionally minimal, dependency-free).** Flat rules with
 * selector lists and simple/compound selectors (type, `.class`, `#id`,
 * `*`, and anything the platform's {@link Element.matches} understands).
 * At-rules (`@media`, `@font-face`, `@keyframes`, ...) are skipped — the
 * static art SVGs this targets essentially never gate paint behind them,
 * and resolving media conditions is out of scope. Selector *matching* is
 * delegated to the platform (`Element.matches`) so descendant/compound
 * selectors resolve correctly; only the cascade ordering (specificity →
 * source order) is computed here.
 *
 * **Pure**: never mutates the input string. The importer flattens the
 * resolved declarations onto its throwaway parser DOM (see
 * `applyStylesheets` in `svg-importer.ts`).
 */

/** One parsed CSS rule: a single selector plus its declaration block. */
interface ParsedRule {
  /** A single, comma-split selector (e.g. `path.fil0`). */
  readonly selector: string;
  /** Declarations from this rule's block, prop (lowercased) → value. */
  readonly declarations: ReadonlyMap<string, string>;
  /** CSS specificity, packed as `a*1e6 + b*1e3 + c` for cheap compare. */
  readonly specificity: number;
  /** Source order — later rules win ties at equal specificity. */
  readonly order: number;
}

/**
 * Accumulates the rules from one or more `<style>` blocks and resolves
 * the winning declarations for a given element per the CSS cascade.
 */
export class CssStyleSheet {
  private readonly rules: ParsedRule[] = [];
  private nextOrder = 0;

  /** True when no usable rule was parsed (lets callers skip the pre-pass). */
  get isEmpty(): boolean {
    return this.rules.length === 0;
  }

  /**
   * Parse one `<style>` block's CSS text and append its rules. Safe to
   * call repeatedly — multiple `<style>` elements accumulate in document
   * order so the cascade's source-order tiebreak stays correct.
   */
  addCss(cssText: string): void {
    const clean = stripComments(cssText);
    for (const block of topLevelBlocks(clean)) {
      const declarations = parseDeclarations(block.body);
      if (declarations.size === 0) continue;
      for (const raw of splitSelectorList(block.prelude)) {
        const selector = raw.trim();
        if (selector.length === 0) continue;
        this.rules.push({
          selector,
          declarations,
          specificity: specificityOf(selector),
          order: this.nextOrder++,
        });
      }
    }
  }

  /**
   * Resolve the winning declarations for `el` across every matching
   * rule, applying the cascade: ascending specificity, then source
   * order (later wins). Returns prop → value, empty when nothing
   * matches. Matching is delegated to {@link Element.matches}; an
   * invalid/unsupported selector is treated as a non-match rather than
   * throwing the whole import.
   */
  resolve(el: Element): Map<string, string> {
    const winning = new Map<string, string>();
    const matched = this.rules
      .filter((rule) => matchesSelector(el, rule.selector))
      .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    for (const rule of matched) {
      for (const [prop, value] of rule.declarations) winning.set(prop, value);
    }
    return winning;
  }
}

/** Strip `/* ... *\/` comments before any structural parsing. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** A top-level `prelude { body }` block (selector list + declarations). */
interface RuleBlock {
  readonly prelude: string;
  readonly body: string;
}

/**
 * Brace-aware splitter: yields each depth-0 `prelude { body }` block.
 * At-rules (prelude starting with `@`) are skipped wholesale — their
 * balanced body (including any nested rules, e.g. inside `@media`) is
 * consumed and discarded.
 */
function topLevelBlocks(css: string): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  let prelude = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const ch = css[i];
    if (ch === '{') {
      // Consume the balanced body for this block.
      let depth = 1;
      let j = i + 1;
      const start = j;
      while (j < n && depth > 0) {
        const c = css[j];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        if (depth === 0) break;
        j++;
      }
      const body = css.slice(start, j);
      const pre = prelude.trim();
      // Skip at-rules (@media/@font-face/@supports/@keyframes/...). Their
      // paint-affecting use in static art SVGs is negligible.
      if (pre.length > 0 && !pre.startsWith('@')) {
        blocks.push({ prelude: pre, body });
      }
      prelude = '';
      i = j + 1; // step past the closing '}'
      continue;
    }
    prelude += ch;
    i++;
  }
  return blocks;
}

/**
 * Split a selector list on top-level commas, ignoring commas nested in
 * functional pseudo-classes (`:not(a, b)`).
 */
function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of prelude) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim().length > 0) out.push(buf);
  return out;
}

/** Parse a declaration block body (`prop: value; ...`) into a map. */
function parseDeclarations(body: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const part of body.split(';')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    let value = part.slice(idx + 1).trim();
    if (prop.length === 0 || value.length === 0) continue;
    // Drop a trailing !important — we don't model declaration priority.
    // (Author rules already win over presentation attributes via the
    // importer's flatten pre-pass, which is the only priority that matters
    // here.)
    value = value.replace(/\s*!\s*important\s*$/i, '').trim();
    if (value.length === 0) continue;
    decls.set(prop, value);
  }
  return decls;
}

/** Platform selector match, hardened against invalid selectors. */
function matchesSelector(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/**
 * Approximate CSS specificity, packed into a single sortable number
 * (`a*1e6 + b*1e3 + c`). Exact per-spec computation isn't needed: in the
 * author stylesheets this targets, conflicts between matching rules are
 * rare, and equal-specificity ties fall back to source order. The
 * approximation counts ids (a), classes/attributes/pseudo-classes (b),
 * and types/pseudo-elements (c).
 */
function specificityOf(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classesAttrsPseudos =
    (selector.match(/\.[\w-]+/g) ?? []).length + // .class
    (selector.match(/\[[^\]]*\]/g) ?? []).length + // [attr]
    (selector.match(/(?<!:):[\w-]+/g) ?? []).length; // :pseudo-class (not ::)
  const types =
    (selector.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length + // type
    (selector.match(/::[\w-]+/g) ?? []).length; // ::pseudo-element
  return ids * 1_000_000 + classesAttrsPseudos * 1_000 + types;
}
