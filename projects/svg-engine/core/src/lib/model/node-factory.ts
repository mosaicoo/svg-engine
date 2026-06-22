import type { SvgMetadata } from '../types/metadata';
import { EMPTY_METADATA } from '../types/metadata';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { DEFAULT_STYLE, type SvgStyle } from '../types/style';
import { IDENTITY_TRANSFORM, type Transform } from '../types/transform';
import type { EllipseNode } from './ellipse-node';
import type { GroupNode } from './group-node';
import type { ImageNode } from './image-node';
import type { LineNode } from './line-node';
import type { PathNode } from './path-node';
import type { PolygonNode } from './polygon-node';
import type { PolylineNode } from './polyline-node';
import type { RectNode } from './rect-node';
import type { SvgNode } from './svg-node';
import type { SymbolUseNode } from './symbol-use-node';
import type { TextNode } from './text-node';

/**
 * Common optional inputs shared by every node factory. Defaults: a
 * freshly-generated id, identity transform, {@link DEFAULT_STYLE},
 * empty metadata.
 */
export interface NodeFactoryOptions {
  readonly id?: NodeId;
  readonly transform?: Transform;
  readonly style?: SvgStyle;
  readonly metadata?: SvgMetadata;
}

interface RectInit {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx?: number;
  readonly ry?: number;
}

export function createRect(init: RectInit, opts: NodeFactoryOptions = {}): RectNode {
  return {
    type: 'rect',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    x: init.x,
    y: init.y,
    width: init.width,
    height: init.height,
    rx: init.rx,
    ry: init.ry,
  };
}

interface EllipseInit {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export function createEllipse(init: EllipseInit, opts: NodeFactoryOptions = {}): EllipseNode {
  return {
    type: 'ellipse',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    cx: init.cx,
    cy: init.cy,
    rx: init.rx,
    ry: init.ry,
  };
}

interface LineInit {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function createLine(init: LineInit, opts: NodeFactoryOptions = {}): LineNode {
  return {
    type: 'line',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    x1: init.x1,
    y1: init.y1,
    x2: init.x2,
    y2: init.y2,
  };
}

export function createPolygon(
  points: readonly Point[],
  opts: NodeFactoryOptions = {},
): PolygonNode {
  return {
    type: 'polygon',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    points,
  };
}

export function createPolyline(
  points: readonly Point[],
  opts: NodeFactoryOptions = {},
): PolylineNode {
  return {
    type: 'polyline',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    points,
  };
}

export function createPath(d: string, opts: NodeFactoryOptions = {}): PathNode {
  return {
    type: 'path',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    d,
  };
}

interface TextInit {
  readonly x: number;
  readonly y: number;
  readonly content: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number | 'normal' | 'bold';
  readonly textAnchor?: 'start' | 'middle' | 'end';
  // **D-098** — full typography + text-on-path pass-through. Without these
  // the factory silently dropped fields the model/renderer/exporter already
  // support, so the importer couldn't reconstruct them (import↔export
  // asymmetry). Mirrors every optional field on {@link TextNode}.
  readonly fontStyle?: 'normal' | 'italic';
  readonly textDecoration?: 'none' | 'underline' | 'line-through';
  readonly lineHeight?: number;
  readonly fontVariationSettings?: string;
  readonly fontFeatureSettings?: string;
  readonly letterSpacing?: number;
  readonly textPathRef?: NodeId;
  readonly textPathStartOffset?: string;
}

export function createText(init: TextInit, opts: NodeFactoryOptions = {}): TextNode {
  return {
    type: 'text',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    x: init.x,
    y: init.y,
    content: init.content,
    fontSize: init.fontSize,
    fontFamily: init.fontFamily,
    fontWeight: init.fontWeight,
    textAnchor: init.textAnchor,
    fontStyle: init.fontStyle,
    textDecoration: init.textDecoration,
    lineHeight: init.lineHeight,
    fontVariationSettings: init.fontVariationSettings,
    fontFeatureSettings: init.fontFeatureSettings,
    letterSpacing: init.letterSpacing,
    textPathRef: init.textPathRef,
    textPathStartOffset: init.textPathStartOffset,
  };
}

interface ImageInit {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly href: string;
  readonly preserveAspectRatio?: string;
}

export function createImage(init: ImageInit, opts: NodeFactoryOptions = {}): ImageNode {
  return {
    type: 'image',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    x: init.x,
    y: init.y,
    width: init.width,
    height: init.height,
    href: init.href,
    preserveAspectRatio: init.preserveAspectRatio,
  };
}

export function createGroup(
  children: readonly SvgNode[] = [],
  opts: NodeFactoryOptions = {},
): GroupNode {
  return {
    type: 'group',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    children,
  };
}

interface SymbolUseInit {
  /** Id of the symbol master in `SymbolLibraryService`. */
  readonly symbolId: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * **D-059** — Construct a `SymbolUseNode` (instance of a registered
 * symbol). The renderer emits `<use href="#{symbolId}">`; the
 * `<symbol id="...">` definition is contributed to `<defs>` by
 * `ActiveSymbolsService` (similar to gradient/pattern active-defs).
 */
export function createSymbolUse(init: SymbolUseInit, opts: NodeFactoryOptions = {}): SymbolUseNode {
  return {
    type: 'symbol-use',
    id: opts.id ?? generateNodeId(),
    transform: opts.transform ?? IDENTITY_TRANSFORM,
    style: opts.style ?? DEFAULT_STYLE,
    metadata: opts.metadata ?? EMPTY_METADATA,
    symbolId: init.symbolId,
    x: init.x,
    y: init.y,
    width: init.width,
    height: init.height,
  };
}
