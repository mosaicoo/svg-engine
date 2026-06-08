import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  builtinAdvancedEditMenuPlugin,
  builtinBrushesPlugin,
  builtinClipPathsPlugin,
  builtinEditorShortcutsPlugin,
  builtinEffectsPlugin,
  builtinGradientsPlugin,
  builtinGraphicStylesPlugin,
  builtinInsertMenuPlugin,
  builtinIoPlugin,
  builtinMasksPlugin,
  builtinMenuContributionsPlugin,
  builtinOptimizersPlugin,
  builtinPalettesPlugin,
  builtinPatternsPlugin,
  builtinShapesPlugin,
  builtinSymbolsPlugin,
  builtinTemplatesPlugin,
  extraPalettesPlugin,
  extraToolsPlugin,
  pageToolPlugin,
  pencilToolPlugin,
  penToolPlugin,
  pngExporterPlugin,
  provideSvgEnginePlugin,
  selectionNudgePlugin,
  selectToolPlugin,
  shapeToolsPlugin,
  textToolPlugin,
} from 'svg-engine/edit';
import { builtinUiMenuContributionsPlugin, provideSvgeBuiltinToolOptions } from 'svg-engine/ui';
import { builtinNluPlugin } from 'svg-engine/ai/nlu';

import { commandPalettePlugin } from './command-palette/command-palette.plugin';
import { routes } from './app.routes';

/**
 * **SVG Studio bootstrap providers** — mirrors the playground's plugin
 * set MINUS the playground-specific demos (the `stamp-tool` is a D-038
 * Phase 3 showcase, not a production tool — kept out of Studio).
 *
 * Plugin install order matters for two reasons:
 *
 * 1. **Tool ordering in the toolbar palette** — the first registered
 *    tool becomes the natural default. `selectToolPlugin` MUST be first.
 * 2. **NLU auto-discovery** — `builtinNluPlugin` scans
 *    `MenuContributionRegistry` at install time to register intents for
 *    every contributed action. It MUST install AFTER the two menu
 *    contribution plugins (edit + ui) so it sees their entries.
 *
 * Keep this file in sync with `projects/playground/src/app/app.config.ts`
 * when adding/removing built-in plugins so both apps stay at feature
 * parity. The only intentional divergence is the stamp tool.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Required by MatDialog (used by workspace-settings, find-replace,
    // svg-source, trace-image, smart-object-editor dialogs). Async
    // variant lazy-loads BrowserAnimationsModule on first use.
    provideAnimationsAsync(),
    provideRouter(routes),

    // ── Tools (order = toolbar order; select MUST be first) ───────
    provideSvgEnginePlugin(selectToolPlugin),
    // PAGES-REFACTOR — Page tool (Illustrator's Artboard Tool pattern).
    // Shift+O toggles; when active, the page selection overlay
    // (brackets + handles) renders and the page is resizable/movable.
    provideSvgEnginePlugin(pageToolPlugin),
    provideSvgEnginePlugin(pencilToolPlugin),
    provideSvgEnginePlugin(penToolPlugin),
    provideSvgEnginePlugin(shapeToolsPlugin),
    provideSvgEnginePlugin(textToolPlugin),

    // ── Built-in libraries (palettes/shapes/symbols/brushes/etc) ───
    provideSvgEnginePlugin(builtinPalettesPlugin),
    provideSvgEnginePlugin(builtinShapesPlugin),
    provideSvgEnginePlugin(builtinSymbolsPlugin),
    provideSvgEnginePlugin(builtinBrushesPlugin),
    provideSvgEnginePlugin(builtinTemplatesPlugin),
    provideSvgEnginePlugin(builtinGradientsPlugin),
    provideSvgEnginePlugin(builtinPatternsPlugin),
    provideSvgEnginePlugin(builtinGraphicStylesPlugin),
    provideSvgEnginePlugin(extraPalettesPlugin),
    provideSvgEnginePlugin(builtinClipPathsPlugin),
    provideSvgEnginePlugin(builtinMasksPlugin),

    // ── IO + optimize + effects ───────────────────────────────────
    provideSvgEnginePlugin(builtinIoPlugin),
    provideSvgEnginePlugin(pngExporterPlugin),
    provideSvgEnginePlugin(builtinOptimizersPlugin),
    provideSvgEnginePlugin(builtinEffectsPlugin),

    // ── Keyboard ergonomics ────────────────────────────────────────
    provideSvgEnginePlugin(selectionNudgePlugin),
    provideSvgEnginePlugin(builtinEditorShortcutsPlugin),

    // ── Menu / toolbar / context-menu contributions ────────────────
    // D-043 — wired Edit/View/Object/Help + toolbar + context items.
    // disabled signals + run handlers honor multi-editor scope via
    // MenuContributionContext.injector (D-042/D-043).
    provideSvgEnginePlugin(builtinMenuContributionsPlugin),
    // D-052 — Insert menu (shape submenu + text + image).
    provideSvgEnginePlugin(builtinInsertMenuPlugin),
    // D-053/D-054/D-056 — compound paths + live boolean.
    provideSvgEnginePlugin(builtinAdvancedEditMenuPlugin),
    // D-044 — UI-side menu items needing MatDialog (View Source…).
    provideSvgEnginePlugin(builtinUiMenuContributionsPlugin),

    // ── Extra tools (Eyedropper / Knife / Smooth / Gradient / etc) ──
    provideSvgEnginePlugin(extraToolsPlugin),

    // ── NLU (must install AFTER menu plugins for auto-discovery) ───
    // D-046 Fase 1 — rule-based natural-language router.
    provideSvgEnginePlugin(builtinNluPlugin),
    // Command Palette (Ctrl+K + botão "Assistente" no toolbar) que
    // hospeda o <svge-nlu-input> num MatDialog escopado ao editor.
    // App-level (não no shell) p/ preservar o desacoplamento ui↛ai.
    provideSvgEnginePlugin(commandPalettePlugin),

    // ── Tool options bar wiring ────────────────────────────────────
    // TOOL-OPT — populates <svge-tool-options> with the built-in
    // option components for each tool (Rect/Ellipse/Polygon/Pencil/
    // Pen/Text/Gradient/Eyedropper/Knife/Smooth/Width/SymbolSprayer).
    provideSvgeBuiltinToolOptions(),
  ],
};
