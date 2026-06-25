import type { EnvironmentProviders } from '@angular/core';
import { provideSvgEnginePlugin, withPluginMeta } from '@mosaicoo/svg-engine/edit';

import { codeGeneratorsPlugin } from '../code-generator-dialog';
import { builtinUiMenuContributionsPlugin } from '../menu-extras';
import { provideSvgeBuiltinToolOptions } from '../tool-options';

/**
 * **`provideSvgeUiBuiltins()`** — tier **controles Material (`ui`)** do
 * conjunto built-in, num único helper.
 *
 * Complementa o `provideSvgEngineEditorBuiltins()` (tier headless, em
 * `svg-engine/edit`) com as peças que **dependem de `@angular/material`**
 * e por isso vivem aqui (fronteira D-017):
 *
 * - **`builtinUiMenuContributionsPlugin`** — itens de menu que abrem
 *   diálogos Material (ex.: "View Source…", "About…").
 * - **`provideSvgeBuiltinToolOptions()`** — registra os componentes de
 *   opção de ferramenta no `<svge-tool-options>` (Rect/Ellipse/Polygon/
 *   Pencil/Pen/Text/Gradient/Eyedropper/Knife/Smooth/Width/SymbolSprayer).
 *
 * **Ordem de uso no app**: chame **depois** de
 * `provideSvgEngineEditorBuiltins()` e **antes** de provisionar o NLU
 * (`builtinNluPlugin`, tier AI) — o NLU faz auto-discovery das
 * contribuições de menu (edit-side **e** ui-side), então ambas precisam
 * estar registradas primeiro.
 *
 * @returns `EnvironmentProviders[]` — faça spread no array `providers`.
 */
export function provideSvgeUiBuiltins(): EnvironmentProviders[] {
  return [
    // Itens de menu que precisam de MatDialog (View Source…, Settings,
    // Find & Replace…, Manage Plugins…, About…). Metadata de exibição
    // (D-083) coerente, igual ao tier headless.
    provideSvgEnginePlugin(
      withPluginMeta(builtinUiMenuContributionsPlugin, {
        description:
          'Menu items that open dialogs (View Source, Settings, Find & Replace, Manage Plugins).',
        author: 'SVGEngine',
        icon: 'menu_open',
        category: 'menu',
      }),
    ),
    // **D-110** — Code Generators (React JSX / React Component / Data URI).
    // Registra os geradores no CodeGeneratorRegistry e adiciona
    // File ▸ Generate Code… (abre <svge-code-generator-dialog>). Aparece em
    // Manage Plugins como qualquer built-in.
    provideSvgEnginePlugin(
      withPluginMeta(codeGeneratorsPlugin, {
        description:
          'Generate React JSX, a React component, or a Data URI from the document (preview + copy).',
        author: 'SVGEngine',
        icon: 'code_blocks',
        category: 'io',
      }),
    ),
    // Componentes de opção das ferramentas no <svge-tool-options>.
    provideSvgeBuiltinToolOptions(),
  ];
}
