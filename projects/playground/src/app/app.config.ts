import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  builtinPalettesPlugin,
  pencilToolPlugin,
  provideSvgEnginePlugin,
  selectToolPlugin,
} from 'svg-engine/edit';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Builtin tool plugins (Bloco 5b). Order matters: select first so it
    // becomes the natural default in the toolbar.
    provideSvgEnginePlugin(selectToolPlugin),
    provideSvgEnginePlugin(pencilToolPlugin),
    // Built-in color palettes (Fase 4 Bloco 4d). Provides the swatches
    // shown under the inspector's color fields out of the box. Consumers
    // can override / remove by installing their own palettes plugin and
    // uninstalling this one.
    provideSvgEnginePlugin(builtinPalettesPlugin),
  ],
};
