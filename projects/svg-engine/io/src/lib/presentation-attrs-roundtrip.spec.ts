import { describe, expect, it } from 'vitest';
import { createGroup, createPath, type SvgDocument, type SvgNode } from 'svg-engine/core';
import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-114 — full presentation-attribute parity (import ↔ model ↔ export).**
 *
 * Real editor exports (Adobe Illustrator / CorelDRAW) lean heavily on the
 * "secondary" stroke/fill presentation attributes — `stroke-linejoin`,
 * `stroke-linecap`, `stroke-dasharray`, `fill-rule`, etc. The model already
 * carried most of these and the renderer/exporter emitted them, but the
 * importer's `parseStyle` only read 8 of them, so importing dropped the rest.
 * These specs lock in: every modelled presentation attribute is (1) read on
 * import (both as an attribute and via inline `style=`) and (2) survives a
 * full export → re-import round-trip.
 */

const skip = typeof DOMParser === 'undefined';

function styleOfFirstChild(xml: string): SvgNode['style'] {
  const result = svgImporter.import(xml);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.document.root.children[0]!.style;
}

function wrap(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      ${inner}
    </svg>`;
}

function exportNode(node: SvgNode): string {
  const doc: SvgDocument = {
    id: 'd' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup([node], { id: 'root' as never }),
  };
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') throw new Error('exporter returned non-string');
  return out;
}

describe('D-114 — secondary presentation attributes import (as attributes)', () => {
  it('reads fill-rule, stroke joins/caps/miterlimit, dash + offset', () => {
    if (skip) return;
    const s = styleOfFirstChild(
      wrap(
        `<path d="M0 0 L10 0 L10 10 Z" fill="#abc" fill-rule="evenodd"
           stroke="#123" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="bevel" stroke-miterlimit="8"
           stroke-dasharray="4 2" stroke-dashoffset="1.5" stroke-opacity="0.5" />`,
      ),
    );
    expect(s.fillRule).toBe('evenodd');
    expect(s.strokeLinecap).toBe('round');
    expect(s.strokeLinejoin).toBe('bevel');
    expect(s.strokeMiterlimit).toBe(8);
    expect(s.strokeDasharray).toEqual([4, 2]);
    expect(s.strokeDashoffset).toBe(1.5);
    expect(s.strokeOpacity).toBe(0.5);
  });

  it('parses a comma-separated dash array', () => {
    if (skip) return;
    expect(
      styleOfFirstChild(wrap('<path d="M0 0" stroke-dasharray="4,2,1" />')).strokeDasharray,
    ).toEqual([4, 2, 1]);
  });

  it('leaves dash array unset for stroke-dasharray="none"', () => {
    if (skip) return;
    expect(
      styleOfFirstChild(wrap('<path d="M0 0" stroke-dasharray="none" />')).strokeDasharray,
    ).toBeUndefined();
  });

  it('ignores an invalid enum value (best-effort import, no throw)', () => {
    if (skip) return;
    // `bogus` is not a valid stroke-linejoin → field stays unset.
    expect(
      styleOfFirstChild(wrap('<path d="M0 0" stroke-linejoin="bogus" />')).strokeLinejoin,
    ).toBeUndefined();
  });

  it('reads clip-path and mask attributes (D-049 importer gap closed)', () => {
    if (skip) return;
    const s = styleOfFirstChild(wrap('<path d="M0 0" clip-path="url(#c)" mask="url(#m)" />'));
    expect(s.clipPath).toBe('url(#c)');
    expect(s.mask).toBe('url(#m)');
  });
});

describe('D-114 — same set via inline style= (cascade parity)', () => {
  it('reads every secondary prop from a style="..." declaration', () => {
    if (skip) return;
    const s = styleOfFirstChild(
      wrap(
        `<path d="M0 0" style="fill-rule: evenodd; stroke-linecap: square;
           stroke-linejoin: round; stroke-miterlimit: 10; stroke-dasharray: 6 3;
           stroke-dashoffset: 2; mix-blend-mode: multiply" />`,
      ),
    );
    expect(s.fillRule).toBe('evenodd');
    expect(s.strokeLinecap).toBe('square');
    expect(s.strokeLinejoin).toBe('round');
    expect(s.strokeMiterlimit).toBe(10);
    expect(s.strokeDasharray).toEqual([6, 3]);
    expect(s.strokeDashoffset).toBe(2);
    // mix-blend-mode is CSS-only — reachable via style=, not as an attribute.
    expect(s.mixBlendMode).toBe('multiply');
  });

  it('inline style= overrides a matching presentation attribute', () => {
    if (skip) return;
    const s = styleOfFirstChild(
      wrap('<path d="M0 0" fill-rule="nonzero" style="fill-rule: evenodd" />'),
    );
    expect(s.fillRule).toBe('evenodd');
  });
});

describe('D-114 — exporter emits the new fields', () => {
  it('emits fill-rule, stroke-miterlimit, stroke-dashoffset, stroke-dasharray', () => {
    const out = exportNode(
      createPath('M0 0 L10 10 Z', {
        style: {
          fillRule: 'evenodd',
          strokeMiterlimit: 8,
          strokeDashoffset: 1.5,
          strokeDasharray: [4, 2],
        },
      }),
    );
    expect(out).toContain('fill-rule="evenodd"');
    expect(out).toContain('stroke-miterlimit="8"');
    expect(out).toContain('stroke-dashoffset="1.5"');
    expect(out).toContain('stroke-dasharray="4 2"');
  });
});

describe('D-114 — full export → re-import round-trip', () => {
  it('preserves every secondary presentation attribute', () => {
    if (skip) return;
    const original = createPath('M0 0 L10 0 L10 10 Z', {
      style: {
        fill: '#abcdef',
        fillRule: 'evenodd',
        stroke: '#112233',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'bevel',
        strokeMiterlimit: 8,
        strokeDasharray: [4, 2],
        strokeDashoffset: 1.5,
        strokeOpacity: 0.5,
      },
    });
    const result = svgImporter.import(exportNode(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.document.root.children[0]!.style;
    expect(s).toMatchObject({
      fill: '#abcdef',
      fillRule: 'evenodd',
      stroke: '#112233',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'bevel',
      strokeMiterlimit: 8,
      strokeDasharray: [4, 2],
      strokeDashoffset: 1.5,
      strokeOpacity: 0.5,
    });
  });
});
