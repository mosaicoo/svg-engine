/*
 * Public API surface of `svg-engine/edit`.
 *
 * Editor-side concerns: selection, hit-testing, transformation gestures,
 * tools and plugin extension points. Builds on `svg-engine/core` (model
 * + commands) and `svg-engine/render` (renderer + viewport).
 *
 * **Headless boundary (D-017)**: this entry point depends only on
 * `@angular/core`, `svg-engine/core` and `svg-engine/render`. It does
 * **not** import `@angular/material` or `@angular/cdk` — consumers can
 * build their own UI on top of these services without dragging Material
 * into the bundle.
 *
 * **Bloco 1 — currently exposed**: `SelectionService`, hit-testing utils.
 * **Bloco 2 (next)**: `<svge-selection-overlay>`, `<svge-rotation-pivot>`.
 * **Bloco 3 (next)**: `TransformService` (drag/resize/rotate with movable
 * pivot — D-022), new commands (`RotateNodeCommand`, `ResizeNodeCommand`).
 * **Bloco 4 (next)**: `<svge-marquee>`, `SnapService`, alignment.
 * **Bloco 5 (next)**: `ToolRegistry` (D-020 plugin extensibility for
 * custom tools).
 */

// Selection (Bloco 1)
export * from './lib/selection';

// Hit-testing utilities (Bloco 1)
export * from './lib/hit-testing';
