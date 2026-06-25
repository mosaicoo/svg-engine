import {
  createGroup,
  createText,
  type NodeId,
  type SvgDocument,
  type SvgNode,
  type TextNode,
} from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-100 — rich text (per-run styling) round-trip.**
 *
 * `<text>` gained an optional `runs` array (one inline `<tspan>` per styled
 * segment). These specs lock the io contract:
 * - import: styled inline tspans → `runs`; `content` mirrors the concatenated
 *   run text; multi-line (`dy`) and unstyled tspans stay on the plain path.
 * - export: runs → inline, whitespace-tight tspans (no spurious spaces).
 * - round-trip: runs survive export → re-import.
 */

const skip = typeof DOMParser === 'undefined';

function wrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${inner}</svg>`;
}

function firstChild(xml: string): SvgNode {
  const result = svgImporter.import(xml);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.document.root.children[0]!;
}

function exportNode(node: SvgNode): string {
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 200, height: 200 },
    root: createGroup([node], { id: 'root' as NodeId }),
  };
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') throw new Error('exporter returned non-string');
  return out;
}

describe('D-100 — rich text import (styled inline tspans → runs)', () => {
  it('builds runs from styled tspans and sets content to their concatenation', () => {
    if (skip) return;
    const t = firstChild(
      wrap(
        `<text x="10" y="20"><tspan>Hello </tspan><tspan fill="#e00" font-weight="bold">world</tspan></text>`,
      ),
    ) as TextNode;
    expect(t.type).toBe('text');
    expect(t.runs).toBeDefined();
    expect(t.runs!.length).toBe(2);
    expect(t.runs![0].text).toBe('Hello ');
    expect(t.runs![1].text).toBe('world');
    expect(t.runs![1].fill).toBe('#e00');
    expect(t.runs![1].fontWeight).toBe('bold');
    // content is the faithful plain-text projection (concatenation, no \n).
    expect(t.content).toBe('Hello world');
  });

  it('reads per-run style from inline style= too', () => {
    if (skip) return;
    const t = firstChild(
      wrap(
        `<text x="0" y="0"><tspan>a</tspan><tspan style="fill: #08f; font-style: italic">b</tspan></text>`,
      ),
    ) as TextNode;
    expect(t.runs).toBeDefined();
    expect(t.runs![1].fill).toBe('#08f');
    expect(t.runs![1].fontStyle).toBe('italic');
  });

  it('multi-line tspans (with dy) are NOT runs — stay on the plain \\n path', () => {
    if (skip) return;
    const t = firstChild(
      wrap(
        `<text x="0" y="0"><tspan x="0" dy="0">line1</tspan><tspan x="0" dy="1.2em">line2</tspan></text>`,
      ),
    ) as TextNode;
    expect(t.runs).toBeUndefined();
    expect(t.content).toBe('line1\nline2');
  });

  it('unstyled inline tspans are NOT runs (indistinguishable from bare text)', () => {
    if (skip) return;
    const t = firstChild(
      wrap(`<text x="0" y="0"><tspan>a</tspan><tspan>b</tspan></text>`),
    ) as TextNode;
    expect(t.runs).toBeUndefined();
  });

  it('runs are ignored when the text is on a path (textPath wins)', () => {
    if (skip) return;
    const t = firstChild(
      wrap(`<text x="0" y="0"><textPath href="#p"><tspan fill="#e00">x</tspan></textPath></text>`),
    ) as TextNode;
    expect(t.textPathRef).toBe('p');
    expect(t.runs).toBeUndefined();
  });
});

describe('D-100 — rich text export (inline, whitespace-tight tspans)', () => {
  it('emits one tspan per run with no whitespace between them', () => {
    if (skip) return;
    const node = createText({
      x: 0,
      y: 0,
      content: 'Hello world',
      runs: [{ text: 'Hello ' }, { text: 'world', fill: '#e00', fontWeight: 'bold' }],
    });
    const out = exportNode(node);
    // Adjacent tspans must touch — no newline/space between, or a browser
    // would paint a spurious gap between the runs.
    expect(out).toContain('</tspan><tspan');
    expect(out).not.toMatch(/<\/tspan>\s+<tspan/);
    expect(out).toContain('fill="#e00"');
    expect(out).toContain('font-weight="bold"');
    expect(out).toContain('>Hello </tspan>');
  });

  it('emits CSS-only run knobs via inline style=', () => {
    if (skip) return;
    const node = createText({
      x: 0,
      y: 0,
      content: 'x',
      runs: [{ text: 'x', letterSpacing: 2, fontVariationSettings: "'wght' 700" }],
    });
    const out = exportNode(node);
    expect(out).toContain('letter-spacing: 2px');
    expect(out).toContain("font-variation-settings: 'wght' 700");
  });
});

describe('D-100 — rich text full round-trip', () => {
  it('runs survive export → re-import (text + fill + weight + italic)', () => {
    if (skip) return;
    const original = createText({
      x: 5,
      y: 30,
      content: 'one two',
      runs: [
        { text: 'one ', fill: '#123456' },
        { text: 'two', fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
    const reimported = firstChild(exportNode(original)) as TextNode;
    expect(reimported.runs).toBeDefined();
    expect(reimported.runs!.length).toBe(2);
    expect(reimported.runs![0].text).toBe('one ');
    expect(reimported.runs![0].fill).toBe('#123456');
    expect(reimported.runs![1].text).toBe('two');
    expect(reimported.runs![1].fontWeight).toBe('bold');
    expect(reimported.runs![1].fontStyle).toBe('italic');
    expect(reimported.content).toBe('one two');
  });
});
