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

/**
 * Library version string. **Must stay in lockstep with the
 * `version` field of `projects/svg-engine/package.json`** — release
 * tooling (D-031 / `standard-version`) bumps both in the same commit.
 *
 * Surfaced for consumers that want to log/warn on version mismatch,
 * or for debugging which build is currently embedded in a host app.
 */
export const SVG_ENGINE_VERSION = '0.1.0';
