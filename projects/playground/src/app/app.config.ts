import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { pencilToolPlugin, provideSvgEnginePlugin, selectToolPlugin } from 'svg-engine/edit';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Builtin tool plugins (Bloco 5b). Order matters: select first so it
    // becomes the natural default in the toolbar.
    provideSvgEnginePlugin(selectToolPlugin),
    provideSvgEnginePlugin(pencilToolPlugin),
  ],
};
