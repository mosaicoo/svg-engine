import { describe, expect, it } from 'vitest';
import {
  type AnimationDoc,
  createGroup,
  createRect,
  DEFAULT_EASING,
  emptyAnimationDoc,
  generateNodeId,
  type SvgDocument,
  type SvgNode,
  type Transform,
  upsertKeyframe,
} from 'svg-engine/core';
import { svgExporter } from './svg-exporter';

/**
 * **D-082 F9c — Animated SVG (SMIL) export wiring.**
 *
 * The serializer (F9a/F9b) is plugged into the SVG exporter behind the opt-in
 * `exportPreferences.emitSmilAnimation`. These tests prove (a) animated nodes
 * gain `<animate>`/`<animateTransform>` children when enabled, (b) the default
 * export is untouched (the AutoSave round-trip invariant), and (c) a
 * transform-animated node drops its static `transform` attribute.
 */

const NODE = generateNodeId();

function exportDoc(children: readonly SvgNode[], emitSmil: boolean): string {
  const doc: SvgDocument = {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
    exportPreferences: { emitSmilAnimation: emitSmil },
  };
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') throw new Error('svgExporter returned non-string');
  return out;
}

/** A group carrying `anim`, wrapping a rect whose id matches the track node. */
function animatedRect(anim: AnimationDoc, transform?: Transform): SvgNode {
  const base = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const rect: SvgNode =
    transform !== undefined ? { ...base, id: NODE, transform } : { ...base, id: NODE };
  return createGroup([rect], { metadata: { customData: { svgeAnimation: anim } } });
}

function geometryDoc(): AnimationDoc {
  let doc = emptyAnimationDoc(1000);
  doc = upsertKeyframe(doc, NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
  doc = upsertKeyframe(doc, NODE, 'x', { time: 1000, value: 50, easing: DEFAULT_EASING });
  return doc;
}

function rotationDoc(): AnimationDoc {
  let doc = emptyAnimationDoc(1000);
  doc = upsertKeyframe(doc, NODE, 'rotation', { time: 0, value: 0, easing: DEFAULT_EASING });
  doc = upsertKeyframe(doc, NODE, 'rotation', { time: 1000, value: 90, easing: DEFAULT_EASING });
  return doc;
}

describe('D-082 F9c — SMIL export wiring in svgExporter', () => {
  it('injects an <animate> child into the animated node when enabled', () => {
    const out = exportDoc([animatedRect(geometryDoc())], true);
    expect(out).toContain('<animate attributeName="x"');
    expect(out).toContain('values="0;50"');
    // The rect switches from self-closing to open/close to host the child —
    // a `</rect>` only appears in the open form.
    expect(out).toContain('</rect>');
  });

  it('does NOT emit any SMIL when the flag is off (AutoSave round-trip intact)', () => {
    const out = exportDoc([animatedRect(geometryDoc())], false);
    expect(out).not.toContain('<animate');
    expect(out).not.toContain('<animateTransform');
    // The animation still persists losslessly via the F7 JSON attribute.
    expect(out).toContain('data-svge-animation=');
  });

  it('the default export (no exportPreferences) emits no SMIL', () => {
    const doc: SvgDocument = {
      id: 'doc' as never,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup([animatedRect(geometryDoc())], { id: 'root' as never }),
    };
    const out = svgExporter.export(doc) as string;
    expect(out).not.toContain('<animate');
  });

  it('emits <animateTransform> and DROPS the static transform for a transform-animated node', () => {
    // Static translate(5,5) + animated rotation → the static transform must be
    // dropped (rebuilt additively) and baked as a constant translate.
    const translate5: Transform = [1, 0, 0, 1, 5, 5];
    const out = exportDoc([animatedRect(rotationDoc(), translate5)], true);
    expect(out).toContain('<animateTransform attributeName="transform" type="rotate"');
    expect(out).toContain('values="0;90"');
    // Static translate baked as a constant animateTransform...
    expect(out).toContain('type="translate"');
    expect(out).toContain('values="5,5;5,5"');
    // ...and the static `transform="translate(5,5)"` attribute is gone.
    expect(out).not.toContain('transform="translate(5,5)"');
  });

  it('keeps the static transform for a node animated only on geometry/style', () => {
    const translate5: Transform = [1, 0, 0, 1, 5, 5];
    const out = exportDoc([animatedRect(geometryDoc(), translate5)], true);
    expect(out).toContain('transform="translate(5,5)"'); // not dropped
    expect(out).toContain('<animate attributeName="x"');
    expect(out).not.toContain('<animateTransform');
  });

  it('leaves non-animated siblings untouched', () => {
    const plain = createRect({ x: 1, y: 2, width: 3, height: 4 });
    const out = exportDoc([animatedRect(geometryDoc()), plain], true);
    // Exactly one <animate> (the animated rect).
    expect((out.match(/<animate\b/g) ?? []).length).toBe(1);
    // Only the animated rect opens (hosts the child); the plain sibling stays
    // self-closing → exactly one `</rect>`.
    expect((out.match(/<\/rect>/g) ?? []).length).toBe(1);
    expect(out).toContain('x="1" y="2" width="3" height="4"');
  });
});
