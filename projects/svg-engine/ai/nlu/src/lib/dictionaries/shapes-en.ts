/**
 * **Shape dictionary — English.**
 *
 * Maps EN vocabulary (technical names + common UX semantic aliases)
 * to {@link NluShapeKind} canonical. Kept separate from PT for clarity.
 *
 * **Key convention**: lowercase, no diacritics.
 */
import type { NluShapeKind } from './shapes-canonical';

export const SHAPE_DICTIONARY_EN: Readonly<Record<string, NluShapeKind>> = Object.freeze({
  // ── RECT ────────────────────────────────────────────────────
  rectangle: 'rect',
  rect: 'rect',
  square: 'rect',
  box: 'rect',
  block: 'rect',
  panel: 'rect',
  card: 'rect',
  frame: 'rect',
  table: 'rect',
  bar: 'rect',
  stripe: 'rect',

  // ── CIRCLE ──────────────────────────────────────────────────
  circle: 'circle',
  round: 'circle',
  dot: 'circle',
  node: 'circle',
  disc: 'circle',
  disk: 'circle',
  ball: 'circle',
  sphere: 'circle',
  coin: 'circle',
  wheel: 'circle',

  // ── ELLIPSE ─────────────────────────────────────────────────
  ellipse: 'ellipse',
  oval: 'ellipse',
  egg: 'ellipse',

  // ── LINE ────────────────────────────────────────────────────
  line: 'line',
  segment: 'line',
  connector: 'line',
  connection: 'line',
  arrow: 'line',
  rule: 'line',
  divider: 'line',
  wire: 'line',
  edge: 'line',

  // ── PATH ────────────────────────────────────────────────────
  path: 'path',
  curve: 'path',
  route: 'path',
  contour: 'path',
  vector: 'path',
  freehand: 'path',
  scribble: 'path',
  trail: 'path',
  outline: 'path',
  silhouette: 'path',

  // ── POLYGON ─────────────────────────────────────────────────
  polygon: 'polygon',
  hexagon: 'polygon',
  pentagon: 'polygon',
  octagon: 'polygon',
  diamond: 'polygon',
  rhombus: 'polygon',
  triangle: 'polygon',
  star: 'polygon',
  heart: 'polygon',

  // ── POLYLINE ────────────────────────────────────────────────
  polyline: 'polyline',
  brokenline: 'polyline',

  // ── TEXT ────────────────────────────────────────────────────
  text: 'text',
  label: 'text',
  title: 'text',
  caption: 'text',
  word: 'text',
  paragraph: 'text',
  sentence: 'text',
  tag: 'text',
  string: 'text',

  // ── IMAGE ───────────────────────────────────────────────────
  image: 'image',
  picture: 'image',
  photo: 'image',
  icon: 'image',
  bitmap: 'image',
  raster: 'image',

  // ── GROUP ───────────────────────────────────────────────────
  group: 'group',
  bundle: 'group',
  container: 'group',
  layer: 'group',
  folder: 'group',
  set: 'group',
  cluster: 'group',
  tooltip: 'group',

  // ── SVG ROOT ────────────────────────────────────────────────
  svg: 'svg',
  document: 'svg',
  artboard: 'svg',
  workspace: 'svg',
  canvas: 'svg',
});
