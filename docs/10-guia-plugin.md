# 10 — Guia do autor de plugin

> Como estender o SVGEngine sem editar o core. Cobre a infra
> ([D-020](04-decisoes-tecnicas.md#d-020--plugin-extensibility-via-typescript-d-020)),
> as 9 categorias mapeadas
> ([D-023](04-decisoes-tecnicas.md#d-023--categorias-de-plugin-roadmap)),
> e padrões práticos. Leia este guia + D-020 + D-023 e você tem o
> quadro completo (~10 min total).

---

## Em uma frase

> Um plugin é um objeto `EditorPlugin` que recebe um `PluginContext`
> com acesso ao Angular Injector e a um helper `track(disposable)`;
> usa esses dois para registrar contribuições nas capability
> registries; o registry devolve a cada `register()` um `Disposable`
> que `track` agenda para auto-cleanup no uninstall.

Sem façade, sem método por categoria, sem framework próprio. **O
único contrato é `install(ctx)` e (opcional) `uninstall(ctx)`.**

---

## Anatomia mínima

```ts
import { type EditorPlugin, type PluginContext, PLUGIN_API_VERSION } from 'svg-engine/edit';

export const myPlugin: EditorPlugin = {
  id: 'com.acme.my-plugin', // reverse-DNS recomendado, único na registry
  name: 'My plugin',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION, // checked at install — bump quando upgradear

  install(ctx: PluginContext): void {
    // ... registra contribuições aqui
  },

  // Opcional. Roda ANTES do auto-disposal dos tracked, caso precise
  // de trabalho que dependa das contribuições ainda estarem vivas.
  uninstall(_ctx: PluginContext): void {
    /* noop usual */
  },
};
```

Provisione no bootstrap:

```ts
// app.config.ts
import { provideSvgEnginePlugin } from 'svg-engine/edit';
providers: [provideSvgEnginePlugin(myPlugin)];
```

`provideSvgEnginePlugin` é um `multi:true` provider via
`ENVIRONMENT_INITIALIZER` — plugins instalam na ordem de declaração no
array `providers`.

---

## O PluginContext

```ts
interface PluginContext {
  readonly pluginId: string; // === plugin.id; útil para logs e tagging
  readonly injector: Injector; // Angular DI cru — pegue qualquer service
  track<T extends Disposable>(d: T): T; // retorna `d` para encadear
}
```

**Por que `injector` cru e não façade**: capability registries crescem
ao longo das fases. Façade por categoria obrigaria mudar o core a cada
novo registry. Com `injector.get(X)` o core fica estável.

**O padrão de uma linha** que você vai usar 90% das vezes:

```ts
install(ctx) {
  ctx.track(ctx.injector.get(SomeRegistry).register(myContribution));
}
```

Lê como: pega o registry, registra a contribuição, faz tracking pra
auto-cleanup. Sem dor.

---

## As 9 categorias (D-023)

| #   | Categoria          | Registry                                        | Fase de abertura | Exemplo                          |
| --- | ------------------ | ----------------------------------------------- | ---------------- | -------------------------------- |
| 1   | Node renderers     | `NodeRendererRegistry`                          | 2 ✅             | renderer custom de um shape novo |
| 2   | Tools              | `ToolRegistry`                                  | 3 ✅             | pencil, shape, eyedropper        |
| 3   | Otimizadores       | `OptimizerRegistry`                             | 5 ✅             | drop defaults, prune empty       |
| 4   | Importers          | `ImporterRegistry`                              | 5 ✅             | parser SVG, AI, EPS              |
| 5   | Exporters          | `ExporterRegistry`                              | 5 ✅             | SVG, PNG via canvas, JSX         |
| 6   | Inspector panels   | `InspectorPanelRegistry`                        | 4 _(planejada)_  | aba custom no inspector          |
| 7   | Efeitos / filtros  | `EffectRegistry`                                | 6 _(planejada)_  | preset de `<filter>` SVG         |
| 8   | Paletas / swatches | `PaletteRegistry`                               | 4 ✅             | conjunto de cores nomeadas       |
| 9   | Menus + atalhos    | `MenuContributionRegistry` + `ShortcutRegistry` | 4 ✅             | botão de toolbar, combo de tecla |

Padrão fixo por registry: `register(entry): Disposable`. Sem invenções.

---

## Receita 1 — Adicionar um shortcut

Caso mais simples. O exemplo abaixo é literalmente uma versão reduzida
do `selectionNudgePlugin` que ships na lib:

```ts
import type { EditorPlugin, PluginContext } from 'svg-engine/edit';
import { PLUGIN_API_VERSION, ShortcutRegistry } from 'svg-engine/edit';

export const myShortcutPlugin: EditorPlugin = {
  id: 'com.acme.shortcuts',
  name: 'Custom shortcuts',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const shortcuts = ctx.injector.get(ShortcutRegistry);
    ctx.track(
      shortcuts.register({
        id: 'com.acme.shortcuts.duplicate',
        combo: 'CmdOrCtrl+D',
        description: 'Duplicate selection',
        run: (event) => {
          event.preventDefault();
          // ... usar `ctx.injector.get(CommandBus)` etc para o trabalho real
        },
      }),
    );
  },
};
```

**Combos suportados**: `Ctrl+G`, `Cmd+Shift+G`, `Alt+ArrowUp`, `g`,
`Escape`, `F5`. Aceita `CmdOrCtrl` cross-platform. Tokens desconhecidos
**throw no register** (descobre erros cedo).

**Quando `when` matters**: shortcut deve ser ativo apenas em estados
específicos. Use o campo `when?: Signal<boolean>`:

```ts
shortcuts.register({
  id: 'com.acme.shortcuts.del-locked',
  combo: 'Delete',
  when: computed(() => selection.count() > 0 && !someEditMode()),
  run: (e) => {
    /* ... */
  },
});
```

---

## Receita 2 — Adicionar um Tool

Ferramentas (lápis, formas, eyedropper) implementam `Tool` e
contribuem via `ToolRegistry`:

```ts
import type { Tool, ToolContext, ToolPointerEvent } from 'svg-engine/edit';

const myShapeTool: Tool = {
  id: 'com.acme.tools.star',
  label: 'Star',
  shortcut: 's',
  icon: 'star_outline',
  cursor: 'crosshair',

  onActivate(_ctx: ToolContext): void {
    /* setup state */
  },
  onPointerDown(event: ToolPointerEvent): void {
    /* event.docPoint já está convertido pra coords do doc */
  },
  onPointerMove(event: ToolPointerEvent): void {
    /* preview */
  },
  onPointerUp(event: ToolPointerEvent): void {
    /* commit via CommandBus */
  },
  onDeactivate(_ctx: ToolContext): void {
    /* cleanup */
  },
};

export const starToolPlugin: EditorPlugin = {
  id: 'com.acme.tools.star.plugin',
  name: 'Star tool',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    ctx.track(ctx.injector.get(ToolRegistry).register(myShapeTool));
  },
};
```

`ToolHostService` cuida do dispatch (activate/deactivate, pointer
routing). Você só implementa os hooks.

---

## Receita 3 — Adicionar um Exporter (binário/async)

Padrão de referência: `pngExporterPlugin` na lib (`svg-engine/edit/lib/io/png-exporter.plugin.ts`).
Resumido:

```ts
import type { Exporter } from 'svg-engine/edit';

const myPdfExporter: Exporter = {
  id: 'com.acme.exporters.pdf',
  name: 'PDF',
  mediaType: 'application/pdf',
  extension: 'pdf',
  // Pode retornar string (sync) OU Promise<string | Blob> (async/binário)
  export(doc): Promise<Blob> {
    // ... call your PDF builder
    return Promise.resolve(new Blob(['fake'], { type: 'application/pdf' }));
  },
};

export const pdfExporterPlugin: EditorPlugin = {
  id: 'com.acme.exporters.pdf.plugin',
  name: 'PDF exporter',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    ctx.track(ctx.injector.get(ExporterRegistry).register(myPdfExporter));
  },
};
```

Consumer code que chama exporter precisa lidar com a união
`string | Promise<string | Blob>`:

```ts
const out = await Promise.resolve(exporter.export(doc));
const blob = typeof out === 'string' ? new Blob([out], { type: exporter.mediaType }) : out;
```

---

## Receita 4 — Adicionar um Optimizer

```ts
import type { Optimizer } from 'svg-engine/edit';

const noopOptimizer: Optimizer = {
  id: 'com.acme.optimizers.noop',
  name: 'No-op (template)',
  description: 'Returns the document unchanged — replace with real logic',
  order: 50, // executa entre default order=10 e order=90 (drop-defaults, prune)
  defaultEnabled: false, // não roda automaticamente; user habilita via UI
  optimize(doc) {
    return doc; // MUST retornar mesma ref se nada mudou (pipeline detecta)
  },
};

export const myOptimizerPlugin: EditorPlugin = {
  id: 'com.acme.optimizers.plugin',
  name: 'My optimizers',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    ctx.track(ctx.injector.get(OptimizerRegistry).register(noopOptimizer));
  },
};
```

**Contract**: `optimize(doc): SvgDocument` deve ser puro. **MUST retornar
a mesma referência** quando não houver mudança (pipeline encadeia
otimizadores em ordem; ref-equality é o sinal de "nada mudou").

`runPipeline(doc, enabledIds?)` itera por `order` ASC. Sem `enabledIds`,
roda todos os `defaultEnabled !== false`.

---

## Padrões e armadilhas

### ✅ Faça

- **Use `ctx.track(reg.register(x))`**: encadeia em uma linha, cleanup
  automático. Você nunca segura `Disposable` manualmente.
- **Reverse-DNS no `id`**: `com.acme.feature.thing`. Evita colisão.
- **Bump `apiVersion`** quando você upgrade pra um PLUGIN_API_VERSION
  novo. Major mismatch faz `PluginRegistry.install` throw — fail-fast
  em vez de runtime esquisito.
- **Use signals para estado reativo**: nunca exponha Subjects. UIs
  consumem via `effect()` / `computed()` natural.
- **Mantenha `install()` síncrono**: se precisa de async setup, faça
  lazy (compute na primeira chamada do contribution, não no install).

### ❌ Evite

- **Mutar serviços de outros plugins** diretamente. Use só os
  contracts públicos (`register`, `dispatch`).
- **Esquecer de tracking**. `reg.register(x)` sem `ctx.track` = leak.
- **Registrar shortcuts globais demais**. Use `when` para limitar
  contexto (ex: só dentro de gesto ativo).
- **Dependências circulares entre plugins**. Use `dependencies?: string[]`
  no plugin para declarar ordem; o registry checa antes de instalar.

---

## Lifecycle e ordem

1. `provideSvgEnginePlugin(p)` adiciona `p` ao queue de boot.
2. No primeiro CD pós-bootstrap, `PluginRegistry.install(p)` roda
   sequencialmente para cada `p` na ordem do array `providers`.
3. Cada `install(ctx)` rola seu código; `ctx.track(d)` registra cada
   `Disposable` no record interno do plugin.
4. Em runtime, `PluginRegistry.uninstall(id)`:
   - Chama `plugin.uninstall?(ctx)` (se existir)
   - Dispõe os tracked em **LIFO** (reverse insertion order — simétrico
     com como DI/composição tipicamente desmonta)
   - Errors em qualquer dispose **não interrompem** o resto do cleanup
     (best-effort, garantia de "tentamos limpar tudo")

`dependencies?: readonly string[]` declara plugins prerequisitos. Install
falha se algum não estiver previamente instalado. Ciclos são detectados
no install.

---

## Como saber se está funcionando

```ts
const reg = inject(PluginRegistry);
console.log(reg.list()); // signal de InstalledPlugin[]
console.log(reg.has('com.acme.my-plugin'));
```

`installed` é signal — UIs de "manage plugins" podem subscrevê-lo.

Para um plugin de Tool, `ToolRegistry.tools()` deve incluir seu tool;
para Shortcut, `ShortcutRegistry.shortcuts()` idem.

---

## Quando NÃO escrever um plugin

Algumas necessidades parecem plugin mas não são:

- **Configurar tema visual** — use CSS overrides + `[data-theme]` (D-012).
  Não tem `ThemeRegistry`.
- **Trocar o renderer SVG por Canvas** — adiado pra fase 6+ via
  `ProjectorRegistry` (não existe ainda; abre quando necessário).
- **Carregar código de usuário final em runtime** (não TypeScript
  compilado) — esse é o `ScriptRuntimePlugin` futuro (D-024).
  Scripts != plugins.
- **Adicionar edição de anchors a um tipo custom** — Path Editor
  (Bloco 6-PE) é built-in para o tipo `path` (e shapes convertidos via
  `ConvertNodeToPathCommand`). Para um tipo custom que precise de
  anchors, primeiro converta para path; um `AnchorOverlayRegistry`
  pluggable seria nova categoria (não existe; abrir issue se precisar).
- **Adicionar boolean op custom no Pathfinder** — as 5 ops
  (Union/Intersect/Subtract/Exclude/Divide) cobrem os casos clássicos
  e são built-in. Para uma op derivada (ex.: "Trim"), você escreve um
  command próprio compondo dispatches dos 5 — não há `PathfinderOpRegistry`.

Se sua necessidade não cabe nas 9 categorias do D-023 + não é uma
das exclusões acima, abra issue propondo uma nova categoria.

---

## Acessibilidade em contribuições custom (Fase 6c)

Plugins que adicionam UI interativa **devem seguir o padrão de a11y
estabelecido** pelos overlays/panels built-in (ARIA + keyboard). O
critério é simples:

- **Tools custom**: seu `onPointerDown/Move/Up` precisa ter equivalente
  via `onKeyDown` quando o gesto produz mutação. Ex.: um tool de "place
  shape on click" deveria também aceitar Enter no canvas focado para
  inserir no centro do viewport. `ToolPointerEvent` carrega
  `event.modifierKey` flags; faça o mesmo no key handler.
- **Renderers custom**: nó renderizado deve aceitar `tabindex="0"` +
  ter `role="button"` (ou `img` se decorativo) + ter `aria-label`
  descritivo (ex.: "Star, 5 points"). Veja o padrão usado nos
  built-in renderers — todos os shapes hardcoded são `<svg:rect>`,
  `<svg:path>` etc nativos que herdam acessibilidade do SVG painter.
- **Menu contributions**: o `aria-keyshortcuts` é propagado
  automaticamente quando você seta `MenuContribution.shortcut`. Ex.:
  `{shortcut: 'CmdOrCtrl+K'}` vira `aria-keyshortcuts="Control+K Meta+K"`.

A library exemplifica todos os padrões — verifique:

- `selection-overlay.component.ts` (resize handles com `role="button"`
  - `aria-label="Resize handle, top-left corner"` + arrow-key handlers)
- `anchor-overlay.component.ts` (squares + handle circles + keyboard
  handler que mapeia arrows para `MoveAnchorCommand`)
- `layers-panel.component.ts` (tree pattern completo com `aria-level`,
  `aria-expanded`, ArrowRight/Left expand/collapse)

---

## Referências

- [D-020 — Plugin extensibility via TypeScript](04-decisoes-tecnicas.md#d-020--plugin-extensibility-via-typescript-d-020)
- [D-023 — Categorias de plugin (roadmap)](04-decisoes-tecnicas.md#d-023--categorias-de-plugin-roadmap)
- [D-024 — ScriptRuntimePlugin (deferido)](04-decisoes-tecnicas.md#d-024--scriptruntimeplugin-deferido-para-fase-6)
- [API pública](09-api-publica.md)
- Exemplos no código:
  - `projects/svg-engine/edit/src/lib/tool/select-tool.plugin.ts`
  - `projects/svg-engine/edit/src/lib/tool/pencil-tool.plugin.ts`
  - `projects/svg-engine/edit/src/lib/io/builtin-io.plugin.ts`
  - `projects/svg-engine/edit/src/lib/io/png-exporter.plugin.ts`
  - `projects/svg-engine/edit/src/lib/optimize/builtin-optimizers.plugin.ts`
  - `projects/svg-engine/edit/src/lib/palette/builtin-palettes.plugin.ts`
  - `projects/svg-engine/edit/src/lib/selection/selection-nudge.plugin.ts`
