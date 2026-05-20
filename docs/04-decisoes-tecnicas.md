# 04 — Decisões Técnicas

> Registro cronológico e rastreável de decisões. Cada decisão tem ID,
> data, contexto, alternativas consideradas e consequências. Decisões
> revogadas **não são apagadas** — são marcadas como `Status: Revogada`
> com link para a substituta.

---

## D-001 — Distribuição como library Angular

- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: O SVGEngine precisa ser reutilizável em múltiplos
  produtos do ecossistema (Mosaicoo) e potencialmente publicado.
- **Decisão**: Construir como **library Angular** (`projects/svg-engine`)
  dentro de um workspace que também contém uma app demo (`projects/playground`).
- **Alternativas**:
  - App monolítica → rejeitada: dificulta reuso e impõe decisões de
    framework de UI ao consumidor.
  - Pacote framework-agnostic (TS puro) → rejeitada na fase 1: aumenta
    complexidade sem demanda atual; pode ser destilado depois se necessário.
- **Consequências**: exige `ng-packagr`, `public-api.ts` disciplinada e
  controle estrito de side-effects.

## D-002 — DOM SVG nativo + camada própria

- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Necessidade de controle total sobre rendering, performance
  e modelo de dados. Editores SVG profissionais (Figma, Boxy SVG) constroem
  pipelines próprios.
- **Decisão**: Usar **DOM SVG nativo** + camada de abstração própria.
  **Não** adotar `svg.js`, `snap.svg`, `fabric.js` ou similares.
- **Alternativas**: bibliotecas externas — rejeitadas: amarram arquitetura,
  somam dependência transitiva, dificultam virtualização e plugins.
- **Consequências**: maior esforço inicial em geometria/transformações;
  liberdade arquitetural total.

## D-003 — Repositório Git no GitHub privado

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Repo em `https://github.com/mosaicoo/svg-engine` (privado).
  Branch padrão: `main`.
- **Consequências**: requer credenciais GitHub configuradas localmente
  (Git Credential Manager ou SSH).

## D-004 — TypeScript estrito

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: `tsconfig.json` com `strict: true`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`.
- **Consequências**: código mais seguro; curva inicial maior.

## D-005 — Angular Material como UI lib

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: UI do editor (toolbar, painel de camadas, inspector,
  diálogos) usa Angular Material **v21** (alinhado à versão Angular).
- **Consequências**: dependência peer da library no `@angular/material@21`;
  documentar versões compatíveis no README.

## D-006 — Angular v21 como versão alvo

- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Em 2026-05-14, o cenário é:
  - v19 (LTS) termina em 2026-05-19 — descartada.
  - v20 (LTS) termina em 2026-11-28 — só 6 meses de suporte.
  - v21 (Active) vira LTS em 2026-05-19, com suporte até 2027-05-19.
  - v22 sai em 2026-05-19 (RC no momento).
- **Decisão**: Scaffold com **Angular v21** (`@angular/core@21`,
  `@angular/cli@21`, `@angular/material@21`).
- **Alternativas**:
  - v22 estável (aguardar 5 dias) — rejeitada: usuário optou por iniciar
    imediatamente; revisitar quando v22 e ecossistema estabilizarem.
  - v22-rc — rejeitada: instabilidade inaceitável para projeto produtivo.
  - v20 — rejeitada: janela de suporte curta demais.
  - v19 — rejeitada: EOL em 5 dias.
- **Consequências**: planejar upgrade para v22 quando esta amadurecer
  (provável janela: 2 a 3 meses após release).

## D-007 — Vitest como test runner

- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Em Angular CLI v21, Vitest passou a ser o **default**
  (`--test-runner=vitest`) substituindo Karma. Vitest oferece execução
  mais rápida, modo watch melhor e API moderna alinhada a Jest.
- **Decisão**: Adotar **Vitest** como test runner para ambos os projetos
  (`svg-engine` e `playground`).
- **Alternativas**: Karma (legado, lento); Web Test Runner (menor
  ecossistema). Ambas rejeitadas.

## D-008 — File name style guide 2025

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Manter o default v21 (`--file-name-style-guide=2025`):
  arquivos concisos como `app.ts`, `app.html` em vez de `app.component.ts`.
- **Consequências**: alinhado ao novo guia oficial Angular; familiarizar
  o time com a nova convenção.

## D-009 — `--ai-config=claude` ativado

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Workspace gerado com `--ai-config=claude`, criando
  `.claude/CLAUDE.md` (guia de boas práticas Angular para Claude Code)
  e `.vscode/mcp.json` (MCP server `angular-cli`).
- **Consequências**: Claude Code recebe contexto Angular automático em
  toda interação; VS Code expõe ferramentas Angular via MCP.

## D-010 — Zone.js mantido (não-zoneless)

- **Data**: 2026-05-14
- **Status**: Aceita (revisitar na Fase 6)
- **Contexto**: Angular v21 oferece `--zoneless` para apps sem zone.js
  baseadas inteiramente em signals. Para SVG editor com signals como
  fonte de verdade (declarado em arquitetura), zoneless é direção
  natural.
- **Decisão**: **Manter zone.js** na Fase 1 para baseline estável.
  Migrar para zoneless na Fase 6 (performance) quando padrões signals
  estiverem maduros no projeto.
- **Consequências**: leve overhead de change detection comparado a
  zoneless puro, aceitável durante construção do núcleo.

## D-011 — Estilo SCSS

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: SCSS para todos os componentes (`--style=scss`).
- **Razão**: alinhado ao Angular Material que usa SCSS como API de
  theming (`@use '@angular/material' as mat;`).

## D-012 — Tema Material: M3 prebuilt + light/dark via OS

- **Data**: 2026-05-14
- **Status**: Aceita parcialmente — toggle explícito pendente (Fase 4)
- **Decisão (Fase 1)**:
  - Tema Material 3 com `mat.theme()` mixin: primary `azure-palette`,
    tertiary `blue-palette`, typography Roboto, density 0.
  - `color-scheme: light dark` no `body` → segue preferência do OS
    automaticamente via `prefers-color-scheme`.
- **Decisão pendente (Fase 4)**:
  - Toggle UI explícito (botão na toolbar) que sobreponha a preferência
    do OS, persistindo escolha em `localStorage`.
- **Consequências**: dark mode funciona "de graça" para usuários que já
  têm OS em modo escuro; toggle vem depois sem refatorar o tema.

## D-013 — ESLint via angular-eslint v21 + flat config

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Adotar `@angular-eslint/schematics@21` (flat config
  `eslint.config.js`) com:
  - `@eslint/js` recommended
  - `typescript-eslint` recommended + stylistic
  - `angular-eslint` `tsRecommended` para `.ts`
  - `angular-eslint` `templateRecommended` + `templateAccessibility` para `.html`
  - `eslint-config-prettier` no final (desliga regras conflitantes com Prettier)
- **Estrutura**: config raiz em `eslint.config.js` + per-project em
  `projects/<name>/eslint.config.js` (overrides apenas `prefix` do selector).
- **Comando**: `ng lint` (lint targets configurados em `angular.json`).
- **Consequências**: lint quebra build se houver violação (rode `ng lint`
  antes de PR). `npm run lint` é um alias.

## D-014 — Husky + lint-staged como pre-commit gate

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: `husky@9` + `lint-staged@latest`. Hook `.husky/pre-commit`
  executa `npx lint-staged` que aplica:
  - `.{ts,html}`: `eslint --fix` + `prettier --write`
  - `.{json,md,scss,css,yml,yaml}`: `prettier --write`
- **Bypass**: `git commit --no-verify` (proibido por padrão; só em emergência).
- **Consequências**: nenhum commit com código mal formatado/linted entra em main.

## D-015 — CI mínimo via GitHub Actions

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Workflow `.github/workflows/ci.yml` rodando em `push` para
  `main` e em qualquer `pull_request` para `main`:
  1. `actions/checkout@v4` + `actions/setup-node@v4` (Node 22, cache npm)
  2. `npm ci`
  3. `npx ng lint`
  4. `npx ng build svg-engine`
  5. `npx ng build playground --configuration=development`
  6. `npx ng build playground --configuration=production`
- **Concurrency**: agrupa por workflow+ref, cancela in-progress.
- **A adicionar (Fase 2+)**: `npx ng test` quando houver testes reais.
- **Consequências**: PR não merge se qualquer step falhar.

## D-016 — Posicionamento: produto de mercado, não MVP

- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Esclarecimento explícito do usuário em 2026-05-14:
  o SVGEngine é tratado como produto de mercado, não MVP. Implica
  rigor em componentização, boas práticas e qualidade desde o início.
- **Decisão**: Toda decisão de design subordina-se a:
  - **Single Responsibility** por componente/serviço.
  - **Composição** > monolitos.
  - **Cobertura de testes** desde o primeiro código de produção.
  - **Documentação de API pública** sincronizada (zero "TODO depois").
  - **Acessibilidade WCAG AA** mínimo em qualquer UI (D-019).
- **Consequências**: feature delivery será mais lento que MVP por
  natureza, mas refatorações de larga escala serão evitadas.

## D-017 — Headless-first: núcleo independente de UI

- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Library deve ser embutível em sistemas terceiros que
  podem **não** usar Angular Material (podem ter PrimeNG, Tailwind UI,
  componentes próprios, ou nem ter UI no consumo — só usar o engine para
  renderizar/otimizar SVG headless).
- **Decisão**: O **núcleo** (`core`, `render`, `optimize`, `io`) **não pode**
  importar nada de `@angular/material` ou `@angular/cdk`. Apenas a camada
  `ui` (e a `playground`) pode depender de Material.
- **Mecanismo**:
  - Lint rule customizada (a definir) ou estrutura de imports
    organizada por entry point (D-018).
  - PR review checa esse princípio.
- **Consequências**: terceiros podem fazer
  `import { SvgRenderer } from 'svg-engine/render';` sem trazer Material
  para o bundle.

## D-018 — Multi-entry-point secondary-only (sem primary útil)

- **Data**: 2026-05-14 (revisada na conclusão da Fase 2 Bloco 1)
- **Status**: Aceita
- **Contexto**: Para suportar D-017 (headless) e tree-shaking real,
  a library `svg-engine` é dividida em **secondary entry points** via
  `ng-packagr`. O entry point primário (`svg-engine`) fica vazio/símbolico
  (apenas `SVG_ENGINE_VERSION`) — alinhado a `@angular/material` e
  `@angular/cdk` que adotam o mesmo padrão. Decidido após análise do
  ecossistema: libs com camadas funcionais distintas (Material, CDK,
  PrimeNG) não expõem primary; libs com API coesa e poucos pontos
  (RxJS) expõem.
- **Decisão**: **secondary-only**. Importar de `'svg-engine'` direto
  não traz nada útil. Isso **força** os consumidores a usar
  `'svg-engine/<entry>'`, garantindo:
  - tree-shaking: ninguém arrasta acidentalmente `@angular/material`;
  - clareza de intenção: o import revela qual camada o código usa;
  - enforcement do D-017 pelo TypeScript, não só por convenção.
- **Estrutura**:

  | Entry point            | Conteúdo                                           | Depende de                 | Fase |
  | ---------------------- | -------------------------------------------------- | -------------------------- | ---- |
  | `svg-engine` (primary) | apenas `SVG_ENGINE_VERSION` (placeholder)          | —                          | 1    |
  | `svg-engine/core`      | `SvgNode`, modelo, comandos, history, state, types | `@angular/core`            | 2 ✅ |
  | `svg-engine/render`    | `<svge-renderer>`, viewport, viewer read-only      | `core`                     | 2    |
  | `svg-engine/io`        | parse, sanitização, serialização                   | `core`                     | 5    |
  | `svg-engine/optimize`  | passes de otimização (path, dedup, minify)         | `core`, `io`               | 5    |
  | `svg-engine/edit`      | seleção, transformação, manipulação programática   | `core`, `render`           | 3    |
  | `svg-engine/ui`        | toolbar, layers panel, inspector, dialogs Material | tudo + `@angular/material` | 4    |

- **Implementação técnica** (validada com `core`):
  - Cada entry point é uma pasta `projects/svg-engine/<entry>/` com seu
    próprio `ng-package.json` apontando para `src/public-api.ts`.
  - `tsconfig.json` raiz adiciona path mapping
    `"svg-engine/<entry>": ["./dist/svg-engine/<entry>"]`.
  - `tsconfig.lib.json` e `tsconfig.spec.json` da library precisam
    incluir `<entry>/src/**/*.ts` e `<entry>/src/**/*.spec.ts`
    respectivamente.
  - `angular.json` com `sourceRoot: "projects/svg-engine"` (não `src/`)
    para test discovery encontrar specs em todos os entry points.
- **Nota arquitetural — SVG content e custom elements** (lição 2026-05-15):
  para entry points que renderizam SVG (`render`, `edit`), **não usar
  custom-element selectors** (ex.: `<svge-rect>`) como wrappers de
  conteúdo SVG. Custom HTML elements dentro de `<svg>` cortam a cadeia
  do painter SVG (limitação de spec, sem erro). Padrão correto:
  diretivas em elementos SVG nativos (`[svgeRect]` em `<svg:rect>`) ou
  selectors híbridos (`g[svgeNode]` em `<svg:g>`). Detalhado em
  `08-historico-de-alteracoes.md` (entrada 2026-05-15).
- **Consequências**: arquitetura mais disciplinada; consumidores escolhem
  exatamente a camada que querem; bundle final inclui só o usado.
- **Validado em produção**: `core` consumido com sucesso pela `playground`
  via `import { ... } from 'svg-engine/core'`; bundle gerado em
  `dist/svg-engine/fesm2022/svg-engine-core.mjs` (separado do primary).

## D-019 — Acessibilidade WCAG AA como alvo mínimo

- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Toda UI (entry point `ui` + playground) atinge **WCAG 2.2 AA**
  no mínimo. Auditorias rotineiras com `axe-core` (a integrar em CI
  na Fase 4).
- **Consequências**: ARIA roles, foco visível, navegação por teclado
  completa, contraste mínimo 4.5:1 (texto normal) e 3:1 (texto grande/UI),
  sem armadilhas de foco.

---

## D-020 — Sistema de plugins de primeira classe

- **Data**: 2026-05-14 (princípio); 2026-05-15 (revisada com a infra real entregue na Fase 3 Bloco 5)
- **Status**: **Aceita e implementada** (Bloco 5a infra + Bloco 5b ToolRegistry como primeira capability registry). Categorias adicionais documentadas em D-023; runtime de scripts em D-024.
- **Contexto**: Terceiros precisam estender a library em múltiplas dimensões — tipos de nó, ferramentas, comandos, painéis, otimizadores, importadores/exportadores, atalhos, paletas, efeitos. Construir um registry standalone por categoria geraria fragmentação (cada um com lifecycle próprio, estilo de install diferente, sem versionamento comum).

### Decisão

Uma única **infra de plugins** + várias **capability registries** plugadas sobre ela. Plugins instalam-se via uma única API (`provideSvgEnginePlugin` no bootstrap, ou `PluginRegistry.install(plugin)` em runtime), recebem um `PluginContext` com acesso a DI, e contribuem chamando os registries que precisarem.

### API formal (entregue Bloco 5a)

```typescript
export interface EditorPlugin {
  readonly id: string; // recomendado: reverse-DNS (com.acme.tools.pencil)
  readonly version: string; // semver da versão do plugin
  readonly name: string; // human-readable (toolbar/painel de plugins)
  readonly apiVersion: string; // semver da API do host que o plugin targeting
  readonly dependencies?: readonly string[]; // ids de outros plugins requeridos
  install(ctx: PluginContext): void;
  uninstall?(ctx: PluginContext): void;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly injector: Injector; // resolve qualquer service via DI
  track<T extends Disposable>(d: T): T; // cleanup automático em uninstall
}

export interface Disposable {
  dispose(): void;
}

export const PLUGIN_API_VERSION = '1.0.0';
```

Bootstrap (Angular):

```typescript
bootstrapApplication(App, {
  providers: [
    provideSvgEnginePlugin(selectToolPlugin),
    provideSvgEnginePlugin(pencilToolPlugin),
    provideSvgEnginePlugin(myCustomOptimizerPlugin), // futuro
  ],
});
```

Hot-load runtime: `inject(PluginRegistry).install(plugin)`.

### Como uma capability registry pluga (padrão fixo)

```typescript
@Injectable({ providedIn: 'root' })
export class XxxRegistry {
  private readonly _entries = signal<readonly Xxx[]>([]);
  readonly entries = this._entries.asReadonly();
  register(entry: Xxx): Disposable {
    // valida (id único etc.)
    this._entries.set([...this._entries(), entry]);
    return { dispose: () => this._entries.set(this._entries().filter((e) => e.id !== entry.id)) };
  }
}
```

Plugin:

```typescript
const myPlugin: EditorPlugin = {
  id: 'com.acme.foo',
  /* ... */
  install(ctx) {
    const reg = ctx.injector.get(XxxRegistry);
    ctx.track(reg.register(myEntry));
  },
};
```

A regra invariante: **toda capability registry emite `Disposable`, todo plugin trackeia via `ctx.track()`, uninstall limpa tudo automaticamente em LIFO**. Sem exceções — qualquer registry futuro segue.

### Garantias do PluginRegistry

- **Validação no install**: id não-vazio + único; semver major contra `PLUGIN_API_VERSION`; deps presentes (ordem matters: declarar deps antes).
- **Atomicidade**: se `install(ctx)` throws, todos os disposables já trackeados são rolled back em LIFO.
- **Errors em install = throw**: configuration error (deve detectar em build/boot), não user action recuperável (compare com `CommandBus.dispatch` que retorna `Result`).
- **Uninstall idempotent**: returns `false` se id desconhecido. Sequência: hook `uninstall(ctx)` (errors logados, não abortam) → dispose LIFO (errors per-disposable logados, não bloqueiam outros) → remove entry.
- **Resiliência**: capability registries devem tolerar uninstall a quente. Ex.: `ToolHostService.activeTool` é computed que re-deriva da `ToolRegistry`; se o plugin do tool ativo for desinstalado, `activeTool` vira `null` e routing vira no-op (sem zombie state).

### Por que `injector` cru no PluginContext (não façade)

Capability registries crescem ao longo das fases (Tool, Optimizer, Importer, Exporter, Inspector, Effect, Palette, Menu, Shortcut, ScriptRuntime, ...). Façade método-por-método (`ctx.registerTool`, `ctx.registerOptimizer`, ...) obrigaria editar o core a cada nova categoria — explosão de superfície estável.

`injector.get(XxxRegistry)` é estável para sempre. O preço: plugins precisam saber importar a registry. O ganho: zero edição de core ao adicionar categorias; tree-shake automático (plugin só puxa o que usa); sandbox de scripts (D-024) é uma camada por cima que CONSTRÓI sua própria API curated, sem substituir a infra.

### Categorias e roadmap

Mapeadas em D-023 (9 categorias, qual fase abre cada registry). Runtime de scripts (carregamento de código de usuário final, ≠ plugin TypeScript) em D-024.

### Consequências

- **Arquitetura "registry-first"** em vez de hard-coded em todas as fases subsequentes — confirmada e formalizada.
- **Toda nova feature do produto** que precisa de extensibilidade abre um `XxxRegistry` seguindo o padrão acima. Sem invenção de mecanismos paralelos.
- **Testabilidade preservada**: registries são services Angular standalone — testáveis isolados via TestBed; plugins são testáveis via `provideSvgEnginePlugin(plugin)` em TestBed.
- **Versionamento**: semver major-only é o gate inicial. Quando `PLUGIN_API_VERSION` saltar para `2.0.0`, plugins targeting `1.x.x` falham loud no install — sem ambiguidade.

## D-021 — Conceito de Workspace / Prancheta / Página

- **Data**: 2026-05-14 (registro); 2026-05-15 (resolvida — Option C híbrida)
- **Status**: **Resolvida (Option C)** — implementação iniciada no bloco prévio à Fase 4 (`WorkspaceService` + `<svge-workspace-background>`); demais aspectos (page/grid/guides) chegam em blocos subsequentes da Fase 4
- **Contexto**: Editores profissionais (Figma, Sketch, Affinity, Inkscape) têm um conceito de "página" / "frame" / "artboard" que envolve:
  - Tamanho e orientação de página.
  - Background (cor sólida, padrão, imagem, checkerboard de transparência).
  - Margens, grid, guides (linhas-guia).
  - Eventual suporte a múltiplas páginas / artboards.
- **Diretriz adicional do usuário (2026-05-15)**: o background precisa suportar transparente (xadrez), cores sólidas, **paletas de cores**, e demais "configurações de mercado" (page size, grid, guides, rulers).

### Opções avaliadas

- **A. Estender `SvgDocument`** com `presentation: PresentationSettings` — _rejeitada_: mistura modelo SVG-spec com configuração de editor (viola D-002 spirit) e bloqueia o caminho de multi-page natural.
- **B. Novo conceito `Workspace`** que contém um ou mais `SvgDocument`s com metadata de apresentação — _parcialmente aceita_: bom direcionamento, mas implementar full multi-page de cara é overengineering antes da real demanda.
- **C. (Escolhida) Híbrida**: `WorkspaceService` separado de `SvgDocument`, single-document inicialmente, multi-page como extensão futura sem refatoração.

### Decisão

`SvgDocument` permanece **puro SVG-spec**. Estado de apresentação do editor mora em um service novo, independente.

```typescript
// Em svg-engine/edit/src/lib/workspace/
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  // Bloco 4-pre (entregue 2026-05-15):
  readonly background = signal<BackgroundConfig>(DEFAULT_BACKGROUND);
  // Blocos seguintes da Fase 4 (planejados):
  // readonly page = signal<PageSettings>(DEFAULT_PAGE);
  // readonly grid = signal<GridConfig>(DEFAULT_GRID);
  // readonly guides = signal<readonly Guide[]>([]);
  // readonly rulers = signal<RulerConfig>(DEFAULT_RULERS);
}

export type BackgroundConfig =
  | { kind: 'transparent' } // CSS xadrez
  | { kind: 'solid'; color: string }
  | { kind: 'image'; href: string };
// Futuro: 'gradient', 'pattern' (do PaletteRegistry/PluginRegistry)
```

Background é renderizado por `<svge-workspace-background>` — wrapper HTML+CSS atrás do `<svge-renderer>`, **não** polui o SVG content tree (xadrez via `linear-gradient` CSS, não via SVG `<pattern>`).

### Color palettes (cobertas pela infra de plugins)

Paletas de cores entram via **`PaletteRegistry`** (categoria 8 do D-023, abertura na Fase 4). Plugins/builtins/projeto contribuem paletas; UI consome via `PaletteService`. Não precisa decisão arquitetural nova — o sistema de plugins já entrega o que é preciso.

### Multi-page como extensão futura

O caminho está aberto sem refatoração: quando demanda surgir, `WorkspaceService` vira instância de `WorkspacesRegistry` (lista de N workspaces, cada um = `SvgDocument` + presentation state). Routing de "qual workspace está ativo" é responsabilidade do consumer (similar a tabs no Figma).

### Por que não polui SVG (background fora do `<svg>`)

- **Export limpo**: usuário exporta SVG e o arquivo vem sem background (que é editor-only). Se quiser background no exportado, **adiciona `<rect>` explícito** ao documento — controle consciente.
- **Performance**: xadrez via CSS gradients é renderizado pela GPU, sem markup repetido em cada frame.
- **Z-order trivial**: HTML naturalmente fica atrás do SVG transparente posicionado em cima.

### Consequências

- Toda Fase 4 lê de `WorkspaceService` para configurações de canvas (page/grid/guides quando chegarem).
- `<svge-editor>` shell (Fase 4) vai compor `<svge-workspace-background>` + `<svge-renderer>` + futuros `<svge-rulers>` / `<svge-grid-overlay>` automaticamente.
- Consumer pode persistir o estado de `WorkspaceService` no formato de projeto (snapshot dos signals).
- D-021 **fechada**; multi-page entra em decisão futura quando demandado.

---

## D-022 — Pivot de rotação editável (Affinity-grade) (Fase 3)

- **Data**: 2026-05-15 (revisada após pesquisa de mercado em 2026-05-15)
- **Status**: Aceita (implementação na Fase 3, refinamento na Fase 4 Inspector)
- **Contexto**: Requisito explícito do usuário ("desejo a melhor
  funcionalidade"). Pesquisa comparativa de 2026-05-15 entre as 4
  ferramentas de mercado mostrou:

  | Ferramenta        | Movable pivot         | 9-point picker     | Snap-to-anchors | Persistência  | Aplica scale |
  | ----------------- | --------------------- | ------------------ | --------------- | ------------- | ------------ |
  | Canva             | ❌                    | ❌                 | ❌              | n/a           | n/a          |
  | Figma             | ⚠️ Alt-drag escondido | ❌                 | ❌              | sessão        | ❌           |
  | Illustrator       | ✅ Rotate Tool        | ✅ Transform panel | parcial         | ❌ reseta     | ✅ via panel |
  | Affinity Designer | ✅ free               | ✅ Anchor 3×3      | ✅              | ✅ por objeto | ✅           |

  Decidido pelo padrão **Affinity-grade** para alinhamento com o tier
  mais alto do mercado.

- **Decisão (final)**:

  **Pivot é estado do editor** (`TransformService`), **não** do
  `SvgNode` — não persiste no documento serializado.

  **Default**: centro do bounding box do nó (ou da seleção múltipla).

  **Persistência por nó** (D-022.persist): `TransformService` mantém um
  `Map<NodeId, Point>` com pivots customizados. Quando o usuário
  reseleciona um nó previamente editado, o pivot é restaurado.
  Coordenadas armazenadas em **node-local** (relativas ao bbox do nó),
  para que o pivot acompanhe transformações posteriores. Sai do mapa
  quando o nó é deletado ou o `clear()` do TransformService é chamado.

  **Para seleção múltipla**: pivot é relativo à bounding box composta
  da seleção; reseta quando a composição muda (não persiste —
  selection bbox é transient).

  **Free-drag**: usuário arrasta crosshair para qualquer ponto
  (dentro/fora/borda do bbox).

  **Snap-to-anchors** (D-022.snap): ao arrastar, snap automático nas 9
  posições do bbox (TL/TC/TR/ML/MC/MR/BL/BC/BR) quando a ≤ 5px de uma
  delas. Hold **Alt** durante drag desativa snap (precisão livre).

  **9-point picker** (D-022.picker): clique no crosshair (sem drag)
  abre popover 3×3 com as 9 posições do bbox; clique em uma snapa
  pivot exatamente lá. UI inicialmente no overlay (Bloco 2);
  espelhada no Inspector na Fase 4.

  **Numerical input X/Y** (D-022.input): coordenadas X/Y do pivot
  editáveis no Inspector (Fase 4). Não bloqueia a Fase 3.

  **Rotação subsequente**: matriz aplicada ao nó é
  `T(pivot) ⋅ R(θ) ⋅ T(-pivot) ⋅ transform_atual`.

  **Esc** durante drag cancela; **double-click** no crosshair reseta
  ao centro (e remove do `Map<NodeId,Point>`).

- **Escopo (Fase 3)**:
  - **Aplica apenas a rotação**.
  - **Scale/resize** usam handle oposto como âncora (Figma /
    Illustrator-Tool style), independente do pivot. Suficiente para
    cobrir o caso de uso comum.
  - Affinity vai além e aplica pivot a scale + shear; registrado como
    **D-022b futura** (ver pendentes). Adia porque exige refatorar
    todos os 4 handles de scale para considerar pivot, custo alto.

- **Componentes**:
  - `TransformService` (a criar no Bloco 3):
    - `pivot: Signal<Point>` (computed: lookup no map ou default centro)
    - `customPivots: Signal<ReadonlyMap<NodeId, Point>>`
    - APIs: `setPivot(point)`, `setPivotAnchor(anchor: 9-point)`,
      `resetPivot()`, `clearAllPivots()`
  - `<svge-rotation-pivot>` (overlay, Bloco 2): crosshair draggable +
    popover 3×3 + lógica de snap.

- **Consequências**:
  - `RotateNodeCommand` (Bloco 3) recebe `pivot` como parâmetro além
    do ângulo, para undo correto.
  - Estado de pivots customizados é cleared em "novo documento" /
    abertura de outro doc.
  - Documentação no Inspector (Fase 4) terá um pequeno indicador de
    qual anchor (ou "custom") está ativo.

---

## D-023 — Categorias de plugin (roadmap)

- **Data**: 2026-05-15
- **Status**: Aceita (mapeamento); cada registry abre na fase indicada
- **Contexto**: D-020 entrega a infra (`EditorPlugin`, `PluginContext`, `PluginRegistry`, `provideSvgEnginePlugin`). Mas a infra sozinha não responde _quais_ tipos de extensão o produto vai suportar e _quando_. Sem esse mapa explícito, capability registries surgem ad-hoc e o ecossistema fica fragmentado.

### Decisão

Nove categorias de plugin antecipadas. Cada uma é uma capability registry específica seguindo o padrão D-020 (emite `Disposable`, plugin trackeia via `ctx.track()`). Implementação distribuída pelas fases:

| #   | Categoria                | Registry                                        | O que registra                                                                                           | Fase   |
| --- | ------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Renderers de nó**      | `NodeRendererRegistry`                          | Componente que renderiza um `type: string` custom de `SvgNode`                                           | 2 (✅) |
| 2   | **Tools**                | `ToolRegistry`                                  | `Tool` com hooks pointer/key + lifecycle (Pencil, Shape, Eyedropper, Hand, custom select, ...)           | 3 (✅) |
| 3   | **Otimizadores**         | `OptimizerRegistry`                             | `(doc: SvgDocument) => SvgDocument` puro; encadeáveis em pipelines (cleanup, simplify paths, dedup defs) | 5      |
| 4   | **Importers**            | `ImporterRegistry`                              | `mimeTypes`, `parse(blob): Promise<SvgDocument>` (SVG, AI, EPS, Figma JSON, ...)                         | 5      |
| 5   | **Exporters**            | `ExporterRegistry`                              | `format`, `serialize(doc): Promise<Blob>` (SVG, PNG via canvas, PDF, JSX, React/Vue componente)          | 5      |
| 6   | **Inspectors / Painéis** | `InspectorPanelRegistry`                        | Painel reativo a critério de seleção (geometria, estilo, transform, custom por tipo de nó)               | 4      |
| 7   | **Efeitos / Filtros**    | `EffectRegistry`                                | Preset de `<filter>` SVG + UI panel de parâmetros (blur, drop-shadow, color matrix, custom WebGL shader) | 6      |
| 8   | **Paletas / Swatches**   | `PaletteRegistry`                               | Conjuntos de cores nomeadas (corporativas, palettes geradas, brand kits)                                 | 4      |
| 9   | **Menus + Shortcuts**    | `MenuContributionRegistry` + `ShortcutRegistry` | Item de menu (label/icon/when/run) + atalho (combo + command id)                                         | 4      |

### Padrão fixo por categoria

Cada registry implementa exatamente:

```typescript
@Injectable({ providedIn: 'root' })
export class XxxRegistry {
  private readonly _entries = signal<readonly XxxEntry[]>([]);
  readonly entries = this._entries.asReadonly();
  register(entry: XxxEntry): Disposable {
    /* valida + adiciona + retorna remover */
  }
  // helpers de lookup específicos da categoria (get(id), getByMimeType(type), etc.)
}
```

Sem invenções por categoria — mesmo lifecycle, mesma garantia de cleanup, mesmo tipo de `Disposable`. Capability registries adicionais que surgirem fora deste mapa devem seguir o mesmo padrão (e ganhar entry própria neste D-023 quando entrarem).

### Por que fixar em 9 categorias agora

- **Evita capability sprawl**: sem mapa, cada nova feature inventa seu mecanismo. Com mapa, perguntar "que tipo de plugin é esse?" sempre tem resposta.
- **Antecipa decisões de API**: saber que vão existir Importers/Exporters Fase 5 informa o design do Bloco 4 (não criar registry concorrente para "format adapters").
- **Não fecha portas**: a lista pode crescer (ex.: `CollaborationRegistry` para multi-user em fase futura). O critério de inclusão é "tipo de extensão que pelo menos 2 plugins distintos plausivelmente vão usar" — feature one-off vira parâmetro de service específico, não registry.

### Categorias deliberadamente omitidas (e por quê)

- **"DataSourceRegistry"** (importers tipo banco/API): o caso de uso converge com Importer (parser → SvgDocument). Importer aceita qualquer fonte de bytes; bancos podem ser camada do consumer.
- **"ThemeRegistry"** (temas Material): D-012 já decidiu prebuilt M3 light/dark via OS. Custom themes são CSS overrides do consumer, não plugins do svg-engine.
- **"ProjectorRegistry"** (renders alternativos do mesmo doc — Canvas, WebGL): adiar até Fase 6 perf. Hoje SVG nativo é o único projector.

### Consequências

- Cada fase futura ganha uma checklist clara de "abrir registry X conforme padrão D-020".
- Documentação de cada plugin pode referenciar a categoria + tabela acima sem reexplicar o padrão.
- Onboarding de terceiros: ler D-020 + D-023 dá o quadro completo em ~5min.

---

## D-024 — ScriptRuntimePlugin (deferido para Fase 6+)

- **Data**: 2026-05-15
- **Status**: **Decidida (escopo + não-objetivos); implementação deferida para Fase 6+**
- **Contexto**: Plugins TypeScript (D-020) cobrem extensão em build-time — terceiros distribuem código compilado, consumer adiciona via `provideSvgEnginePlugin` no bootstrap. Mas algumas necessidades exigem **scripts de usuário final** carregados em runtime: automatizar tarefas repetitivas, gerar shapes paramétricas, batch-apply de transformações, criar comandos custom no momento. Ex.: "para cada selecionado, crie um clone deslocado X pixels" sem precisar publicar plugin.

### Decisão

Scripts NÃO são plugins. Scripts entram via um **`ScriptRuntimePlugin`** — um plugin TypeScript que se instala como qualquer outro (D-020), mas carrega seu próprio runtime + sandbox + API curated por cima.

Ou seja: **a infra de plugins (D-020/D-023) NÃO precisa mudar para suportar scripts**. Quando chegar a Fase 6+, basta implementar:

1. **`ScriptRuntimePlugin`** (1 plugin TypeScript) que registra:
   - **`ScriptRegistry`** (nova capability registry seguindo padrão D-023) — armazena scripts carregados (id, name, source, trusted-or-not).
   - **Sandbox runtime** — onde os scripts efetivamente executam.
   - **API curated** — subset estável de operações expostas aos scripts (não acesso ao Injector!).
   - **UI** (Inspector panel registrado via `InspectorPanelRegistry`) para criar/editar/executar scripts.

### Sandbox: opções avaliadas

| Opção                                | Segurança                           | Performance               | Complexidade                 | Acesso DOM         |
| ------------------------------------ | ----------------------------------- | ------------------------- | ---------------------------- | ------------------ |
| `Function()` constructor / `eval`    | ❌ inseguro (mesmo escopo)          | ✅ máxima                 | ✅ trivial                   | ✅ direto (perigo) |
| **WebWorker isolado** ✅ recomendado | ✅ (no DOM, no globals do consumer) | ✅ boa (paralelismo)      | ⚠️ média (msg passing)       | ❌ (intencional)   |
| QuickJS / Boa em WASM                | ✅ máxima                           | ⚠️ ~10x mais lento que V8 | ❌ alta (bundle WASM, FFI)   | ❌ (intencional)   |
| DSL próprio (parser + interpreter)   | ✅ máxima                           | ⚠️ depende                | ❌ alta (escrever linguagem) | ❌ (intencional)   |

**Caminho escolhido**: **WebWorker isolado** + **API curated por message passing**. Razões:

- **Segurança**: worker não tem acesso a `window`, DOM, cookies, localStorage, IndexedDB do main thread. Script malicioso não pode exfiltrar dados nem manipular UI.
- **Performance**: V8 nativo, paralelismo real (não bloqueia render).
- **Maturidade**: API stable, suporte cross-browser desde 2012.
- **Custo**: latência ms-level por message passing — aceitável para scripts curtos (intent é "automation tasks", não "real-time animation loop").

QuickJS-WASM fica como **fallback** se descobrirmos requisitos hard de "script bloqueante síncrono no main" — não previsto hoje.

### API curated (esboço)

```typescript
// Visível DENTRO do worker, montada via worker bootstrap:
interface ScriptHostAPI {
  // Snapshot read-only do documento
  readonly document: () => SvgDocumentSnapshot;
  // Operações de alto nível — todas voltam comandos (consumer aplica via CommandBus no main thread)
  readonly ops: {
    move(id: NodeId, dx: number, dy: number): CommandRequest;
    scale(id: NodeId, sx: number, sy: number, anchor: Point): CommandRequest;
    align(ids: NodeId[], axis: AlignAxis): CommandRequest;
    insert(node: SvgNodeSpec): CommandRequest;
    // ...
  };
  // Selection snapshot (não signal — é snapshot no momento do call)
  readonly selection: { ids: readonly NodeId[]; focus: NodeId | null };
}
```

O script **monta uma sequência de `CommandRequest`s e devolve via postMessage**. Main thread recebe, valida, dispara via `CommandBus` — usuário vê **um único** undo entry "Run script: X" cobrindo a sequência inteira (via `TranslateManyCommand` / wrappers compostos).

### Não-objetivos explícitos

- **Não acesso direto a DOM/window/document**: por design.
- **Não acesso ao Injector**: script não pode `inject(any service)`. Tudo que script faz passa pela `ScriptHostAPI` curada.
- **Não acesso síncrono ao state**: script trabalha sobre snapshot; mudanças aplicam após o script retornar (worker → main → CommandBus).
- **Não persistência automática**: scripts são salvos pelo consumer (localStorage, banco, projeto), não pela library — library só executa.
- **Não TypeScript no script** (inicialmente): JavaScript ES2022. TypeScript transpilation é responsabilidade do consumer (Monaco/CodeMirror integration).
- **Não NPM install dentro do script**: script é self-contained, sem fetch dinâmico de módulos. Scripts podem importar de uma allowlist de "stdlib do svg-engine" exposta via `ScriptHostAPI.lib.*`.

### Quando reabrir esta decisão

- **Se aparecer requisito de script blocking síncrono no main** (raro, ex.: substituir comportamento built-in de uma tool em tempo real): reavaliar QuickJS-WASM.
- **Se o produto demandar marketplace de scripts** (compartilhamento entre usuários): adicionar layer de assinatura/rep + permissões granulares (pedir acesso a `ops.delete`, etc., como Chrome extensions).
- **Se latência de message passing virar gargalo medido**: considerar SharedArrayBuffer ou wasm-in-main com permissions API ainda mais estrita.

### Consequências

- **Bloco 5a/5b ficam intactos** — nenhuma adaptação necessária para suportar scripts mais tarde.
- **Roadmap Fase 6+** ganha entrada explícita: implementar `ScriptRuntimePlugin` quando o produto demandar.
- **Decisão de não-permitir-Injector** evita classe inteira de exploits — vale a pena documentar de antemão para que ninguém adicione "shortcut" inseguro futuramente.

---

## D-025 — `AnchorKind` não persistido no `d` string (Bloco 6-PathEditor)

- **Data**: 2026-05-19
- **Status**: Decidida + limitação documentada
- **Contexto**: Path/Anchor Point editor (Fase 6) introduziu `AnchorKind = 'cusp' | 'smooth' | 'symmetric'` para classificar cada ponto de um path. Decisão estrutural: como armazenar o `kind`?

### Opções avaliadas

**A — Inferir do `d` (escolhida)**:

- Cada parse via `parsePathToAnchors` chama `classifyAnchorKind(point, handleIn, handleOut)` que decide via geometria: handles colineares e opostos com mesma length = `symmetric`; colineares com lengths diferentes = `smooth`; senão = `cusp`.
- Vantagem: zero mudança no modelo (`PathNode.d` continua sendo um SVG path string padrão); round-trip parser→serializer→parser preserva tudo o que importa visualmente.
- Desvantagem: dois anchors com handles idênticos SEMPRE classificam ao mesmo kind. Não há como "lembrar" que o user queria que aquele anchor fosse `cusp` se os handles estão simétricos.

**B — Metadata array `anchorKinds[]` no PathNode**:

- Adicionar `readonly anchorKinds?: readonly AnchorKind[]` ao `PathNode` model.
- Vantagem: kind é fonte da verdade, persistido cleanly.
- Desvantagem: TODOS commands de path (Move/Insert/Remove anchor) precisariam manter o array em sincronia com o `d`. Round-trip com SVGs externos (importados) seria lossy (perdem o array, voltam para inferência). Mudança breaking no modelo.

### Decisão

**Opção A** — inferir do `d`. Razões:

- Mantém `SvgDocument` em paridade total com o SVG-spec (importável/exportável sem perda).
- Evita acoplamento entre kind state e command pipeline (cada command só precisa pensar em handles, não em metadata).
- Limitação resultante é controlável via UX (ver abaixo).

### Limitação resultante e mitigação

Cycle `cusp → smooth → symmetric → cusp` poderia ficar preso em `symmetric` porque enforceKind aplicado a um anchor já symmetric resultaria em handles idênticos → `d` idêntico → no-op silencioso pelo guard de `withPathAnchors`.

**Mitigação implementada** no `enforceKind`:

- `enforceKind(_, 'cusp')` COLAPSA handles para o anchor point (semântica "Convert Anchor Point" do Illustrator/Affinity). Destrutivo (curva flatten naquele anchor) mas garante que o `d` muda e o classifier devolve `cusp` no re-parse.
- `enforceKind(_, 'smooth')` quando handles colapsados sintetiza handles ASSIMÉTRICOS (razões 0.4 in / 0.3 out da chord prev→next) — garante que o classifier devolva `smooth`, não auto-promova para `symmetric`.

Cycle real resultante: `cusp (corner) → smooth (curva assimétrica) → symmetric (curva mirror) → cusp (handles colapsam)`. Cada passo produz mudança visível.

**Escape valve documentada**: para escapar do estado symmetric sem destruir handles, usuário arrasta um handle manualmente — a geometria muda, o classifier vê handles desbalanceados, devolve `smooth`.

### Quando reabrir esta decisão

- Se um produto consumer demandar "kind persistente além de uma sessão" (ex.: salvar projeto, reabrir, esperar que cada anchor lembre seu kind exato mesmo com handles iguais): adotar Opção B com strategy de migration (`anchorKinds?` opcional, inferência como fallback).
- Se feedback de usuários reportar que o colapso de handles em `symmetric → cusp` é destrutivo demais (perda de curva involuntária): trocar comportamento para "perturbar um handle minimamente" em vez de colapsar (mais sutil, menos lossy).

### Consequências

- `PathNode` model permanece intacto — zero impacto em imports/exports SVG.
- Cobertura via `anchor-cycle.spec.ts` (4 specs) prova que o cycle funciona end-to-end com a mitigação.
- README + guia de plugin precisam mencionar a limitação para devs que tentarem estender o Path Editor.

---

## D-026 — Promover `io` e `optimize` a entry points dedicados (alinhamento estrutural)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada (zero-break refactor)
- **Contexto**: O plano original do produto (ver D-018) catalogava 6 entry points secundários: `core`, `render`, `io`, `optimize`, `edit`, `ui`. Durante o crescimento orgânico (Fase 4 → Fase 5 → Fase 6) os módulos `io/` e `optimize/` ficaram dobrados dentro de `svg-engine/edit` — funcionalmente corretos, mas violando a separação de responsabilidades prevista. Auditoria pós-Sprint Text-Tool detectou o desvio.

### Problema

- `svg-engine/edit` carrega importadores/exportadores SVG/PNG e pipeline de otimização, contrariando o use case "Caso B — apenas otimização sem editor" descrito em D-016. Um consumer que quer só otimizar/converter SVG era forçado a trazer o editor inteiro (DI tree, gestures, plugin registry).
- O bundle do `edit` ficava maior do que o necessário para use cases não-editoriais.
- O catálogo da documentação (06, 09) descrevia 6 entry points, mas o código entregava 4 (core/render/edit/ui). Discrepância documental.

### Decisão

Extrair `io/` e `optimize/` como entry points secundários próprios (`svg-engine/io`, `svg-engine/optimize`), preservando 100% da API pública via re-exports em `svg-engine/edit` para garantia de zero breaking change.

**Layout pós-refactor**:

- `svg-engine/io` (NOVO): `Importer`/`Exporter` types, `ImporterRegistry`/`ExporterRegistry`, `svgImporter`, `svgExporter`, `pngExporter`, `renderPng`.
- `svg-engine/optimize` (NOVO): `Optimizer` type, `OptimizerRegistry`, 3 passes built-in (precision/dropDefaults/pruneEmptyGroups), `OptimizeCommand`.
- `svg-engine/edit` (mantido): plugin wrappers (`builtinIoPlugin`, `pngExporterPlugin`, `builtinOptimizersPlugin`) — ficam aqui porque dependem do scaffolding `EditorPlugin` ownado por `/edit`. Os barréis `lib/io/index.ts` e `lib/optimize/index.ts` re-exportam o conteúdo dos novos entry points → imports `from 'svg-engine/edit'` continuam funcionando.
- `svg-engine/core`: recebeu `Disposable` interface e `parseTransformAttr` (utilitários foundational que `/io` precisava sem trazer `/edit`).

### Garantias verificadas

- ✅ Build full (`npx ng build svg-engine`): 6 entry points compilam sem erro.
- ✅ Suite full (`npx ng test svg-engine`): 948/948 specs passando (zero regressão).
- ✅ Playground (`npx ng build playground`): compila sem ajuste (re-exports preservam imports existentes).
- ✅ Lint clean em todos arquivos tocados.
- ✅ Bundle do `edit` reduz quando consumer importa só `svg-engine/io` ou `/optimize` (tree-shaking acompanha boundary do entry point).

### Razões para escolher esta hora (não adiar)

- Pre-1.0: SemVer policy permite refactors estruturais (ver D-001), porém a maioria dos imports externos já é via `svg-engine/edit` — refactor late seria mais doloroso.
- D-018 já estabelecia secondary-only — extender o catálogo para 6 alinha o código com o plano original.
- O custo é zero (apenas movimentações + barréis re-export) e o benefício é arquitetural (use case B viável sem `/edit`).

### Trade-offs aceitos

- Mais entry points = mais arquivos `ng-package.json` + mais paths no `tsconfig.json` (overhead trivial).
- Plugins wrappers ficam em `/edit` enquanto registries ficam em `/io`/`/optimize` — split intencional (plugins precisam de `EditorPlugin`, registries não).

### Quando reabrir

- Se `/edit` precisar de algum import circular para `/io` ou `/optimize` (não há hoje) — sinal de que o scaffolding `EditorPlugin` precisaria também sair de `/edit`.
- Se algum consumer reportar que o re-export em `/edit/lib/io/index.ts` confunde tree-shaker (bundlers modernos lidam, mas vale monitorar).

---

## D-036 — Consolidação de helpers de input compartilhados (screenToDoc, pointer capture, isEditableTarget)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada
- **Contexto**: Auditoria de duplicação revelou que helpers de input/coordenada estavam reimplementados em paralelo em até 5–7 lugares cada:

| Helper                                        | Duplicatas (antes)                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `screenToDoc(clientX, clientY)` (CTM-inverse) | 5 cópias: `playground-home`, `selection-overlay`, `canvas-gestures`, `guides-overlay`, `rulers` (e `anchor-overlay` — 6 no total) |
| `setPointerCapture` defensive pattern         | 7 cópias inline (mesmos lugares + `rotation-pivot`, `anchor-overlay`, `color-picker`)                                             |
| `releasePointerCapture` defensive pattern     | 7 cópias inline                                                                                                                   |
| `isEditableTarget` (event-target gate)        | 2 cópias (`shortcut.service` privada + `playground-home` file-local)                                                              |

**Problema**: drift já visível entre cópias — algumas usavam `?.` chaining, outras `typeof === 'function'` + `if`, outras `'method' in target`. Algumas tinham guard de `createSVGPoint`, outras não. Cada novo gesto/overlay copiava uma das versões → potencial bug silencioso quando uma das cópias fosse atualizada e as outras não.

### Decisão

Consolidar em dois módulos canônicos, mantendo backward-compat zero-break:

1. **`svg-engine/render/lib/util/screen-to-doc.ts`** — função pura `screenToDoc(svg, clientX, clientY): Point | null`. Vive em `/render` porque é foundational da camada que dona o `<svg>`; consumers em `/edit` e `/ui` importam de `svg-engine/render`. Cada call site passa o SVG que já tem em mãos (`ownerSVGElement` do ElementRef, `viewChild` ref, ou `document.querySelector` no playground).

2. **`svg-engine/edit/lib/pointer/`** (novo módulo):
   - `capturePointer(event)` — defensive `setPointerCapture` com guards uniformes + swallow de exceções (Safari/Firefox edge cases).
   - `releasePointer(event)` — simétrico.
   - `isEditableTarget(target)` — gate de `<input>` / `<textarea>` / `<select>` / `contenteditable` para shortcuts globais.

   Vive em `/edit` (não `/core`) porque tudo que consome é editor surface; `/core` permanece DOM-free exceto pelo transform parser foundational.

3. **Exportado em ambos public-apis**, importável diretamente por consumers terceiros (ex.: plugin escrevendo seu próprio overlay).

### Garantias verificadas

- ✅ 973/973 specs passando (+25 specs novos para os 2 módulos consolidados — antes 948).
- ✅ Build full nos 6 entry points clean.
- ✅ Playground compila sem ajustes funcionais (só substituiu imports).
- ✅ Lint clean em todos arquivos tocados.
- ✅ Zero mudança de comportamento — cada helper é byte-equivalente à melhor das versões anteriores.

### Sites migrados (12 arquivos)

| Arquivo                          | Removido                                                                                             | Substituído por                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `playground-home.component.ts`   | `screenToDoc`, `capturePointer`, `releasePointer`, `isEditableTarget` (4 helpers locais, 80+ linhas) | imports                                                                             |
| `selection-overlay.component.ts` | local `screenToDoc` + bottom-of-file helpers                                                         | imports                                                                             |
| `canvas-gestures.directive.ts`   | inline capture/release + local `screenToDoc`                                                         | imports (release usa cast `unknown as PointerEvent` por usar target+id armazenados) |
| `guides-overlay.component.ts`    | inline capture/release + local `screenToDoc`                                                         | imports                                                                             |
| `anchor-overlay.component.ts`    | inline capture/release + local `screenToDoc`                                                         | imports                                                                             |
| `rotation-pivot.component.ts`    | inline capture/release + local `screenToDoc`                                                         | imports                                                                             |
| `color-picker.component.ts`      | 4 inline capture/release                                                                             | imports                                                                             |
| `rulers.component.ts`            | local `screenToDoc`                                                                                  | imports                                                                             |
| `shortcut.service.ts`            | local `isEditableTarget` privado                                                                     | re-export do canonical                                                              |

### Quando reabrir

- Se algum consumer precisar de pointer capture com semântica diferente (ex.: capturar no `document` em vez do `event.target`), o helper deve aceitar opção opcional em vez de bifurcar.
- Se ResizeObserver / IntersectionObserver helpers virarem padrão repetido, considerar `svg-engine/edit/lib/observers/` análogo a `/pointer/`.

---

## D-034 — `<svge-toolbar>` materializando `MenuContributionRegistry` (integrado ao shell)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada
- **Contexto**: O componente `<svge-toolbar>` (Bloco 4e) já existia em `svg-engine/ui/lib/toolbar/` desde o Fase 4 — lê o `MenuContributionRegistry` (D-023 categoria 9) e renderiza Material icon buttons por slot. Mas **nunca foi integrado** ao `<svge-editor>`. Resultado: o shell completo (rota `/shell-demo` do playground) mostrava apenas undo/redo/zoom hardcoded; plugins não tinham onde aparecer.

### Decisão

Integrar `<svge-toolbar slot="toolbar.main">` dentro do `<svge-editor>`, **adicionalmente** aos botões built-in (undo/redo/zoom). Plugins contribuem via `MenuContributionRegistry.register()` e aparecem automaticamente. Slot configurável via input `[toolbarSlot]` para isolar contribuições entre editores múltiplos no mesmo app.

**Por que aditivo (não data-driven 100%)**: os built-ins (undo/redo/zoom) são guarantees do shell — disponíveis mesmo quando o consumer não registra nada. Refatorar pra serem contribuições seria puramente cosmético e quebraria o `<svge-editor>` em apps que ainda não bootstrappam `provideSvgEnginePlugin(...)`.

---

## D-035 — `<svge-status-bar>` (novo componente UI)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada
- **Contexto**: `playground-home` tem status indicators espalhados pelo HTML (cursor doc-coords, zoom%, tool ativa, selection count, snap mode, dirty flag, isolation breadcrumb). Consumer terceiro precisa reescrever tudo se quer um status bar próprio.

### Decisão

Novo componente `<svge-status-bar>` em `svg-engine/ui/lib/status-bar/`. Lê de 8 services existentes (`EditorStateService`, `SelectionService`, `ViewportService`, `WorkspaceService`, `ToolHostService` + `ToolRegistry`, `SnapService`, `IsolationService`) — só leitura, nunca muta. 7 sections opt-in via `[sections]` input:

| Section     | Fonte                                             | Mostra                                 |
| ----------- | ------------------------------------------------- | -------------------------------------- |
| `tool`      | `ToolHostService.activeId` + `ToolRegistry.get()` | Ícone + label da tool ativa            |
| `selection` | `SelectionService.count`/`focusId`                | "1 · abc12345" / "N selected" / "none" |
| `cursor`    | `WorkspaceService.rulerCursor`                    | "x.x, y.y" doc-coords (1 decimal)      |
| `zoom`      | `ViewportService.zoom`                            | "N%" arredondado                       |
| `snap`      | `SnapService.enabled`/`mode`                      | "off" / "grid" / "objects" / "both"    |
| `isolation` | `IsolationService.isActive`/`breadcrumbPath`      | "L2 · abc123" (condicional)            |
| `dirty`     | `EditorStateService.dirty`                        | "●" laranja (condicional)              |

Standalone usável fora do `<svge-editor>` — consumers podem montar isoladamente em sua própria UI.

---

## D-037 — Invariantes Mosaicoo: as 3 formas de consumir o editor

- **Data**: 2026-05-20
- **Status**: Decidida + implementada + coberto por specs
- **Contexto**: Decisão explícita do user/Mosaicoo: o produto será consumido em **3 modos distintos** dependendo do caso de uso (canvas embedável em painéis menores, editor completo em pages dedicadas, customizações intermediárias). A decisão de expandir `<svge-editor>` com D-034/D-035 trouxe o risco de "matar" o caminho headless puro — esta D-037 formaliza as três premissas como **invariantes não-negociáveis** garantidas estruturalmente.

### Os 3 modos garantidos

| Modo                  | O que importa                                                                          | Material no bundle?    | Uso típico Mosaicoo                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| **1. Headless puro**  | `core` + `render` + `edit` apenas (ignora `/ui`)                                       | ❌ Zero                | Painéis menores onde o consumer constrói toda a UI custom; embed em outras apps Mosaicoo que já têm seu chrome |
| **2. Shell completo** | `<svge-editor>` sem flags (default)                                                    | ✅ Sim                 | Página dedicada de edição — drop-in completo (toolbar + canvas + status bar + plugin contributions)            |
| **3. Shell parcial**  | `<svge-editor [showToolbar]="false">` ou `[showStatusBar]="false"` + slots de projeção | ✅ Sim (sem usar tudo) | Canvas com chrome Mosaicoo, OR shell completo com status bar custom, OR qualquer mix                           |

### Como ficam garantidos

- **Modo 1**: estrutural via D-017 + multi-entry-point (D-018). `svg-engine/render` + `svg-engine/edit` **não importam** `@angular/material`. Quem nunca importa de `svg-engine/ui` não recebe Material no bundle. Lint rule no D-028 (pendente) reforça via análise estática.
- **Modo 2**: default do `<svge-editor>` (`showToolbar` e `showStatusBar` defaultam para `true`). Plugins aparecem automaticamente via `<svge-toolbar>` interno lendo `MenuContributionRegistry`.
- **Modo 3**: inputs `[showToolbar]` e `[showStatusBar]` independentes + `<ng-content select="[toolbar-extras]">` e `<ng-content select="[status-bar]">` permitem substituições pontuais. Quando o consumer projeta `<div status-bar>...</div>`, o `<svge-status-bar>` default não renderiza (semântica do `<ng-content>` fallback).

### Specs garantindo

`projects/svg-engine/ui/src/lib/editor/editor.component.spec.ts` ganhou bloco "**THREE MODES guarantee (D-034 + D-035)**" com 6 specs:

- MODE 2 default: toolbar + status bar + canvas renderizam
- MODE 3a `[showToolbar]="false"`: status bar + canvas
- MODE 3b `[showStatusBar]="false"`: toolbar + canvas
- MODE 3c ambos false: só canvas + background
- Toolbar contributions slot renderiza via `<svge-toolbar>` interno
- Canvas + overlays projetados sobrevivem em todos os 3 modos
- Slot custom `[status-bar]` substitui o default

Modo 1 (headless puro) é garantido estruturalmente — não testável de dentro de `/ui` (a definição é "consumer não importa `/ui`"). O playground em si tem 3 rotas demonstrando: `/` (headless puro), `/shell-demo` (completo), `/shell-partial-demo` (parcial com checkboxes interativos).

### Quando reabrir

- Se aparecer caso de uso onde `<svge-editor>` precisa também esconder o canvas (improvável, mas registrar).
- Se algum dia decidirmos consolidar `<svge-toolbar>` (built-ins + contributions) em data-driven 100% — implicaria refatorar undo/redo/zoom como contribuições registradas no boot do shell.

---

## Decisões pendentes (em aberto)

| ID provis. | Tema                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| D-025?     | Registry de publicação (npm público / GitHub Packages / Mosaicoo)      |
| D-027?     | Migração para zoneless (revisar D-010)                                 |
| D-028?     | Lint rule customizada para enforcer headless boundary                  |
| D-029?     | Estratégia de testes E2E (Playwright?)                                 |
| D-031?     | Versionamento + changelog (changesets / standard-version)              |
| D-032?     | Multi-page (`WorkspacesRegistry`) — extensão futura de D-021           |
| D-033?     | Estratégia de i18n no editor                                           |
| D-022b?    | Pivot afetar scale/resize (estilo Affinity completo); adiar pós-Fase 3 |

> **Nota**: D-023 era "API formal de plugins" (cumprida pelo D-020 expandido em 2026-05-15). D-024 era "Versionamento + changelog" (renumerada para D-031 porque o número D-024 foi reusado para `ScriptRuntimePlugin`). D-030 era "Workspace/Página: A vs B" (cumprida pelo D-021 resolvido como Option C). D-032 entra como pendente para multi-page futuro. Sequência de IDs cumpridas em 2026-05-15: D-020, D-021, D-023, D-024. Em 2026-05-20: D-026 (alinhamento estrutural io/optimize); o número D-026 era previamente reservado para i18n — renomeado para D-033. D-036 (consolidação de helpers compartilhados) entrou no mesmo dia. **D-034 + D-035 + D-037** (shell-refinement) entraram em 2026-05-20 mais tarde no mesmo dia — adiamento "pós-Fase 6d" foi reduzido pois caso de uso Mosaicoo (canvas embedável em painéis menores + editor completo) demandou ambas formas garantidamente.
