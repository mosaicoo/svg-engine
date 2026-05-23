/*
 * Public API surface of `svg-engine/ui` (Fase 4).
 *
 * Material-based UI shell components for the editor: full-featured
 * `<svge-editor>` composing background + renderer + overlays + toolbar,
 * and individual panels (layers, inspector, color palette, etc.) that
 * consumers can compose à la carte.
 *
 * **Headless boundary (D-017)**: this is the **only** entry point in
 * `svg-engine` allowed to import `@angular/material` and `@angular/cdk`.
 * Consumers who don't want Material can keep using `core/render/edit`
 * directly and build their own UI.
 *
 * **Bloco 4a** ✅: entry point setup + `<svge-editor>` shell.
 * **Bloco 4b** ✅: `<svge-layers-panel>`.
 * **Bloco 4c** ✅: `<svge-inspector>`.
 * **Bloco 4d** ✅: `<svge-color-palette>` + `PaletteService`.
 * **Bloco 4e** ✅: `<svge-toolbar>` extensible + `MenuContributionRegistry`.
 * **Bloco 4f** ✅: workspace settings (page/grid/guides/rulers UI).
 * **Bloco 4g** ✅: shortcuts UI + `ShortcutRegistry`.
 * **Bloco 4h** ✅: grouping commands.
 * **Bloco 4i** ✅: `<svge-theme-toggle>` (D-012 part 2).
 */

// Editor shell (Bloco 4a)
export * from './lib/editor';

// Layers panel (Bloco 4b)
export * from './lib/layers-panel';

// Property inspector (Bloco 4c)
export * from './lib/inspector';

// Color palette UI (Bloco 4d)
export * from './lib/color-palette';

// Extensible toolbar UI (Bloco 4e)
export * from './lib/toolbar';

// Rulers (Fase 4 Bloco 4f)
export * from './lib/rulers';

// Isolation Mode breadcrumb (Affinity / Illustrator-style)
export * from './lib/isolation-breadcrumb';

// Theme toggle + service (Fase 4 Bloco 4i — D-012 part 2)
export * from './lib/theme-toggle';

// Workspace settings dialog (Item 2 — débito 4f)
export * from './lib/workspace-settings';

// Effects panel UI (Fase 6d — D-023 cat 7)
export * from './lib/effects-panel';

// Libraries panel UI (D-048) — unified surface for the 6 fully-
// functional libraries (shapes, templates, gradients, patterns,
// graphic styles, assets) + collapsible sections.
export * from './lib/libraries-panel';

// Pro-grade color picker (Sprint C-ColorPicker)
export * from './lib/color-picker';

// SVG source viewer dialog (Inkscape "XML Editor" / Boxy SVG "Source" parity)
export * from './lib/svg-source-dialog';

// Status bar (D-035 — shell-refinement; standalone OR via <svge-editor>)
export * from './lib/status-bar';

// Menu bar (Sprint Pro-Editor — D-038 phase 1; standalone OR via <svge-editor>)
export * from './lib/menu-bar';

// Context menu (Sprint Pro-Editor — D-038 phase 2; directive + service + component)
export * from './lib/context-menu';

// Tool options bar (Sprint Pro-Editor — D-038 phase 3; standalone OR via <svge-editor>)
export * from './lib/tool-options';

// Tools palette (Sprint Pro-Editor — D-038 phase 4 helper; standalone)
export * from './lib/tools-palette';

// Professional shell composing menu + toolbar + tool-options + tools-palette
// + canvas + context-menu + layers + inspector + status — D-038 phase 4
export * from './lib/shell-pro';

// Built-in UI menu contributions (Material-dialog items — D-044)
export * from './lib/menu-extras';

// Shared dialog shell + sizing system (D-044 follow-up — UI consistency)
// Use SvgeDialogShell + svgeDialogConfig() to build new dialogs that
// match the standardized SVGEngine look. See dialog-shell.component.ts
// for the API and dialog-config.ts for the size buckets.
export * from './lib/dialog-shell';
