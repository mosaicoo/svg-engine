/**
 * SVGEngine — primary entry point.
 *
 * This package follows a **secondary-only entry point** pattern (D-018).
 * Importing from `'svg-engine'` directly is discouraged and exports nothing
 * useful. Use one of the secondary entry points instead, matching the
 * functional layer you need:
 *
 *   import { SvgNode, EditorStateService } from 'svg-engine/core';
 *   import { SvgRenderer }                from 'svg-engine/render';
 *   import { SvgParser, SvgSerializer }   from 'svg-engine/io';
 *   import { OptimizationPipeline }       from 'svg-engine/optimize';
 *   import { SelectionService }           from 'svg-engine/edit';
 *   import { SvgEditorComponent }         from 'svg-engine/ui';
 *
 * Rationale: tree-shaking guarantee + headless boundary enforcement
 * (D-017). Consumers wanting only render/optimize never pull `@angular/material`
 * into their bundle.
 */

export const SVG_ENGINE_VERSION = '0.0.0';
