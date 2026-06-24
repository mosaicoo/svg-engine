import type { SvgDocument } from 'svg-engine/core';
import { svgExporter } from '../svg-exporter';
import type { CodeGenerator, CodeGeneratorOptions } from './code-generator-types';

/**
 * **D-110 — Built-in code generators (Group A).** Pure
 * `SvgDocument → string` transforms that reuse {@link svgExporter} as the
 * base serialization and reshape it into the target language:
 *
 * - {@link reactJsxGenerator} — inline `<svg>` JSX (camelCased attributes).
 * - {@link reactComponentGenerator} — a standalone React component file.
 * - {@link dataUriGenerator} — a `data:image/svg+xml,…` URI.
 *
 * All transforms operate on the exporter's deterministic, double-quoted
 * output (presentation attributes in kebab-case, the few CSS-only props via
 * `style="…"`, a leading `<?xml?>` prolog). They are pure (no DOM): the JSX
 * rewrite is string-based so the module stays worker-safe and unit-testable
 * without a DOM. **Caveat**: a verbatim `<defs>` fragment carried from an
 * imported file with single-quoted attributes won't be camelCased (its tags
 * don't match the double-quote attribute pattern) — acceptable for v1, since
 * our own importer/exporter use double quotes throughout.
 */

// ── Shared SVG-string helpers ──────────────────────────────────────────

const XML_PROLOG_RE = /^\s*<\?xml[^>]*\?>\s*/;

/** Drop the leading `<?xml …?>` declaration — unwanted in JSX / data URIs. */
export function stripXmlProlog(svg: string): string {
  return svg.replace(XML_PROLOG_RE, '');
}

/**
 * Replace concrete `fill`/`stroke` colors with `currentColor` so the output
 * inherits the surrounding text color (the standard themeable-icon pattern).
 * Leaves `none`, `transparent`, `url(#…)` paint-server refs, and values
 * already set to `currentColor` untouched.
 */
export function applyCurrentColor(svg: string): string {
  return svg.replace(
    /\b(fill|stroke)="(?!none"|transparent"|currentColor"|url\()[^"]*"/g,
    '$1="currentColor"',
  );
}

// ── JSX transform ───────────────────────────────────────────────────────

/** Decode the 4 XML entities the exporter emits (for `style` object values). */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** `kebab-case` → `camelCase` (single segment helper). */
function camelize(name: string): string {
  return name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Map an SVG attribute name to its JSX spelling:
 * - `class` → `className`, `for` → `htmlFor`
 * - `data-*` / `aria-*` kept hyphenated (valid JSX, React passes them through)
 * - namespaced `xlink:href` → `xlinkHref`, `xml:space` → `xmlSpace`
 * - any remaining `kebab-case` → `camelCase`
 */
function jsxAttrName(name: string): string {
  if (name === 'class') return 'className';
  if (name === 'for') return 'htmlFor';
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  if (name.includes(':')) {
    return name
      .split(':')
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .map(camelize)
      .join('');
  }
  if (name.includes('-')) return camelize(name);
  return name;
}

/** Convert a `style="a: b; c: d"` attribute value into a JSX object literal. */
function styleStringToJsxObject(value: string): string {
  const props = decodeXmlEntities(value)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx === -1) return null;
      const prop = decl.slice(0, idx).trim();
      const val = decl.slice(idx + 1).trim();
      // CSS custom properties keep their literal name as a quoted key.
      const key = prop.startsWith('--') ? `'${prop}'` : camelize(prop);
      return `${key}: ${JSON.stringify(val)}`;
    })
    .filter((x): x is string => x !== null);
  return `{{ ${props.join(', ')} }}`;
}

const OPEN_TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[:\w-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
// Leading `\s*` is consumed so each attribute renormalizes to a single
// leading space — avoids double spaces when rewriting names in place.
const ATTR_RE = /\s*([:\w-]+)\s*=\s*"([^"]*)"/g;

/**
 * Rewrite a serialized SVG string into JSX: strips the `<?xml?>` prolog and
 * rewrites every opening/self-closing tag's attributes (names → JSX, `style`
 * string → object). Text nodes and entities are left as-is — JSX decodes the
 * exporter's `&amp;`/`&lt;`/`&gt;` in element children correctly.
 */
export function svgStringToJsx(svg: string): string {
  const body = stripXmlProlog(svg);
  return body.replace(OPEN_TAG_RE, (_full, tag: string, attrs: string, selfClose: string) => {
    const newAttrs = attrs.replace(ATTR_RE, (_am, name: string, value: string) => {
      if (name === 'style') return ` style=${styleStringToJsxObject(value)}`;
      return ` ${jsxAttrName(name)}="${value}"`;
    });
    return `<${tag}${newAttrs}${selfClose ? ' />' : '>'}`;
  });
}

// ── Data URI ────────────────────────────────────────────────────────────

/** UTF-8-safe base64 (btoa requires Latin1; chunked to avoid stack limits). */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Serialize an SVG string to a `data:` URI. `url` encoding (default) uses
 * `encodeURIComponent` — valid in `<img src>` and (quoted) CSS `url()`, and
 * typically smaller than base64 for attribute-light icons. `base64` is the
 * classic, universally-accepted form.
 */
export function svgToDataUri(svg: string, encoding: 'url' | 'base64'): string {
  const body = stripXmlProlog(svg).trim();
  if (encoding === 'base64') return `data:image/svg+xml;base64,${utf8ToBase64(body)}`;
  return `data:image/svg+xml,${encodeURIComponent(body)}`;
}

// ── Component-name + indentation helpers ────────────────────────────────

/** Coerce an arbitrary label into a PascalCase identifier (≥1 leading letter). */
export function toPascalCaseComponentName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (cleaned.length === 0) return 'Icon';
  const pascal = cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[a-zA-Z]/.test(pascal) ? pascal : `Icon${pascal}`;
}

function indentLines(text: string, indent: string): string {
  return text
    .split('\n')
    .map((l) => (l.length > 0 ? indent + l : l))
    .join('\n');
}

/** Insert `{...props}` into the first (opening `<svg…>`) tag of a JSX string. */
function injectPropsSpread(jsx: string): string {
  const nl = jsx.indexOf('\n');
  const firstLine = nl === -1 ? jsx : jsx.slice(0, nl);
  const rest = nl === -1 ? '' : jsx.slice(nl);
  if (firstLine.endsWith('/>')) {
    return `${firstLine.slice(0, -2).trimEnd()} {...props} />${rest}`;
  }
  if (firstLine.endsWith('>')) {
    return `${firstLine.slice(0, -1).trimEnd()} {...props}>${rest}`;
  }
  return jsx;
}

// ── Base serialization ──────────────────────────────────────────────────

/**
 * Call the built-in SVG exporter and narrow its `string | Promise` return to
 * `string`. `svgExporter` is synchronous by contract (it always returns a
 * string); the union comes from the generic {@link Exporter} type. Same guard
 * the source-viewer dialog uses.
 */
function exportSvgString(doc: SvgDocument): string {
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') {
    throw new Error('svgExporter unexpectedly returned a non-string');
  }
  return out;
}

/** Exporter output minus the prolog, with optional currentColor swap. */
function inlineSvg(doc: SvgDocument, currentColor: boolean): string {
  let svg = stripXmlProlog(exportSvgString(doc));
  if (currentColor) svg = applyCurrentColor(svg);
  return svg;
}

function boolOpt(options: CodeGeneratorOptions | undefined, key: string): boolean {
  return options?.[key] === true;
}

// ── Built-in generators ─────────────────────────────────────────────────

/** Inline SVG-as-JSX (camelCased attributes) for pasting into a component. */
export const reactJsxGenerator: CodeGenerator = {
  id: 'svge.codegen.react-jsx',
  name: 'React JSX',
  description: 'Inline <svg> with camelCased attributes — paste straight into JSX.',
  language: 'jsx',
  extension: 'jsx',
  options: [
    {
      kind: 'boolean',
      key: 'currentColor',
      label: 'Use currentColor for fills/strokes',
      default: false,
      hint: 'Lets the icon inherit the surrounding text color.',
    },
  ],
  generate(doc, options) {
    return svgStringToJsx(inlineSvg(doc, boolOpt(options, 'currentColor')));
  },
};

/** A standalone React component (.tsx/.jsx) that spreads props onto `<svg>`. */
export const reactComponentGenerator: CodeGenerator = {
  id: 'svge.codegen.react-component',
  name: 'React Component',
  description: 'A standalone component that forwards props onto the <svg> root.',
  language: 'tsx',
  extension: 'tsx',
  options: [
    {
      kind: 'text',
      key: 'componentName',
      label: 'Component name',
      default: 'Icon',
      placeholder: 'Icon',
    },
    { kind: 'boolean', key: 'typescript', label: 'TypeScript', default: true },
    { kind: 'boolean', key: 'namedExport', label: 'Named export (vs default)', default: false },
    {
      kind: 'boolean',
      key: 'currentColor',
      label: 'Use currentColor for fills/strokes',
      default: false,
    },
  ],
  generate(doc, options) {
    const rawName = options?.['componentName'];
    const name = toPascalCaseComponentName(
      typeof rawName === 'string' && rawName.trim().length > 0 ? rawName : 'Icon',
    );
    // typescript defaults ON (absent → true); the others default OFF.
    const typescript = options?.['typescript'] !== false;
    const named = boolOpt(options, 'namedExport');
    const currentColor = boolOpt(options, 'currentColor');

    const jsx = injectPropsSpread(svgStringToJsx(inlineSvg(doc, currentColor)));
    const body = indentLines(jsx, '      ');

    const importLine = typescript ? `import type { SVGProps } from 'react';\n\n` : '';
    const signature = typescript ? `${name}(props: SVGProps<SVGSVGElement>)` : `${name}(props)`;
    const exportKw = named ? 'export function' : 'export default function';
    return `${importLine}${exportKw} ${signature} {\n` + `  return (\n${body}\n  );\n` + `}\n`;
  },
};

/** A `data:image/svg+xml,…` URI for CSS `background-image` or an `<img>` src. */
export const dataUriGenerator: CodeGenerator = {
  id: 'svge.codegen.data-uri',
  name: 'Data URI',
  description: 'A data: URI for CSS background-image or an <img> src.',
  language: 'text',
  extension: 'txt',
  options: [
    {
      kind: 'select',
      key: 'encoding',
      label: 'Encoding',
      default: 'url',
      choices: [
        { value: 'url', label: 'URL-encoded (smaller)' },
        { value: 'base64', label: 'Base64' },
      ],
    },
  ],
  generate(doc, options) {
    const encoding = options?.['encoding'] === 'base64' ? 'base64' : 'url';
    return svgToDataUri(exportSvgString(doc), encoding);
  },
};

/** The Group-A built-in set, in display order. */
export const BUILTIN_CODE_GENERATORS: readonly CodeGenerator[] = [
  reactJsxGenerator,
  reactComponentGenerator,
  dataUriGenerator,
];
