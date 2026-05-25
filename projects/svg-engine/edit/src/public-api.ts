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
 * **Bloco 3** ✅: `TransformService` expanded (drag/resize/rotate);
 *   new commands (`RotateNodeCommand`, `ResizeNodeCommand`).
 * **Bloco 4a** ✅: `<svge-marquee>` + `MarqueeService` + pure
 *   `nodesInsideMarquee` hit-tester (drag-to-select with shift-add).
 * **Bloco 4b** ✅: `SnapService` (grid + objects) + pure `resolveSnap`
 *   + `<svge-snap-guides>` overlay (magenta dashed lines).
 * **Bloco 4c** ✅: `AlignmentService` (6 align ops + 2 distribute ops),
 *   pure `computeAlignDeltas`/`computeDistributeDeltas`, dispatched as
 *   a single `TranslateManyCommand` (one undo entry per UI action).
 * **Bloco 5a** ✅: plugin scaffolding — `EditorPlugin` interface,
 *   `PluginRegistry` (install/uninstall/lifecycle, semver gate, dep
 *   check, auto-cleanup of tracked `Disposable`s), `provideSvgEnginePlugin`
 *   Angular provider for bootstrap.
 * **Bloco 5b** ✅: `ToolRegistry` + `ToolHostService` (active tool +
 *   event routing) + reference `selectToolPlugin` (passthrough) and
 *   `pencilToolPlugin` (freehand drawing) — both built on the Bloco
 *   5a plugin scaffolding.
 * **Bloco 5c** ✅: D-020 expanded + D-023 plugin-types roadmap +
 *   D-024 ScriptRuntimePlugin (Fase 6+ deferred).
 * **Fase 4 foundation** ✅: `WorkspaceService` + `<svge-workspace-background>`
 *   (D-021 resolution: editor presentation state separate from
 *   `SvgDocument`; transparent/solid/image background variants).
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

// Alignment + distribution (Bloco 4c)
export * from './lib/alignment';

// Plugin scaffolding (Bloco 5a)
export * from './lib/plugin';

// Pointer / input helpers (D-036 consolidation — capturePointer,
// releasePointer, isEditableTarget shared across overlays/gestures)
export * from './lib/pointer';

// Tool API + builtin tools (Bloco 5b)
export * from './lib/tool';

// Workspace presentation (D-021 — Fase 4 foundation)
export * from './lib/workspace';

// Per-node visibility + lock (Fase 4 Bloco 4b)
export * from './lib/layers';

// Color palettes + built-in palette plugin (Fase 4 Bloco 4d)
export * from './lib/palette';

// Menu / toolbar contribution registry (Fase 4 Bloco 4e)
export * from './lib/menu';

// Keyboard shortcuts (Fase 4 Bloco 4g)
export * from './lib/shortcut';

// IO — SVG import + export (Fase 5-IO)
export * from './lib/io';

// Optimization pipeline (Fase 5-Optimize)
export * from './lib/optimize';

// Viewport culling (Fase 6b-2 — perf for large docs)
export * from './lib/viewport-culling';

// Effects / SVG filters (Fase 6d — D-023 cat 7)
export * from './lib/effect';

// Canvas gestures (Fase 6 UX polish — middle-mouse pan + wheel zoom)
export * from './lib/canvas-gestures';

// Isolation Mode (Illustrator/Affinity-style group isolation + breadcrumb)
export * from './lib/isolation';

// Anchor / path editor (Direct Select tool — edit individual anchor points)
export * from './lib/anchor-editor';

// Auto-save + recovery (localStorage-backed)
export * from './lib/autosave';

// In-memory clipboard for Copy/Cut/Paste (D-044)
export * from './lib/clipboard';

// Route-scoped editor state stack (D-042 — multi-editor in same app)
export * from './lib/scope';

// Library system (D-048) — 8 asset/preset libraries: shapes, palettes,
// graphic styles, gradients, patterns, templates, symbols (D-059 full
// master/instance via SymbolUseNode), brushes (D-060 Pencil-tool
// expansion via widthProfile), plus the standalone AssetManagerService
// for runtime imports.
export * from './lib/library';

// Auto-trace (D-062d) — single-threshold raster → vector tracing.
// Pure function (`traceImageToPaths`) + `TraceImageCommand` wrapper.
// Honest scope: bicromático, polyline output (no curve fitting).
export * from './lib/autotrace';

// Find & Replace (D-070) — service + types only. UI lives in
// `svg-engine/ui` (Material dialog). Pure logic exported so headless
// consumers can build their own find/replace flow without dragging
// the dialog in.
export * from './lib/find-replace';
