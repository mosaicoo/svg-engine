import type { SvgDocument } from 'svg-engine/core';

/**
 * Plugin contribution to the SVG optimization pipeline (categoria 3
 * do D-023). Pure transformation `SvgDocument → SvgDocument`.
 *
 * **Contract**:
 * - `optimize(doc)` MUST be pure (no DOM, no service access, no
 *   side effects). Worker-safe.
 * - MUST return a structurally-equivalent document on no-op input
 *   (lets the pipeline detect "nothing changed" via reference
 *   equality and short-circuit).
 * - SHOULD NOT mutate the input — return a new document via
 *   `{ ...doc, root: ... }` when changes are needed.
 *
 * **Fields**:
 * - `id`: unique within {@link OptimizerRegistry}
 * - `name`: human-readable label for UIs
 * - `description`: optional one-liner explaining what the pass does
 * - `order`: sort key in the pipeline (lower runs first). Default
 *   100. Use lower for "structural" passes that other passes can
 *   then optimize on top of (e.g., precision-round before dedupe).
 * - `defaultEnabled`: whether the pipeline includes this pass when
 *   no explicit selection is provided. Default `true`.
 */
export interface Optimizer {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly order?: number;
  readonly defaultEnabled?: boolean;
  optimize(document: SvgDocument): SvgDocument;
}
