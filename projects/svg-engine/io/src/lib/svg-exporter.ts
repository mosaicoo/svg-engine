import {
  ANIMATION_KEY,
  type AnimationDoc,
  animationToSmil,
  customAttrToDataName,
  type EllipseNode,
  getPageName,
  getPageOptions,
  getPageViewBox,
  type GroupNode,
  type ImageNode,
  isAnimationDoc,
  isGroupNode,
  isLayer,
  isPage,
  isSmartObject,
  type LineNode,
  type NodeId,
  type PathNode,
  type PolygonNode,
  type PolylineNode,
  readAnimationDoc,
  readCustomAttrs,
  type RectNode,
  roundPathCorners,
  type SvgDocument,
  SVGE_PAGE_OPTIONS_KEY,
  type SvgNode,
  type SvgStyle,
  type SymbolUseNode,
  type TextNode,
  type Transform,
  TRANSFORM_PROPERTY_NAMES,
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
    // **D-082 F9c — Animated SVG (SMIL) export** (opt-in). When enabled, build a
    // `nodeId → AnimationDoc` index once so each rendered node can inject its
    // `<animate>`/`<animateTransform>` children. Default OFF keeps the AutoSave
    // round-trip byte-for-byte identical (the animation persists via the
    // `data-svge-animation` JSON attr regardless — F7).
    const emitSmil = document.exportPreferences?.emitSmilAnimation === true;
    const animDocByNode = emitSmil
      ? buildAnimDocIndex(document.root)
      : new Map<NodeId, AnimationDoc>();
    const ctx: ExportContext = { referencedIds, emitTitles, emitSmil, animDocByNode };
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
 * **D-086** — Serialize a SINGLE node to its SVG element markup, in
 * isolation (no document wrapper, no `<defs>`). Reuses the exporter's
 * `renderNode` so a node's geometry/attributes/transform serialize
 * exactly as they would inside a full export.
 *
 * **Primary use**: building `<clipPath>` / `<mask>` definitions from a
 * "clipper" shape for the Object ▸ Mask commands (D-086) — the returned
 * markup is the inner geometry placed inside a `<clipPath>` / `<mask>`
 * element. Titles and SMIL are intentionally OFF (a clip/mask def needs
 * pure geometry, not authored names or animation).
 *
 * **Coordinate space**: the node's own `transform` IS emitted, so the
 * markup paints in the same place the node was on the canvas — exactly
 * what `clipPathUnits="userSpaceOnUse"` / `maskUnits="userSpaceOnUse"`
 * expect. Ancestor-group transforms are NOT baked in (caller's
 * responsibility when the node is nested).
 *
 * @returns the element markup (possibly multi-line/indented), or `''`
 *   when the node is doc-hidden (`metadata.visible === false`).
 */
export function nodeToSvgMarkup(node: SvgNode): string {
  const ctx: ExportContext = {
    referencedIds: new Set<NodeId>(),
    emitTitles: false,
    emitSmil: false,
    animDocByNode: new Map<NodeId, AnimationDoc>(),
  };
  return renderNode(node, 0, ctx);
}

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
  /** **D-082 F9c** — whether to inject SMIL animation children (opt-in). */
  readonly emitSmil: boolean;
  /** **D-082 F9c** — `nodeId → AnimationDoc` index (empty unless `emitSmil`). */
  readonly animDocByNode: ReadonlyMap<NodeId, AnimationDoc>;
}

/**
 * **D-082 F9c** — Pre-scan: map every animated node id to the {@link AnimationDoc}
 * that targets it. AnimationDocs live on container groups (pages / root) under
 * `metadata.customData[ANIMATION_KEY]`; their tracks reference descendant node
 * ids. The first doc that claims a node wins (a node belongs to one page).
 */
function buildAnimDocIndex(root: GroupNode): Map<NodeId, AnimationDoc> {
  const map = new Map<NodeId, AnimationDoc>();
  walk(root, (n) => {
    const doc = readAnimationDoc(n);
    if (doc === null) return;
    for (const track of doc.tracks) {
      if (!map.has(track.nodeId)) map.set(track.nodeId, doc);
    }
  });
  return map;
}

/** The SMIL children + transform-drop flag for a node, or `null` when none. */
interface NodeAnimation {
  /** `<animate>`/`<animateTransform>` element strings (no indentation). */
  readonly smil: readonly string[];
  /**
   * Whether the node's STATIC `transform` attribute must be dropped: a
   * transform-animated node rebuilds its full transform additively via
   * `<animateTransform>` (which bakes the static components as constants), so
   * keeping the static attribute would double-apply it.
   */
  readonly dropTransform: boolean;
}

/**
 * **D-082 F9c** — Resolve a node's SMIL animation for injection. Returns `null`
 * when SMIL export is off, the node isn't animated, or there's nothing to emit
 * (e.g. zero-duration). `animationToSmil` receives the node's static transform
 * so non-animated transform components are baked as constants.
 */
function nodeAnimation(node: SvgNode, ctx: ExportContext): NodeAnimation | null {
  if (!ctx.emitSmil) return null;
  const doc = ctx.animDocByNode.get(node.id);
  if (doc === undefined) return null;
  const smil = animationToSmil(doc, node.id, node.transform);
  if (smil.length === 0) return null;
  const dropTransform = doc.tracks.some(
    (t) => t.nodeId === node.id && TRANSFORM_PROPERTY_NAMES.has(t.property),
  );
  return { smil, dropTransform };
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
 * Render a leaf element (`rect`, `path`, `use`, …) from its geometry-specific
 * attributes, appending the common base attrs (style + transform) and any
 * child elements: a `<title>` (authored name) and — when SMIL export is on
 * (D-082 F9c) and the node is animated — `<animate>` / `<animateTransform>`
 * children. Self-closes when there are no children; otherwise emits the
 * open/children/close form. A transform-animated node drops its static
 * `transform` attribute (rebuilt additively by `<animateTransform>`).
 *
 * `geometryAttrs` are the element-type-specific attributes (e.g. `x`/`y`/
 * `width`/`height` for a rect); base attrs are appended here so the
 * transform-drop decision lives in one place.
 */
function renderLeaf(
  tagName: string,
  geometryAttrs: readonly [string, string][],
  depth: number,
  node: SvgNode,
  ctx: ExportContext,
): string {
  const indent = '  '.repeat(depth);
  const anim = nodeAnimation(node, ctx);
  const attrsString = attrsStr([
    ...geometryAttrs,
    ...baseAttrs(node, anim?.dropTransform ?? false),
  ]);
  const childLines: string[] = [];
  if (shouldEmitTitle(node, ctx)) childLines.push(titleChildLine(node, depth + 1, ctx));
  if (anim !== null) {
    const childIndent = '  '.repeat(depth + 1);
    for (const el of anim.smil) childLines.push(`${childIndent}${el}`);
  }
  if (childLines.length === 0) {
    return `${indent}<${tagName}${attrsString} />`;
  }
  return `${indent}<${tagName}${attrsString}>\n${childLines.join('\n')}\n${indent}</${tagName}>`;
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
  return renderLeaf('use', attrs, depth, node, ctx);
}

function renderGroup(node: GroupNode, depth: number, ctx: ExportContext): string {
  const indent = '  '.repeat(depth);
  // **D-082 F9c** — a group can itself be animated (transform/opacity); resolve
  // its SMIL children + transform-drop before building the attribute set.
  const anim = nodeAnimation(node, ctx);
  const attrs = baseAttrs(node, anim?.dropTransform ?? false);
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
  // **D-082 F7 — Animation Timeline persistence**. Emit the page's
  // AnimationDoc (stored in `metadata.customData[ANIMATION_KEY]`) as a
  // JSON-encoded `data-svge-animation` attribute so the animation survives
  // an export → re-import round-trip — which is exactly how AutoSave
  // persists (it serializes the document through this SVG exporter and
  // recovers by re-importing). Same transport mechanism as the layer /
  // smart-object / page flags, and INDEPENDENT of `data-svge-kind`: a
  // 'page' group can also carry animation. The attribute value is escaped
  // by `escapeAttr` (the JSON's `"` become `&quot;`), so it's valid SVG and
  // is ignored by renderers + preserved by other editors.
  // **D-140-fix** — persist the page presentation options (background /
  // margins / orientation / format) so Document Settings survive an
  // export → re-import round-trip (which is exactly how Save Workspace and
  // AutoSave persist). Same JSON-in-data-attr transport as
  // `data-svge-animation` (escapeAttr turns the `"` into `&quot;`). Emitted
  // ONLY when the page actually has a stored options slot, so a fresh /
  // default page stays clean. Lives here (after the isLayer/isSmartObject/
  // isPage chain) because chained `is GroupNode` guards narrow `node` to
  // `never` inside the isPage branch — the `isPage(node)` guard here
  // re-narrows it to GroupNode from the post-chain SvgNode type.
  if (isPage(node) && node.metadata.customData?.[SVGE_PAGE_OPTIONS_KEY] != null) {
    attrs.push(['data-svge-page-options', JSON.stringify(getPageOptions(node))]);
  }
  const animDoc = node.metadata.customData?.[ANIMATION_KEY];
  if (isAnimationDoc(animDoc)) {
    attrs.push(['data-svge-animation', JSON.stringify(animDoc)]);
  }
  // **D-072 follow-up — Authored name via `<title>` child**. Emitted
  // as the FIRST child of the group so screen readers announce the
  // group's name before traversing its content. Skipped when the
  // group has no authored name OR the document opted out of title
  // emission (`exportPreferences.emitAuthoredTitles === false`).
  const titleLine = shouldEmitTitle(node, ctx) ? titleChildLine(node, depth + 1, ctx) : '';
  // **D-082 F9c** — the group's own `<animate>`/`<animateTransform>` children,
  // emitted right after the title (before child shapes).
  const childIndent = '  '.repeat(depth + 1);
  const animLines = anim !== null ? anim.smil.map((el) => `${childIndent}${el}`) : [];

  if (!isGroupNode(node) || node.children.length === 0) {
    // Empty group still renders (preserves structure for round-trip).
    // When the empty group has a title OR its own animation we MUST switch to
    // open+close form so those children can live inside — self-closing
    // wouldn't permit children.
    const head: string[] = [];
    if (titleLine.length > 0) head.push(titleLine);
    head.push(...animLines);
    if (head.length > 0) {
      return `${indent}<g${attrsStr(attrs)}>\n${head.join('\n')}\n${indent}</g>`;
    }
    return `${indent}<g${attrsStr(attrs)} />`;
  }
  const lines = [`${indent}<g${attrsStr(attrs)}>`];
  if (titleLine.length > 0) lines.push(titleLine);
  lines.push(...animLines);
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
  return renderLeaf('rect', attrs, depth, node, ctx);
}

function renderEllipse(node: EllipseNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['cx', fmt(node.cx)],
    ['cy', fmt(node.cy)],
    ['rx', fmt(node.rx)],
    ['ry', fmt(node.ry)],
  ];
  return renderLeaf('ellipse', attrs, depth, node, ctx);
}

function renderLine(node: LineNode, depth: number, ctx: ExportContext): string {
  const attrs: [string, string][] = [
    ['x1', fmt(node.x1)],
    ['y1', fmt(node.y1)],
    ['x2', fmt(node.x2)],
    ['y2', fmt(node.y2)],
  ];
  return renderLeaf('line', attrs, depth, node, ctx);
}

function renderPolygon(node: PolygonNode, depth: number, ctx: ExportContext): string {
  const points = node.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const attrs: [string, string][] = [['points', points]];
  return renderLeaf('polygon', attrs, depth, node, ctx);
}

function renderPolyline(node: PolylineNode, depth: number, ctx: ExportContext): string {
  const points = node.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const attrs: [string, string][] = [['points', points]];
  return renderLeaf('polyline', attrs, depth, node, ctx);
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
  return renderLeaf('path', attrs, depth, node, ctx);
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

  // **D-082 F9c** — text can be animated (x/y/opacity/fill/transform). Resolve
  // its SMIL + transform-drop once and inject the elements as children in every
  // text shape (textPath / multi-line / single-line). `attrsString` and the
  // child-indent are shared by all branches below.
  const anim = nodeAnimation(node, ctx);
  const attrsString = attrsStr([...attrs, ...baseAttrs(node, anim?.dropTransform ?? false)]);
  const childIndent = '  '.repeat(depth + 1);
  const animLines = anim !== null ? anim.smil.map((el) => `${childIndent}${el}`) : [];
  const titleLine = shouldEmitTitle(node, ctx) ? titleChildLine(node, depth + 1, ctx) : null;
  const titleLines = titleLine !== null ? [titleLine] : [];

  // D-053 — Text on path. When textPathRef is set, content lives inside a
  // <textPath href="#id"> child instead of as direct text. The renderer
  // pre-collapses whitespace; mirror that to avoid the \n-to-space stretch.
  const ref = node.textPathRef;
  if (ref !== undefined && ref !== null && ref !== '') {
    const flat = node.content.replace(/\s+/g, ' ');
    const startOffset = node.textPathStartOffset;
    const offsetAttr =
      startOffset !== undefined && startOffset !== null && startOffset !== ''
        ? ` startOffset="${escapeAttr(startOffset)}"`
        : '';
    const refStr = ref as unknown as string;
    const children = [
      ...titleLines,
      ...animLines,
      `${childIndent}<textPath href="#${escapeAttr(refStr)}"${offsetAttr}>${escapeXml(flat)}</textPath>`,
    ];
    return `${indent}<text${attrsString}>\n${children.join('\n')}\n${indent}</text>`;
  }

  // **D-053/D-069 follow-up — Multi-line tspan emission**. The editor's canvas
  // renderer splits `node.content` on `\n` and emits one `<tspan dy>` per line
  // so the saved file opens elsewhere with the same line layout. Single-line
  // text (no `\n`) keeps the plain-character-data shape for back-compat.
  const lines = node.content.includes('\n') ? node.content.split('\n') : null;

  if (lines !== null) {
    // Each tspan resets `x` to the parent text's `x` (a real line break); `dy`
    // shifts each line down by `lineHeight em`s (first line `0`).
    const lineDy = resolveLineHeightEm(node);
    const xAttr = fmt(node.x);
    const tspans = lines.map((line, i) => {
      const dy = i === 0 ? '0' : lineDy;
      return `${childIndent}<tspan x="${xAttr}" dy="${dy}">${escapeXml(line)}</tspan>`;
    });
    const children = [...titleLines, ...animLines, ...tspans];
    return `${indent}<text${attrsString}>\n${children.join('\n')}\n${indent}</text>`;
  }

  // Single-line. Use the compact inline form ONLY when there are no children
  // (no authored title, no animation); otherwise open/close with children so
  // the title/animation can live inside.
  if (titleLines.length > 0 || animLines.length > 0) {
    const children = [...titleLines, ...animLines, `${childIndent}${escapeXml(node.content)}`];
    return `${indent}<text${attrsString}>\n${children.join('\n')}\n${indent}</text>`;
  }
  return `${indent}<text${attrsString}>${escapeXml(node.content)}</text>`;
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
  // Emit `preserveAspectRatio` when set so the exported `<image>` scales
  // the same way it does on the canvas (the renderer binds the same
  // attribute). Required for page-background images (`xMidYMid slice` =
  // cover) to look identical in the exported file; also a general
  // fidelity fix for any imported image carrying a non-default value.
  if (node.preserveAspectRatio !== undefined && node.preserveAspectRatio.length > 0) {
    attrs.push(['preserveAspectRatio', node.preserveAspectRatio]);
  }
  return renderLeaf('image', attrs, depth, node, ctx);
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
function baseAttrs(node: SvgNode, skipTransform = false): [string, string][] {
  const out: [string, string][] = [];
  out.push(...styleAttrs(node.style));
  // `skipTransform` (D-082 F9c): a transform-animated node rebuilds its whole
  // transform via additive `<animateTransform>`, so the static attribute is
  // dropped to avoid double-applying it.
  if (!skipTransform && !isIdentityTransform(node.transform)) {
    out.push(['transform', transformAttr(node.transform)]);
  }
  // **D-089 — Custom `data-*` attributes**. User-authored key/value props
  // (e.g. `data-sku="123"`) emitted LAST so they read clearly at the end of
  // the attribute list and never interleave with native SVG attrs. Sorted
  // by name for deterministic output (golden-file / diff friendliness).
  // The `data-` prefix puts them in a namespace the SVG render spec ignores
  // and every major editor preserves — pure metadata transport, distinct
  // from the engine's own `data-svge-*` flags (those are reserved and can
  // never be a custom-attr name; see `isValidCustomAttrName`).
  out.push(...customDataAttrs(node));
  return out;
}

/**
 * **D-089** — Serialize a node's custom attributes to `data-<name>` pairs,
 * sorted by name. Empty when the node has none.
 */
function customDataAttrs(node: SvgNode): [string, string][] {
  const attrs = readCustomAttrs(node);
  return Object.keys(attrs)
    .sort()
    .map((name): [string, string] => [customAttrToDataName(name), attrs[name]!]);
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
  if (style.fillRule !== undefined) out.push(['fill-rule', style.fillRule]);
  if (style.filter !== undefined) out.push(['filter', style.filter]);
  if (style.mask !== undefined) out.push(['mask', style.mask]);
  if (style.opacity !== undefined) out.push(['opacity', fmt(style.opacity)]);
  if (style.stroke !== undefined) out.push(['stroke', style.stroke]);
  if (style.strokeDasharray !== undefined && style.strokeDasharray.length > 0) {
    out.push(['stroke-dasharray', style.strokeDasharray.map(fmt).join(' ')]);
  }
  if (style.strokeDashoffset !== undefined) {
    out.push(['stroke-dashoffset', fmt(style.strokeDashoffset)]);
  }
  if (style.strokeLinecap !== undefined) out.push(['stroke-linecap', style.strokeLinecap]);
  if (style.strokeLinejoin !== undefined) out.push(['stroke-linejoin', style.strokeLinejoin]);
  if (style.strokeMiterlimit !== undefined) {
    out.push(['stroke-miterlimit', fmt(style.strokeMiterlimit)]);
  }
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
