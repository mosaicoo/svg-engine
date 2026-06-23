import { createGroup } from '../model/node-factory';
import { bbox, type BoundingBox } from '../types/bounding-box';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { SvgDocument } from './svg-document';

/** Defaults used by {@link createEmptyDocument} when no viewBox is provided. */
export const DEFAULT_VIEW_BOX: BoundingBox = bbox(0, 0, 800, 600);

export interface CreateDocumentOptions {
  readonly id?: NodeId;
  readonly viewBox?: BoundingBox;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Build a new, empty {@link SvgDocument} with a fresh root group. Suitable
 * as the initial state of {@link EditorStateService}.
 */
export function createEmptyDocument(options: CreateDocumentOptions = {}): SvgDocument {
  return {
    id: options.id ?? generateNodeId(),
    viewBox: options.viewBox ?? DEFAULT_VIEW_BOX,
    width: options.width,
    height: options.height,
    // D-104 — the root is a structural container; `createGroup` now defaults to
    // EMPTY_STYLE (no inherited `stroke:#333333`), so no explicit style needed.
    root: createGroup([], { metadata: { name: 'root' } }),
  };
}
