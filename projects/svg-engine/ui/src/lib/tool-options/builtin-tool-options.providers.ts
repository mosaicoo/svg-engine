import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import {
  DIRECT_SELECT_TOOL_ID,
  ELLIPSE_TOOL_ID,
  EYEDROPPER_TOOL_ID,
  GRADIENT_TOOL_ID,
  KNIFE_TOOL_ID,
  PEN_TOOL_ID,
  PENCIL_TOOL_ID,
  POLYGON_TOOL_ID,
  RECTANGLE_TOOL_ID,
  SELECT_TOOL_ID,
  SMOOTH_TOOL_ID,
  SYMBOL_SPRAYER_TOOL_ID,
  TEXT_TOOL_ID,
  WIDTH_TOOL_ID,
} from 'svg-engine/edit';
import { SvgeDirectSelectOptions } from './direct-select-options/direct-select-options.component';
import { SvgeEyedropperToolOptions } from './eyedropper-tool-options/eyedropper-tool-options.component';
import { SvgeGradientToolOptions } from './gradient-tool-options/gradient-tool-options.component';
import { SvgeKnifeToolOptions } from './knife-tool-options/knife-tool-options.component';
import { SvgePenToolOptions } from './pen-tool-options/pen-tool-options.component';
import { SvgePencilToolOptions } from './pencil-tool-options/pencil-tool-options.component';
import { SvgeSelectToolOptions } from './select-tool-options/select-tool-options.component';
import { SvgeEllipseOptions } from './shape-tool-options/ellipse-options.component';
import { SvgePolygonOptions } from './shape-tool-options/polygon-options.component';
import { SvgeRectangleOptions } from './shape-tool-options/rectangle-options.component';
import { SvgeSmoothToolOptions } from './smooth-tool-options/smooth-tool-options.component';
import { SvgeSymbolSprayerOptions } from './symbol-sprayer-options/symbol-sprayer-options.component';
import { SvgeTextToolOptions } from './text-tool-options/text-tool-options.component';
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
      // TOOL-OPT-A — Symbol Sprayer + Width.
      registry.register(SYMBOL_SPRAYER_TOOL_ID, SvgeSymbolSprayerOptions);
      registry.register(WIDTH_TOOL_ID, SvgeWidthToolOptions);
      // TOOL-OPT-B — Rectangle + Ellipse + Polygon + Pencil + Pen.
      registry.register(RECTANGLE_TOOL_ID, SvgeRectangleOptions);
      registry.register(ELLIPSE_TOOL_ID, SvgeEllipseOptions);
      registry.register(POLYGON_TOOL_ID, SvgePolygonOptions);
      registry.register(PENCIL_TOOL_ID, SvgePencilToolOptions);
      registry.register(PEN_TOOL_ID, SvgePenToolOptions);
      // TOOL-OPT-C — Text + Gradient + Eyedropper.
      registry.register(TEXT_TOOL_ID, SvgeTextToolOptions);
      registry.register(GRADIENT_TOOL_ID, SvgeGradientToolOptions);
      registry.register(EYEDROPPER_TOOL_ID, SvgeEyedropperToolOptions);
      // TOOL-OPT-D — Select + Direct Select + Knife + Smooth.
      registry.register(SELECT_TOOL_ID, SvgeSelectToolOptions);
      registry.register(DIRECT_SELECT_TOOL_ID, SvgeDirectSelectOptions);
      registry.register(KNIFE_TOOL_ID, SvgeKnifeToolOptions);
      registry.register(SMOOTH_TOOL_ID, SvgeSmoothToolOptions);
    }),
  ]);
}
