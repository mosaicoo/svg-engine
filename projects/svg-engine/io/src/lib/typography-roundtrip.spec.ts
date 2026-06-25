import {
  createGroup,
  createImage,
  createText,
  type ImageNode,
  type NodeId,
  type SvgDocument,
  type SvgNode,
  type TextNode,
} from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-098 — import↔export typography / image parity.**
 *
 * The exporter + renderer already supported the full `<text>` typography
 * surface (`font-family/weight/style`, `text-anchor`, `text-decoration`,
 * `letter-spacing`, variable-font / OpenType settings, text-on-path) and
 * `<image preserveAspectRatio>`, but the importer only read `x/y/content/
 * font-size`, so a Save → Open silently flattened text + image. These specs
 * lock in: every field the exporter emits is read back on import.
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

describe('D-098 — text typography import (attributes)', () => {
  it('reads font-family/weight/style/text-anchor/text-decoration/letter-spacing', () => {
    if (skip) return;
    const t = firstChild(
      wrap(
        `<text x="10" y="20" font-size="18" font-family="Georgia" font-weight="bold"
           font-style="italic" text-anchor="middle" text-decoration="underline"
           letter-spacing="2">Hello</text>`,
      ),
    ) as TextNode;
    expect(t.type).toBe('text');
    expect(t.fontFamily).toBe('Georgia');
    expect(t.fontWeight).toBe('bold');
    expect(t.fontStyle).toBe('italic');
    expect(t.textAnchor).toBe('middle');
    expect(t.textDecoration).toBe('underline');
    expect(t.letterSpacing).toBe(2);
    expect(t.content).toBe('Hello');
  });

  it('parses a numeric font-weight (e.g. 650)', () => {
    if (skip) return;
    const t = firstChild(wrap(`<text x="0" y="0" font-weight="650">x</text>`)) as TextNode;
    expect(t.fontWeight).toBe(650);
  });

  it('reads typography from inline style= (letter-spacing, variation/feature settings)', () => {
    if (skip) return;
    const t = firstChild(
      wrap(
        `<text x="0" y="0" style="font-family: Inter; letter-spacing: 3px;
           font-variation-settings: 'wght' 620; font-feature-settings: 'liga' on">y</text>`,
      ),
    ) as TextNode;
    expect(t.fontFamily).toBe('Inter');
    expect(t.letterSpacing).toBe(3);
    expect(t.fontVariationSettings).toContain('wght');
    expect(t.fontFeatureSettings).toContain('liga');
  });
});

describe('D-098 — text-on-path import (<textPath>)', () => {
  it('reads textPathRef (# stripped), startOffset, and the textPath content', () => {
    if (skip) return;
    const t = firstChild(
      wrap(
        `<text x="0" y="0"><textPath href="#curve" startOffset="50%">On a path</textPath></text>`,
      ),
    ) as TextNode;
    expect(t.textPathRef).toBe('curve');
    expect(t.textPathStartOffset).toBe('50%');
    expect(t.content).toBe('On a path');
  });

  it('supports the legacy xlink:href form', () => {
    if (skip) return;
    // `xlink:` prefix must be declared or image/svg+xml parsing errors.
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 200" width="200" height="200"><text x="0" y="0"><textPath xlink:href="#c2">t</textPath></text></svg>`;
    const t = firstChild(xml) as TextNode;
    expect(t.textPathRef).toBe('c2');
  });
});

describe('D-098 — image preserveAspectRatio import', () => {
  it('reads preserveAspectRatio', () => {
    if (skip) return;
    const img = firstChild(
      wrap(
        `<image x="0" y="0" width="50" height="50" href="data:image/png;base64,AAA"
           preserveAspectRatio="xMidYMid slice" />`,
      ),
    ) as ImageNode;
    expect(img.type).toBe('image');
    expect(img.preserveAspectRatio).toBe('xMidYMid slice');
  });
});

describe('D-098 — full export → re-import round-trip', () => {
  it('text typography survives the round-trip', () => {
    if (skip) return;
    const original = createText({
      x: 5,
      y: 30,
      content: 'Roundtrip',
      fontSize: 24,
      fontFamily: 'Helvetica',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textAnchor: 'end',
      textDecoration: 'line-through',
      letterSpacing: 1.5,
    });
    const reimported = firstChild(exportNode(original)) as TextNode;
    expect(reimported.fontFamily).toBe('Helvetica');
    expect(reimported.fontWeight).toBe('bold');
    expect(reimported.fontStyle).toBe('italic');
    expect(reimported.textAnchor).toBe('end');
    expect(reimported.textDecoration).toBe('line-through');
    expect(reimported.letterSpacing).toBe(1.5);
    expect(reimported.content).toBe('Roundtrip');
  });

  it('image preserveAspectRatio survives the round-trip', () => {
    if (skip) return;
    const original = createImage({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      href: 'data:image/png;base64,AAA',
      preserveAspectRatio: 'xMinYMin meet',
    });
    const reimported = firstChild(exportNode(original)) as ImageNode;
    expect(reimported.preserveAspectRatio).toBe('xMinYMin meet');
  });
});
