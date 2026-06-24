import {
  ANIMATION_KEY,
  bbox,
  type BoundingBox,
  createEllipse,
  createGroup,
  createImage,
  createLine,
  createPath,
  createPolygon,
  createPolyline,
  createRect,
  createSymbolUse,
  createText,
  type CustomAttrs,
  dataNameToCustomAttr,
  generateNodeId,
  isAnimationDoc,
  type NodeFactoryOptions,
  type NodeId,
  parseTransformAttr,
  SVGE_CUSTOM_ATTRS_KEY,
  SVGE_KIND_KEY,
  SVGE_KIND_LAYER,
  SVGE_KIND_PAGE,
  SVGE_KIND_SMART_OBJECT,
  SVGE_PAGE_NAME_KEY,
  SVGE_PAGE_OPTIONS_KEY,
  SVGE_PAGE_VIEWBOX_KEY,
  type SvgDocument,
  type SvgNode,
  type SvgStyle,
  type TextRun,
} from 'svg-engine/core';
import { CssStyleSheet } from './css-style-resolver';
import type { Importer, ImportResult } from './io-types';

/**
 * Built-in SVG importer (Fase 5-IO). Parses SVG XML text into a
 * {@link SvgDocument} that the editor's model understands.
 *
 * **Sanitization**: the importer never executes any payload from the
 * input. Specifically:
 *
 * - `<script>` elements (anywhere in the tree) are dropped + warned
 * - `on*` event-handler attributes (`onclick`, `onload`, ...) are
 *   dropped + warned
 * - `xlink:href` / `href` values starting with `javascript:` are
 *   dropped + warned. `data:` URIs are allowed (caller can validate
 *   externally if they want stricter policy)
 * - External entity references (`<!ENTITY>` / `&xxe;`) are not
 *   processed by the browser's DOMParser when called via `parseFromString`
 *   with `'image/svg+xml'`, so XXE is structurally precluded
 *
 * **Unsupported elements** (gradients, filters, masks, clipPaths,
 * markers, defs, use, switch, foreignObject, ...) are skipped with
 * a single per-tag warning so the result is always a "best-effort"
 * approximation — never a hard fail on a partially-supported file.
 *
 * **viewBox**: extracted from the root `<svg>`. If absent, falls back
 * to `width`/`height` attributes; if those are missing too, defaults
 * to `0 0 800 600`.
 *
 * **Pure**: no DOM mutation outside the throwaway parser document, no
 * service injection. Safe to call from a Web Worker (if/when we add
 * that path).
 */
export const svgImporter: Importer = {
  id: 'svge.builtin.importer.svg',
  name: 'SVG',
  mediaTypes: ['image/svg+xml'],
  extensions: ['svg'],

  import(text: string): ImportResult {
    if (typeof DOMParser === 'undefined') {
      return { ok: false, error: 'svgImporter requires a browser DOMParser' };
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError !== null) {
      return { ok: false, error: `Malformed SVG: ${parseError.textContent ?? 'parse error'}` };
    }
    const svgRoot = doc.documentElement;
    if (svgRoot === null || svgRoot.tagName.toLowerCase() !== 'svg') {
      return { ok: false, error: 'Root element must be <svg>' };
    }
    const warnings: string[] = [];
    const unsupportedTags = new Set<string>();
    const viewBox = parseViewBoxAttr(svgRoot, warnings);
    // **D-112 — Resolve CSS class / <style> paint.** Many editors
    // (CorelDRAW, Illustrator, Inkscape) paint shapes through class
    // selectors defined in a document <style> block instead of inline
    // fill=/style=. Flatten the winning declarations onto each renderable
    // element as presentation attributes BEFORE traversal, so the existing
    // attribute-based parseStyle picks them up. Runs before defs extraction
    // (which serializes <defs> as-is) and only touches renderable elements
    // outside <defs>, so the preserved defs fragment stays byte-faithful.
    applyStylesheets(svgRoot);
    // Capture <defs> BEFORE walking children so the renderable tree
    // doesn't emit an "Unsupported <defs>" warning. We preserve the
    // sanitized inner content as an opaque XML fragment on the
    // document — exporter re-emits it, renderer injects it. Nodes
    // that reference defs via `url(#id)` keep their reference intact.
    const defsFragment = extractDefsFragment(svgRoot, warnings);
    const rootChildren = parseChildren(svgRoot, warnings, unsupportedTags);
    // Convert the collected unsupported tags into ONE warning each
    // (not per-occurrence — avoids flooding for documents with many
    // gradients/filters).
    for (const tag of unsupportedTags) {
      warnings.push(`Unsupported element <${tag}> skipped`);
    }
    // **D-102** — the root group mirrors the `<svg>` element, so its style must
    // come from the `<svg>`'s own presentation (usually empty), NOT from
    // `createGroup`'s `DEFAULT_STYLE` fallback. That fallback injects
    // `stroke:#333333` + `fill:#cccccc` (editor demo defaults); SVG stroke is
    // *inherited*, so every imported child without its own stroke picked up a
    // spurious dark border — a black outline absent in the source / other
    // renderers (reported on CorelDRAW exports where shapes are fill-only).
    const rootStyle = parseStyle(svgRoot);
    const document: SvgDocument =
      defsFragment.length > 0
        ? {
            id: generateNodeId(),
            viewBox,
            root: createGroup(rootChildren, { style: rootStyle }),
            defs: defsFragment,
          }
        : { id: generateNodeId(), viewBox, root: createGroup(rootChildren, { style: rootStyle }) };
    return { ok: true, document, warnings };
  },
};

/**
 * **D-112** — Renderable shape tags that `parseElement` actually models.
 * The CSS flatten pre-pass writes resolved declarations only onto these,
 * so it never mutates `<defs>`, `<style>`, gradients, stops, clipPaths,
 * or other non-shape elements that the importer serializes verbatim.
 * `<g>` is included on purpose: a `fill` on a group is natively inherited
 * by its descendant shapes, matching how the source CSS painted them.
 */
const FLATTENABLE_TARGET_TAGS: ReadonlySet<string> = new Set([
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'text',
  'image',
]);

/**
 * **D-112** — CSS properties the model understands AND that are valid
 * SVG presentation-attribute names. The flatten pre-pass only writes
 * these: arbitrary CSS props (e.g. custom properties like `--x`) are not
 * valid XML attribute names and would throw on `setAttribute`, and props
 * the model doesn't read would be dropped anyway.
 */
const FLATTENABLE_STYLE_PROPS: ReadonlySet<string> = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'visibility',
  'filter',
]);

/**
 * **D-112** — Parse every `<style>` block in the document into a
 * {@link CssStyleSheet} and flatten each element's winning declarations
 * onto it as presentation attributes. Mutates ONLY the throwaway parser
 * document (never the caller's input). No-op when the document has no
 * usable rules.
 *
 * Cascade correctness: presentation attributes are what `parseStyle`
 * reads FIRST (lowest priority) and an element's own inline `style=` is
 * applied LAST (highest). Writing the resolved author-rule value as a
 * presentation attribute therefore lands it exactly where the cascade
 * wants it — above the element's original presentation attributes (which
 * it overwrites) and below its inline `style=` (which still wins). Only
 * renderable elements outside `<defs>` are touched, so the preserved defs
 * fragment is unaffected.
 */
function applyStylesheets(svgRoot: Element): void {
  const styleEls = svgRoot.querySelectorAll('style');
  if (styleEls.length === 0) return;
  const sheet = new CssStyleSheet();
  for (const styleEl of Array.from(styleEls)) {
    sheet.addCss(styleEl.textContent ?? '');
  }
  if (sheet.isEmpty) return;
  for (const el of Array.from(svgRoot.querySelectorAll('*'))) {
    if (!FLATTENABLE_TARGET_TAGS.has(el.tagName.toLowerCase())) continue;
    // Never mutate elements inside <defs> — they're serialized verbatim
    // into the preserved defs fragment.
    if (el.closest('defs') !== null) continue;
    const decls = sheet.resolve(el);
    if (decls.size === 0) continue;
    for (const [prop, value] of decls) {
      if (!FLATTENABLE_STYLE_PROPS.has(prop)) continue;
      el.setAttribute(prop, value);
    }
  }
}

/**
 * Tags emitted by editors (Inkscape, Sodipodi, Adobe Illustrator
 * metadata blocks) that carry no visual contribution to the SVG output
 * and are not worth warning about. Dropped silently so the warning
 * list stays focused on things that might actually affect rendering.
 */
const SILENTLY_IGNORED_TAGS: ReadonlySet<string> = new Set([
  // Document metadata — informational only, never affects render
  'metadata',
  'title',
  'desc',
  // SVG comments / processing — DOMParser already filters most of these
  // but listed for clarity. Inkscape-namespaced editor state:
  'sodipodi:namedview',
  'inkscape:path-effect',
  'inkscape:perspective',
]);

/**
 * Tags treated as "known-but-not-modeled" reusable definitions. When
 * encountered as direct children of `<svg>` (outside a `<defs>` block),
 * they're rolled into the document's `defs` fragment instead of
 * emitting an "Unsupported" warning — the renderer puts them in a
 * proper `<defs>` block at runtime so references resolve.
 */
const REUSABLE_DEF_TAGS: ReadonlySet<string> = new Set([
  'lineargradient',
  'radialgradient',
  'pattern',
  'clippath',
  'mask',
  'filter',
  'marker',
  'symbol',
]);

// ── Element walkers ────────────────────────────────────────────────

function parseChildren(
  parent: Element,
  warnings: string[],
  unsupportedTags: Set<string>,
): readonly SvgNode[] {
  const out: SvgNode[] = [];
  for (const child of Array.from(parent.children)) {
    const node = parseElement(child, warnings, unsupportedTags);
    if (node !== null) out.push(node);
  }
  return out;
}

/**
 * **D-072 follow-up — Parse authored name into `metadata.name`.**
 *
 * Recognizes (in priority order):
 *
 *  1. **Direct `<title>` child** — W3C SVG spec mechanism, what this
 *     editor emits since D-072+. The text content of a `<title>`
 *     element that's a DIRECT child of the node. We restrict to
 *     direct children (not deep descendants) so a leaf `<text>`
 *     containing its own `<title>` doesn't accidentally claim the
 *     name from a `<title>` inside a nested `<g>`.
 *  2. `inkscape:label` — Inkscape convention. Preserves the original
 *     Unicode label verbatim. Kept as fallback for files authored in
 *     Inkscape OR by an earlier version of this editor (D-072+
 *     hybrid iteration).
 *  3. `data-svge-name` — short-lived intermediate from an earlier
 *     iteration of D-072+. Kept as input for forward-compat with
 *     any file produced during that window.
 *
 * Does NOT de-slugify the `id` attribute as a fallback because the
 * `id` may have been authored by the user (or by another tool) with
 * no semantic relation to a human name — guessing wrong would mint a
 * fake "name" that the user never typed. Better to fall back to the
 * panel's type-based default ("rect 348cb5") than to invent one.
 *
 * Returns `undefined` when no name signal is present; the caller
 * passes that straight to the factory which uses the standard empty
 * metadata default.
 */
/**
 * **D-053/D-069 follow-up — Multi-line tspan import.** Mirror of the
 * exporter's tspan emission: when a `<text>` element has direct
 * `<tspan>` children, each tspan represents one rendered line and the
 * lines join with `\n` to reconstruct {@link TextNode.content}.
 *
 * - **Tspan path** (round-trip from our own exporter, or from
 *   Inkscape/Illustrator/Figma which all emit multi-line text the
 *   same way): concatenate `tspan.textContent` separated by `\n`.
 *   `<title>` / `<desc>` direct children are skipped — those carry
 *   metadata (authored name via D-072), not user-visible text.
 * - **Plain text path** (legacy / 3rd-party files / files exported by
 *   this editor before this fix): fall back to `el.textContent`
 *   verbatim. Matches the pre-existing single-string semantics so we
 *   don't regress simple `<text>foo</text>` imports.
 *
 * **Why a dedicated helper** (vs inlining in `case 'text'`): the
 * tspan-aware logic needs DOM-aware filtering (skip `<title>` /
 * `<desc>` / non-tspan elements) which is non-trivial inline. Keeping
 * it factored out also opens the door to future enhancements like
 * preserving per-line `x` overrides or `dy` deltas without growing
 * the createNode switch.
 */
function parseTextContent(el: Element): string {
  const tspans = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'tspan');
  if (tspans.length > 0) {
    return tspans.map((t) => t.textContent ?? '').join('\n');
  }
  return el.textContent ?? '';
}

/**
 * **D-100 — rich text.** Parse a `<text>`'s child `<tspan>`s into styled
 * {@link TextRun}s — but ONLY when they look like inline styled runs, not
 * multi-line "lines". Heuristic:
 * - any `<tspan dy=…>` (vertical offset) → those are LINES → return `null`
 *   so the multi-line path ({@link parseTextContent}, joined by `\n`) wins.
 * - otherwise build one run per tspan; return them only when AT LEAST one
 *   carries a per-run style override (fill / font-* / letter-spacing / …).
 *   A plain unstyled `<tspan>` is indistinguishable from bare text, so we
 *   leave those to `parseTextContent` rather than turning every text node
 *   into rich text.
 *
 * Returns `null` when there are no tspans, when they're lines, or when
 * none carry styling.
 */
function parseTextRuns(el: Element): readonly TextRun[] | null {
  const tspans = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'tspan');
  if (tspans.length === 0) return null;
  if (tspans.some((t) => t.hasAttribute('dy'))) return null; // multi-line, not runs
  const runs = tspans.map((t) => buildTextRun(t));
  const anyStyled = runs.some(
    (r) =>
      r.fill !== undefined ||
      r.fontFamily !== undefined ||
      r.fontSize !== undefined ||
      r.fontWeight !== undefined ||
      r.fontStyle !== undefined ||
      r.textDecoration !== undefined ||
      r.letterSpacing !== undefined ||
      r.fontVariationSettings !== undefined ||
      r.fontFeatureSettings !== undefined,
  );
  return anyStyled ? runs : null;
}

/** Build one {@link TextRun} from a `<tspan>` element (D-100). */
function buildTextRun(t: Element): TextRun {
  return {
    text: t.textContent ?? '',
    fill: attrOrCss(t, 'fill'),
    fontFamily: attrOrCss(t, 'font-family'),
    fontSize: parseLength(attrOrCss(t, 'font-size')),
    fontWeight: parseFontWeight(attrOrCss(t, 'font-weight')),
    fontStyle: enumValue(attrOrCss(t, 'font-style'), ['normal', 'italic'] as const),
    textDecoration: enumValue(attrOrCss(t, 'text-decoration'), [
      'none',
      'underline',
      'line-through',
    ] as const),
    letterSpacing: parseLength(attrOrCss(t, 'letter-spacing')),
    fontVariationSettings: attrOrCss(t, 'font-variation-settings'),
    fontFeatureSettings: attrOrCss(t, 'font-feature-settings'),
  };
}

// ── D-098 — typography + text-on-path import helpers ───────────────

/** Read a single CSS declaration value from an element's inline `style="..."`. */
function inlineStyleValue(el: Element, prop: string): string | undefined {
  const style = el.getAttribute('style');
  if (style === null) return undefined;
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    if (decl.slice(0, idx).trim().toLowerCase() === prop) {
      const v = decl.slice(idx + 1).trim();
      return v.length > 0 ? v : undefined;
    }
  }
  return undefined;
}

/** A value from a presentation attribute OR inline CSS (attribute wins, like the cascade). */
function attrOrCss(el: Element, name: string): string | undefined {
  const attr = el.getAttribute(name);
  if (attr !== null && attr.length > 0) return attr;
  return inlineStyleValue(el, name);
}

/** Parse `font-weight` into the model union (`number | 'normal' | 'bold'`). */
function parseFontWeight(raw: string | undefined): number | 'normal' | 'bold' | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'normal' || v === 'bold') return v;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Restrict a raw value to one of `allowed`, else `undefined`. */
function enumValue<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim() as T;
  return allowed.includes(v) ? v : undefined;
}

/** Parse a numeric CSS/SVG length (drops a trailing unit), or `undefined`. */
function parseLength(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

interface TextPathInfo {
  readonly content: string;
  readonly ref?: NodeId;
  readonly startOffset?: string;
}

/**
 * **D-098** — read a `<text>`'s `<textPath>` child (text-on-path). Returns the
 * path id (from `href`/`xlink:href`, `#` stripped), the `startOffset`, and the
 * textPath's text content. `null` when the `<text>` has no `<textPath>` child.
 */
function parseTextPath(el: Element): TextPathInfo | null {
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() !== 'textpath') continue;
    const href = child.getAttribute('href') ?? child.getAttribute('xlink:href') ?? '';
    const id = href.startsWith('#') ? href.slice(1) : href;
    const startOffset = child.getAttribute('startOffset');
    return {
      content: child.textContent ?? '',
      ref: id.length > 0 ? (id as NodeId) : undefined,
      startOffset: startOffset !== null && startOffset.length > 0 ? startOffset : undefined,
    };
  }
  return null;
}

function parseAuthoredName(el: Element): string | undefined {
  // 1. Direct <title> child — preferred.
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() === 'title') {
      const text = (child.textContent ?? '').trim();
      if (text.length > 0) return text;
    }
  }
  // 2. Inkscape convention.
  const inkscape = el.getAttribute('inkscape:label');
  if (inkscape !== null && inkscape.length > 0) return inkscape;
  // 3. Legacy data-svge-name (D-072+ intermediate iteration).
  const data = el.getAttribute('data-svge-name');
  if (data !== null && data.length > 0) return data;
  return undefined;
}

/**
 * **D-082 F7** — best-effort parse of a `data-svge-animation` attribute value
 * into an {@link import('svg-engine/core').AnimationDoc}. Returns `null` on
 * malformed JSON or a value that doesn't satisfy {@link isAnimationDoc} — the
 * importer never throws on foreign/corrupt input.
 */
function tryParseAnimationDoc(raw: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isAnimationDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Mutable view over {@link NodeFactoryOptions} — used by
 * {@link baseFactoryOpts} so callers can splice extra metadata (e.g.,
 * the `customData.svgeKind` layer flag) into the returned object
 * without spreading.
 */
type MutableFactoryOpts = {
  -readonly [K in keyof NodeFactoryOptions]: NodeFactoryOptions[K];
};

/**
 * Builder for `NodeFactoryOptions` shared by every node type — collects
 * the transform, style, and authored-name metadata in one place so
 * each case in {@link parseElement} stays readable. The returned
 * object is mutable on purpose: the `g` case extends `metadata.customData`
 * with the layer flag in-place.
 */
function baseFactoryOpts(el: Element): MutableFactoryOpts {
  const opts: MutableFactoryOpts = {
    transform: parseTransformAttr(el.getAttribute('transform')),
    style: parseStyle(el),
  };
  const name = parseAuthoredName(el);
  // **D-089 — Custom `data-*` attributes**. Read every user `data-*`
  // attribute (excluding the engine-reserved `data-svge-*` namespace,
  // filtered by `dataNameToCustomAttr`) back into
  // `metadata.customData[SVGE_CUSTOM_ATTRS_KEY]` so they survive the
  // export → re-import round-trip. The `g` case below MERGES (not
  // clobbers) this when it adds its kind/page/animation flags.
  const customAttrs = parseCustomAttrs(el);
  const hasCustom = Object.keys(customAttrs).length > 0;
  if (name !== undefined || hasCustom) {
    opts.metadata = {
      ...(name !== undefined ? { name } : {}),
      ...(hasCustom ? { customData: { [SVGE_CUSTOM_ATTRS_KEY]: customAttrs } } : {}),
    };
  }
  return opts;
}

/**
 * **D-089** — Collect an element's user `data-*` attributes into a
 * {@link CustomAttrs} map (attribute name without the `data-` prefix →
 * value). The engine's own `data-svge-*` round-trip flags are excluded:
 * `dataNameToCustomAttr` returns `null` for the reserved `svge` prefix
 * (and for any non-`data-` / malformed name), so they're skipped here.
 */
function parseCustomAttrs(el: Element): CustomAttrs {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    const name = dataNameToCustomAttr(attr.name);
    if (name !== null) out[name] = attr.value;
  }
  return out;
}

function parseElement(
  el: Element,
  warnings: string[],
  unsupportedTags: Set<string>,
): SvgNode | null {
  const tag = el.tagName.toLowerCase();
  // Sanitization: SKIP <script> entirely (don't even parse children).
  if (tag === 'script') {
    warnings.push(`<script> dropped for safety`);
    return null;
  }
  // Editor-metadata tags (Inkscape/Sodipodi namespace, <title>, <desc>)
  // produce no visual output — drop silently so the warning list isn't
  // noisy with stuff the user can't act on. `<defs>` is handled separately
  // BEFORE this function runs (extractDefsFragment) so won't reach here.
  if (SILENTLY_IGNORED_TAGS.has(tag) || tag === 'defs') {
    return null;
  }
  // Reusable defs that appear as direct siblings of renderable content
  // (rare but happens when authors put a `<linearGradient>` next to a
  // shape without wrapping it in `<defs>`). Skipped here — they were
  // already rolled into `extractDefsFragment` during the outer pass.
  if (REUSABLE_DEF_TAGS.has(tag)) {
    return null;
  }
  // Strip any on* event handlers BEFORE we read the rest of the
  // attributes. They never make it into the model.
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.toLowerCase().startsWith('on')) {
      warnings.push(`Removed event handler "${attr.name}" on <${tag}>`);
      el.removeAttribute(attr.name);
    }
  }
  switch (tag) {
    case 'g': {
      // **D-072 — Logical Layers**. The exporter emits
      // `data-svge-kind="layer"` on layer groups; also honor
      // `inkscape:groupmode="layer"` so files authored in Inkscape
      // import with their layer structure preserved. Both signals
      // collapse to the same in-editor `customData.svgeKind = 'layer'`
      // flag — the UI doesn't care which one was on disk.
      const svgeKind = el.getAttribute('data-svge-kind');
      const inkscapeGroupMode = el.getAttribute('inkscape:groupmode');
      const isLayerGroup = svgeKind === SVGE_KIND_LAYER || inkscapeGroupMode === 'layer';
      // D-074 — Smart Object flag. Single-slot with layer; precedence
      // is irrelevant because the exporter never emits both at once.
      const isSmartObjectGroup = svgeKind === SVGE_KIND_SMART_OBJECT;
      // D-079 / PAGES-D — Page flag + viewBox.
      const isPageGroup = svgeKind === SVGE_KIND_PAGE;
      const opts = baseFactoryOpts(el);
      if (isLayerGroup) {
        // Merge the layer flag into customData WITHOUT clobbering the
        // `name` that `baseFactoryOpts` may have populated from
        // `inkscape:label` / `data-svge-name`, NOR the D-089 custom
        // `data-*` attrs it may have parsed into `customData`.
        opts.metadata = {
          ...(opts.metadata ?? {}),
          customData: {
            ...(opts.metadata?.customData ?? {}),
            [SVGE_KIND_KEY]: SVGE_KIND_LAYER,
          },
        };
      } else if (isSmartObjectGroup) {
        opts.metadata = {
          ...(opts.metadata ?? {}),
          customData: {
            ...(opts.metadata?.customData ?? {}),
            [SVGE_KIND_KEY]: SVGE_KIND_SMART_OBJECT,
          },
        };
      } else if (isPageGroup) {
        // Parse the page viewBox + optional explicit name. Falls back
        // silently when the data-attribute is missing/malformed — the
        // model accepts a page without viewBox (renderer + Inspector
        // both fall back to the document's viewBox).
        const customData: Record<string, unknown> = {
          ...(opts.metadata?.customData ?? {}),
          [SVGE_KIND_KEY]: SVGE_KIND_PAGE,
        };
        const rawVB = el.getAttribute('data-svge-page-viewbox');
        if (rawVB !== null) {
          const parts = rawVB
            .trim()
            .split(/[\s,]+/)
            .map((p) => Number.parseFloat(p));
          if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
            customData[SVGE_PAGE_VIEWBOX_KEY] = {
              x: parts[0]!,
              y: parts[1]!,
              width: parts[2]!,
              height: parts[3]!,
            };
          }
        }
        const rawName = el.getAttribute('data-svge-page-name');
        if (rawName !== null && rawName.length > 0) {
          customData[SVGE_PAGE_NAME_KEY] = rawName;
        }
        // **D-140-fix** — read the page presentation options back
        // (background / margins / orientation / format) so Document
        // Settings survive Save Workspace / Export → re-import. Best-effort:
        // malformed / foreign JSON is ignored; `getPageOptions()` validates
        // and defaults each field defensively on read, so storing the raw
        // parsed object here is safe.
        const rawOpts = el.getAttribute('data-svge-page-options');
        if (rawOpts !== null && rawOpts.length > 0) {
          try {
            const parsed: unknown = JSON.parse(rawOpts);
            if (typeof parsed === 'object' && parsed !== null) {
              customData[SVGE_PAGE_OPTIONS_KEY] = parsed;
            }
          } catch {
            // ignore malformed page options
          }
        }
        opts.metadata = {
          ...(opts.metadata ?? {}),
          customData,
        };
      }
      // **D-082 F7 — Animation Timeline persistence**. Read the page's
      // AnimationDoc back from `data-svge-animation` and MERGE it into
      // customData (additive — independent of the svgeKind branch above, so a
      // 'page' group keeps both its page flag and its animation). Best-effort:
      // malformed/foreign JSON is ignored, never throws.
      const rawAnim = el.getAttribute('data-svge-animation');
      if (rawAnim !== null && rawAnim.length > 0) {
        const parsedAnim = tryParseAnimationDoc(rawAnim);
        if (parsedAnim !== null) {
          opts.metadata = {
            ...(opts.metadata ?? {}),
            customData: {
              ...(opts.metadata?.customData ?? {}),
              [ANIMATION_KEY]: parsedAnim,
            },
          };
        }
      }
      return createGroup(parseChildren(el, warnings, unsupportedTags), opts);
    }
    case 'rect':
      return createRect(
        {
          x: numberAttr(el, 'x', 0, warnings),
          y: numberAttr(el, 'y', 0, warnings),
          width: numberAttr(el, 'width', 0, warnings),
          height: numberAttr(el, 'height', 0, warnings),
          rx: optionalNumberAttr(el, 'rx', warnings),
          ry: optionalNumberAttr(el, 'ry', warnings),
        },
        baseFactoryOpts(el),
      );
    case 'ellipse':
      return createEllipse(
        {
          cx: numberAttr(el, 'cx', 0, warnings),
          cy: numberAttr(el, 'cy', 0, warnings),
          rx: numberAttr(el, 'rx', 0, warnings),
          ry: numberAttr(el, 'ry', 0, warnings),
        },
        baseFactoryOpts(el),
      );
    case 'circle': {
      // SVG <circle r="N"> is the rx=ry=N case of ellipse — fold to
      // ellipse so the model stays small (one shape, not two).
      const r = numberAttr(el, 'r', 0, warnings);
      return createEllipse(
        {
          cx: numberAttr(el, 'cx', 0, warnings),
          cy: numberAttr(el, 'cy', 0, warnings),
          rx: r,
          ry: r,
        },
        baseFactoryOpts(el),
      );
    }
    case 'line':
      return createLine(
        {
          x1: numberAttr(el, 'x1', 0, warnings),
          y1: numberAttr(el, 'y1', 0, warnings),
          x2: numberAttr(el, 'x2', 0, warnings),
          y2: numberAttr(el, 'y2', 0, warnings),
        },
        baseFactoryOpts(el),
      );
    case 'polygon':
      return createPolygon(parsePoints(el.getAttribute('points')), baseFactoryOpts(el));
    case 'polyline':
      return createPolyline(parsePoints(el.getAttribute('points')), baseFactoryOpts(el));
    case 'path':
      return createPath(el.getAttribute('d') ?? '', baseFactoryOpts(el));
    case 'text': {
      // **D-098** — read the full typography surface the model/renderer/
      // exporter already support, closing the import↔export asymmetry.
      // `<textPath>` content + ref take precedence over plain/tspan content.
      const tp = parseTextPath(el);
      // **D-100** — rich text (inline styled tspans). Only when not on a path
      // (text-on-path with per-run styling is out of scope). When runs are
      // detected, `content` is their concatenation (faithful plain-text
      // projection); otherwise fall back to the plain/multi-line reader.
      const runs = tp === null ? parseTextRuns(el) : null;
      const content =
        tp !== null
          ? tp.content
          : runs !== null
            ? runs.map((r) => r.text).join('')
            : parseTextContent(el);
      return createText(
        {
          x: numberAttr(el, 'x', 0, warnings),
          y: numberAttr(el, 'y', 0, warnings),
          content,
          fontSize: optionalNumberAttr(el, 'font-size', warnings),
          fontFamily: attrOrCss(el, 'font-family'),
          fontWeight: parseFontWeight(attrOrCss(el, 'font-weight')),
          fontStyle: enumValue(attrOrCss(el, 'font-style'), ['normal', 'italic'] as const),
          textAnchor: enumValue(attrOrCss(el, 'text-anchor'), ['start', 'middle', 'end'] as const),
          textDecoration: enumValue(attrOrCss(el, 'text-decoration'), [
            'none',
            'underline',
            'line-through',
          ] as const),
          letterSpacing: parseLength(attrOrCss(el, 'letter-spacing')),
          fontVariationSettings: attrOrCss(el, 'font-variation-settings'),
          fontFeatureSettings: attrOrCss(el, 'font-feature-settings'),
          textPathRef: tp?.ref,
          textPathStartOffset: tp?.startOffset,
          runs: runs ?? undefined,
        },
        baseFactoryOpts(el),
      );
    }
    case 'image': {
      const href = sanitizeHref(
        el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '',
        warnings,
        tag,
      );
      return createImage(
        {
          x: numberAttr(el, 'x', 0, warnings),
          y: numberAttr(el, 'y', 0, warnings),
          width: numberAttr(el, 'width', 0, warnings),
          height: numberAttr(el, 'height', 0, warnings),
          href,
          // **D-098** — preserveAspectRatio was emitted by the exporter but
          // dropped on import (round-trip loss). Read it back.
          preserveAspectRatio: el.getAttribute('preserveAspectRatio') ?? undefined,
        },
        baseFactoryOpts(el),
      );
    }
    case 'use': {
      // **D-098** — generic `<use href="#id">` → SymbolUseNode (the deferred
      // importer enhancement promised in SymbolUseNode's JSDoc). The referenced
      // `<symbol>`/def is preserved verbatim in the document `<defs>`
      // (REUSABLE_DEF_TAGS / extractDefsFragment), so the renderer's
      // `<use href="#id">` resolves at paint time. Works for `<use>` pointing
      // at a `<symbol>` or any `<defs>` element by id.
      //
      // **Known limitation**: `<use>` pointing at a *plain sibling shape* by id
      // dangles — the importer regenerates ids on regular nodes, so the
      // authored id the `<use>` references no longer exists after import. (Far
      // rarer than use→symbol; faithful support needs id preservation/remap.)
      const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
      const id = href.startsWith('#') ? href.slice(1) : href;
      if (id.length === 0) {
        warnings.push(`<use> without an href reference dropped`);
        return null;
      }
      return createSymbolUse(
        {
          symbolId: id,
          x: numberAttr(el, 'x', 0, warnings),
          y: numberAttr(el, 'y', 0, warnings),
          width: optionalNumberAttr(el, 'width', warnings),
          height: optionalNumberAttr(el, 'height', warnings),
        },
        baseFactoryOpts(el),
      );
    }
    default:
      unsupportedTags.add(tag);
      return null;
  }
}

// ── Attribute helpers ─────────────────────────────────────────────

/**
 * **D-098** — CSS absolute length units → user units (px), at 96dpi (the CSS
 * reference). Lets print-oriented exports (Illustrator/CorelDRAW emit `pt`,
 * `mm`, `in`, `cm`) import at the correct size instead of being truncated to
 * the bare number (`parseFloat("10mm") === 10` was wrong — 10mm ≈ 37.8px).
 */
const ABSOLUTE_UNIT_TO_PX: Readonly<Record<string, number>> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 25.4 / 4,
};

/**
 * **D-098** — parse an SVG/CSS length into user units. Converts absolute units
 * (px/pt/pc/in/cm/mm/Q). For `%` and relative units (em/ex/rem/vw/vh/…) it
 * can't resolve to user units without layout context, so it returns the numeric
 * part flagged via `warnUnit` (the caller warns instead of silently lying).
 * `null` when the value isn't a number at all.
 */
function parseUnitLength(raw: string): { value: number; warnUnit?: string } | null {
  const m = raw.trim().match(/^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
  if (m === null) return null;
  const n = Number.parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === '') return { value: n };
  const factor = ABSOLUTE_UNIT_TO_PX[unit];
  if (factor !== undefined) return { value: n * factor };
  return { value: n, warnUnit: unit };
}

function warnUnresolvedUnit(
  el: Element,
  name: string,
  raw: string,
  unit: string,
  warnings: string[] | undefined,
): void {
  if (warnings === undefined) return;
  warnings.push(
    `Unit "${unit}" on <${el.tagName.toLowerCase()}> ${name}="${raw}" not resolvable to user units — used the numeric part`,
  );
}

function numberAttr(el: Element, name: string, fallback: number, warnings?: string[]): number {
  const v = el.getAttribute(name);
  if (v === null) return fallback;
  const parsed = parseUnitLength(v);
  if (parsed === null) return fallback;
  if (parsed.warnUnit !== undefined) warnUnresolvedUnit(el, name, v, parsed.warnUnit, warnings);
  return parsed.value;
}

function optionalNumberAttr(el: Element, name: string, warnings?: string[]): number | undefined {
  const v = el.getAttribute(name);
  if (v === null) return undefined;
  const parsed = parseUnitLength(v);
  if (parsed === null) return undefined;
  if (parsed.warnUnit !== undefined) warnUnresolvedUnit(el, name, v, parsed.warnUnit, warnings);
  return parsed.value;
}

function parseViewBoxAttr(svgRoot: Element, warnings: string[]): BoundingBox {
  const attr = svgRoot.getAttribute('viewBox');
  if (attr !== null) {
    const parts = attr
      .trim()
      .split(/[\s,]+/)
      .map((s) => Number.parseFloat(s));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return bbox(parts[0]!, parts[1]!, parts[2]!, parts[3]!);
    }
    warnings.push(`Malformed viewBox="${attr}" — using fallback`);
  }
  // Fallback: width/height attrs, else 800x600 default.
  const w = numberAttr(svgRoot, 'width', 800);
  const h = numberAttr(svgRoot, 'height', 600);
  return bbox(0, 0, w, h);
}

/**
 * Parse `points="x,y x,y ..."` (whitespace OR comma separators) into
 * an array of `{x, y}` records. Skips malformed pairs silently —
 * matches Affinity's lenient parsing.
 */
function parsePoints(attr: string | null): readonly { readonly x: number; readonly y: number }[] {
  if (attr === null) return [];
  const tokens = attr
    .trim()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const x = Number.parseFloat(tokens[i]!);
    const y = Number.parseFloat(tokens[i + 1]!);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

/**
 * Build an {@link SvgStyle} from the element's attribute set AND any
 * inline `style="..."` CSS. Attribute and CSS values are both
 * applied; CSS wins on conflict (matches browser cascade).
 */
/**
 * Build an {@link SvgStyle} from an element's attribute set + any
 * inline `style="..."` CSS. SvgStyle has readonly fields; we collect
 * into a `-readonly` mutable form and freeze on return.
 */
type MutableStyle = { -readonly [K in keyof SvgStyle]: SvgStyle[K] };

/**
 * Presentation attributes the importer reads into {@link SvgStyle}. Read FIRST
 * (lowest CSS priority), then inline `style="..."` overrides any of them.
 * `mix-blend-mode` is intentionally absent: it's a CSS-only property with no
 * presentation-attribute form, so it's read from `style=` only.
 */
const PRESENTATION_STYLE_ATTRS: readonly string[] = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'visibility',
  'filter',
  'clip-path',
  'mask',
  'vector-effect',
];

function parseStyle(el: Element): SvgStyle {
  const style: MutableStyle = {};
  // Presentation attributes first (lowest priority).
  for (const name of PRESENTATION_STYLE_ATTRS) {
    const value = el.getAttribute(name);
    if (value !== null) applyStyleProp(style, name, value);
  }
  // Then inline CSS (`style="..."`) — overrides matching presentation attrs
  // (correct CSS cascade). `mix-blend-mode` is reachable only via this pass.
  const inline = el.getAttribute('style');
  if (inline !== null) {
    for (const decl of inline.split(';')) {
      const idx = decl.indexOf(':');
      if (idx <= 0) continue;
      applyStyleProp(style, decl.slice(0, idx).trim().toLowerCase(), decl.slice(idx + 1));
    }
  }
  // **D-099** — imported content defaults to the SVG-spec `vector-effect: none`
  // (stroke scales with the transform) when the file says nothing, so imported
  // art with a `scale()` transform renders faithfully instead of being forced
  // non-scaling. Editor-created nodes leave this `undefined`, which the renderer
  // treats as `'non-scaling-stroke'` (resize-safe) — see SvgStyle.vectorEffect.
  if (style.vectorEffect === undefined) style.vectorEffect = 'none';
  return style;
}

/**
 * Apply one presentation/CSS declaration to the mutable style. Shared by the
 * presentation-attribute pass AND the inline-`style=` pass so the two never
 * drift (D-114). Unknown props and malformed values are ignored — the importer
 * is always best-effort, never throws on foreign input.
 */
function applyStyleProp(style: MutableStyle, prop: string, rawValue: string): void {
  const value = rawValue.trim();
  if (value.length === 0) return;
  switch (prop) {
    case 'fill':
      style.fill = value;
      break;
    case 'stroke':
      style.stroke = value;
      break;
    case 'stroke-width': {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) style.strokeWidth = n;
      break;
    }
    case 'opacity': {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) style.opacity = n;
      break;
    }
    case 'fill-opacity': {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) style.fillOpacity = n;
      break;
    }
    case 'stroke-opacity': {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) style.strokeOpacity = n;
      break;
    }
    case 'fill-rule':
      if (value === 'nonzero' || value === 'evenodd') style.fillRule = value;
      break;
    case 'stroke-linecap':
      if (value === 'butt' || value === 'round' || value === 'square') {
        style.strokeLinecap = value;
      }
      break;
    case 'stroke-linejoin':
      if (value === 'miter' || value === 'round' || value === 'bevel') {
        style.strokeLinejoin = value;
      }
      break;
    case 'stroke-miterlimit': {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n) && n >= 1) style.strokeMiterlimit = n;
      break;
    }
    case 'stroke-dashoffset': {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) style.strokeDashoffset = n;
      break;
    }
    case 'stroke-dasharray': {
      const dashes = parseDashArray(value);
      if (dashes !== null) style.strokeDasharray = dashes;
      break;
    }
    case 'visibility':
      if (value === 'visible' || value === 'hidden') style.visibility = value;
      break;
    case 'filter':
      style.filter = value;
      break;
    case 'clip-path':
      style.clipPath = value;
      break;
    case 'mask':
      style.mask = value;
      break;
    case 'mix-blend-mode':
      style.mixBlendMode = value;
      break;
    case 'vector-effect':
      // **D-099** — only the two values the model represents; other SVG2
      // vector-effect keywords (e.g. non-scaling-size) are ignored.
      if (value === 'non-scaling-stroke' || value === 'none') style.vectorEffect = value;
      break;
  }
}

/**
 * Parse an SVG `stroke-dasharray` value (`"4 2"`, `"4,2"`, `"none"`) into an
 * array of non-negative dash lengths. Returns `null` for `none` / empty /
 * malformed input so the caller leaves `strokeDasharray` unset (matches the
 * exporter, which emits the array space-joined and skips empty).
 */
function parseDashArray(value: string): readonly number[] | null {
  if (value.toLowerCase() === 'none') return null;
  const parts = value
    .split(/[\s,]+/)
    .filter((p) => p.length > 0)
    .map((p) => Number.parseFloat(p));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts;
}

function sanitizeHref(raw: string, warnings: string[], tag: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith('javascript:')) {
    warnings.push(`Removed unsafe href on <${tag}>: javascript:... payload`);
    return '';
  }
  return trimmed;
}

/**
 * Collect every `<defs>` block in the SVG document — **at any depth**, not
 * just direct children of `<svg>` — plus any reusable definition elements
 * (`<linearGradient>`, `<clipPath>`, etc.) authors place loose (without a
 * `<defs>` wrapper). Returns the combined, sanitized inner XML as an opaque
 * fragment — no `<defs>` wrapper (the exporter adds one).
 *
 * **Why recursive** (D-115): SVG `id`s are document-global, so a gradient/
 * clipPath/filter defined inside a nested (often transformed) `<g>` is still
 * referenced via `url(#id)` from anywhere — and several authoring tools emit
 * exactly that (`<g transform><defs>…</defs>…</g>`). The renderable-tree
 * walker skips `<defs>` (and bare reusable-defs) at every depth, so if we
 * only collected top-level ones the nested definition was dropped entirely
 * and its `url(#…)` references dangled (gradient/clip vanished on import).
 * Hoisting is safe: definitions ignore ancestor transforms (gradients have
 * their own `gradientUnits` coordinate system), so where the `<defs>` sat in
 * the tree never affected the painted result.
 *
 * Sanitization performed BEFORE serialization:
 *
 * - All `<script>` descendants removed (drop, no warn — already covered
 *   by the main parser path for the rest of the doc).
 * - All `on*` event-handler attributes stripped from every descendant.
 * - `href` / `xlink:href` values starting with `javascript:` blanked out.
 *
 * The result is a string of SVG markup safe to inject into the rendered
 * `<svg>` via `insertAdjacentHTML` or to serialize via the exporter
 * without re-running it through the parser.
 *
 * Returns an empty string when no defs/reusable defs exist.
 */
/**
 * True when `el` has any ancestor that is a `<defs>` or another reusable-def
 * element. Used by {@link extractDefsFragment} step 2 to avoid emitting a
 * definition twice: one already inside a `<defs>` is collected by step 1; one
 * nested inside another reusable-def (e.g. a `<linearGradient>` inside a
 * `<pattern>`) is serialized as part of that parent's `outerHTML`.
 */
function hasDefOrReusableDefAncestor(el: Element): boolean {
  let parent = el.parentElement;
  while (parent !== null) {
    const tag = parent.tagName.toLowerCase();
    if (tag === 'defs' || REUSABLE_DEF_TAGS.has(tag)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function extractDefsFragment(svgRoot: Element, warnings: string[]): string {
  const collected: Element[] = [];
  const seen = new Set<Element>();
  // `querySelectorAll('*')` is case-insensitive on the universal selector,
  // so it works for the camelCase SVG tags (`linearGradient`) that an
  // element-name selector would miss in an XML-parsed document. Returns
  // descendants in document order (excludes `svgRoot` itself).
  const allEls = Array.from(svgRoot.querySelectorAll('*'));

  // 1. Children of EVERY `<defs>` anywhere in the tree (gradients, clipPaths,
  //    etc.). Skip a child that is itself a `<defs>` — it gets visited on its
  //    own iteration, so collecting it here too would duplicate its content.
  for (const el of allEls) {
    if (el.tagName.toLowerCase() !== 'defs') continue;
    for (const def of Array.from(el.children)) {
      if (def.tagName.toLowerCase() === 'defs') continue;
      if (!seen.has(def)) {
        seen.add(def);
        collected.push(def);
      }
    }
  }

  // 2. Bare reusable-def elements (not wrapped in `<defs>`) anywhere. Skip
  //    any nested inside a `<defs>` (collected above) or inside another
  //    reusable-def (serialized as part of that parent's `outerHTML`) so we
  //    never emit the same definition twice.
  for (const el of allEls) {
    if (!REUSABLE_DEF_TAGS.has(el.tagName.toLowerCase())) continue;
    if (hasDefOrReusableDefAncestor(el)) continue;
    if (!seen.has(el)) {
      seen.add(el);
      collected.push(el);
    }
  }

  if (collected.length === 0) return '';

  // Sanitize each collected element (clone to avoid mutating the
  // original DOM, which the renderable-tree parser may still be walking).
  // Sanitizer returns null when the root itself is forbidden — drop
  // those entries entirely (e.g., a `<script>` sitting inside `<defs>`).
  const sanitized = collected
    .map((el) => sanitizeDefSubtree(el, warnings))
    .filter((el): el is Element => el !== null);

  if (sanitized.length === 0) return '';

  // Serialize via outerHTML — preserves the XML structure including
  // namespaces (DOMParser keeps `xmlns:xlink` on the clone). Concatenate
  // with newlines so the exporter's pretty-printing is readable.
  return sanitized.map((el) => el.outerHTML).join('\n');
}

/**
 * Recursively scrub script, event-handler attrs, and javascript: hrefs from
 * a `<defs>` subtree. Clones the element first so we don't mutate the
 * importer's parsed-DOM source (the renderable-tree walker may still
 * reference it via querySelectorAll).
 *
 * Returns `null` when the root element itself is forbidden — caller
 * filters those out before serialization. (Removing a detached root via
 * `.remove()` is a no-op since it has no parent.)
 */
function sanitizeDefSubtree(source: Element, warnings: string[]): Element | null {
  // Root-level forbidden element: drop the whole subtree.
  if (source.tagName.toLowerCase() === 'script') {
    warnings.push(`<script> inside <defs> dropped for safety`);
    return null;
  }
  const clone = source.cloneNode(true) as Element;
  // Scrub attrs on the clone root.
  scrubAttrs(clone, warnings);
  // Walk DESCENDANTS only (root already handled above). Collect script
  // descendants for batch removal — mutating during iteration would
  // skip siblings.
  const walker = clone.ownerDocument.createTreeWalker(clone, /* SHOW_ELEMENT */ 0x1);
  const toRemove: Element[] = [];
  // First nextNode() moves PAST the root, into the first descendant.
  let current: Node | null = walker.nextNode();
  while (current !== null) {
    const el = current as Element;
    if (el.tagName.toLowerCase() === 'script') {
      toRemove.push(el);
    } else {
      scrubAttrs(el, warnings);
    }
    current = walker.nextNode();
  }
  for (const el of toRemove) el.remove();
  return clone;
}

/** Strip on* handlers + javascript: hrefs from a single element. */
function scrubAttrs(el: Element, warnings: string[]): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) {
      warnings.push(`Removed event handler "${attr.name}" on <defs> <${el.tagName}>`);
      el.removeAttribute(attr.name);
    } else if (
      (name === 'href' || name === 'xlink:href') &&
      attr.value.trim().toLowerCase().startsWith('javascript:')
    ) {
      warnings.push(`Removed unsafe href on <defs> <${el.tagName}>: javascript:... payload`);
      el.setAttribute(attr.name, '');
    }
  }
}
