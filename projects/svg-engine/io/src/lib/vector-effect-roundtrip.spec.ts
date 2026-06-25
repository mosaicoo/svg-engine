import {
  createGroup,
  createRect,
  DEFAULT_STYLE,
  type NodeId,
  type RectNode,
  type SvgDocument,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-099 — per-node `vector-effect` import fidelity.**
 *
 * The renderer historically forced `vector-effect="non-scaling-stroke"` on
 * every shape (resize-safe editor semantics). That silently overrode imported
 * artwork that relies on the SVG default (`none` → stroke scales with the
 * transform), so a logo drawn at 1× and placed under a `scale()` rendered with
 * a hairline stroke instead of the intended thick one.
 *
 * The fix: model `vector-effect` on `SvgStyle`. The importer sets it explicitly
 * (file value, or `'none'` when absent — the SVG spec default), so imported art
 * scales faithfully. Editor-created nodes leave it `undefined`, which the
 * renderer still treats as `'non-scaling-stroke'` (zero regression). These
 * specs lock that contract at the io layer.
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

describe('D-099 — vector-effect import (SVG-faithful default)', () => {
  it('absent vector-effect defaults to "none" (stroke scales per the SVG spec)', () => {
    if (skip) return;
    const r = firstChild(
      wrap(`<rect x="0" y="0" width="10" height="10" stroke="#000" stroke-width="2"/>`),
    ) as RectNode;
    expect(r.type).toBe('rect');
    expect(r.style.vectorEffect).toBe('none');
  });

  it('explicit non-scaling-stroke is preserved (presentation attribute)', () => {
    if (skip) return;
    const r = firstChild(
      wrap(`<rect x="0" y="0" width="10" height="10" vector-effect="non-scaling-stroke"/>`),
    ) as RectNode;
    expect(r.style.vectorEffect).toBe('non-scaling-stroke');
  });

  it('explicit non-scaling-stroke from inline style= is preserved', () => {
    if (skip) return;
    const r = firstChild(
      wrap(`<rect x="0" y="0" width="10" height="10" style="vector-effect: non-scaling-stroke"/>`),
    ) as RectNode;
    expect(r.style.vectorEffect).toBe('non-scaling-stroke');
  });

  it('unsupported SVG2 keywords (e.g. non-scaling-size) fall back to the "none" default', () => {
    if (skip) return;
    const r = firstChild(
      wrap(`<rect x="0" y="0" width="10" height="10" vector-effect="non-scaling-size"/>`),
    ) as RectNode;
    // Not one of the two modelled values → ignored, so parseStyle re-defaults it.
    expect(r.style.vectorEffect).toBe('none');
  });
});

describe('D-099 — vector-effect export (emit only when non-default)', () => {
  it('"none" is NOT emitted (it is the SVG default — keeps output clean)', () => {
    if (skip) return;
    const node = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { ...DEFAULT_STYLE, vectorEffect: 'none' } },
    );
    expect(exportNode(node)).not.toContain('vector-effect');
  });

  it('non-scaling-stroke IS emitted', () => {
    if (skip) return;
    const node = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { ...DEFAULT_STYLE, vectorEffect: 'non-scaling-stroke' } },
    );
    expect(exportNode(node)).toContain('vector-effect="non-scaling-stroke"');
  });

  it('undefined (editor-created) is NOT emitted — renderer applies its own default', () => {
    if (skip) return;
    const node = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(node.style.vectorEffect).toBeUndefined();
    expect(exportNode(node)).not.toContain('vector-effect');
  });
});

describe('D-099 — full round-trip', () => {
  it('non-scaling-stroke survives export → re-import', () => {
    if (skip) return;
    const original = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { ...DEFAULT_STYLE, vectorEffect: 'non-scaling-stroke' } },
    );
    const reimported = firstChild(exportNode(original)) as RectNode;
    expect(reimported.style.vectorEffect).toBe('non-scaling-stroke');
  });

  it('"none" round-trips via the importer re-defaulting absent → "none"', () => {
    if (skip) return;
    const original = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { ...DEFAULT_STYLE, vectorEffect: 'none' } },
    );
    // Exporter drops it, importer re-derives it — semantics preserved.
    const reimported = firstChild(exportNode(original)) as RectNode;
    expect(reimported.style.vectorEffect).toBe('none');
  });
});
