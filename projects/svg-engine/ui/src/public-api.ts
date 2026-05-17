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
 * **Bloco 4b** ⏳: `<svge-layers-panel>`.
 * **Bloco 4c** ⏳: `<svge-inspector>`.
 * **Bloco 4d** ⏳: `<svge-color-palette>` + `PaletteService`.
 * **Bloco 4e** ⏳: `<svge-toolbar>` extensible + `MenuContributionRegistry`.
 * **Bloco 4f** ⏳: workspace settings (page/grid/guides/rulers UI).
 * **Bloco 4g** ⏳: shortcuts UI + `ShortcutRegistry`.
 * **Bloco 4h** ⏳: grouping commands.
 * **Bloco 4i** ⏳: `<svge-theme-toggle>` (D-012 part 2).
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

// Theme toggle + service (Fase 4 Bloco 4i — D-012 part 2)
export * from './lib/theme-toggle';
