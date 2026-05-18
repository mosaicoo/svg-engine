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
  type SvgDocument,
  type SvgNode,
  type SvgStyle,
} from 'svg-engine/core';
import { parseTransformAttr } from '../geometry/transform-attr-parser';
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
    const rootChildren = parseChildren(svgRoot, warnings, unsupportedTags);
    // Convert the collected unsupported tags into ONE warning each
    // (not per-occurrence — avoids flooding for documents with many
    // gradients/filters).
    for (const tag of unsupportedTags) {
      warnings.push(`Unsupported element <${tag}> skipped`);
    }
    const document: SvgDocument = {
      id: generateNodeId(),
      viewBox,
      root: createGroup(rootChildren),
    };
    return { ok: true, document, warnings };
  },
};

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
  // Strip any on* event handlers BEFORE we read the rest of the
  // attributes. They never make it into the model.
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.toLowerCase().startsWith('on')) {
      warnings.push(`Removed event handler "${attr.name}" on <${tag}>`);
      el.removeAttribute(attr.name);
    }
  }
  switch (tag) {
    case 'g':
      return createGroup(parseChildren(el, warnings, unsupportedTags), {
        transform: parseTransformAttr(el.getAttribute('transform')),
        style: parseStyle(el),
      });
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
        { transform: parseTransformAttr(el.getAttribute('transform')), style: parseStyle(el) },
      );
    case 'ellipse':
      return createEllipse(
        {
          cx: numberAttr(el, 'cx', 0),
          cy: numberAttr(el, 'cy', 0),
          rx: numberAttr(el, 'rx', 0),
          ry: numberAttr(el, 'ry', 0),
        },
        { transform: parseTransformAttr(el.getAttribute('transform')), style: parseStyle(el) },
      );
    case 'circle': {
      // SVG <circle r="N"> is the rx=ry=N case of ellipse — fold to
      // ellipse so the model stays small (one shape, not two).
      const r = numberAttr(el, 'r', 0);
      return createEllipse(
        { cx: numberAttr(el, 'cx', 0), cy: numberAttr(el, 'cy', 0), rx: r, ry: r },
        { transform: parseTransformAttr(el.getAttribute('transform')), style: parseStyle(el) },
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
        { transform: parseTransformAttr(el.getAttribute('transform')), style: parseStyle(el) },
      );
    case 'polygon':
      return createPolygon(parsePoints(el.getAttribute('points')), {
        transform: parseTransformAttr(el.getAttribute('transform')),
        style: parseStyle(el),
      });
    case 'polyline':
      return createPolyline(parsePoints(el.getAttribute('points')), {
        transform: parseTransformAttr(el.getAttribute('transform')),
        style: parseStyle(el),
      });
    case 'path':
      return createPath(el.getAttribute('d') ?? '', {
        transform: parseTransformAttr(el.getAttribute('transform')),
        style: parseStyle(el),
      });
    case 'text':
      return createText(
        {
          x: numberAttr(el, 'x', 0),
          y: numberAttr(el, 'y', 0),
          content: el.textContent ?? '',
          fontSize: optionalNumberAttr(el, 'font-size'),
        },
        { transform: parseTransformAttr(el.getAttribute('transform')), style: parseStyle(el) },
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
        { transform: parseTransformAttr(el.getAttribute('transform')), style: parseStyle(el) },
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
