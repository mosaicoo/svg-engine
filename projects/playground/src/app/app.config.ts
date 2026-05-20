import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  builtinEffectsPlugin,
  builtinIoPlugin,
  builtinOptimizersPlugin,
  builtinPalettesPlugin,
  pencilToolPlugin,
  penToolPlugin,
  pngExporterPlugin,
  provideSvgEnginePlugin,
  selectionNudgePlugin,
  selectToolPlugin,
  shapeToolsPlugin,
  textToolPlugin,
} from 'svg-engine/edit';

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
  ],
};
