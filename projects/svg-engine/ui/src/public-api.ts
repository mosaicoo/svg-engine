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

// Panel-group base component (D-061) — Illustrator/Affinity-style
// dockable tab strip used by shell-pro/custom-editor to combine
// related panels (Layers/Pages, Properties/Transform, etc.) into
// the same dock zone with a tiny tab header.
export * from './lib/panel-group';

// Layers panel (Bloco 4b)
export * from './lib/layers-panel';

// History snapshots panel (D-073) — Photoshop-style named restorable
// checkpoints. Pairs with SnapshotsService (core) + SnapshotsPersistenceService
// (edit) — both already scoped via provideSvgEngineEditorScope().
export * from './lib/snapshots-panel';

// Command history panel (D-134) — Photoshop-style linear list of every
// command on the HistoryService stacks with click-to-time-travel via
// CommandBus.goto(). Complementary to the snapshots panel above.
export * from './lib/history-panel';

// Plugin manager panel (D-083 Fase 1) — list/enable/disable/uninstall
// plugins grouped by type (internal/external). Reads PluginManagerService
// (edit, root-provided). Mechanism only — access policy is the consumer's.
export * from './lib/plugin-manager';

// Plugin manager dialog (D-083 Fase 1) — Material dialog wrapper around
// <svge-plugin-manager>, opened from the File ▸ Manage Plugins… menu item
// (builtinUiMenuContributionsPlugin). Service mirrors the other dialog openers.
export * from './lib/plugin-manager-dialog';

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

// Document settings dialog — File ▸ Document Settings… (D-140); mirrors
// the Inspector Page tab, bound to the active page.
export * from './lib/document-settings';

// Workspace layout reset — Window ▸ Workspace ▸ Reset Workspace (D-088)
export * from './lib/workspace-layout';

// Effects panel UI (Fase 6d — D-023 cat 7)
export * from './lib/effects-panel';

// Libraries panel UI (D-048) — unified surface for the 6 fully-
// functional libraries (shapes, templates, gradients, patterns,
// graphic styles, assets) + collapsible sections.
export * from './lib/libraries-panel';

// Pro-grade color picker (Sprint C-ColorPicker)
export * from './lib/color-picker';

// Gradient inline editor panel (D-058) — Inspector-side controls
// for editing the active gradient's stops/kind. Pairs with the
// GradientOverlay from `svg-engine/edit` for canvas interactions.
export * from './lib/gradient-editor';

// SVG source viewer dialog (Inkscape "XML Editor" / Boxy SVG "Source" parity)
export * from './lib/svg-source-dialog';

// D-110 — Code Generators dialog + plugin (React JSX / React Component /
// Data URI). Preview-and-copy surface over CodeGeneratorRegistry (svg-engine/io).
export * from './lib/code-generator-dialog';

// D-074 — Smart Object editor dialog (textarea SVG editor for "Edit Contents")
export * from './lib/smart-object-dialog';

// Trace Image options dialog (D-066c) — Material wrapper for D-062d
// autotrace with threshold/tolerance/minPoints sliders + hide-source
// checkbox + Apply/Cancel.
export * from './lib/trace-image-dialog';

// Find & Replace dialog (D-070) — Material dialog over the headless
// FindReplaceService (svg-engine/edit). Search fill/stroke/fontFamily/
// generic attribute; replace all in a single undoable batch.
export * from './lib/find-replace-dialog';

// Keyboard Shortcuts manager (D-087) — Material dialog over the global
// KeybindingsService (svg-engine/edit). List every command, rebind /
// unbind / reset its key combo with live conflict warnings.
export * from './lib/keyboard-shortcuts-dialog';

// Command Palette (Tools ▸ Command Palette, Ctrl+Shift+P) — fuzzy search
// over every MenuContributionRegistry command, run by keyboard. Distinct
// from the svg-studio NLU palette (Ctrl+K, natural language).
export * from './lib/command-palette';

// D-093 — Object ▸ Transform parameter dialog (Rotate / Scale / Skew).
// Illustrator-style "enter the exact amount" dialog backing the three
// Transform submenu entries that need a value. Pure-UI; the menu handler
// does the geometry + dispatches the matching batch command.
export * from './lib/transform-dialog';

// D-093 — generic single-number prompt dialog. Backs menu actions whose
// command takes one numeric parameter but previously used a hardcoded
// default (Path ▸ Offset Path distance, Path ▸ Simplify tolerance).
export * from './lib/number-prompt-dialog';

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

// D-044 follow-up — About SVGEngine Material dialog. Replaces the
// alert()-based About previously registered by the edit-side
// builtinMenuContributionsPlugin. The menu entry now lives in
// builtinUiMenuContributionsPlugin which can import MatDialog.
export * from './lib/about-dialog';

// D-077 — Asset Export panel (batch export UI). Pairs with the
// edit-side AssetExportRegistry + AssetExportRunner. Mount inside
// any panel-group tab to expose batch-export workflows.
export * from './lib/asset-export-panel';

// D-079 — Pages / Artboards tab strip (PAGES-C). Horizontal browser-
// style tabs above the canvas. Auto-hides when the document has zero
// pages (back-compat). Pairs with PagesService + ActivePageService.
export * from './lib/pages-panel';

// D-082 — Animation Timeline (F4): read-only <svge-timeline> dock.
// Renders the active page's animation (ruler + per-track keyframes +
// playhead). No editing (F5) or transport wiring (F6) yet. Pairs with
// the edit-side AnimationService + PlaybackService.
export * from './lib/timeline';

// REFACTOR-1 — Material builtin tier. `provideSvgeUiBuiltins()` bundles
// the UI-side builtins (tool-options + dialog-bound menu contributions)
// so apps add the Material tier with one spread. Pairs with
// `provideSvgEngineEditorBuiltins()` (svg-engine/edit, headless tier).
export * from './lib/builtins';
