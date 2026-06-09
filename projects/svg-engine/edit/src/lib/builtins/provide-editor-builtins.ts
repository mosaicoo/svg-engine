import type { EnvironmentProviders } from '@angular/core';

import { builtinEffectsPlugin } from '../effect';
import { builtinIoPlugin, pngExporterPlugin } from '../io';
import {
  builtinBrushesPlugin,
  builtinClipPathsPlugin,
  builtinGradientsPlugin,
  builtinGraphicStylesPlugin,
  builtinMasksPlugin,
  builtinPatternsPlugin,
  builtinShapesPlugin,
  builtinSymbolsPlugin,
  builtinTemplatesPlugin,
  extraPalettesPlugin,
} from '../library';
import {
  builtinAdvancedEditMenuPlugin,
  builtinInsertMenuPlugin,
  builtinMenuContributionsPlugin,
} from '../menu';
import { builtinOptimizersPlugin } from '../optimize';
import { builtinPalettesPlugin } from '../palette';
import { provideSvgEnginePlugin } from '../plugin';
import { selectionNudgePlugin } from '../selection';
import { builtinEditorShortcutsPlugin } from '../shortcut';
import {
  extraToolsPlugin,
  pageToolPlugin,
  pencilToolPlugin,
  penToolPlugin,
  selectToolPlugin,
  shapeToolsPlugin,
  textToolPlugin,
} from '../tool';

/**
 * **`provideSvgEngineEditorBuiltins()`** — tier **editor (headless)** do
 * conjunto built-in de plugins, num único helper.
 *
 * Antes desta função, **cada app** (svg-studio, playground e qualquer
 * consumidor que quisesse "o editor completo") tinha de chamar
 * `provideSvgEnginePlugin(...)` ~24 vezes, mantendo a lista e a **ordem**
 * sincronizadas à mão. Este helper centraliza isso: um `...spread` no
 * `providers` entrega tudo, na ordem correta.
 *
 * **Tiers (premissas da lib)** — os helpers espelham os entry-points para
 * que a DX combine com a arquitetura:
 * - **view-only** → use `<svge-renderer>` (`svg-engine/render`) direto,
 *   sem nenhum plugin.
 * - **editor headless (este)** → `provideSvgEngineEditorBuiltins()`
 *   (`svg-engine/edit`): tools + libraries + io/optimize/effects +
 *   teclado + menus. **Sem `@angular/material`** (fronteira D-017).
 * - **controles Material** → `provideSvgeUiBuiltins()` (`svg-engine/ui`):
 *   tool-options + itens de menu que abrem diálogos.
 * - **IA (separada)** → o app provisiona `builtinNluPlugin`
 *   (`svg-engine/ai/nlu`) + voz opcional por conta própria.
 *
 * **Composição vs. customização**: os plugins individuais continuam
 * exportados — quem quiser um subconjunto (ex.: editor sem libraries)
 * compõe à mão com `provideSvgEnginePlugin(x)` em vez de usar este helper.
 * Aditivo e não-quebrante: nada foi removido da superfície pública.
 *
 * **Ordem (importa)**:
 * 1. `selectToolPlugin` **primeiro** — vira a ferramenta default da paleta.
 * 2. As 6 tools principais em ordem (paleta) + extra tools.
 * 3. Menus por último neste tier — o `builtinNluPlugin` (tier AI),
 *    provisionado pelo app **depois** deste helper e do
 *    `provideSvgeUiBuiltins()`, precisa que as contribuições de menu já
 *    estejam registradas (auto-discovery).
 *
 * @returns `EnvironmentProviders[]` — faça spread no array `providers`.
 */
export function provideSvgEngineEditorBuiltins(): EnvironmentProviders[] {
  return [
    // ── Tools (ordem = ordem da paleta; SELECT primeiro) ──────────
    provideSvgEnginePlugin(selectToolPlugin),
    provideSvgEnginePlugin(pageToolPlugin),
    provideSvgEnginePlugin(pencilToolPlugin),
    provideSvgEnginePlugin(penToolPlugin),
    provideSvgEnginePlugin(shapeToolsPlugin),
    provideSvgEnginePlugin(textToolPlugin),
    // Extra tools (Eyedropper / Knife / Smooth / Gradient / Width / etc.)
    provideSvgEnginePlugin(extraToolsPlugin),

    // ── Teclado (nudge + atalhos canônicos Ctrl+Z/Y/G/A/…) ────────
    provideSvgEnginePlugin(selectionNudgePlugin),
    provideSvgEnginePlugin(builtinEditorShortcutsPlugin),

    // ── Bibliotecas (D-048): paletas, formas, símbolos, brushes, … ─
    provideSvgEnginePlugin(builtinPalettesPlugin),
    provideSvgEnginePlugin(extraPalettesPlugin),
    provideSvgEnginePlugin(builtinShapesPlugin),
    provideSvgEnginePlugin(builtinSymbolsPlugin),
    provideSvgEnginePlugin(builtinBrushesPlugin),
    provideSvgEnginePlugin(builtinTemplatesPlugin),
    provideSvgEnginePlugin(builtinGradientsPlugin),
    provideSvgEnginePlugin(builtinPatternsPlugin),
    provideSvgEnginePlugin(builtinGraphicStylesPlugin),
    provideSvgEnginePlugin(builtinClipPathsPlugin),
    provideSvgEnginePlugin(builtinMasksPlugin),

    // ── IO + optimize + effects ───────────────────────────────────
    provideSvgEnginePlugin(builtinIoPlugin),
    provideSvgEnginePlugin(pngExporterPlugin),
    provideSvgEnginePlugin(builtinOptimizersPlugin),
    provideSvgEnginePlugin(builtinEffectsPlugin),

    // ── Menus (edit-side) — DEVEM vir antes do NLU (auto-discovery) ─
    provideSvgEnginePlugin(builtinMenuContributionsPlugin),
    provideSvgEnginePlugin(builtinInsertMenuPlugin),
    provideSvgEnginePlugin(builtinAdvancedEditMenuPlugin),
  ];
}
