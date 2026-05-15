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
 * **Bloco 1** ✅: `SelectionService` + hit-testing helpers.
 * **Bloco 2** ✅: geometry utils (bbox + 9 anchors), `TransformService`
 *   skeleton (pivot only), `<svge-selection-overlay>`,
 *   `<svge-rotation-pivot>` Affinity-grade (free-drag + snap-to-anchors
 *   with Alt-bypass + 3×3 popover + Esc cancel + dbl-click reset).
 * **Bloco 3** ⏳: `TransformService` expanded (drag/resize/rotate);
 *   new commands (`RotateNodeCommand`, `ResizeNodeCommand`).
 * **Bloco 4a** ✅: `<svge-marquee>` + `MarqueeService` + pure
 *   `nodesInsideMarquee` hit-tester (drag-to-select with shift-add).
 * **Bloco 4b** ✅: `SnapService` (grid + objects) + pure `resolveSnap`
 *   + `<svge-snap-guides>` overlay (magenta dashed lines).
 * **Bloco 4c** ⏳: alignment + distribution commands.
 * **Bloco 5** ⏳: `ToolRegistry` (D-020 plugin point).
 */

// Selection (Bloco 1)
export * from './lib/selection';

// Hit-testing utilities (Bloco 1)
export * from './lib/hit-testing';

// Geometry utilities (Bloco 2)
export * from './lib/geometry';

// Transform service skeleton — pivot only (Bloco 2; expanded in Bloco 3)
export * from './lib/transform';

// Visual overlays (Bloco 2 + Bloco 4a marquee)
export * from './lib/overlay';

// Marquee selection (Bloco 4a)
export * from './lib/marquee';

// Snap to grid + objects (Bloco 4b)
export * from './lib/snap';
