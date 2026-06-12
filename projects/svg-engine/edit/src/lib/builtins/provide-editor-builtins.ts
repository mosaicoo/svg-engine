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
  builtinRoadmapMenuPlugin,
} from '../menu';
import { builtinOptimizersPlugin } from '../optimize';
import { builtinPalettesPlugin } from '../palette';
import {
  type EditorPlugin,
  type PluginCategory,
  provideSvgEnginePlugin,
  withPluginMeta,
} from '../plugin';
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

/** First-party author stamp shared by every built-in plugin manifest. */
const SVGE_AUTHOR = 'SVGEngine';

/**
 * Provide a built-in plugin with **display metadata** (D-083) attached
 * for the plugin manager — `description` / `icon` / `category`, plus the
 * shared `SVGEngine` author. Keeps the metadata coherent with each item
 * **right next to** the ordered list below, instead of scattering it
 * across ~25 plugin files. Third-party plugins instead declare the same
 * fields inline on their `EditorPlugin` (see `docs/10-guia-plugin.md`).
 */
function builtin(
  plugin: EditorPlugin,
  description: string,
  icon: string,
  category: PluginCategory,
): EnvironmentProviders {
  return provideSvgEnginePlugin(
    withPluginMeta(plugin, { description, author: SVGE_AUTHOR, icon, category }),
  );
}

/**
 * **`provideSvgEngineEditorBuiltins()`** — tier **editor (headless)** do
 * conjunto built-in de plugins, num único helper.
 *
 * Antes desta função, **cada app** (svg-studio, playground e qualquer
 * consumidor que quisesse "o editor completo") tinha de chamar
 * `provideSvgEnginePlugin(...)` ~24 vezes, mantendo a lista e a **ordem**
 * sincronizadas à mão. Este helper centraliza isso: um `...spread` no
 * `providers` entrega tudo, na ordem correta — agora também com a
 * metadata de exibição (D-083) coerente por item.
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
 * compõe à mão com `provideSvgEnginePlugin(x)` (opcionalmente via
 * `withPluginMeta`) em vez de usar este helper. Aditivo e não-quebrante.
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
    builtin(
      selectToolPlugin,
      'Select, move and marquee shapes — the default tool.',
      'near_me',
      'tool',
    ),
    builtin(
      pageToolPlugin,
      'Create, resize and arrange pages (artboards).',
      'crop_portrait',
      'tool',
    ),
    builtin(pencilToolPlugin, 'Freehand pencil drawing.', 'gesture', 'tool'),
    builtin(penToolPlugin, 'Bézier pen — place anchors, drag for curves.', 'draw', 'tool'),
    builtin(shapeToolsPlugin, 'Rectangle, ellipse and polygon tools.', 'category', 'tool'),
    builtin(textToolPlugin, 'Add and edit text on the canvas.', 'title', 'tool'),
    builtin(
      extraToolsPlugin,
      'Eyedropper, knife, smooth, gradient, width and symbol sprayer.',
      'build',
      'tool',
    ),

    // ── Teclado (nudge + atalhos canônicos Ctrl+Z/Y/G/A/…) ────────
    builtin(
      selectionNudgePlugin,
      'Arrow-key nudge for the current selection.',
      'open_with',
      'shortcut',
    ),
    builtin(
      builtinEditorShortcutsPlugin,
      'Canonical editor shortcuts (Undo/Redo, Group, Select All…).',
      'keyboard',
      'shortcut',
    ),

    // ── Bibliotecas (D-048): paletas, formas, símbolos, brushes, … ─
    builtin(
      builtinPalettesPlugin,
      'Built-in color palettes (greys, Material, Tailwind).',
      'palette',
      'palette',
    ),
    builtin(
      extraPalettesPlugin,
      'Extra color palettes (IBM, warm, cool, neon).',
      'palette',
      'palette',
    ),
    builtin(
      builtinShapesPlugin,
      'Starter shape library (star, arrow, heart…).',
      'category',
      'library',
    ),
    builtin(
      builtinSymbolsPlugin,
      'Reusable symbol library (master/instance).',
      'widgets',
      'library',
    ),
    builtin(
      builtinBrushesPlugin,
      'Calligraphic brush library for the Pencil tool.',
      'brush',
      'library',
    ),
    builtin(
      builtinTemplatesPlugin,
      'Document templates (print, social, video formats).',
      'dashboard',
      'library',
    ),
    builtin(builtinGradientsPlugin, 'Linear and radial gradient presets.', 'gradient', 'library'),
    builtin(builtinPatternsPlugin, 'Tileable pattern library.', 'texture', 'library'),
    builtin(
      builtinGraphicStylesPlugin,
      'One-click appearance presets (graphic styles).',
      'style',
      'library',
    ),
    builtin(builtinClipPathsPlugin, 'Clip-path shape library.', 'crop', 'library'),
    builtin(builtinMasksPlugin, 'Mask preset library.', 'masks', 'library'),

    // ── IO + optimize + effects ───────────────────────────────────
    builtin(builtinIoPlugin, 'SVG import and export.', 'import_export', 'io'),
    builtin(pngExporterPlugin, 'Export the document as a PNG image.', 'image', 'io'),
    builtin(
      builtinOptimizersPlugin,
      'SVG optimization passes (precision, drop-defaults, prune-empty).',
      'compress',
      'optimizer',
    ),
    builtin(
      builtinEffectsPlugin,
      '19 SVG filter effects (blur, shadows, glows, color, distortion).',
      'auto_awesome',
      'effect',
    ),

    // ── Menus (edit-side) — DEVEM vir antes do NLU (auto-discovery) ─
    builtin(
      builtinMenuContributionsPlugin,
      'Core File/Edit/Object menu, toolbar and context items.',
      'menu',
      'menu',
    ),
    builtin(
      builtinInsertMenuPlugin,
      'Insert menu — shapes, text and image submenu.',
      'add_box',
      'menu',
    ),
    builtin(
      builtinAdvancedEditMenuPlugin,
      'Advanced Edit menu (compound paths, live boolean).',
      'account_tree',
      'menu',
    ),
    // D-085 — completes the 9-menu Option B layout: the new Path/Tools/
    // Window menus + Object ▸ Mask + every "coming soon" roadmap item.
    // Installed AFTER the core menu plugins so its cross-plugin children
    // (e.g. Transform ▸ Rotate under the Object Flip parent) attach to
    // already-registered parents.
    builtin(
      builtinRoadmapMenuPlugin,
      'Option B menubar: Path/Tools/Window menus, Mask, and roadmap items.',
      'schedule',
      'menu',
    ),
  ];
}
