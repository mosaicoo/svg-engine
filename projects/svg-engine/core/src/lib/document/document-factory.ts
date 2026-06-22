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
    // **D-103** — explicit EMPTY style, NOT `createGroup`'s `DEFAULT_STYLE`
    // fallback. The root is a structural container, never painted; with the
    // default it carried `stroke:#333333` + `fill:#cccccc`, and since SVG
    // `stroke` is inherited, any imported/added child without its own stroke
    // (e.g. fill-only CorelDRAW art placed into the editor) picked up a
    // spurious dark border. Companion to D-102 (which fixed the *imported*
    // doc's root); this fixes the *editor's* document root.
    root: createGroup([], { metadata: { name: 'root' }, style: {} }),
  };
}
