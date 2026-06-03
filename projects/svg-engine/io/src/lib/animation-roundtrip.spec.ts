import { describe, expect, it } from 'vitest';
import {
  type AnimationDoc,
  createGroup,
  createRect,
  DEFAULT_EASING,
  emptyAnimationDoc,
  generateNodeId,
  isLayer,
  readAnimationDoc,
  type SvgDocument,
  type SvgNode,
  upsertKeyframe,
  withLayerFlag,
} from 'svg-engine/core';
import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-082 F7 — Round-trip tests for the Animation Timeline persistence.**
 *
 * The AnimationDoc lives on a page group's `metadata.customData[svgeAnimation]`.
 * The exporter emits it as a JSON-encoded `data-svge-animation` attribute and
 * the importer reads it back — so the animation survives an export → re-import
 * cycle, which is exactly how AutoSave persists (it serializes through this SVG
 * exporter and recovers by re-importing).
 *
 * Mirrors the D-072 (layer) / D-074 (smart-object) round-trip pattern, but the
 * animation attribute is ADDITIVE: independent of `data-svge-kind`, so a node
 * can carry both a kind flag and animation.
 */

const NODE = generateNodeId();

/** An AnimationDoc with a numeric track and a color track. */
function sampleDoc(): AnimationDoc {
  let doc = emptyAnimationDoc(2000);
  doc = upsertKeyframe(doc, NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
  doc = upsertKeyframe(doc, NODE, 'x', { time: 500, value: 50, easing: { kind: 'easeIn' } });
  doc = upsertKeyframe(doc, NODE, 'fill', { time: 0, value: '#ff0000', easing: DEFAULT_EASING });
  return doc;
}

function exportNode(children: readonly SvgNode[]): string {
  const doc: SvgDocument = {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
  };
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') throw new Error('svgExporter returned non-string');
  return out;
}

/** A group carrying `anim` in its customData. */
function animatedGroup(anim: AnimationDoc): SvgNode {
  return createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
    metadata: { customData: { svgeAnimation: anim } },
  });
}

describe('D-082 F7 — AnimationDoc round-trip via exporter + importer', () => {
  it('exporter emits a data-svge-animation attribute for animated groups', () => {
    const out = exportNode([animatedGroup(sampleDoc())]);
    expect(out).toContain('data-svge-animation=');
    // JSON quotes are attribute-escaped.
    expect(out).toContain('&quot;durationMs&quot;');
  });

  it('exporter does NOT emit data-svge-animation on plain groups', () => {
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    expect(exportNode([plain])).not.toContain('data-svge-animation');
  });

  it('an animated group survives a full export → re-import cycle', () => {
    if (typeof DOMParser === 'undefined') return;
    const anim = sampleDoc();
    const exported = exportNode([animatedGroup(anim)]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(readAnimationDoc(child)).toEqual(anim); // deep-equal through JSON
  });

  it('plain groups stay animation-free through a round-trip', () => {
    if (typeof DOMParser === 'undefined') return;
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const result = svgImporter.import(exportNode([plain]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readAnimationDoc(result.document.root.children[0]!)).toBeNull();
  });

  it('animation is ADDITIVE — coexists with a data-svge-kind flag (layer + animation)', () => {
    if (typeof DOMParser === 'undefined') return;
    const layer = withLayerFlag(createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]));
    const anim = sampleDoc();
    const both: SvgNode = {
      ...layer,
      metadata: {
        ...layer.metadata,
        customData: { ...layer.metadata.customData, svgeAnimation: anim },
      },
    };
    const result = svgImporter.import(exportNode([both]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(isLayer(child)).toBe(true); // kind preserved
    expect(readAnimationDoc(child)).toEqual(anim); // animation preserved
  });

  it('a malformed data-svge-animation attribute is ignored (never throws)', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <g data-svge-animation="{not valid json">
          <rect x="0" y="0" width="10" height="10" />
        </g>
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readAnimationDoc(result.document.root.children[0]!)).toBeNull();
  });
});
