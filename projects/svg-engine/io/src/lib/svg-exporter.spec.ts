import { describe, expect, it } from 'vitest';
import {
  createEllipse,
  createGroup,
  createPath,
  createRect,
  createText,
  type SvgDocument,
  type SvgNode,
} from 'svg-engine/core';
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
