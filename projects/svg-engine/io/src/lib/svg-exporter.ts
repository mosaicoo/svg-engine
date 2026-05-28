import {
  type EllipseNode,
  getPageName,
  getPageViewBox,
  type GroupNode,
  type ImageNode,
  isGroupNode,
  isLayer,
  isPage,
  isSmartObject,
  type LineNode,
  type NodeId,
  type PathNode,
  type PolygonNode,
  type PolylineNode,
  type RectNode,
  roundPathCorners,
  type SvgDocument,
  type SvgNode,
  type SvgStyle,
  type SymbolUseNode,
  type TextNode,
  type Transform,
  walk,
} from 'svg-engine/core';
import type { Exporter } from './io-types';

/**
 * Built-in SVG exporter (Fase 5-IO). Serializes a {@link SvgDocument}
 * back to SVG XML text with **deterministic** output: byte-for-byte
 * stable for the same input, friendly for diffs / golden-file tests /
 * VCS commits.
 *
 * **Determinism guarantees**:
 *
 * - Element attribute order: fixed per element type (canonical order
 *   below) instead of object-iteration order
 * - Numeric formatting: 6 decimal places max, trailing zeros stripped
 *   (`Math.round(n * 1e6) / 1e6` → trim trailing zeros). Eliminates
 *   floating-point noise like `0.30000000000000004`
 * - Transform: only emitted when not identity (`[1,0,0,1,0,0]`).
 *   Default matrix is implicit in the spec — no point bloating output
 * - Style: only emitted when non-empty. Style attributes are emitted
 *   as individual presentation attributes (`fill="..."`), not inline
 *   CSS (`style="fill:..."`) — easier to query in raw SVG, and
 *   identical visual rendering
 *
 * **Indentation**: 2-space, recursive. Tags on their own line for
 * leaf elements; opening + content + closing tags collapsed for
 * single-line text content. Matches Inkscape's default save style.
 *
 * **Pure**: no DOM mutation, no service injection. Worker-safe.
 */
export const svgExporter: Exporter = {
  id: 'svge.builtin.exporter.svg',
  name: 'SVG',
  mediaType: 'image/svg+xml',
  extension: 'svg',

  export(document: SvgDocument): string {
    const vb = document.viewBox;
    const viewBoxAttr = `${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.width)} ${fmt(vb.height)}`;
    // **D-068 follow-up — Pre-scan referenced ids**. Only paths that
    // are the target of a `<textPath href="#...">` need an `id`
    // attribute in the output (otherwise the text disappears at
    // re-open). All other nodes export without `id` — the runtime
    // UUIDs aren't useful externally and would pollute diffs.
    const referencedIds = collectReferencedPathIds(document.root);
    // **D-072 follow-up — Authored title emission**. Resolved once
    // here so per-node renderers can ask `shouldEmitTitle(node)`
    // cheaply. Default: emit titles for any node with `metadata.name`.
    const emitTitles = document.exportPreferences?.emitAuthoredTitles !== false;
    const ctx: ExportContext = { referencedIds, emitTitles };
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxAttr}" width="${fmt(vb.width)}" height="${fmt(vb.height)}">`,
    );
    // Round-trip defs verbatim (Fase 6c-1). The importer captured this
    // fragment already-sanitized — no script tags, no on* handlers, no
    // javascript: hrefs — so re-emitting it is safe. Indented with one
    // level of leading whitespace inside `<defs>` to match the rest of
    // the tree's 2-space style.
    if (typeof document.defs === 'string' && document.defs.length > 0) {
      lines.push('  <defs>');
      // The defs fragment is the literal inner XML of the original
      // `<defs>` (possibly multiple top-level elements). We indent each
      // line by 4 spaces so the wrapper `<defs>` reads cleanly. Best-
      // effort: lines that contain no leading whitespace get indented;
      // already-indented content keeps its original structure.
      for (const line of document.defs.split('\n')) {
        const stripped = line.replace(/^\s+/, '');
        lines.push(stripped.length > 0 ? `    ${stripped}` : '');
      }
      lines.push('  </defs>');
    }
    for (const child of document.root.children) {
      lines.push(renderNode(child, 1, ctx));
    }
    lines.push('</svg>');
    return lines.join('\n');
  },
};

/**
 * Pre-scan helper: collect the set of node ids that any `textPathRef`
 * in the document points to. The `<path id>` attribute is only emitted
 * for nodes whose id appears here — keeps the runtime-only-id rule
 * intact for the 99% of paths that nobody references.
 *
 * **Why exported**: specs check the set contents to assert the
 * boundary between "referenced → id emitted" and "not referenced →
 * id omitted" without parsing the resulting SVG string.
 */
export function collectReferencedPathIds(root: GroupNode): ReadonlySet<NodeId> {
  const out = new Set<NodeId>();
  walk(root, (n) => {
    if (n.type === 'text') {
      const ref = (n as TextNode).textPathRef;
      if (ref !== undefined && ref !== null && (ref as string).length > 0) {
        out.add(ref);
      }
    }
  });
  return out;
}

// ── Export context (shared across pre-scan + render) ────────────────

/**
 * Per-export bundle threaded through every `render*` function:
 *
 * - `referencedIds`: paths that some `<text textPathRef>` points at
 *   (D-068h). Such paths MUST emit `id="UUID"` in the output or the
 *   href dangles after re-open.
 *
 * - `emitTitles`: resolved from `document.exportPreferences?.
 *   emitAuthoredTitles` (default `true`). When `true`, any node with
 *   `metadata.name` gets a `<title>...</title>` child element so the
 *   human-authored name survives export → re-import.
 */
interface ExportContext {
  readonly referencedIds: ReadonlySet<NodeId>;
  readonly emitTitles: boolean;
}

/**
 * Determine whether `node` should emit a `<title>` child for its
 * authored name. Pure read; called once per leaf/group render.
 */
function shouldEmitTitle(node: SvgNode, ctx: ExportContext): boolean {
  if (!ctx.emitTitles) return false;
  const name = node.metadata.name;
  return typeof name === 'string' && name.length > 0;
}

/**
 * Render the inner `<title>` line for a node, properly indented and
 * XML-escaped. Returns an empty string when the node has no authored
 * name (caller can still concatenate without nullish checks).
 */
function titleChildLine(node: SvgNode, depth: number, ctx: ExportContext): string {
  if (!shouldEmitTitle(node, ctx)) return '';
  const indent = '  '.repeat(depth);
  return `${indent}<title>${escapeXml(node.metadata.name!)}</title>`;
}

/**
 * Wrap a self-closing leaf element so it carries a `<title>` child
 * when the node is authored-named. Without this helper every leaf
 * renderer would need a fork between "self-close" and "open-title-
 * close" branches; isolating the branch keeps each renderer readable.
 *
 * `selfClosingTag` is the full element string the renderer would have
 * emitted (e.g., `<rect x="0" y="0" .../>`). When titling is required
 * the leading `<` is preserved, the `/` and final `>` are dropped,
 * children get an extra indent level, and the closing tag is appended.
 */
function wrapLeafWithTitle(
  tagName: string,
  attrsString: string,
  depth: number,
  node: SvgNode,
  ctx: ExportContext,
): string {
  const indent = '  '.repeat(depth);
  if (!shouldEmitTitle(node, ctx)) {
    return `${indent}<${tagName}${attrsString} />`;
  }
  return `${indent}<${tagName}${attrsString}>\n${titleChildLine(node, depth + 1, ctx)}\n${indent}</${tagName}>`;
}

// ── Element renderers ─────────────────────────────────────────────

function renderNode(node: SvgNode, depth: number, ctx: ExportContext): string {
  // **Visibility gate** — `metadata.visible === false` means the node
  // is doc-level hidden (D-056 Live Boolean inputs use this to keep
  // their shapes as group children without painting). The renderer
  // applies `display: none` to such nodes; the exporter mirrors that
  // by SKIPPING them entirely so the exported file matches what the
  // canvas paints. (Alternative: emit with `style="display:none"`;
  // chose skip-on-export because the typical use case is "I want my
  // file to render what I see" — hidden nodes are session-level
  // intent, not part of the visual.) Round-tripping requires the
  // editor to re-derive these from Live Boolean groups on import.
  if (node.metadata.visible === false) return '';
  switch (node.type) {
    case 'group':
      return renderGroup(node, depth, ctx);
    case 'rect':
      return renderRect(node, depth, ctx);
    case 'ellipse':
      return renderEllipse(node, depth, ctx);
    case 'line':
      return renderLine(node, depth, ctx);
    case 'polygon':
      return renderPolygon(node, depth, ctx);
    case 'polyline':
      return renderPolyline(node, depth, ctx);
    case 'path':
      return renderPath(node, depth, ctx);
    case 'text':
      return renderText(node, depth, ctx);
    case 'image':
      return renderImage(node, depth, ctx);
    case 'symbol-use':
      return renderSymbolUse(node, depth, ctx);
  }
}

function renderSymbolUse(node: SymbolUseNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['href', `#${node.symbolId}`],
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
  ];
  if (node.width !== undefined) attrs.push(['width', fmt(node.width)]);
  if (node.height !== undefined) attrs.push(['height', fmt(node.height)]);
  return wrapLeafWithTitle('use', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderGroup(node: GroupNode, depth: number, ctx: ExportContext): string {
  const indent = '  '.repeat(depth);
  const attrs = baseAttrs(node);
  // Capture metadata.name BEFORE the kind-narrowing if-chain. The
  // chained `is GroupNode` guards (isLayer/isSmartObject/isPage) cause
  // TS to narrow `node` to `never` after a few branches even though
  // the guards aren't mutually exclusive at the type level — reading
  // `node.metadata` inside the deeper else-if would error.
  const groupBaseName = node.metadata.name;
  // **D-072 — Logical Layers**. Mark layer groups with a
  // `data-svge-kind="layer"` attribute so the designation survives a
  // full export → re-import round-trip. `data-*` attributes are valid
  // SVG/HTML, preserved by every major editor (Inkscape/Illustrator/
  // Figma) on save, and ignored by the SVG rendering spec — pure
  // metadata transport. No namespace pollution.
  if (isLayer(node)) {
    attrs.push(['data-svge-kind', 'layer']);
  }
  // **D-074 — Smart Objects**. Same data-attribute mechanism as
  // layers (`svgeKind` single-slot); the importer reads it back into
  // `customData.svgeKind = 'smart-object'`. Layers and smart objects
  // are mutually exclusive (the flag is set OR cleared, never
  // both — see `withSmartObjectFlag`'s spread semantics).
  else if (isSmartObject(node)) {
    attrs.push(['data-svge-kind', 'smart-object']);
  }
  // **D-079 — Pages / Artboards** (PAGES-D). Same data-attribute
  // mechanism. Pages also carry their own viewBox (separate from the
  // document-level viewBox) so re-import preserves the page geometry
  // even when other editors don't recognise `data-svge-kind`. The
  // viewBox is serialised as a space-separated quartet
  // (`x y width height`) — same format as the SVG `viewBox` attribute
  // for symmetry. Optional `data-svge-page-name` overrides
  // `metadata.name` (mostly useful when an explicit page name diverges
  // from the layer-style `<title>` we emit elsewhere).
  else if (isPage(node)) {
    attrs.push(['data-svge-kind', 'page']);
    const pvb = getPageViewBox(node);
    if (pvb !== null) {
      attrs.push([
        'data-svge-page-viewbox',
        `${fmt(pvb.x)} ${fmt(pvb.y)} ${fmt(pvb.width)} ${fmt(pvb.height)}`,
      ]);
    }
    const pname = getPageName(node);
    // Emit explicit page-name ONLY when it differs from metadata.name
    // (otherwise the layer-style <title> already carries the name).
    if (pname.length > 0 && pname !== 'Untitled Page' && pname !== groupBaseName) {
      attrs.push(['data-svge-page-name', pname]);
    }
  }
  // **D-072 follow-up — Authored name via `<title>` child**. Emitted
  // as the FIRST child of the group so screen readers announce the
  // group's name before traversing its content. Skipped when the
  // group has no authored name OR the document opted out of title
  // emission (`exportPreferences.emitAuthoredTitles === false`).
  const titleLine = shouldEmitTitle(node, ctx) ? titleChildLine(node, depth + 1, ctx) : '';

  if (!isGroupNode(node) || node.children.length === 0) {
    // Empty group still renders (preserves structure for round-trip).
    // When the empty group has a title we MUST switch to open+close
    // form so the title can live as a child — self-closing wouldn't
    // permit children.
    if (titleLine.length > 0) {
      return `${indent}<g${attrsStr(attrs)}>\n${titleLine}\n${indent}</g>`;
    }
    return `${indent}<g${attrsStr(attrs)} />`;
  }
  const lines = [`${indent}<g${attrsStr(attrs)}>`];
  if (titleLine.length > 0) lines.push(titleLine);
  for (const child of node.children) {
    // Filter empty strings — renderNode returns '' for hidden nodes
    // (metadata.visible === false). Skip them so we don't emit blank
    // lines inside the group.
    const rendered = renderNode(child, depth + 1, ctx);
    if (rendered.length > 0) lines.push(rendered);
  }
  lines.push(`${indent}</g>`);
  return lines.join('\n');
}

function renderRect(node: RectNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
    ['width', fmt(node.width)],
    ['height', fmt(node.height)],
  ];
  if (node.rx !== undefined) attrs.push(['rx', fmt(node.rx)]);
  if (node.ry !== undefined) attrs.push(['ry', fmt(node.ry)]);
  return wrapLeafWithTitle('rect', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderEllipse(node: EllipseNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['cx', fmt(node.cx)],
    ['cy', fmt(node.cy)],
    ['rx', fmt(node.rx)],
    ['ry', fmt(node.ry)],
  ];
  return wrapLeafWithTitle('ellipse', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderLine(node: LineNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['x1', fmt(node.x1)],
    ['y1', fmt(node.y1)],
    ['x2', fmt(node.x2)],
    ['y2', fmt(node.y2)],
  ];
  return wrapLeafWithTitle('line', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderPolygon(node: PolygonNode, depth: number, ctx: ExportContext): string {
  const points = node.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const attrs: [string, string][] = [['points', points]];
  return wrapLeafWithTitle('polygon', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderPolyline(node: PolylineNode, depth: number, ctx: ExportContext): string {
  const points = node.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const attrs: [string, string][] = [['points', points]];
  return wrapLeafWithTitle('polyline', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderPath(node: PathNode, depth: number, ctx: ExportContext): string {
  // D-055 Live Corners — when cornerRadius > 0, the renderer paints
  // the ROUNDED `d` (derived via roundPathCorners). Exporter mirrors:
  // emit the rounded `d` so the exported SVG looks identical to the
  // canvas.
  const r = node.cornerRadius ?? 0;
  const effectiveD = r > 0 ? roundPathCorners(node.d, r) : node.d;
  // **D-068h** — emit `id="UUID"` ONLY when the path is the target
  // of some `<textPath href>`. Keeps the runtime-only-id rule intact
  // for the 99% of paths that nobody references while making text-on-
  // path links resolvable in the exported SVG.
  const attrs: [string, string][] = [['d', effectiveD]];
  if (ctx.referencedIds.has(node.id)) {
    attrs.push(['id', node.id]);
  }
  return wrapLeafWithTitle('path', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

function renderText(node: TextNode, depth: number, ctx: ExportContext): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
  ];
  if (node.fontSize !== undefined) attrs.push(['font-size', fmt(node.fontSize)]);
  if (node.fontFamily !== undefined) attrs.push(['font-family', node.fontFamily]);
  if (node.fontWeight !== undefined) attrs.push(['font-weight', String(node.fontWeight)]);
  if (node.textAnchor !== undefined) attrs.push(['text-anchor', node.textAnchor]);
  // D-069 — typography basics. `font-style` + `text-decoration` are
  // standard SVG attributes emitted directly. `lineHeight` drives the
  // multi-line `<tspan dy>` emission below (D-053/D-069 follow-up).
  if (node.fontStyle !== undefined) attrs.push(['font-style', node.fontStyle]);
  if (node.textDecoration !== undefined) attrs.push(['text-decoration', node.textDecoration]);
  // D-053 — Variable Fonts + OpenType + letter spacing. These are CSS
  // properties (no native SVG attributes); the renderer emits them as
  // host-bound styles. Exporter mirrors via inline `style=""` so the
  // exported file applies them when opened in a browser or design tool
  // that honors CSS in SVG (every modern viewer does).
  const styleProps: string[] = [];
  if (node.fontVariationSettings !== undefined) {
    styleProps.push(`font-variation-settings: ${node.fontVariationSettings}`);
  }
  if (node.fontFeatureSettings !== undefined) {
    styleProps.push(`font-feature-settings: ${node.fontFeatureSettings}`);
  }
  if (node.letterSpacing !== undefined) {
    // SVG also has a `letter-spacing` attribute. We emit as CSS for
    // parity with the renderer's `[style.letter-spacing]` binding.
    styleProps.push(`letter-spacing: ${fmt(node.letterSpacing)}px`);
  }
  if (styleProps.length > 0) attrs.push(['style', styleProps.join('; ')]);

  // D-053 — Text on path. When textPathRef is set, content lives inside
  // a <textPath href="#id"> child instead of as direct text. The
  // renderer pre-collapses whitespace; mirror that to avoid the
  // typical \n-to-space stretch issue. `textPathRef` is the target
  // path's NodeId (UUID) which `renderPath` emits as `id="UUID"` via
  // `ctx.referencedIds`.
  const ref = node.textPathRef;
  if (ref !== undefined && ref !== null && ref !== '') {
    const flat = node.content.replace(/\s+/g, ' ');
    const startOffset = node.textPathStartOffset;
    const offsetAttr =
      startOffset !== undefined && startOffset !== null && startOffset !== ''
        ? ` startOffset="${escapeAttr(startOffset)}"`
        : '';
    const refStr = ref as unknown as string;
    const titleLine = shouldEmitTitle(node, ctx) ? `${titleChildLine(node, depth + 1, ctx)}\n` : '';
    return `${indent}<text${attrsStr([...attrs, ...baseAttrs(node)])}>\n${titleLine}${'  '.repeat(depth + 1)}<textPath href="#${escapeAttr(refStr)}"${offsetAttr}>${escapeXml(flat)}</textPath>\n${indent}</text>`;
  }

  // **D-053/D-069 follow-up — Multi-line tspan emission**. The
  // editor's canvas renderer splits `node.content` on `\n` and emits
  // one `<tspan dy>` per line so what the user sees is laid out as
  // real text lines (not a single run with literal newlines, which
  // most SVG viewers collapse to a single space). Mirror that in the
  // exporter so a saved file opens elsewhere with the same line
  // layout — otherwise WYSIWYG breaks the moment the file leaves the
  // editor. Single-line text (no `\n`) keeps the plain-character-data
  // shape for back-compat with snapshots / specs / other tools that
  // expected the legacy form.
  const lines = node.content.includes('\n') ? node.content.split('\n') : null;
  const titleLine = shouldEmitTitle(node, ctx) ? titleChildLine(node, depth + 1, ctx) : null;

  if (lines !== null) {
    // Multi-line — emit a `<tspan>` per line. Every tspan resets `x`
    // to the parent text's `x` (without it, tspans flow continuously
    // from the previous run's end-x, which is NOT a line break). `dy`
    // shifts each line down by `lineHeight em`s relative to the
    // previous baseline; first line uses `0` so we don't push the
    // text below `node.y` (single-line equivalent stays at y exactly).
    const lineDy = resolveLineHeightEm(node);
    const innerIndent = '  '.repeat(depth + 1);
    const xAttr = fmt(node.x);
    const tspans = lines
      .map((line, i) => {
        const dy = i === 0 ? '0' : lineDy;
        return `${innerIndent}<tspan x="${xAttr}" dy="${dy}">${escapeXml(line)}</tspan>`;
      })
      .join('\n');
    const titlePrefix = titleLine !== null ? `${titleLine}\n` : '';
    return `${indent}<text${attrsStr([...attrs, ...baseAttrs(node)])}>\n${titlePrefix}${tspans}\n${indent}</text>`;
  }

  // **D-072 follow-up** — Single-line text with an authored name:
  // emit `<title>` child before the text content so screen readers
  // announce the name first.
  if (titleLine !== null) {
    return `${indent}<text${attrsStr([...attrs, ...baseAttrs(node)])}>\n${titleLine}\n${'  '.repeat(depth + 1)}${escapeXml(node.content)}\n${indent}</text>`;
  }
  return `${indent}<text${attrsStr([...attrs, ...baseAttrs(node)])}>${escapeXml(node.content)}</text>`;
}

/**
 * **D-053/D-069 follow-up** — resolve `node.lineHeight` to a CSS-style
 * `em` string for `<tspan dy>` emission. Mirrors the renderer's
 * `textLineDy()` defaults (node-renderer.component.ts): when
 * `lineHeight` is undefined / non-finite / `<= 0`, falls back to the
 * canonical `1.2` (the pre-D-069 hardcoded leading). Keeping both
 * sides in lockstep guarantees the in-editor preview and the exported
 * file render with identical line spacing.
 */
function resolveLineHeightEm(node: TextNode): string {
  const lh = node.lineHeight;
  const factor = typeof lh === 'number' && Number.isFinite(lh) && lh > 0 ? lh : 1.2;
  return `${factor}em`;
}

function renderImage(node: ImageNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
    ['width', fmt(node.width)],
    ['height', fmt(node.height)],
    ['href', node.href],
  ];
  return wrapLeafWithTitle('image', attrsStr([...attrs, ...baseAttrs(node)]), depth, node, ctx);
}

// ── Base attributes (style, transform) ─────────────────────────────

/**
 * Build the canonical attribute set common to every node type:
 * style props (alphabetical) + transform (only when non-identity).
 * `id` is NOT included here — it's runtime editor state and only
 * gets emitted by `renderPath` when the path is a `<textPath href>`
 * target (D-068h). Authored names persist via `<title>` child
 * elements via `titleChildLine` / `wrapLeafWithTitle`, NOT via
 * attributes — see {@link ExportContext} for the rationale.
 */
function baseAttrs(node: SvgNode): [string, string][] {
  const out: [string, string][] = [];
  out.push(...styleAttrs(node.style));
  if (!isIdentityTransform(node.transform)) {
    out.push(['transform', transformAttr(node.transform)]);
  }
  return out;
}

function styleAttrs(style: SvgStyle): [string, string][] {
  const out: [string, string][] = [];
  // Canonical alphabetical order — predictable diffs.
  // D-049 — composition / clipping. These belong on the wrapper <g>
  // in the renderer (see node-renderer.component for the reasoning),
  // but for export we attach them as direct attributes on the painted
  // element because the exporter doesn't emit a wrapper <g> per leaf.
  // Visually identical for non-grouped nodes; for groups, both renderer
  // and exporter attach to the same element so it round-trips clean.
  if (style.clipPath !== undefined) out.push(['clip-path', style.clipPath]);
  if (style.fill !== undefined) out.push(['fill', style.fill]);
  if (style.fillOpacity !== undefined) out.push(['fill-opacity', fmt(style.fillOpacity)]);
  if (style.filter !== undefined) out.push(['filter', style.filter]);
  if (style.mask !== undefined) out.push(['mask', style.mask]);
  if (style.opacity !== undefined) out.push(['opacity', fmt(style.opacity)]);
  if (style.stroke !== undefined) out.push(['stroke', style.stroke]);
  if (style.strokeDasharray !== undefined && style.strokeDasharray.length > 0) {
    out.push(['stroke-dasharray', style.strokeDasharray.map(fmt).join(' ')]);
  }
  if (style.strokeLinecap !== undefined) out.push(['stroke-linecap', style.strokeLinecap]);
  if (style.strokeLinejoin !== undefined) out.push(['stroke-linejoin', style.strokeLinejoin]);
  if (style.strokeOpacity !== undefined) out.push(['stroke-opacity', fmt(style.strokeOpacity)]);
  if (style.strokeWidth !== undefined) out.push(['stroke-width', fmt(style.strokeWidth)]);
  if (style.visibility !== undefined) out.push(['visibility', style.visibility]);
  // D-049 — mix-blend-mode is a CSS property (no SVG attribute), so
  // it goes inline as style="...". Kept LAST so it appears at the end
  // of the attribute list (visually separable from native SVG attrs
  // in a diff / hand-edit).
  if (style.mixBlendMode !== undefined) {
    out.push(['style', `mix-blend-mode: ${style.mixBlendMode}`]);
  }
  return out;
}

function isIdentityTransform(t: Transform): boolean {
  return t[0] === 1 && t[1] === 0 && t[2] === 0 && t[3] === 1 && t[4] === 0 && t[5] === 0;
}

function transformAttr(t: Transform): string {
  // Prefer compact `translate(x,y)` when only translation is set.
  if (t[0] === 1 && t[1] === 0 && t[2] === 0 && t[3] === 1) {
    return `translate(${fmt(t[4])},${fmt(t[5])})`;
  }
  return `matrix(${fmt(t[0])},${fmt(t[1])},${fmt(t[2])},${fmt(t[3])},${fmt(t[4])},${fmt(t[5])})`;
}

// ── String formatting ──────────────────────────────────────────────

function attrsStr(attrs: readonly [string, string][]): string {
  if (attrs.length === 0) return '';
  return ' ' + attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ');
}

/**
 * Format a numeric value to a stable string: rounds to 6 decimal
 * places, strips trailing zeros, normalizes `-0` to `0`. Eliminates
 * float-precision noise without losing meaningful decimal places.
 */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  // Avoid `-0` in output.
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  // Strip trailing zeros from decimals; integers don't get a `.` at all.
  if (Number.isInteger(safe)) return String(safe);
  return String(safe);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
