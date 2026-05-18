import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  builtinIoPlugin,
  builtinOptimizersPlugin,
  builtinPalettesPlugin,
  pencilToolPlugin,
  pngExporterPlugin,
  provideSvgEnginePlugin,
  selectToolPlugin,
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
  ],
};
