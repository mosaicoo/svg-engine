import { type GroupNode, type SvgNode, type TextNode, walk } from 'svg-engine/core';

/**
 * **PNG export font fidelity.**
 *
 * The PNG exporter rasterizes the serialized SVG by loading it into an
 * `<img src="data:image/svg+xml;…">` and painting onto a `<canvas>`. That
 * image is an **isolated document**: the page's `@font-face` rules and any
 * JS-loaded fonts are NOT visible to it, so text falls back to a system
 * font — diverging from the live canvas (where the web font is applied via
 * CSS). The most affected cases are custom `font-family` and variable fonts
 * (D-053).
 *
 * Fix: before building the data-URI, find the web fonts the document's
 * text actually uses, fetch their bytes, and inline them as
 * `@font-face { src: url(data:font/woff2;base64,…) }` inside a `<style>`
 * in the SVG. Inlining as a **data URI** (not the original cross-origin
 * URL) is also what keeps the canvas un-tainted — a cross-origin font URL
 * would taint the canvas and make `toBlob` throw.
 *
 * **Best-effort by design**: only families that the page declared via a
 * CSS `@font-face` rule are embedded (system families like `Arial` /
 * `sans-serif` have no rule → skipped → rendered with the system font,
 * same as a viewer would). Any failure (cross-origin fetch blocked, 404,
 * unreadable stylesheet) silently skips that face and leaves the rest —
 * export never fails because of fonts.
 *
 * **Known limitation**: fonts registered purely via JS
 * (`new FontFace(...).load()` + `document.fonts.add()`) without a CSS
 * `@font-face` rule are not discoverable here and won't embed.
 */

/** A resolver maps a `font-family` name to ready-to-inline `@font-face` CSS blocks. */
export type FontFaceResolver = (family: string) => Promise<readonly string[]>;

/**
 * Collect the distinct `font-family` tokens referenced by every
 * {@link TextNode} in the tree. CSS family lists (`"Inter, sans-serif"`)
 * are split into individual tokens; surrounding quotes and whitespace are
 * stripped; duplicates are removed case-insensitively (first spelling
 * wins). Pure — no DOM. Order is first-seen for deterministic output.
 */
export function collectUsedFontFamilies(root: GroupNode): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    for (const token of raw.split(',')) {
      const family = stripQuotes(token.trim());
      if (family.length === 0) continue;
      const key = family.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(family);
    }
  };
  walk(root, (n: SvgNode) => {
    if (n.type === 'text') {
      const fam = (n as TextNode).fontFamily;
      if (typeof fam === 'string' && fam.length > 0) add(fam);
    }
  });
  return out;
}

/** Strip a single layer of matching single/double quotes from a CSS token. */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

/**
 * Insert a `<style>` element (carrying the `@font-face` rules) as the
 * first child of the root `<svg>` so it applies to all text below. Pure
 * string op. Returns `svgText` unchanged when it can't find the opening
 * `<svg …>` tag (defensive — never corrupts the payload) or when the CSS
 * is empty.
 */
export function injectStyleIntoSvg(svgText: string, css: string): string {
  if (css.length === 0) return svgText;
  const match = /<svg\b[^>]*>/.exec(svgText);
  if (match === null) return svgText;
  const insertAt = match.index + match[0].length;
  const style = `\n  <style type="text/css">\n${css}\n  </style>`;
  return svgText.slice(0, insertAt) + style + svgText.slice(insertAt);
}

/**
 * Resolve every used family through `resolver` and flatten the resulting
 * `@font-face` blocks into a single CSS string. Failures from individual
 * families are swallowed (best-effort) so one bad font never blocks the
 * rest. Pure relative to `resolver` — unit-testable with a fake resolver.
 */
export async function buildEmbeddedFontCss(
  families: readonly string[],
  resolver: FontFaceResolver,
): Promise<string> {
  const blocks: string[] = [];
  for (const family of families) {
    try {
      const faces = await resolver(family);
      for (const face of faces) {
        if (face.trim().length > 0) blocks.push(face.trim());
      }
    } catch {
      // best-effort — skip this family
    }
  }
  return blocks.join('\n');
}

/**
 * Orchestrator: collect used families, resolve their `@font-face` blocks
 * via `resolver` (defaults to the live-document scanner), and inject them
 * into `svgText`. Returns `svgText` unchanged when there are no custom
 * families, nothing resolves, or we're not in a browser. Never throws.
 */
export async function embedUsedFonts(
  svgText: string,
  root: GroupNode,
  resolver: FontFaceResolver = resolveFontFacesFromDocument,
): Promise<string> {
  try {
    const families = collectUsedFontFamilies(root);
    if (families.length === 0) return svgText;
    const css = await buildEmbeddedFontCss(families, resolver);
    return injectStyleIntoSvg(svgText, css);
  } catch {
    return svgText;
  }
}

// ── Default (DOM) resolver ─────────────────────────────────────────────

/**
 * Default {@link FontFaceResolver}: scan the page's stylesheets for
 * `@font-face` rules whose `font-family` matches `family`, fetch the first
 * usable `url(...)` source of each, and rebuild the rule with the bytes
 * inlined as a `data:` URI. Cross-origin / unreadable stylesheets and
 * failed fetches are skipped. Returns `[]` outside a browser.
 */
export async function resolveFontFacesFromDocument(family: string): Promise<readonly string[]> {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return [];
  const target = family.toLowerCase();
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      // Cross-origin sheets throw on `.cssRules` access — skip them.
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const faceRule = rule as CSSFontFaceRule;
      const ruleFamily = stripQuotes(faceRule.style.getPropertyValue('font-family').trim());
      if (ruleFamily.toLowerCase() !== target) continue;
      const dataUri = await fetchFirstSrcAsDataUri(faceRule.style.getPropertyValue('src'));
      if (dataUri === null) continue;
      out.push(buildFontFaceBlock(ruleFamily, faceRule, dataUri));
    }
  }
  return out;
}

/** Assemble a minimal `@font-face` block, preserving weight/style/stretch when present. */
function buildFontFaceBlock(family: string, rule: CSSFontFaceRule, dataUri: string): string {
  const lines = [`    font-family: '${family.replace(/'/g, "\\'")}';`, `    src: url(${dataUri});`];
  for (const prop of ['font-weight', 'font-style', 'font-stretch', 'unicode-range']) {
    const value = rule.style.getPropertyValue(prop).trim();
    if (value.length > 0) lines.push(`    ${prop}: ${value};`);
  }
  return `  @font-face {\n${lines.join('\n')}\n  }`;
}

/**
 * Parse the first `url(...)` from a `src` descriptor, fetch it, and return
 * a `data:` URI (mime guessed from the extension). Returns `null` on any
 * failure. Data-URI inlining is what keeps the rasterizing canvas
 * un-tainted (a remote cross-origin URL would not).
 */
async function fetchFirstSrcAsDataUri(src: string): Promise<string | null> {
  const urlMatch = /url\(\s*(['"]?)([^'")]+)\1\s*\)/.exec(src);
  if (urlMatch === null) return null;
  const url = urlMatch[2]!.trim();
  if (url.startsWith('data:')) return url; // already inlined
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:${mimeForFontUrl(url)};base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return null;
  }
}

function mimeForFontUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.woff2')) return 'font/woff2';
  if (lower.includes('.woff')) return 'font/woff';
  if (lower.includes('.otf')) return 'font/otf';
  if (lower.includes('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
