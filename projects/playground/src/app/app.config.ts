import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  builtinClipPathsPlugin,
  builtinEditorShortcutsPlugin,
  builtinEffectsPlugin,
  extraToolsPlugin,
  builtinGradientsPlugin,
  builtinGraphicStylesPlugin,
  builtinIoPlugin,
  builtinMasksPlugin,
  builtinMenuContributionsPlugin,
  builtinOptimizersPlugin,
  builtinPalettesPlugin,
  builtinPatternsPlugin,
  builtinShapesPlugin,
  builtinTemplatesPlugin,
  extraPalettesPlugin,
  pencilToolPlugin,
  penToolPlugin,
  pngExporterPlugin,
  provideSvgEnginePlugin,
  selectionNudgePlugin,
  selectToolPlugin,
  shapeToolsPlugin,
  textToolPlugin,
} from 'svg-engine/edit';
import { builtinUiMenuContributionsPlugin } from 'svg-engine/ui';
import { builtinNluPlugin } from 'svg-engine/ai/nlu';

import { stampToolPlugin } from './plugins/stamp-tool.plugin';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Required by MatDialog (used by the workspace-settings dialog).
    // Async variant lazy-loads BrowserAnimationsModule on first use.
    provideAnimationsAsync(),
    provideRouter(routes),
    // Builtin tool plugins (Bloco 5b). Order matters: select first so it
    // becomes the natural default in the toolbar.
    provideSvgEnginePlugin(selectToolPlugin),
    provideSvgEnginePlugin(pencilToolPlugin),
    // Pen tool (Sprint B-PenTool) — vector path creation via clicks
    // (cusp) and click-drag (smooth handles). Sucessor natural do
    // Pencil tool para edição precisa.
    provideSvgEnginePlugin(penToolPlugin),
    // Shape tools (Sprint Shapes+Text): Rectangle (R), Ellipse (E),
    // Polygon (Y). Substituem os botões "Add Rect/Ellipse/Triangle"
    // one-shot da toolbar — agora cada tool é persistente (Illustrator
    // convention). Shift constrain square/circle/regular; Alt center.
    provideSvgEnginePlugin(shapeToolsPlugin),
    // Text tool (T): click cria text node placeholder + abre inline
    // editor (foreignObject + contentEditable). Enter commita; Esc
    // cancela e remove placeholder se nada foi digitado.
    provideSvgEnginePlugin(textToolPlugin),
    // Built-in color palettes (Fase 4 Bloco 4d).
    provideSvgEnginePlugin(builtinPalettesPlugin),
    // Built-in SVG IO (Fase 5-IO) — sanitized importer + deterministic exporter.
    provideSvgEnginePlugin(builtinIoPlugin),
    // PNG export (Item 6 — reference plugin for binary/async exporters).
    // Shipped separately so apps that don't need raster can drop it.
    provideSvgEnginePlugin(pngExporterPlugin),
    // Built-in optimization passes (Fase 5-Optimize) — precision rounding,
    // drop SVG default attrs, prune empty groups.
    provideSvgEnginePlugin(builtinOptimizersPlugin),
    // Arrow-key nudge for selection (Fase 6c-2 a11y). Keyboard-only
    // users get parity with pointer drag for the most common edit op.
    provideSvgEnginePlugin(selectionNudgePlugin),
    // Built-in SVG filter effects (Fase 6d — D-023 cat 7): blur,
    // drop-shadow, grayscale, sepia. Shipped separately so apps that
    // don't surface effects in their UI can drop this plugin.
    provideSvgEnginePlugin(builtinEffectsPlugin),
    // D-043 — Built-in menu/toolbar/context contributions with REAL
    // handlers (replaces playground demoMenuBarPlugin which was all
    // console.info mocks). Populates Edit/View/Object/Help + toolbar
    // + context.canvas + context.node with wired commands (undo/redo/
    // delete/group/ungroup/select-all/zoom/reorder/toggle-grid/etc).
    // Items with reactive `disabled` signals follow selection/history
    // state. Opt-in (consumer may replace with custom layouts).
    provideSvgEnginePlugin(builtinMenuContributionsPlugin),
    // D-044 — Sibling plugin in svg-engine/ui for menu items that
    // require Material dialog infrastructure (View Source… opens
    // <svge-svg-source-dialog> via MatDialog). edit-side plugin
    // cannot import @angular/material (D-017), so dialog-bound items
    // live here. Future: Workspace Settings…, Export with options…
    provideSvgEnginePlugin(builtinUiMenuContributionsPlugin),
    // Stamp tool (D-038 Phase 3 showcase) — demonstrates
    // Tool.optionsComponent flowing through <svge-tool-options>.
    // Press K to activate; the options bar shows radius + color
    // togglers; click on the canvas to drop a styled circle.
    provideSvgEnginePlugin(stampToolPlugin),
    // D-040 — canonical editor shortcuts (Ctrl+Z/Y/Shift+Z/G/Shift+G/A).
    // Opt-in; consumers can replace with their own bindings if needed.
    provideSvgEnginePlugin(builtinEditorShortcutsPlugin),
    // D-046 Fase 1 — NLU rule-based. Auto-descobre intents do
    // MenuContributionRegistry + registra `create-shape`/`set-fill`
    // customizados. **Ordem importa**: instalado APÓS
    // builtinMenuContributionsPlugin / builtinUiMenuContributionsPlugin
    // para que auto-discovery encontre as contribuições já registradas.
    provideSvgEnginePlugin(builtinNluPlugin),
    // D-048 — Libraries ecosystem (8 libraries). Each is opt-in via
    // its own plugin so apps choose what to ship. The Shape/Template/
    // Gradient/Pattern/GraphicStyle plugins register builtin items;
    // extra palettes augment the base palette plugin already installed
    // above. Asset/Symbol/Brush services are zero-cost without
    // plugins (empty registries).
    provideSvgEnginePlugin(builtinShapesPlugin),
    provideSvgEnginePlugin(builtinTemplatesPlugin),
    provideSvgEnginePlugin(builtinGradientsPlugin),
    provideSvgEnginePlugin(builtinPatternsPlugin),
    provideSvgEnginePlugin(builtinGraphicStylesPlugin),
    provideSvgEnginePlugin(extraPalettesPlugin),
    // D-049 (Item 4 — Composição / Recorte): registers built-in clipPath
    // + mask presets so the Inspector's Composition section dropdowns
    // have options the moment the editor mounts. Opt-out by omitting.
    provideSvgEnginePlugin(builtinClipPathsPlugin),
    provideSvgEnginePlugin(builtinMasksPlugin),
    // D-050 (Item 5 — Tools faltantes): Eyedropper / Knife / Smooth /
    // Gradient + 3 stub tools (Width / Mesh / Symbol Sprayer). Opt-out
    // by omitting; each tool's id is exported for selective install.
    provideSvgEnginePlugin(extraToolsPlugin),
  ],
};
