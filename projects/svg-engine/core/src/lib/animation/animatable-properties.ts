import { decomposeTransform } from '../geometry';
import type { SvgNode } from '../model/svg-node';

/**
 * **D-082 (Animation Timeline) — F3.** The catalog of **animatable properties
 * per node type** — the source of truth for the timeline's rows (F4). It
 * mirrors what the Inspector already knows about each shape (geometry fields,
 * transform components, style attributes), but as pure, headless data so both
 * the editor engine ({@link import('svg-engine/edit').AnimationService}) and
 * the timeline UI consume the same list.
 *
 * **Alignment with the apply layer (F1)** is the whole point: every
 * `property` name here is exactly what `applyAnimationToTree` knows how to
 * apply and what {@link import('./animation-doc').AnimationTrack} stores —
 * transform components are recomposed via decompose/compose, style props live
 * under `node.style`, and everything else is a top-level geometry field. The
 * canonical {@link TRANSFORM_PROPERTY_NAMES} / {@link STYLE_PROPERTY_NAMES}
 * sets defined here are imported by `apply-animation.ts`, so the two can never
 * drift.
 */

/**
 * How a property is edited/displayed (and which value kind it stores). All but
 * `'color'` store a `number`; `'color'` stores a `string`. `'angle'` is a
 * number in **degrees**; `'scale'` is a unitless multiplier (1 = 100%).
 */
export type AnimatablePropertyKind = 'number' | 'angle' | 'scale' | 'color';

/** Which conceptual bucket the property belongs to (for grouping in the UI). */
export type AnimatablePropertyGroup = 'geometry' | 'transform' | 'style';

/** One animatable property of a node: its identity, label, kind and default. */
export interface AnimatablePropertyDef {
  /**
   * The property key — the SVG/Inspector field name. This is what an
   * {@link import('./animation-doc').AnimationTrack} stores and what
   * `applyAnimationToTree` applies (no translation table).
   */
  readonly property: string;
  /** Human-readable label for the timeline row. */
  readonly label: string;
  /** Edit/display kind (drives the input control + interpolation value kind). */
  readonly kind: AnimatablePropertyKind;
  /** Conceptual bucket (geometry / transform / style). */
  readonly group: AnimatablePropertyGroup;
  /**
   * Value to seed a first keyframe with when the node doesn't carry the
   * property explicitly (e.g. a rect with no `stroke` yet, or the identity
   * transform's `scaleX = 1`). Matches the SVG/CSS initial value.
   */
  readonly defaultValue: number | string;
}

/**
 * Canonical set of transform-component property names — the ones recomposed
 * through `decomposeTransform`/`composeTransform` rather than set as fields.
 * Imported by `apply-animation.ts` so the catalog and the apply layer share a
 * single definition.
 */
export const TRANSFORM_PROPERTY_NAMES: ReadonlySet<string> = new Set<string>([
  'translateX',
  'translateY',
  'rotation',
  'scaleX',
  'scaleY',
]);

/**
 * Canonical set of style-bag property names — the ones that live under
 * `node.style` rather than as top-level fields. Imported by
 * `apply-animation.ts`.
 */
export const STYLE_PROPERTY_NAMES: ReadonlySet<string> = new Set<string>([
  'opacity',
  'fillOpacity',
  'strokeOpacity',
  'strokeWidth',
  'fill',
  'stroke',
]);

/** Transform components — animatable on every node type. */
const TRANSFORM_PROPS: readonly AnimatablePropertyDef[] = [
  {
    property: 'translateX',
    label: 'Translate X',
    kind: 'number',
    group: 'transform',
    defaultValue: 0,
  },
  {
    property: 'translateY',
    label: 'Translate Y',
    kind: 'number',
    group: 'transform',
    defaultValue: 0,
  },
  { property: 'rotation', label: 'Rotation', kind: 'angle', group: 'transform', defaultValue: 0 },
  { property: 'scaleX', label: 'Scale X', kind: 'scale', group: 'transform', defaultValue: 1 },
  { property: 'scaleY', label: 'Scale Y', kind: 'scale', group: 'transform', defaultValue: 1 },
];

/** Style attributes — animatable on every node type. */
const STYLE_PROPS: readonly AnimatablePropertyDef[] = [
  { property: 'opacity', label: 'Opacity', kind: 'number', group: 'style', defaultValue: 1 },
  { property: 'fill', label: 'Fill', kind: 'color', group: 'style', defaultValue: '#000000' },
  { property: 'stroke', label: 'Stroke', kind: 'color', group: 'style', defaultValue: '#000000' },
  {
    property: 'strokeWidth',
    label: 'Stroke width',
    kind: 'number',
    group: 'style',
    defaultValue: 1,
  },
  {
    property: 'fillOpacity',
    label: 'Fill opacity',
    kind: 'number',
    group: 'style',
    defaultValue: 1,
  },
  {
    property: 'strokeOpacity',
    label: 'Stroke opacity',
    kind: 'number',
    group: 'style',
    defaultValue: 1,
  },
];

/** Build a geometry def (all geometry props are plain numbers, default 0). */
function geom(property: string, label: string): AnimatablePropertyDef {
  return { property, label, kind: 'number', group: 'geometry', defaultValue: 0 };
}

const RECT_GEOMETRY: readonly AnimatablePropertyDef[] = [
  geom('x', 'X'),
  geom('y', 'Y'),
  geom('width', 'Width'),
  geom('height', 'Height'),
];

const ELLIPSE_GEOMETRY: readonly AnimatablePropertyDef[] = [
  geom('cx', 'Center X'),
  geom('cy', 'Center Y'),
  geom('rx', 'Radius X'),
  geom('ry', 'Radius Y'),
];

const LINE_GEOMETRY: readonly AnimatablePropertyDef[] = [
  geom('x1', 'X1'),
  geom('y1', 'Y1'),
  geom('x2', 'X2'),
  geom('y2', 'Y2'),
];

const XY_GEOMETRY: readonly AnimatablePropertyDef[] = [geom('x', 'X'), geom('y', 'Y')];

/**
 * Geometry properties specific to a node's type. Path (`d`) and poly* (`points`)
 * are intentionally **omitted** for the MVP — path-`d`/points morphing is a
 * future phase (F9+); only transform + style animate those for now. Groups have
 * no geometry of their own (they animate via transform + style).
 */
function geometryPropsFor(node: SvgNode): readonly AnimatablePropertyDef[] {
  switch (node.type) {
    case 'rect':
    case 'image':
      return RECT_GEOMETRY;
    case 'ellipse':
      return ELLIPSE_GEOMETRY;
    case 'line':
      return LINE_GEOMETRY;
    case 'text':
    case 'symbol-use':
      return XY_GEOMETRY;
    default:
      // path, polygon, polyline, group → no per-type geometry in the MVP.
      return [];
  }
}

/**
 * The full ordered list of properties animatable on `node`: its type-specific
 * geometry first, then the universal transform components, then style. This is
 * exactly the set the timeline offers when the user expands the node's row.
 */
export function animatablePropertiesForNode(node: SvgNode): readonly AnimatablePropertyDef[] {
  return [...geometryPropsFor(node), ...TRANSFORM_PROPS, ...STYLE_PROPS];
}

/** Find the {@link AnimatablePropertyDef} for `property` on `node`, or `null`. */
export function findAnimatableProperty(
  node: SvgNode,
  property: string,
): AnimatablePropertyDef | null {
  return animatablePropertiesForNode(node).find((p) => p.property === property) ?? null;
}

/**
 * Read the **current value** of an animatable `property` from `node` — what a
 * "set keyframe at the playhead" action captures. Returns `null` when the
 * property doesn't apply to the node or isn't set (the caller can fall back to
 * the def's `defaultValue`).
 *
 * The read mirrors how `applyAnimationToTree` writes:
 * - transform components come from `decomposeTransform` (rotation in DEGREES);
 * - style props are read from `node.style`;
 * - everything else is a top-level geometry field.
 */
export function readAnimatableValue(node: SvgNode, property: string): number | string | null {
  if (TRANSFORM_PROPERTY_NAMES.has(property)) {
    const d = decomposeTransform(node.transform);
    switch (property) {
      case 'translateX':
        return d.tx;
      case 'translateY':
        return d.ty;
      case 'rotation':
        return (d.rotationRad * 180) / Math.PI; // radians → degrees (export-friendly)
      case 'scaleX':
        return d.scaleX;
      case 'scaleY':
        return d.scaleY;
      default:
        return null;
    }
  }
  if (STYLE_PROPERTY_NAMES.has(property)) {
    const raw = (node.style as unknown as Record<string, unknown>)[property];
    if (typeof raw === 'number' || typeof raw === 'string') return raw;
    return null;
  }
  // Geometry / top-level field.
  const raw = (node as unknown as Record<string, unknown>)[property];
  return typeof raw === 'number' ? raw : null;
}
