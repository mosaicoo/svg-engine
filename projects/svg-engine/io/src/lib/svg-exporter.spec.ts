import { describe, expect, it } from 'vitest';
import {
  createEllipse,
  createGroup,
  createImage,
  createPath,
  createRect,
  createText,
  type SvgDocument,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { svgExporter } from './svg-exporter';

/**
 * Coverage for the bug-fix iteration that closed the gap between
 * "what the canvas paints" and "what gets serialized" — D-049 style
 * fields (clipPath/mask/mix-blend-mode), D-053 text features
 * (variable fonts, OpenType, text on path), D-055 Live Corners,
 * D-056 metadata.visible.
 */

function exportNode(children: readonly SvgNode[]): string {
  const doc: SvgDocument = {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
  };
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') {
    throw new Error('svgExporter unexpectedly returned non-string');
  }
  return out;
}

describe('svgExporter — D-049 composition style fields', () => {
  it('emits clip-path attribute when set', () => {
    const out = exportNode([
      createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { clipPath: 'url(#myClip)' } }),
    ]);
    expect(out).toContain('clip-path="url(#myClip)"');
  });

  it('emits mask attribute when set', () => {
    const out = exportNode([
      createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { mask: 'url(#myMask)' } }),
    ]);
    expect(out).toContain('mask="url(#myMask)"');
  });

  it('emits mix-blend-mode as inline style', () => {
    const out = exportNode([
      createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { mixBlendMode: 'multiply' } }),
    ]);
    expect(out).toContain('mix-blend-mode: multiply');
  });

  it('emits stroke-dasharray / linecap / linejoin', () => {
    const out = exportNode([
      createPath('M0 0 L10 0', {
        style: {
          strokeDasharray: [4, 2],
          strokeLinecap: 'round',
          strokeLinejoin: 'bevel',
        },
      }),
    ]);
    expect(out).toContain('stroke-dasharray="4 2"');
    expect(out).toContain('stroke-linecap="round"');
    expect(out).toContain('stroke-linejoin="bevel"');
  });
});

describe('svgExporter — D-053 text features', () => {
  it('emits font-variation-settings inline style', () => {
    const text = {
      ...createText({ x: 0, y: 10, content: 'A' }),
      fontVariationSettings: "'wght' 650, 'wdth' 95",
    };
    const out = exportNode([text]);
    expect(out).toContain("font-variation-settings: 'wght' 650, 'wdth' 95");
  });

  it('emits font-feature-settings inline style', () => {
    const text = {
      ...createText({ x: 0, y: 10, content: 'A' }),
      fontFeatureSettings: "'liga' on, 'smcp' on",
    };
    const out = exportNode([text]);
    expect(out).toContain("font-feature-settings: 'liga' on, 'smcp' on");
  });

  it('emits letter-spacing inline style with px unit', () => {
    const text = { ...createText({ x: 0, y: 10, content: 'A' }), letterSpacing: 2 };
    const out = exportNode([text]);
    expect(out).toContain('letter-spacing: 2px');
  });

  it('wraps content in <textPath> when textPathRef set', () => {
    const text = {
      ...createText({ x: 0, y: 10, content: 'Curved' }),
      textPathRef: 'mypath' as never,
      textPathStartOffset: '25%',
    };
    const out = exportNode([text]);
    expect(out).toContain('<textPath href="#mypath" startOffset="25%">Curved</textPath>');
  });
});

describe('svgExporter — D-055 Live Corners', () => {
  it('emits ROUNDED d when cornerRadius > 0', () => {
    const square = 'M0 0 L100 0 L100 100 L0 100 Z';
    const out = exportNode([{ ...createPath(square), cornerRadius: 10 }]);
    // Rounded version contains arcs (A commands).
    const arcCount = (out.match(/\bA[0-9]/g) ?? []).length;
    expect(arcCount).toBe(4);
  });

  it('emits authored d unchanged when cornerRadius is 0/undefined', () => {
    const square = 'M0 0 L100 0 L100 100 L0 100 Z';
    const out = exportNode([createPath(square)]);
    expect(out).toContain(`d="${square}"`);
  });
});

describe('svgExporter — D-056 metadata.visible', () => {
  it('skips nodes with metadata.visible === false', () => {
    const visible = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const hidden = createRect(
      { x: 20, y: 0, width: 10, height: 10 },
      { metadata: { visible: false } },
    );
    const out = exportNode([visible, hidden]);
    expect(out).toContain('x="0"');
    expect(out).not.toContain('x="20"');
  });

  it('keeps visible siblings inside groups when one is hidden', () => {
    const visible = createEllipse({ cx: 5, cy: 5, rx: 3, ry: 3 });
    const hidden = createRect(
      { x: 50, y: 50, width: 10, height: 10 },
      { metadata: { visible: false } },
    );
    const group = createGroup([visible, hidden]);
    const out = exportNode([group]);
    expect(out).toContain('<ellipse');
    expect(out).not.toContain('<rect');
  });
});

// ── D-068 follow-up — id emission for textPath-referenced paths ────
//
// Bug fix: D-053 exporter emitted <textPath href="#id"> but the path
// itself was emitted without an `id` attribute (per the general
// "ids are runtime-only" rule). Result: opening the exported file
// dangled the href and the text disappeared in every SVG viewer.
// Fix: pre-scan the doc tree for textPathRef targets, emit `id` on
// the path nodes that are referenced. Other paths still omit id
// (preserves the runtime-only intent for the common case).

import { collectReferencedPathIds } from './svg-exporter';
import type { GroupNode, NodeId } from '@mosaicoo/svg-engine/core';

describe('svgExporter — D-068 follow-up: id emission for referenced paths', () => {
  it('emits id="..." on a path that some text node references via textPathRef', () => {
    const targetPath = createPath('M0 50 Q50 0 100 50');
    const followingText = {
      ...createText({ x: 0, y: 0, content: 'On the curve' }),
      textPathRef: targetPath.id,
    };
    const out = exportNode([targetPath, followingText]);
    // path renders with id
    expect(out).toContain(`id="${targetPath.id}"`);
    // textPath href matches the path id (fragment resolves now)
    expect(out).toContain(`<textPath href="#${targetPath.id}"`);
  });

  it('does NOT emit id on a path that nobody references (runtime-only intent preserved)', () => {
    const lonelyPath = createPath('M0 0 L10 10');
    const out = exportNode([lonelyPath]);
    expect(out).not.toContain(`id="${lonelyPath.id}"`);
    // The d still emits — only id is suppressed
    expect(out).toContain('<path d="M0 0 L10 10"');
  });

  it('emits id ONLY on referenced paths when both kinds coexist', () => {
    const referenced = createPath('M0 50 Q50 0 100 50');
    const unreferenced = createPath('M200 0 L300 0');
    const text = {
      ...createText({ x: 0, y: 0, content: 'Hi' }),
      textPathRef: referenced.id,
    };
    const out = exportNode([referenced, unreferenced, text]);
    expect(out).toContain(`id="${referenced.id}"`);
    expect(out).not.toContain(`id="${unreferenced.id}"`);
  });

  it('finds textPathRef inside nested groups (pre-scan walks the whole tree)', () => {
    const referenced = createPath('M0 50 Q50 0 100 50');
    const text = {
      ...createText({ x: 0, y: 0, content: 'Hi' }),
      textPathRef: referenced.id,
    };
    // text lives 2 levels deep — exercise walk descent
    const inner = createGroup([text]);
    const outer = createGroup([referenced, inner]);
    const out = exportNode([outer]);
    expect(out).toContain(`id="${referenced.id}"`);
  });
});

describe('collectReferencedPathIds — pure helper', () => {
  function root(children: readonly SvgNode[]): GroupNode {
    return createGroup(children, { id: 'root' as never });
  }

  it('returns empty set when no text node has textPathRef', () => {
    const r = root([createPath('M0 0 L10 10'), createText({ x: 0, y: 0, content: 'Hi' })]);
    expect(collectReferencedPathIds(r).size).toBe(0);
  });

  it('collects ids from textPathRef across the whole tree', () => {
    const p1 = createPath('M0 0 L10 10');
    const p2 = createPath('M50 50 L100 100');
    const t1 = { ...createText({ x: 0, y: 0, content: 'A' }), textPathRef: p1.id };
    const t2 = { ...createText({ x: 0, y: 0, content: 'B' }), textPathRef: p2.id };
    const r = root([p1, p2, t1, t2]);
    const ids = collectReferencedPathIds(r);
    expect(ids.has(p1.id)).toBe(true);
    expect(ids.has(p2.id)).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('ignores empty / undefined textPathRef (does not pollute the set)', () => {
    const t1 = createText({ x: 0, y: 0, content: 'A' }); // undefined
    const t2 = { ...createText({ x: 0, y: 0, content: 'B' }), textPathRef: '' as NodeId };
    const r = root([t1, t2]);
    expect(collectReferencedPathIds(r).size).toBe(0);
  });
});

// ── D-149 — authored id round-trip (metadata.sourceId → id="...") ─────

describe('svgExporter — D-149 authored id round-trip', () => {
  function docWith(children: readonly SvgNode[], prefs?: SvgDocument['exportPreferences']): string {
    const doc: SvgDocument = {
      id: 'doc' as never,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup(children, { id: 'root' as never }),
      ...(prefs ? { exportPreferences: prefs } : {}),
    };
    const out = svgExporter.export(doc);
    if (typeof out !== 'string') {
      throw new Error('svgExporter unexpectedly returned non-string');
    }
    return out;
  }

  it('re-emits an authored sourceId as id="..." (default on-when-present)', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { sourceId: 'innerroot' } },
    );
    expect(docWith([rect])).toContain('id="innerroot"');
  });

  it('works for groups too (a <g id="..."> from an authoring tool)', () => {
    const g = createGroup([], { metadata: { name: 'Layer', sourceId: 'grp-1' } });
    const out = docWith([g]);
    expect(out).toContain('id="grp-1"');
  });

  it('emits NO id for an editor-created node (no sourceId)', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const out = docWith([rect]);
    expect(out).not.toContain(' id=');
  });

  it('emitAuthoredIds:false suppresses the id (stripAuthoredIds optimizer path)', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { sourceId: 'innerroot' } },
    );
    const out = docWith([rect], { emitAuthoredIds: false });
    expect(out).not.toContain('id="innerroot"');
  });

  it('deduplicates a sourceId shared by two nodes (valid SVG never repeats an id)', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 }, { metadata: { sourceId: 'dup' } });
    const b = createRect({ x: 20, y: 0, width: 10, height: 10 }, { metadata: { sourceId: 'dup' } });
    const out = docWith([a, b]);
    expect(out).toContain('id="dup"');
    expect(out).toContain('id="dup-2"');
  });

  it('sanitizes an id that would corrupt the attribute (whitespace stripped)', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { sourceId: 'has space' } },
    );
    expect(docWith([rect])).toContain('id="hasspace"');
  });

  it('a textPath target with a sourceId links via that id (path id === href)', () => {
    const targetPath = { ...createPath('M0 50 Q50 0 100 50'), metadata: { sourceId: 'wave' } };
    const text = {
      ...createText({ x: 0, y: 0, content: 'On the curve' }),
      textPathRef: targetPath.id,
    };
    const out = docWith([targetPath, text]);
    expect(out).toContain('id="wave"');
    expect(out).toContain('<textPath href="#wave"');
    // the runtime UUID must NOT appear as the link (the authored id wins)
    expect(out).not.toContain(`href="#${targetPath.id}"`);
  });
});

// ── D-069 — typography basics (font-style / text-decoration) ─────────
//
// The fontSize/fontFamily/fontWeight/textAnchor attrs were already
// exported pre-D-069; D-069 adds 3 new text-level fields. `lineHeight`
// is intentionally NOT emitted in the current exporter (the exporter
// emits content as a single plain run, so per-line dy doesn't apply —
// see renderText comment). When future multi-line tspan emission lands,
// lineHeight should join then.

describe('svgExporter — D-069 typography basics', () => {
  it('emits font-style attribute when set to italic', () => {
    const t = { ...createText({ x: 0, y: 10, content: 'Hi' }), fontStyle: 'italic' as const };
    const out = exportNode([t]);
    expect(out).toContain('font-style="italic"');
  });

  it('emits text-decoration attribute when set to underline', () => {
    const t = {
      ...createText({ x: 0, y: 10, content: 'Hi' }),
      textDecoration: 'underline' as const,
    };
    const out = exportNode([t]);
    expect(out).toContain('text-decoration="underline"');
  });

  it('emits text-decoration line-through', () => {
    const t = {
      ...createText({ x: 0, y: 10, content: 'Hi' }),
      textDecoration: 'line-through' as const,
    };
    const out = exportNode([t]);
    expect(out).toContain('text-decoration="line-through"');
  });

  it('omits font-style and text-decoration when undefined (no garbage attrs)', () => {
    const t = createText({ x: 0, y: 10, content: 'Hi' });
    const out = exportNode([t]);
    expect(out).not.toContain('font-style=');
    expect(out).not.toContain('text-decoration=');
  });

  it('emits all four pre-D-069 typography attrs together with new ones', () => {
    const t = {
      ...createText({ x: 0, y: 10, content: 'Hi' }),
      fontSize: 24,
      fontFamily: 'Arial',
      fontWeight: 700 as const,
      textAnchor: 'middle' as const,
      fontStyle: 'italic' as const,
      textDecoration: 'underline' as const,
    };
    const out = exportNode([t]);
    expect(out).toContain('font-size="24"');
    expect(out).toContain('font-family="Arial"');
    expect(out).toContain('font-weight="700"');
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain('font-style="italic"');
    expect(out).toContain('text-decoration="underline"');
  });
});

// ── D-053 / D-069 follow-up — Multi-line tspan emission ───────────
//
// Pre-fix the exporter emitted text content as a single plain run
// with literal `\n`s (collapsed to a space by most SVG viewers).
// Post-fix it splits on `\n` and emits one `<tspan x dy>` per line,
// matching the canvas renderer so WYSIWYG holds when the file is
// opened elsewhere. Single-line text stays in the legacy plain-CDATA
// shape (back-compat with snapshots / 3rd-party tools).
describe('svgExporter — D-053/D-069 multi-line tspan emission', () => {
  it('keeps single-line text as plain character data (back-compat)', () => {
    const t = createText({ x: 0, y: 10, content: 'single' });
    const out = exportNode([t]);
    // Inline form: <text ...>single</text> — no tspan, no newlines
    // inside <text>.
    expect(out).toMatch(/<text[^>]*>single<\/text>/);
    expect(out).not.toContain('<tspan');
  });

  it('splits multi-line content into one <tspan> per line', () => {
    const t = createText({ x: 5, y: 12, content: 'one\ntwo\nthree' });
    const out = exportNode([t]);
    // Each line becomes its own tspan with x reset and dy.
    expect(out).toContain('<tspan x="5" dy="0">one</tspan>');
    expect(out).toContain('<tspan x="5" dy="1.2em">two</tspan>');
    expect(out).toContain('<tspan x="5" dy="1.2em">three</tspan>');
  });

  it('uses node.lineHeight when set (overrides default 1.2em)', () => {
    const t = { ...createText({ x: 0, y: 10, content: 'a\nb' }), lineHeight: 1.5 };
    const out = exportNode([t]);
    expect(out).toContain('<tspan x="0" dy="0">a</tspan>');
    expect(out).toContain('<tspan x="0" dy="1.5em">b</tspan>');
  });

  it('falls back to 1.2em when lineHeight is non-finite or <= 0 (defensive)', () => {
    const bad = { ...createText({ x: 0, y: 10, content: 'a\nb' }), lineHeight: 0 };
    const out = exportNode([bad]);
    // dy on the second line uses the default, not "0em".
    expect(out).toContain('<tspan x="0" dy="1.2em">b</tspan>');
  });

  it('escapes XML special chars per-line (no double-escape, no leak)', () => {
    const t = createText({ x: 0, y: 10, content: '<a&b>\n"c"' });
    const out = exportNode([t]);
    expect(out).toContain('<tspan x="0" dy="0">&lt;a&amp;b&gt;</tspan>');
    // " inside CDATA stays literal (escapeXml only handles & < >);
    // attribute values use escapeAttr — they're not at risk here.
    expect(out).toContain('<tspan x="0" dy="1.2em">"c"</tspan>');
  });

  it('keeps <title> child BEFORE the tspans when authored name is set', () => {
    const t = {
      ...createText({ x: 0, y: 10, content: 'line1\nline2' }),
      metadata: { name: 'Greeting' },
    };
    const out = exportNode([t]);
    // <title> appears before the first tspan in the output.
    const titleIdx = out.indexOf('<title>Greeting</title>');
    const firstTspanIdx = out.indexOf('<tspan');
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(firstTspanIdx).toBeGreaterThan(titleIdx);
  });

  it('textPath still flattens \\n to space (textPath does not honour line breaks)', () => {
    const t = {
      ...createText({ x: 0, y: 10, content: 'curve\nbreak' }),
      textPathRef: 'mypath' as never,
    };
    const out = exportNode([t]);
    // No tspans in textPath case; the runtime flattens whitespace.
    expect(out).toContain('<textPath href="#mypath">curve break</textPath>');
    expect(out).not.toContain('<tspan');
  });

  it('round-trips multi-line content through import (full export → import)', async () => {
    // Pure round-trip — export emits tspans, importer reads them back
    // into the original `\n`-separated content string.
    if (typeof DOMParser === 'undefined') return;
    const { svgImporter } = await import('./svg-importer');
    const original = createText({ x: 4, y: 20, content: 'alpha\nbeta\ngamma' });
    const doc: SvgDocument = {
      id: 'd' as never,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup([original], { id: 'r' as never }),
    };
    const xml = svgExporter.export(doc);
    if (typeof xml !== 'string') throw new Error('exporter returned non-string');
    const reimported = svgImporter.import(xml);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const text = reimported.document.root.children.find((c: SvgNode) => c.type === 'text');
    expect(text).toBeDefined();
    if (text === undefined || text.type !== 'text') return;
    expect(text.content).toBe('alpha\nbeta\ngamma');
  });

  it('round-trips single-line content unchanged (back-compat path)', async () => {
    if (typeof DOMParser === 'undefined') return;
    const { svgImporter } = await import('./svg-importer');
    const original = createText({ x: 0, y: 10, content: 'just one line' });
    const doc: SvgDocument = {
      id: 'd' as never,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup([original], { id: 'r' as never }),
    };
    const xml = svgExporter.export(doc);
    if (typeof xml !== 'string') throw new Error('exporter returned non-string');
    const reimported = svgImporter.import(xml);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    const text = reimported.document.root.children.find((c: SvgNode) => c.type === 'text');
    expect(text).toBeDefined();
    if (text === undefined || text.type !== 'text') return;
    expect(text.content).toBe('just one line');
  });
});

describe('svgExporter — image preserveAspectRatio', () => {
  it('emits preserveAspectRatio when set (page-background "cover" + general fidelity)', () => {
    const out = exportNode([
      createImage({
        x: 0,
        y: 0,
        width: 50,
        height: 40,
        href: 'pic.png',
        preserveAspectRatio: 'xMidYMid slice',
      }),
    ]);
    expect(out).toContain('href="pic.png"');
    expect(out).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it('omits preserveAspectRatio when not set (default meet)', () => {
    const out = exportNode([createImage({ x: 0, y: 0, width: 50, height: 40, href: 'pic.png' })]);
    expect(out).not.toContain('preserveAspectRatio');
  });
});
