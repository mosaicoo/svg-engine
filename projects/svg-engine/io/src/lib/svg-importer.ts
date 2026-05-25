import {
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
  createText,
  generateNodeId,
  type NodeFactoryOptions,
  parseTransformAttr,
  SVGE_KIND_KEY,
  SVGE_KIND_LAYER,
  type SvgDocument,
  type SvgNode,
  type SvgStyle,
} from 'svg-engine/core';
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
    const document: SvgDocument =
      defsFragment.length > 0
        ? { id: generateNodeId(), viewBox, root: createGroup(rootChildren), defs: defsFragment }
        : { id: generateNodeId(), viewBox, root: createGroup(rootChildren) };
    return { ok: true, document, warnings };
  },
};

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
  if (name !== undefined) {
    opts.metadata = { name };
  }
  return opts;
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
      const opts = baseFactoryOpts(el);
      if (isLayerGroup) {
        // Merge the layer flag into customData WITHOUT clobbering the
        // `name` that `baseFactoryOpts` may have populated from
        // `inkscape:label` / `data-svge-name`.
        opts.metadata = {
          ...(opts.metadata ?? {}),
          customData: { [SVGE_KIND_KEY]: SVGE_KIND_LAYER },
        };
      }
      return createGroup(parseChildren(el, warnings, unsupportedTags), opts);
    }
    case 'rect':
      return createRect(
        {
          x: numberAttr(el, 'x', 0),
          y: numberAttr(el, 'y', 0),
          width: numberAttr(el, 'width', 0),
          height: numberAttr(el, 'height', 0),
          rx: optionalNumberAttr(el, 'rx'),
          ry: optionalNumberAttr(el, 'ry'),
        },
        baseFactoryOpts(el),
      );
    case 'ellipse':
      return createEllipse(
        {
          cx: numberAttr(el, 'cx', 0),
          cy: numberAttr(el, 'cy', 0),
          rx: numberAttr(el, 'rx', 0),
          ry: numberAttr(el, 'ry', 0),
        },
        baseFactoryOpts(el),
      );
    case 'circle': {
      // SVG <circle r="N"> is the rx=ry=N case of ellipse — fold to
      // ellipse so the model stays small (one shape, not two).
      const r = numberAttr(el, 'r', 0);
      return createEllipse(
        { cx: numberAttr(el, 'cx', 0), cy: numberAttr(el, 'cy', 0), rx: r, ry: r },
        baseFactoryOpts(el),
      );
    }
    case 'line':
      return createLine(
        {
          x1: numberAttr(el, 'x1', 0),
          y1: numberAttr(el, 'y1', 0),
          x2: numberAttr(el, 'x2', 0),
          y2: numberAttr(el, 'y2', 0),
        },
        baseFactoryOpts(el),
      );
    case 'polygon':
      return createPolygon(parsePoints(el.getAttribute('points')), baseFactoryOpts(el));
    case 'polyline':
      return createPolyline(parsePoints(el.getAttribute('points')), baseFactoryOpts(el));
    case 'path':
      return createPath(el.getAttribute('d') ?? '', baseFactoryOpts(el));
    case 'text':
      return createText(
        {
          x: numberAttr(el, 'x', 0),
          y: numberAttr(el, 'y', 0),
          content: el.textContent ?? '',
          fontSize: optionalNumberAttr(el, 'font-size'),
        },
        baseFactoryOpts(el),
      );
    case 'image': {
      const href = sanitizeHref(
        el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '',
        warnings,
        tag,
      );
      return createImage(
        {
          x: numberAttr(el, 'x', 0),
          y: numberAttr(el, 'y', 0),
          width: numberAttr(el, 'width', 0),
          height: numberAttr(el, 'height', 0),
          href,
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

function numberAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name);
  if (v === null) return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNumberAttr(el: Element, name: string): number | undefined {
  const v = el.getAttribute(name);
  if (v === null) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
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

function parseStyle(el: Element): SvgStyle {
  const style: MutableStyle = {};
  // Presentation attributes first.
  const fill = el.getAttribute('fill');
  if (fill !== null) style.fill = fill;
  const stroke = el.getAttribute('stroke');
  if (stroke !== null) style.stroke = stroke;
  const strokeWidth = el.getAttribute('stroke-width');
  if (strokeWidth !== null) {
    const n = Number.parseFloat(strokeWidth);
    if (Number.isFinite(n)) style.strokeWidth = n;
  }
  const opacity = el.getAttribute('opacity');
  if (opacity !== null) {
    const n = Number.parseFloat(opacity);
    if (Number.isFinite(n)) style.opacity = n;
  }
  const fillOpacity = el.getAttribute('fill-opacity');
  if (fillOpacity !== null) {
    const n = Number.parseFloat(fillOpacity);
    if (Number.isFinite(n)) style.fillOpacity = n;
  }
  const strokeOpacity = el.getAttribute('stroke-opacity');
  if (strokeOpacity !== null) {
    const n = Number.parseFloat(strokeOpacity);
    if (Number.isFinite(n)) style.strokeOpacity = n;
  }
  const visibility = el.getAttribute('visibility');
  if (visibility === 'visible' || visibility === 'hidden') {
    style.visibility = visibility;
  }
  // SVG `filter` attribute (Fase 6d) — typically url(#effect-id).
  const filter = el.getAttribute('filter');
  if (filter !== null && filter.length > 0) style.filter = filter;
  // Then merge inline CSS (style="...") — CSS overrides matching attrs.
  const inline = el.getAttribute('style');
  if (inline !== null) {
    for (const decl of inline.split(';')) {
      const idx = decl.indexOf(':');
      if (idx <= 0) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (value.length === 0) continue;
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
        case 'visibility':
          if (value === 'visible' || value === 'hidden') {
            style.visibility = value;
          }
          break;
        case 'filter':
          if (value.length > 0) style.filter = value;
          break;
      }
    }
  }
  return style;
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
 * Collect every `<defs>` block in the SVG document plus any top-level
 * reusable definition elements (`<linearGradient>`, `<clipPath>`, etc.)
 * that authors sometimes place as direct children of `<svg>` without
 * wrapping in `<defs>`. Returns the combined, sanitized inner XML as
 * an opaque fragment — no `<defs>` wrapper (the exporter adds one).
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
function extractDefsFragment(svgRoot: Element, warnings: string[]): string {
  const collected: Element[] = [];

  // 1. Top-level `<defs>` blocks (most common case).
  for (const child of Array.from(svgRoot.children)) {
    if (child.tagName.toLowerCase() === 'defs') {
      // Collect each direct child of `<defs>` (gradients, clipPaths, etc.).
      for (const def of Array.from(child.children)) {
        collected.push(def);
      }
    }
  }

  // 2. Top-level reusable-def elements not wrapped in `<defs>`.
  for (const child of Array.from(svgRoot.children)) {
    if (REUSABLE_DEF_TAGS.has(child.tagName.toLowerCase())) {
      collected.push(child);
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
