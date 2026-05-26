import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { SYMBOL_SPRAYER_TOOL_ID, WIDTH_TOOL_ID } from 'svg-engine/edit';
import { SvgeSymbolSprayerOptions } from './symbol-sprayer-options/symbol-sprayer-options.component';
import { ToolOptionsRegistry } from './tool-options-registry.service';
import { SvgeWidthToolOptions } from './width-tool-options/width-tool-options.component';

/**
 * **TOOL-OPT-A4** — wire all built-in tool option components into the
 * `ToolOptionsRegistry` at app bootstrap.
 *
 * **Usage** (in `app.config.ts`):
 *
 * ```ts
 * import { provideSvgeBuiltinToolOptions } from 'svg-engine/ui';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideSvgEnginePlugin(...),
 *     provideSvgeBuiltinToolOptions(),
 *   ],
 * };
 * ```
 *
 * **What it registers** (Fase A — first batch):
 *
 * - Symbol Sprayer (Stamp) → {@link SvgeSymbolSprayerOptions}
 * - Width → {@link SvgeWidthToolOptions}
 *
 * Subsequent phases (B/C/D) extend this list with Rectangle, Ellipse,
 * Polygon, Pencil, Pen, Text, Gradient, Eyedropper, Select, Direct
 * Select, Knife, Smooth. The function signature stays stable across
 * additions — consumers don't need to change their `app.config.ts`
 * when a new builtin lands.
 *
 * **Why an environment initializer instead of a constructor side
 * effect**: keeps the wiring explicit, opt-in (consumers who only
 * want a subset of built-ins can override one tool via
 * `ToolOptionsRegistry.register()` after this runs), and predictable
 * — the registration happens once at bootstrap regardless of which
 * tool the user activates first.
 *
 * **Idempotency**: re-registration is allowed (last write wins). Safe
 * to call this multiple times if the consumer bootstraps multiple
 * environments (though that's unusual).
 */
export function provideSvgeBuiltinToolOptions(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      const registry = inject(ToolOptionsRegistry);
      registry.register(SYMBOL_SPRAYER_TOOL_ID, SvgeSymbolSprayerOptions);
      registry.register(WIDTH_TOOL_ID, SvgeWidthToolOptions);
    }),
  ]);
}
