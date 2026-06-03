import { type DecomposedTransform, composeTransform, decomposeTransform } from '../geometry';
import { isGroupNode, type SvgNode } from '../model/svg-node';
import type { SvgStyle } from '../types/style';
import { STYLE_PROPERTY_NAMES, TRANSFORM_PROPERTY_NAMES } from './animatable-properties';
import type { AnimationSample, AnimationValue } from './sample-animation';

/**
 * **D-082 (Animation Timeline) — F1.** Apply a sampled animation
 * ({@link AnimationSample}) onto a base tree, deriving the tree to render at
 * the current playhead. NON-DESTRUCTIVE: the base tree is never mutated.
 *
 * **Identity invariant** — when the sample is empty (nothing animated), the
 * SAME tree reference is returned. More generally, any node/subtree without
 * overrides keeps its reference (**structural sharing**): only the animated
 * nodes and their ancestors are rebuilt. This is what keeps the editor
 * byte-for-byte unchanged when the timeline isn't doing anything.
 */
export function applyAnimationToTree(tree: SvgNode, sample: AnimationSample): SvgNode {
  if (sample.size === 0) return tree;
  return applyNode(tree, sample);
}

// Property classification is shared with the F3 catalog
// (`animatable-properties.ts`) so the list the timeline offers and the list
// this layer applies can never drift. `TRANSFORM_PROPERTY_NAMES` are recomposed
// via decompose/compose; `STYLE_PROPERTY_NAMES` live under `node.style`;
// everything else is a top-level geometry field.

function applyNode(node: SvgNode, sample: AnimationSample): SvgNode {
  let next = node;
  const overrides = sample.get(node.id);
  if (overrides !== undefined && overrides.size > 0) {
    next = applyOverrides(node, overrides);
  }
  if (isGroupNode(next)) {
    let changed = false;
    const newChildren = next.children.map((c) => {
      const nc = applyNode(c, sample);
      if (nc !== c) changed = true;
      return nc;
    });
    if (changed) next = { ...next, children: newChildren };
  }
  return next;
}

function applyOverrides(node: SvgNode, overrides: ReadonlyMap<string, AnimationValue>): SvgNode {
  const topLevel: Record<string, AnimationValue> = {};
  const styleOverrides: Record<string, AnimationValue> = {};
  const transformOverrides = new Map<string, number>();
  let hasTop = false;
  let hasStyle = false;
  let hasXform = false;

  for (const [prop, value] of overrides) {
    if (TRANSFORM_PROPERTY_NAMES.has(prop)) {
      transformOverrides.set(prop, asNumber(value));
      hasXform = true;
    } else if (STYLE_PROPERTY_NAMES.has(prop)) {
      styleOverrides[prop] = value;
      hasStyle = true;
    } else {
      topLevel[prop] = value;
      hasTop = true;
    }
  }

  let next = node;
  if (hasTop) {
    next = { ...(next as unknown as Record<string, unknown>), ...topLevel } as unknown as SvgNode;
  }
  if (hasStyle) {
    next = { ...next, style: { ...next.style, ...styleOverrides } as unknown as SvgStyle };
  }
  if (hasXform) {
    next = applyTransformOverrides(next, transformOverrides);
  }
  return next;
}

function applyTransformOverrides(node: SvgNode, comps: ReadonlyMap<string, number>): SvgNode {
  const d = decomposeTransform(node.transform);
  const next: DecomposedTransform = {
    tx: comps.has('translateX') ? comps.get('translateX')! : d.tx,
    ty: comps.has('translateY') ? comps.get('translateY')! : d.ty,
    // `rotation` is authored in DEGREES (export-friendly: CSS/SMIL/Lottie all
    // use degrees); convert to the radians the matrix decomposition uses.
    rotationRad: comps.has('rotation') ? (comps.get('rotation')! * Math.PI) / 180 : d.rotationRad,
    scaleX: comps.has('scaleX') ? comps.get('scaleX')! : d.scaleX,
    scaleY: comps.has('scaleY') ? comps.get('scaleY')! : d.scaleY,
  };
  return { ...node, transform: composeTransform(next) };
}

function asNumber(value: AnimationValue): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
