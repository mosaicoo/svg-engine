import {
  type EllipseNode,
  type GroupNode,
  type ImageNode,
  isGroupNode,
  type LineNode,
  type PathNode,
  type PolygonNode,
  type PolylineNode,
  type RectNode,
  type SvgDocument,
  type SvgNode,
  type SvgStyle,
  type TextNode,
  type Transform,
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
      lines.push(renderNode(child, 1));
    }
    lines.push('</svg>');
    return lines.join('\n');
  },
};

// ── Element renderers ─────────────────────────────────────────────

function renderNode(node: SvgNode, depth: number): string {
  switch (node.type) {
    case 'group':
      return renderGroup(node, depth);
    case 'rect':
      return renderRect(node, depth);
    case 'ellipse':
      return renderEllipse(node, depth);
    case 'line':
      return renderLine(node, depth);
    case 'polygon':
      return renderPolygon(node, depth);
    case 'polyline':
      return renderPolyline(node, depth);
    case 'path':
      return renderPath(node, depth);
    case 'text':
      return renderText(node, depth);
    case 'image':
      return renderImage(node, depth);
  }
}

function renderGroup(node: GroupNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs = baseAttrs(node);
  if (!isGroupNode(node) || node.children.length === 0) {
    // Empty group still renders (preserves structure for round-trip).
    return `${indent}<g${attrsStr(attrs)} />`;
  }
  const lines = [`${indent}<g${attrsStr(attrs)}>`];
  for (const child of node.children) {
    lines.push(renderNode(child, depth + 1));
  }
  lines.push(`${indent}</g>`);
  return lines.join('\n');
}

function renderRect(node: RectNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
    ['width', fmt(node.width)],
    ['height', fmt(node.height)],
  ];
  if (node.rx !== undefined) attrs.push(['rx', fmt(node.rx)]);
  if (node.ry !== undefined) attrs.push(['ry', fmt(node.ry)]);
  return `${indent}<rect${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

function renderEllipse(node: EllipseNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [
    ['cx', fmt(node.cx)],
    ['cy', fmt(node.cy)],
    ['rx', fmt(node.rx)],
    ['ry', fmt(node.ry)],
  ];
  return `${indent}<ellipse${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

function renderLine(node: LineNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [
    ['x1', fmt(node.x1)],
    ['y1', fmt(node.y1)],
    ['x2', fmt(node.x2)],
    ['y2', fmt(node.y2)],
  ];
  return `${indent}<line${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

function renderPolygon(node: PolygonNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const points = node.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const attrs: [string, string][] = [['points', points]];
  return `${indent}<polygon${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

function renderPolyline(node: PolylineNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const points = node.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
  const attrs: [string, string][] = [['points', points]];
  return `${indent}<polyline${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

function renderPath(node: PathNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [['d', node.d]];
  return `${indent}<path${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

function renderText(node: TextNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
  ];
  if (node.fontSize !== undefined) attrs.push(['font-size', fmt(node.fontSize)]);
  if (node.fontFamily !== undefined) attrs.push(['font-family', node.fontFamily]);
  if (node.fontWeight !== undefined) attrs.push(['font-weight', String(node.fontWeight)]);
  if (node.textAnchor !== undefined) attrs.push(['text-anchor', node.textAnchor]);
  return `${indent}<text${attrsStr([...attrs, ...baseAttrs(node)])}>${escapeXml(node.content)}</text>`;
}

function renderImage(node: ImageNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: [string, string][] = [
    ['x', fmt(node.x)],
    ['y', fmt(node.y)],
    ['width', fmt(node.width)],
    ['height', fmt(node.height)],
    ['href', node.href],
  ];
  return `${indent}<image${attrsStr([...attrs, ...baseAttrs(node)])} />`;
}

// ── Base attributes (transform, style, id) ─────────────────────────

function baseAttrs(node: SvgNode): [string, string][] {
  const out: [string, string][] = [];
  // Style attrs first (presentation properties), then transform, then
  // id. Fixed order for byte-stable output.
  out.push(...styleAttrs(node.style));
  if (!isIdentityTransform(node.transform)) {
    out.push(['transform', transformAttr(node.transform)]);
  }
  // id is omitted from export — ids are runtime editor state, not
  // serializable model. Re-import generates fresh ids.
  return out;
}

function styleAttrs(style: SvgStyle): [string, string][] {
  const out: [string, string][] = [];
  // Canonical alphabetical order — predictable diffs.
  if (style.fill !== undefined) out.push(['fill', style.fill]);
  if (style.fillOpacity !== undefined) out.push(['fill-opacity', fmt(style.fillOpacity)]);
  if (style.opacity !== undefined) out.push(['opacity', fmt(style.opacity)]);
  if (style.stroke !== undefined) out.push(['stroke', style.stroke]);
  if (style.strokeOpacity !== undefined) out.push(['stroke-opacity', fmt(style.strokeOpacity)]);
  if (style.strokeWidth !== undefined) out.push(['stroke-width', fmt(style.strokeWidth)]);
  if (style.visibility !== undefined) out.push(['visibility', style.visibility]);
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
