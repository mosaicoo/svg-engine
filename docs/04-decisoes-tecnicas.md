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

## D-038 — Sprint Pro-Editor: editor profissional drop-in (`<svge-shell-pro>`)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada (4 phases)
- **Contexto**: D-037 garantiu 3 modos de consumo via `<svge-editor>` (headless puro / shell completo / shell parcial / canvas-only). Mas "shell completo" era **minimal** — apenas toolbar (undo/redo/zoom) + canvas + status bar. Apps Mosaicoo que querem editor profissional **drop-in** (menu bar, context menus, tool options bar, sidebars com layers + inspector, tools palette à esquerda) tinham que compor à mão (200+ linhas de wiring). Equivalente Illustrator/Affinity/Inkscape não existia.

### Decisão

Criar **`<svge-shell-pro>`** como composição "tudo on por padrão", coexistindo com `<svge-editor>` (que continua intocado como "minimal drop-in"). Implementação em 4 fases incrementais:

| Phase       | Entrega          | Componentes/extensões                                                                                                                                                                                    |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | Menu bar         | `<svge-menu-bar>` + `MenuContribution.parentId` (submenus) + `MenuContribution.divider` + `MENU_SLOT.*` constantes; `<svge-editor>` ganhou `[showMenuBar]` opt-in                                        |
| **Phase 2** | Context menu     | `<svge-context-menu>` + `SvgeContextMenuService` (CDK Overlay) + `[svgeContextMenu]` diretiva + `CONTEXT_MENU_SLOT.*`; `<svge-editor>` ganhou `[showContextMenu]` + `[contextMenuSlot]` opt-in           |
| **Phase 3** | Tool options     | `<svge-tool-options>` (NgComponentOutlet do `Tool.optionsComponent`) + extensão da interface `Tool` (campo opcional); `<svge-editor>` ganhou `[showToolOptions]` + `[toolOptionsShowPlaceholder]` opt-in |
| **Phase 4** | Composição final | `<svge-shell-pro>` (grid: menu + toolbar + tool-options + [tools palette \| canvas \| layers+inspector] + status); `<svge-tools-palette>` auxiliar (le `ToolRegistry.tools()`)                           |

### Slots de contribuição introduzidos

| Categoria                   | Slots canônicos                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Menu bar (top dropdowns)    | `menu.file` / `menu.edit` / `menu.view` / `menu.object` / `menu.help`                    |
| Context menus (right-click) | `context.canvas` / `context.node` / `context.layer` / `context.anchor` / `context.guide` |
| Toolbar items               | `toolbar.main` (já existente; plugins contribuem ícones aqui)                            |

Constantes `MENU_SLOT` e `CONTEXT_MENU_SLOT` exportadas de `svg-engine/ui` para evitar string-mongering.

### Invariantes preservadas

- **D-017 (headless boundary)**: `<svge-shell-pro>` vive em `svg-engine/ui` — modo 1 (headless puro) intocado, zero Material.
- **D-037 (3 modos)**: `<svge-editor>` continua exatamente como estava (defaults `showToolbar=true`, `showStatusBar=true`; novos flags `showMenuBar`/`showContextMenu`/`showToolOptions` defaultam `false` para não alterar comportamento). Modos 2/3/4 inalterados por padrão.
- **D-020 plugin scaffolding**: novas peças usam o `MenuContributionRegistry` existente. Plugin authoring is the same; novos slots usam o mesmo `register()`.

### Diferença `<svge-editor>` vs `<svge-shell-pro>`

| Aspecto       | `<svge-editor>` (Bloco 4a + D-034/035/038 opt-in)     | `<svge-shell-pro>` (D-038 Phase 4)                               |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Defaults      | toolbar + canvas + status (D-037 modes 2-4)           | TUDO ativo (defaults profissionais)                              |
| Layout        | flexbox vertical simples                              | CSS grid + sidebars dockáveis                                    |
| Tools palette | ❌                                                    | ✅ esquerda                                                      |
| Layers panel  | ❌                                                    | ✅ direita topo                                                  |
| Inspector     | ❌                                                    | ✅ direita baixo                                                 |
| Menu bar      | opt-in via `[showMenuBar]`                            | sempre on                                                        |
| Use case      | Mosaicoo embed em painéis, canvas-only, shell minimal | Mosaicoo "editor pro" página dedicada, drop-in Illustrator-grade |

### Garantias verificadas

- ✅ **1016/1016 specs** passando (Phase 4 não adicionou specs novos, mas regrediu nenhum; menu-bar/context-menu/tool-options trouxeram +23 specs nas fases anteriores)
- ✅ 6 entry points build clean
- ✅ Playground build clean (5 rotas cobrindo modos 1-5)
- ✅ ESLint clean
- ✅ Nova rota `/shell-pro-demo` no playground (nav entry com ⭐)
- ✅ Stamp Tool demo plugin valida `Tool.optionsComponent` end-to-end

### Quando reabrir

- Se aparecer caso de uso onde `<svge-shell-pro>` precisa flags individuais (probably algum subset da Mosaicoo querendo o pro mas sem layers panel): expor `[showLayersPanel]` / `[showInspector]` flags. Hoje a opinião do shell-pro é "vem com tudo ou usa svge-editor".
- Se layout dockável "à la VSCode" (drag-and-drop de panels) for demandado: refatorar para `<svge-dock-layout>` + persist em localStorage.
- D-022b ainda pendente (pivot afetar scale/resize). Independente desta sprint.

### Fix pós-Phase 4 (2026-05-20, mesma data)

Após validação manual no playground o usuário Mosaicoo reportou que `<svge-shell-pro>` parecia incompleto:

1. **Não dava para criar/manipular shapes** — bug arquitetural antigo: `<svge-editor>` e `<svge-shell-pro>` nunca rotearam pointer events para `ToolHostService.routePointer*`. Apenas o `playground-home` fazia esse wireup manual. **Fix**: nova diretiva `[svgeShellInteractions]` em `svg-engine/edit/lib/tool/` — wire pointer → tool routes + click-select via hit-testing + Delete/Backspace. Aplicada automaticamente em `<svge-editor>` e `<svge-shell-pro>`.
2. **Tools palette com 7 chaves-inglesa** — built-in tools (select/pen/pencil/rect/ellipse/polygon/text) nunca tiveram campo `icon` definido porque ninguém renderizava ícones antes do D-038 Phase 4. **Fix**: adicionados Material icons (`arrow_selector_tool`, `ads_click`, `edit`, `draw`, `crop_square`, `radio_button_unchecked`, `pentagon`, `title`).
3. **Toolbar vazia** entre menu bar e tool options — demo plugin registrava apenas `menu.*` e `context.*`, zero `toolbar.main`. **Fix**: 4 items demo (Save / Export SVG / Optimize / View Source).

**Gap remanescente** (resolvido em D-039 — ver abaixo): marquee drag-to-select, move-by-drag de seleção, multi-select Shift+click, double-click → isolation, ShortcutService auto-start. **Polish ainda pendente em D-040**: dynamic context-menu slot + plugin de builtin shortcuts.

---

## D-039 — Shell interactions full kit (`[svgeShellInteractions]` expandido)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada (Phases A-D em um único turno)
- **Contexto**: D-038 fix pós-Phase 4 entregou a versão **mínima** do `[svgeShellInteractions]` (tool routing + click-select + Delete). Restavam 5 gaps que faziam o shell ainda parecer "viewer" em vez de "editor": drag-move, multi-select, marquee, dblclick→isolation, shortcut listener auto-start.

### Decisão

Expandir o `[svgeShellInteractions]` para cobrir **todo o fluxo de interação** que o `playground-home` faz à mão. Migração de ~120 linhas de lógica do playground para a diretiva — `<svge-editor>` e `<svge-shell-pro>` herdam automaticamente. `playground-home` continua intocado por ora (a migração para a diretiva é um cleanup futuro pequeno).

### Fluxos cobertos (resumo da matriz)

| Gesto                               | Comportamento                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Pointer-down em shape               | Select; arma `potentialDrag`                                                   |
| Shift/Ctrl/Cmd + click              | `selection.toggle` (multi-select)                                              |
| Pointer-down em fundo               | `marquee.start(point, mode, initialSelection)`; Shift = `'add'`                |
| Drag > 3px em shape selecionada     | `transform.startMove` + snap via `SnapService.resolveForMove`                  |
| Pointer-up depois de drag           | `transform.endMove` → 1 entrada de undo                                        |
| Click em fundo                      | Clear selection (replace-mode)                                                 |
| Double-click em group               | `isolation.enter(groupId)` (manual dblclick detection, 400ms)                  |
| Right-click                         | Handled por `[svgeContextMenu]` (slot estático por enquanto — dynamic é D-040) |
| Pointer-down com drawing tool ativa | Forward para `ToolHostService.routePointer*`                                   |
| Delete / Backspace                  | `RemoveNodeCommand` por id selecionado                                         |
| Escape                              | Hierarquia: drag → marquee → isolation → forward para tool                     |
| Outras keys                         | `ToolHostService.routeKeyDown`                                                 |
| Pointer-cancel                      | Cancela drag/marquee preservando estado                                        |
| Construtor                          | `ShortcutService.start()` (idempotente) — listener keydown global ativo        |

### Por que numa única diretiva (não múltiplas)

Considerei separar em `[svgeToolEventRouter]` + `[svgeSelectionInteractions]` + `[svgeMarqueeInteractions]` + `[svgeKeyboardShortcuts]`. Rejeitado: cada fluxo lê estado dos outros (selection-vs-marquee, drag-vs-click threshold, escape hierarchy) — diretivas separadas duplicariam state ou exigiriam um service de coordenação. Uma diretiva única com fluxos bem-comentados é mais simples de raciocinar.

### O que NÃO entrou (escopo declarado D-040)

| Item                                                                        | Por que adiou                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Dynamic context-menu slot (`context.node` vs `context.canvas` por hit-test) | Requer refactor do `[svgeContextMenu]` em `/ui` ou cross-layer dance — escopo de design separado |
| Plugin `builtinEditorShortcutsPlugin` registrando Ctrl+Z/Y/G/Shift+G/A/D    | Aditivo limpo via `ShortcutRegistry`; pode ser um plugin opt-in separado                         |

### Garantias verificadas

- ✅ **1016/1016 specs** continuam passando (sem regressão)
- ✅ 6 entry points build clean
- ✅ Playground build clean
- ✅ Modos 1-5 D-037/D-038 inalterados em comportamento default — apenas ganham mais interatividade quando o consumer usa o canvas

### Validação manual

```
http://localhost:4200/shell-pro-demo
  → click em shape → seleciona (inspector direita popula)
  → arrastar shape selecionada → move (snap ativo se SnapService.enabled)
  → arrastar fundo vazio → marquee selection
  → Shift+click em outras shapes → adiciona à seleção
  → double-click em grupo → isolation mode
  → Delete → remove selecionadas
  → Esc → cancela drag/marquee, depois sai de isolation
```

### Quando reabrir

- Se Mosaicoo demandar marquee em **deep mode** (selecionar leaves dentro de grupos): hoje hit-test é sempre `'group'` — adicionar input opcional `[svgeShellInteractionsMode]` para alternar.
- Se aparecer apetite por isolar interações em services testáveis sem DOM (vs diretiva): refatorar para `EditorInteractionsService` + diretiva fina que delega.

---

## D-040 — Shell interactions polish (dynamic context-menu + builtin shortcuts)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada
- **Contexto**: D-039 declarou 2 itens fora de escopo: (a) right-click em shape deveria abrir `context.node` em vez de `context.canvas`; (b) atalhos canônicos de editor (Ctrl+Z/Y/G/Shift+G/A) precisavam de um plugin de registro. Ambos foram registrados como pendentes na mesma data.

### Decisão

Duas peças independentes entregues juntas como "polish do shell":

**Part 1 — Dynamic context-menu slot via resolver function**

- `[svgeContextMenu]` directive ganhou input opcional `[svgeContextMenuResolver]` — função `(event: MouseEvent) => string`.
- Quando supplied, **toma precedência** sobre a slot estática.
- `<svge-editor>` e `<svge-shell-pro>` fornecem resolver que usa `resolveSelectableNodeId` + `IsolationService.isolationRootId()` para retornar `'context.node'` (hit em shape) ou `'context.canvas'` (hit no fundo).
- Plugins registram items em qualquer slot via `MenuContributionRegistry`; consumer não wireia dois `[svgeContextMenu]`s.

**Part 2 — `builtinEditorShortcutsPlugin` (svg-engine/edit/lib/shortcut/)**

| Combo          | Action                                       |
| -------------- | -------------------------------------------- |
| `Ctrl+Z`       | `bus.undo()`                                 |
| `Ctrl+Y`       | `bus.redo()` (Windows idiom)                 |
| `Ctrl+Shift+Z` | `bus.redo()` (Mac/Linux idiom)               |
| `Ctrl+G`       | `GroupSelectionCommand` (>= 2 selecionados)  |
| `Ctrl+Shift+G` | `UngroupCommand(focus)` quando focus é group |
| `Ctrl+A`       | Select all top-level children do root        |

Plugin opt-in (consumer escolhe instalar). Playground instala por padrão em `app.config.ts`. Bare `<svge-editor>` consumers que querem bindings custom NÃO instalam este e registram os seus.

### Fora de escopo (NÃO entrou)

- `Ctrl+C` / `Ctrl+V` (clipboard) — sem `ClipboardService` ainda.
- `Ctrl+S` (save) — depende da estratégia do consumer.
- `Ctrl+D` (duplicate) — precisa de `DuplicateCommand` que ainda não existe; fast-follow.
- Arrow nudge já provido por `selectionNudgePlugin` (separado).

### Garantias

- ✅ **1016/1016 specs** continuam passando
- ✅ 6 entry points build clean
- ✅ Playground build clean
- ✅ ESLint clean
- ✅ Modos 1-5 D-037/D-038/D-039 sem regressão de comportamento
- ✅ Plugin opt-in não força bindings — coerente com D-020 (plugin scaffolding)

### Validação manual

```
http://localhost:4200/shell-pro-demo
  → right-click em shape → menu mostra context.node items (vazio por enquanto — registre items para popular)
  → right-click no fundo → menu mostra context.canvas items (Paste/Select All/Zoom)
  → Ctrl+Z → desfaz última operação
  → Ctrl+Y ou Ctrl+Shift+Z → refaz
  → Selecionar 2+ shapes → Ctrl+G agrupa
  → Focus em group → Ctrl+Shift+G desagrupa
  → Ctrl+A seleciona todos os top-level children
```

### Quando reabrir

- Quando aparecer `ClipboardService`: adicionar Ctrl+C/X/V ao plugin.
- Quando aparecer `DuplicateCommand`: adicionar Ctrl+D.
- Se um consumer Mosaicoo demandar Cmd-only no Mac (vs Ctrl-or-Cmd): hoje a combinação `Ctrl` matcha ambos; bifurcar via plugin custom seria a saída.

---

## D-031 — Versionamento + changelog automatizados (standard-version)

- **Data**: 2026-05-20
- **Status**: Decidida + implementada
- **Contexto**: A library `svg-engine` já é instalável-ready (D-018 multi-entry, D-026 io/optimize promovidos, README publicável, metadata completa). Para destravar `npm publish` falta: versionamento determinístico, changelog auto-gerado, e workflow CI que produza tarball/publish a partir de uma tag. O histórico de commits já segue Conventional Commits (`feat(scope):`, `fix(scope):`, `docs:`, `refactor:`, `perf:`), tornando viável geração automática.

### Decisão

Adotar **[`standard-version`](https://github.com/conventional-changelog/standard-version)** (devDep, single-package model) + **GitHub Actions release workflow** (publish on tag).

**Por que `standard-version` e não `changesets`**:

- O workspace é **single-package**: a library `svg-engine` é o único artefato publicado (D-018 garante multi-entry-point sob 1 versão única). `changesets` brilha em mono-repos com múltiplos pacotes versionados independentemente — overhead desnecessário aqui.
- `standard-version` lê commits do git diretamente (zero discipline overhead — basta manter conventional-commits, já feito).
- Bump + CHANGELOG + tag em **um único comando** (`npm run release`).
- Dry-run nativo (`npm run release:dry`) — preview sem efeitos colaterais.
- Suporte a `--release-as patch|minor|major` para override manual.

### Implementação (componentes entregues)

**1. `.versionrc.json`** (raiz do workspace)

- `bumpFiles` + `packageFiles` apontam **apenas** para `projects/svg-engine/package.json` (root permanece `private: true / 0.0.0` — não é publicável e não deve versionar).
- `types` filtra histórico no CHANGELOG: `feat`/`fix`/`perf`/`refactor`/`docs`/`revert` aparecem; `test`/`build`/`ci`/`chore`/`style` ficam ocultos.
- `commitUrlFormat` / `compareUrlFormat` / `issueUrlFormat` produzem links absolutos para `mosaicoo/svg-engine`.
- `tagPrefix: 'v'` (padrão npm).
- `releaseCommitMessageFormat: 'chore(release): {{currentTag}}'` (limpa o histórico).

**2. Scripts npm** (no `package.json` raiz)

| Script          | Comando                               | Uso                                        |
| --------------- | ------------------------------------- | ------------------------------------------ |
| `release`       | `standard-version`                    | Bump baseado em commits + CHANGELOG + tag  |
| `release:dry`   | `standard-version --dry-run`          | Preview sem escrever nada                  |
| `release:patch` | `standard-version --release-as patch` | Forçar patch                               |
| `release:minor` | `standard-version --release-as minor` | Forçar minor                               |
| `release:major` | `standard-version --release-as major` | Forçar major                               |
| `release:first` | `standard-version --first-release`    | Primeira release (não bumpa, só CHANGELOG) |

**3. Workflow `.github/workflows/release.yml`**

- Trigger: `push tag v*` (gerado automaticamente por `standard-version`).
- Steps: `npm ci` → lint → test (svg-engine) → `ng build svg-engine` → `npm pack` (dry-run + artifact) → upload tarball → **publish condicional**.
- **`NPM_TOKEN` opcional**: workflow detecta presença via `env.HAS_NPM_TOKEN`. Sem o secret, termina pacificamente após upload do tarball (artifact retention 90 dias). Adicionar o secret depois habilita publish automático — "ready when you add token".
- `npm publish --access public --provenance` (Sigstore provenance via GitHub OIDC — sem custo, eleva confiança do consumidor).

### Fluxo end-to-end

```
# 1. Desenvolvedor commit-a usando conventional-commits (já é a norma):
git commit -m "feat(edit): nova ferramenta"

# 2. Quando quiser cortar release:
npm run release:dry              # preview
npm run release                  # bump + CHANGELOG + tag local

# 3. Push da tag dispara o workflow:
git push --follow-tags origin main

# 4. CI builda, testa, packsta, e (se NPM_TOKEN setado) publica no npm.
```

### Fora de escopo (NÃO entrou)

- **Decisão do registry definitivo** — npm público / GitHub Packages / registry Mosaicoo privado. Continua como **D-025?** pendente. O workflow default aponta para `registry.npmjs.org` mas é trocável em uma linha.
- **GitHub Releases auto-criadas** — `standard-version` cria tag local; subir para "GitHub Release" com release-notes formatados é opcional (`action-gh-release` ou `release-please`). Pode entrar depois sem regressão.
- **Pre-releases (`alpha`/`beta`/`rc`)** — `standard-version --prerelease alpha` já funciona; documentação intencionalmente deferida até primeira demanda real.

### Garantias

- ✅ Build da library e specs **inalterados** — `standard-version` é dev-only, não toca runtime.
- ✅ Histórico Conventional Commits já existente é **retroativamente válido** (CHANGELOG do `--first-release` cobre tudo desde o início).
- ✅ Root `package.json` permanece `private: true` — workflow rejeitaria push do root acidentalmente.
- ✅ Pre-commit gate (D-014) e CI base (D-015) intocados — release.yml é workflow **adicional**, não substitui ci.yml.

### Quando reabrir

- Quando a decisão D-025? (registry) for fechada — atualizar `registry-url` + remover comentário "pending decision" do workflow.
- Se o workspace virar mono-repo (múltiplos pacotes publicáveis), revisitar para `changesets`.
- Se a equipe quiser **GitHub Releases** com release-notes auto-formatadas, adicionar `softprops/action-gh-release` ao workflow (não-bloqueante).

---

## D-041 — Posicionamento: o produto é o Canvas headless; `ui` é camada de conveniência

- **Data**: 2026-05-21
- **Status**: Decidida
- **Contexto**: D-016 estabeleceu "produto de mercado, não MVP". D-017 fixou o boundary headless. D-018 dividiu em 6 entry points. D-037 codificou os 4 modos de consumo. Mas **nenhuma decisão dizia, com todas as letras, qual é o produto principal**. Em conversas de alinhamento isso virou pergunta recorrente: "É o `<svge-shell-pro>` ou é o headless?". Sem resposta canônica, decisões de roadmap/breaking-change/doc oscilavam.

### Decisão

**O produto principal do SVGEngine é o Canvas Engine headless** — o conjunto de entry points `core` + `render` + `io` + `optimize` + `edit`. O entry point `svg-engine/ui` (com componentes Angular Material como `<svge-shell-pro>`, `<svge-editor>`, `<svge-toolbar>`, etc.) é uma **camada de conveniência opt-in**, reutilizável mas **substituível**.

Em uma frase: **"Vendemos uma engine. A UI profissional é cortesia."**

### Implicações operacionais

1. **Roadmap prioriza features headless primeiro**. UI só ganha versão de uma feature **depois** que a API headless dela está estável. Ex.: ao adicionar `ClipboardService` (futuro D-???), primeiro o service vai em `edit`; só depois `<svge-shell-pro>` ganha botões/atalhos que o consumam.

2. **Breaking changes em `ui` são menos graves do que em headless**. Quebra no headless = consumer em modo 1 (D-037) quebra silenciosamente sem alternativa. Quebra em `ui` = consumer ainda pode cair para Modo 3 (shell parcial) ou Modo 1. SemVer minor pode incluir breaking em `ui` com migration note; SemVer minor **não pode** incluir breaking em headless.

3. **Documentação de API prioriza headless**. `09-api-publica.md` ordena: tipos do `core` primeiro, services do `edit` segundo, componentes do `ui` por último. O 10-guia-plugin foca em headless. README posiciona "use o engine; UI pronta se quiser".

4. **Tamanho e dependências do `ui` podem crescer**; do headless devem ser vigiados ativamente. Adicionar `@angular/material/foo` em `ui` é OK; adicionar **qualquer** dep em `core/render/io/optimize/edit` exige justificativa em D-???.

5. **Performance** (D-???? perf budget futuro): mede-se contra o Canvas headless puro (Modo 1), não contra o shell completo. Overhead do shell é aceitável; do headless não.

6. **A `playground` é showcase + sandbox + benchmark, não produto.** A rota `/custom-editor` é o exemplo canônico de "consumer construindo editor completo sobre o Canvas headless sem usar `<svge-editor>`" e deve ser preservada como referência mesmo se outras rotas mudarem.

### De-para conceitual (alinhamento terminológico)

| Termo conceitual (mercado)  | Implementação real (hoje)                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **SVG Engine** (produto)    | npm package `svg-engine`                                                                                                                  |
| **Canvas Engine / Core**    | conjunto: `svg-engine/{core,render,io,optimize,edit}` (5 entry points headless)                                                           |
| **Canvas físico**           | `<svge-renderer>` (read-only) ou `<svge-canvas>` (com gestures via diretivas `edit`)                                                      |
| **SVG Engine Professional** | entry point `svg-engine/ui` — em particular `<svge-shell-pro>` (editor drop-in completo) e `<svge-editor [shell]="true">` (editor padrão) |
| **Shell parcial**           | Modo 3 (D-037) — composição manual de componentes de `svg-engine/ui`                                                                      |
| **Playground**              | app `projects/playground/` — sandbox + showcase + benchmark, **não** produto                                                              |

### Rotas do playground (slugs EN / labels PT)

Convenção: cada rota tem **nome que descreve a atividade**, não a categoria arquitetural. URLs antigas redirecionam para os novos slugs (compatibilidade com bookmarks).

| Rota canônica        | Componente         | Atividade real                                                                             | URL antiga (redireciona)              |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| `/custom-editor`     | `CustomEditor`     | Editor 100% custom — canvas headless + painéis `ui` sem `<svge-editor>`/`<svge-shell-pro>` | `/raw-primitives`, `/playground-home` |
| `/basic-editor`      | `BasicEditor`      | `<svge-editor>` drop-in básico (toolbar+canvas+statusbar)                                  | `/shell-demo`                         |
| `/modular-editor`    | `ModularEditor`    | `<svge-editor>` com 6 checkboxes ligando/desligando peças                                  | `/shell-partial-demo`                 |
| `/embeddable-canvas` | `EmbeddableCanvas` | `<svge-editor>` com tudo off — canvas + edição sem chrome                                  | `/shell-canvas-only`                  |
| `/pro-editor`        | `ProEditor`        | `<svge-shell-pro>` profissional completo (Illustrator-grade)                               | `/shell-pro-demo`                     |
| `/svg-viewer`        | `SvgViewer`        | `<svge-renderer>` puro read-only — bundle mínimo (só `render` + `io`), zero `edit`         | (novo em D-041 — fecha gap do D-037)  |
| `/benchmark`         | `Benchmark`        | Performance harness — FPS + render-to-paint latency                                        | `/perf`                               |

### Por que **não** quebrar em dois pacotes npm (`svg-engine` + `svg-engine-professional`)

Avaliado em D-041 e rejeitado:

- Tree-shaking + `optional` peer deps **já garantem** o que dois pacotes ofereceriam: consumer headless puro **não baixa** Material/CDK (`peerDependenciesMeta.@angular/material.optional = true`).
- Manter duas versões coordenadas adiciona overhead real (release sincronizada, risco de drift) sem ganho funcional.
- Refactor cross-entry (renomear API em `core` que é re-exportada por componente em `ui`) hoje é 1 PR atômico; em 2 pacotes seria coordenação 2 PRs + 2 releases.
- A invariante "produto = headless" pode ser comunicada por **documentação** (D-041 + README + doc 01) sem precisar da segregação física.

Se em algum futuro `ui` precisar evoluir em cadência **dramaticamente** diferente de `core` (cenário improvável: hoje co-evoluem), reabrir.

### Fora de escopo

- Lint rule formal para impedir adição de deps em entry points headless — fica como **D-028?** (já pendente).
- "Perf budget" headless vs shell — registrar como nova decisão pendente quando começar a medir formalmente.

### Garantias

- ✅ Decisão é puramente posicional/operacional — **zero código alterado** para registrar.
- ✅ Compatível com todas as decisões anteriores (D-016, D-017, D-018, D-026, D-037).
- ✅ Diagramas de `docs/02-arquitetura.md` seção 4 já refletem essa hierarquia (UI no topo, headless boundary destacado).

### Quando reabrir

- Se o `ui` virar mais consumido que o headless (consumer headless = <10% dos usuários) — **reposicionar produto**.
- Se Angular dropar Material e exigir migração brutal — **revisar o que é "conveniência"** quando o custo de conveniência sobe.
- Se a Mosaicoo demandar release de `ui` independente do headless por X meses seguidos — **reabrir a separação em 2 pacotes**.

---

## D-042 — Editor scope (route-scoped DI): `provideSvgEngineEditorScope()`

- **Data**: 2026-05-21
- **Status**: Decidida + implementada
- **Contexto**: Bug visível no playground após D-041 — ao navegar entre `/custom-editor` → `/basic-editor` → `/embeddable-canvas`, as **shapes apareciam compartilhadas** entre rotas (cada rota seedava shapes mas o documento era o mesmo) e os elementos do canvas apareciam **esmaecidos** (estado de `IsolationService` / `LayersService` / outline mode persistia entre rotas). Investigação revelou que TODOS os 20+ services de estado da library são `providedIn: 'root'` (singletons app-wide). Funciona para apps single-editor; **quebra a partir de 2 instâncias** de editor no mesmo app Angular (caso de uso real: Mosaicoo embedando 2 editores em painéis side-by-side, ou playground com múltiplas rotas demonstrando modos).

### Decisão

Introduzir **`provideSvgEngineEditorScope()`** — helper que devolve `Provider[]` listando todos os services de estado per-editor. Consumer adiciona em `providers: []` do componente que hospeda o editor. Cada subtree de injetor recebe **instâncias frescas** dos services, isoladas do root e dos sibling subtrees.

```ts
@Component({
  selector: 'my-editor-route',
  providers: [provideSvgEngineEditorScope()],
  template: `<svge-editor>...</svge-editor>`,
})
export class MyEditorRoute {}
```

**Por que helper e não breaking change**: services mantêm `providedIn: 'root'` como **default** (back-compat — consumer single-editor não precisa de boilerplate). O override por DI hierárquico kicks in **só quando** o consumer opta. Zero quebra.

### O que entra no scope (per-editor)

| Entry point  | Services                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`       | `EditorStateService` (document), `CommandBus` (mutations), `HistoryService` (undo/redo)                                                                                                                              |
| `render`     | `ViewportService` (pan/zoom)                                                                                                                                                                                         |
| `edit`       | `SelectionService`, `IsolationService`, `LayersService`, `WorkspaceService`, `SnapService`, `TransformService`, `MarqueeService`, `AlignmentService`, `AutoSaveService`, `ToolHostService`, `AnchorSelectionService` |
| `edit/tool`  | `PenToolService`, `ShapeToolService`, `InlineTextEditorService`                                                                                                                                                      |
| `edit/perf`  | `ViewportCullingService`                                                                                                                                                                                             |
| `edit/input` | `ShortcutService` (per-editor: cada editor escuta keystrokes com seu próprio injector e resolve services do scope ativo)                                                                                             |

### O que FICA app-wide (não entra no scope, intencional)

- **Registries de plugins** (`ToolRegistry`, `MenuContributionRegistry`, `ShortcutRegistry`, `PaletteRegistry`, `EffectRegistry`, `OptimizerRegistry`, `ImporterRegistry`, `ExporterRegistry`, `PluginInfoRegistry`): plugins são registrados **uma vez** em `provideSvgEnginePlugin(...)` no `app.config.ts` e precisam aparecer em todo editor.
- **Renderer dispatch** (`NodeRendererRegistry`): mapping `<rect>` → `<rect-renderer>` é global.
- **App-wide UI services** (`ThemeService`, `ColorHistoryService`): tema é escolha única; color history é compartilhada via localStorage por design.
- **`SvgeContextMenuService`** (vive em `svg-engine/ui`): não inclusa no helper porque importar de `ui` no `edit` violaria D-017 (headless boundary). Consumer adiciona manualmente se precisar isolation de menu per-editor.

### Refactor casado: handlers de shortcut precisam de injector per-fire

Plugins como `builtinEditorShortcutsPlugin` registram handlers que disparam `bus.undo()`. **Problema sutil**: o plugin é instalado uma vez em `app.config.ts` (injector root); o closure do handler captura o `CommandBus` **root**. Com state per-editor, o handler dispara no bus errado.

**Solução**: adicionar `ShortcutContext { injector }` opcional na `Shortcut.run(event, ctx?)`. `ShortcutService` injeta seu próprio `Injector` e passa per-fire — em scope per-editor, esse injector é o da rota. Plugins refatoram para resolver services do `ctx.injector` (com fallback ao injector do install para single-editor + tests).

`builtinEditorShortcutsPlugin` e `selectionNudgePlugin` refatorados nesse padrão. Plugins de terceiros que queiram suportar multi-editor seguem o mesmo modelo (documentado em `10-guia-plugin.md`).

### Garantias

- ✅ **Sem breaking change**: services mantêm `providedIn: 'root'` como default; consumer single-editor não precisa de helper.
- ✅ **6 entry points buildam clean** após o refactor.
- ✅ **1022/1022 specs** passando (era 1016; +6 novos covering scope isolation).
- ✅ **Spec dedicado** (`editor-scope.providers.spec.ts`) prova: 2 hosts com `provideSvgEngineEditorScope()` têm `EditorStateService`/`CommandBus`/`SelectionService`/`IsolationService`/`LayersService` distintos, mutações em A não afetam B.
- ✅ **D-017 headless boundary intacta**: helper vive em `edit`, não importa de `ui`.
- ✅ **Playground funciona**: 5 rotas (custom-editor, basic-editor, modular-editor, embeddable-canvas, pro-editor) recebem `providers: [provideSvgEngineEditorScope()]`. svg-viewer não precisa (não usa `edit`). Benchmark não precisa (tem semântica de reset programático).

### Validação manual (após este commit)

1. `npm start` no workspace → abrir `http://localhost:4200/custom-editor`
2. Inserir 2 rects, agrupar (Ctrl+G), entrar isolation (dblclick no grupo)
3. Navegar para `/basic-editor` — canvas vazio, **não** mostra os rects da rota anterior, **não** está esmaecido
4. Voltar para `/custom-editor` — fresh state (sem os rects da visita anterior — instância nova)
5. `/modular-editor`, `/embeddable-canvas`, `/pro-editor` — cada um com seu próprio documento independente

### Fora de escopo

- **Multi-editor in same view** (Mosaicoo split-panel com 2 `<svge-editor>` lado a lado): tecnicamente suportado pelo helper, mas keyboard dispatch precisa de **focus-aware routing** (qual editor recebe Ctrl+Z?). Hoje, ambos os `ShortcutService` escutam `document.keydown` e ambos disparam — comportamento aceitável em routing (só um editor mounted) mas problemático em split-view. Registrar como **D-???? Focus-aware shortcut dispatch** quando o caso real aparecer.
- **Helper de UI scope** (`provideSvgEngineUiScope()`) cobrindo `SvgeContextMenuService`: deferir até demanda concreta — em routing single-editor o singleton root funciona.
- **Auto-cleanup de localStorage por scope** (`AutoSaveService` salva com chave fixa): cada editor scope sobrescreve o mesmo localStorage key. Para multi-editor real, precisaria de keys distintas por instância. Deferir.

### Quando reabrir

- Se aparecer caso real de multi-editor side-by-side com keystroke dispatch ambíguo → abrir D-???? focus dispatch
- Se `SvgeContextMenuService` per-editor virar requisito → criar `provideSvgEngineUiScope()`
- Se `AutoSaveService` precisar key per-instance → discutir API de scope-id

---

## D-043 — `builtinMenuContributionsPlugin` (UI controls full-functionality sprint)

- **Data**: 2026-05-21
- **Status**: Decidida + implementada
- **Contexto**: A library tinha **componentes UI completos** (`<svge-menu-bar>`, `<svge-toolbar>`, `<svge-context-menu>`, `<svge-tools-palette>`, `<svge-tool-options>`, `<svge-status-bar>`, `<svge-inspector>`, `<svge-layers-panel>`, `<svge-color-picker>`, `<svge-effects-panel>`, etc.) **todos wired aos services correspondentes**. E tinha **commands reais no core** (Move/Group/Ungroup/Remove/Reorder/etc.). Mas **não existia um plugin built-in que conectasse os dois** — o único populador de menus era o `demoMenuBarPlugin` (em `projects/playground/`), cujos `run()` eram puramente `console.info(...)`. Resultado: ao consumir o shell pro Mosaicoo, os menus apareciam visualmente profissionais mas **nenhum botão fazia ação real**.

### Decisão

Criar **`builtinMenuContributionsPlugin`** em `svg-engine/edit/lib/menu/builtin/` — plugin opt-in que registra **File / Edit / View / Object / Help + toolbar.main + context.canvas + context.node** com **handlers funcionais** wired aos commands reais do bus. Mesmo padrão arquitetural do `builtinEditorShortcutsPlugin` (D-040): opt-in, multi-editor safe (D-042 lazy injector), reactive `disabled` signals.

Como efeito colateral arquitetural necessário, as constantes de slot (`MENU_SLOT`, `TOOLBAR_SLOT`, `CONTEXT_MENU_SLOT`) foram **consolidadas em `svg-engine/edit/lib/menu/menu-slots.ts`** (eram duplicadas em `ui/menu-bar` e `ui/context-menu`). `ui` re-exporta para back-compat zero-quebra.

### Itens registrados (canonical surface)

| Slot             | Item                                                     | Wired para                                                                  |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `menu.edit`      | Undo                                                     | `bus.undo()` (disabled quando `!history.canUndo()`)                         |
| `menu.edit`      | Redo                                                     | `bus.redo()` (disabled quando `!history.canRedo()`)                         |
| `menu.edit`      | Delete                                                   | `RemoveNodeCommand` para cada selecionado (disabled quando `!hasSelection`) |
| `menu.edit`      | Select All                                               | `selection.selectMany(root.children)`                                       |
| `menu.edit`      | Group                                                    | `GroupSelectionCommand(ids)` (disabled quando `<2 selecionados`)            |
| `menu.edit`      | Ungroup                                                  | `UngroupCommand(focusId)` (disabled quando focus não é group)               |
| `menu.view`      | Zoom In / Out / Reset                                    | `viewport.zoomIn()/zoomOut()/reset()`                                       |
| `menu.view`      | Show Grid / Rulers / Outline                             | `workspace.toggleGrid()/toggleRulers()/toggleOutlineMode()`                 |
| `menu.object`    | Bring to Front / Forward / Send Backward / to Back       | `ReorderNodeCommand(id, direction)` para cada selecionado                   |
| `menu.help`      | About                                                    | `alert(...)` (consumer override permitido por ID)                           |
| `toolbar.main`   | Undo / Redo / Delete / Group / Ungroup                   | mesma lógica das menu items                                                 |
| `context.canvas` | Select All / Zoom In / Out / Reset                       | mesma lógica                                                                |
| `context.node`   | Delete / Group / Ungroup / Bring Forward / Send Backward | mesma lógica                                                                |

**31 contribuições no total** (incluindo dividers para agrupamento visual).

### O que **não** entrou (registrado explicitamente em "fora de escopo")

| Item                          | Razão                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cut / Copy / Paste            | Não existe `ClipboardService` ainda. Quando for criado, append items ao Edit/Toolbar/Context.node                                                                                     |
| Duplicate                     | Não existe `DuplicateCommand` (deferido de D-040)                                                                                                                                     |
| Save / Open / New             | Dependem de estratégia de persistência do consumer                                                                                                                                    |
| Export SVG / PNG (com dialog) | Requer `MatDialog` que vive em `ui` (D-017 proíbe `edit→ui`). Export via Blob download direto seria possível — fica como follow-up                                                    |
| Align / Distribute            | Requer `NodeBBox[]` (rendered geometry — precisa de SVG DOM ref). Handlers de plugin não têm. Já existem buttons no `custom-editor` que fazem isso quando o componente tem ref ao SVG |
| Workspace Settings dialog     | Idem Export — requer Material dialog                                                                                                                                                  |

### Refactor casado: consolidação de slot constants

Antes: `MENU_SLOT` em `ui/menu-bar/menu-bar.component.ts`, `CONTEXT_MENU_SLOT` em `ui/context-menu/context-menu.component.ts`, `TOOLBAR_SLOT` ausente (literal string).

Depois: **fonte única em `edit/lib/menu/menu-slots.ts`**. `ui` re-exporta para preservar `import { MENU_SLOT } from 'svg-engine/ui'`. Plugins em `edit` agora podem importar das suas próprias constantes sem violar D-017 (edit não pode importar de ui).

### Substituição em playground

`projects/playground/src/app/plugins/demo-menu-bar.plugin.ts` **removido** (via `git rm`, history preservada). `app.config.ts` substitui `provideSvgEnginePlugin(demoMenuBarPlugin)` por `provideSvgEnginePlugin(builtinMenuContributionsPlugin)`. As 5 rotas que usam o shell (`basic-editor`, `modular-editor`, `embeddable-canvas`, `pro-editor`) **herdam automaticamente** os menus funcionais — zero alterações nessas views (registry-driven, conforme o requisito).

### Garantias

- ✅ **1038/1038 specs** passando (era 1026; +12 novos cobrindo: registro nos slots, disabled signals reativos, handlers dispatching commands reais, D-042 lazy injector contract)
- ✅ 6 entry points + playground build clean
- ✅ Zero breaking change: `MENU_SLOT`/`CONTEXT_MENU_SLOT` ainda exportados de `svg-engine/ui` via re-export
- ✅ **D-017 headless boundary intacta**: `edit/menu/builtin` só importa de `core`, `render`, `edit/{plugin,selection,workspace,menu}` — zero `ui`
- ✅ **D-042 multi-editor**: handlers usam `fromCtx(token, runCtxArg)` para resolver do scope ativo
- ✅ **D-040 pattern**: plugin opt-in (consumer não obrigado), reactive `disabled` signals
- ✅ **Sem mocks**: spec dedicado verifica que `Undo` realmente remove shape, `Group` realmente cria group, `Delete` realmente apaga node — não `console.info`

### Quando reabrir / próximas iterações

- **Quando `ClipboardService` aparecer**: append Cut/Copy/Paste a Edit + Toolbar + Context.node
- **Quando `DuplicateCommand` aparecer**: append Duplicate
- **Para Save/Export**: adicionar `provideSvgEngineUiScope()` (em `ui`) com items que abrem dialogs Material — ou consumer registra os seus próprios
- **Align/Distribute**: discutir contrato para handlers receberem SVG ref (talvez via signal global registrado pelo shell)
- **Override granular pelo consumer**: já é possível — basta o consumer registrar um item com o mesmo `id` (registry throws on duplicate — então o consumer precisa primeiro dispose do built-in via `MenuContributionRegistry.get(id) + dispose`)

---

## Decisões pendentes (em aberto)

| ID provis. | Tema                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| D-025?     | Registry de publicação (npm público / GitHub Packages / Mosaicoo)      |
| D-027?     | Migração para zoneless (revisar D-010)                                 |
| D-028?     | Lint rule customizada para enforcer headless boundary                  |
| D-029?     | Estratégia de testes E2E (Playwright?)                                 |
| D-032?     | Multi-page (`WorkspacesRegistry`) — extensão futura de D-021           |
| D-033?     | Estratégia de i18n no editor                                           |
| D-045?     | Distribuição cross-framework (React / Vue / Vanilla JS / RN)           |
| D-046?     | NLU/SLM para comandos — Fase 1 ✅ (2026-05-22); Fases 2 + 3 pendentes  |
| D-022b?    | Pivot afetar scale/resize (estilo Affinity completo); adiar pós-Fase 3 |

> **Nota**: D-023 era "API formal de plugins" (cumprida pelo D-020 expandido em 2026-05-15). D-024 era "Versionamento + changelog" (renumerada para D-031 porque o número D-024 foi reusado para `ScriptRuntimePlugin`). D-030 era "Workspace/Página: A vs B" (cumprida pelo D-021 resolvido como Option C). D-032 entra como pendente para multi-page futuro. Sequência de IDs cumpridas em 2026-05-15: D-020, D-021, D-023, D-024. Em 2026-05-20: D-026 (alinhamento estrutural io/optimize); o número D-026 era previamente reservado para i18n — renomeado para D-033. D-036 (consolidação de helpers compartilhados) entrou no mesmo dia. **D-034 + D-035 + D-037** (shell-refinement) entraram em 2026-05-20 mais tarde no mesmo dia — adiamento "pós-Fase 6d" foi reduzido pois caso de uso Mosaicoo (canvas embedável em painéis menores + editor completo) demandou ambas formas garantidamente. **D-038 + D-039 + D-040** (Sprint Pro-Editor + interactions + polish) entraram em 2026-05-20 fechando o ciclo do shell profissional. **D-031** (release tooling) também entrou em 2026-05-20 — destrava `npm publish` via `standard-version` + workflow `release.yml` condicional ao secret `NPM_TOKEN`; a decisão de registry definitivo (D-025?) permanece pendente.

> **D-045?** (registrado em 2026-05-21, sem prazo): hoje a library é Angular-only (D-001). Pergunta levantada: viabilidade de distribuir em React / React Native / Vue / Vanilla JS. **Status atual**: `core` + `io` + `optimize` são parcialmente neutros (usam `@angular/core` apenas para `signal()` reativo + `@Injectable` em registries) — funcionam fora de Angular com Angular core como peer dep (~50KB) tratando classes como objects. `render` + `edit` + `ui` são Angular-bound (components/directives). RN não suportado por causa do DOM SVG web-only. **Trilha viável** se reabrir: extrair `@svg-engine/core` puro TS (signals → biblioteca neutra tipo `@preact/signals-core`), criar wrappers `@svg-engine/react`, `@svg-engine/vue`, `@svg-engine/web-components` (via `@angular/elements`). D-017 (headless boundary) facilita o destilamento. D-001 explicitamente rejeitou inicialmente mas com nota "pode ser destilado depois se necessário". Apenas registro — não há sprint planejada.

---

## D-046 — NLU/SLM para comandos por linguagem natural (3 fases incrementais)

- **Data registro**: 2026-05-21
- **Status**: **Fase 1 (rule-based) IMPLEMENTADA** em 2026-05-22; Fases 2 (ML classifier) e 3 (SLM) permanecem pendentes
- **Pergunta levantada**: viabilidade de adicionar um SLM (Small Language Model) para reconhecer linguagem natural e executar comandos dentro da ferramenta. Não é IA generativa: o caso de uso é **intent classification + slot filling** — entender "criar retângulo vermelho 100x50" → `{intent: 'create-shape', shape: 'rect', fill: 'red', width: 100, height: 50}` → `bus.dispatch(...)`.

### Por que faz sentido aqui

A arquitetura atual já está pronta para acoplar isso sem retrabalho:

- **`CommandBus`** (D-002): ponto único de mutação. O NLU produz um `Command` e despacha.
- **`CommandRegistry` + `MenuContributionRegistry`** (D-020/D-043): catálogo enumerável de tudo que o editor sabe fazer (cada item tem `id`, `label`, `icon`, `run`). O NLU pode **introspectar** isso pra descobrir intents automaticamente — todo menu item vira candidato com label como exemplo.
- **Plugin system** (D-020 + D-023): entrega opt-in via `provideSvgEnginePlugin(nluPlugin)`.
- **D-017 headless boundary**: o NLU **não** entra no core — vira entry point separado (`svg-engine/nlu`).
- **D-042 multi-editor scope**: o `MenuContributionContext.injector` já permite o NLU resolver `CommandBus` / `Selection` / etc. do scope ativo (cada editor seu).

### Decomposição em 3 fases (cada uma entrega valor sozinha)

| Fase  | Stack                                                                                   | Tamanho       | Cobertura esperada                                                                        | Entry point opt-in                   |
| ----- | --------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| **1** | Rule-based: regex + dicionário PT/EN + fuzzy match (Levenshtein)                        | < 50 KB       | 70–80% dos comandos comuns ("undo", "delete", "criar retângulo vermelho")                 | `svg-engine/nlu` (sempre disponível) |
| **2** | Intent classifier ML: distilled BERT / MiniLM via **Transformers.js** (ONNX no browser) | 30–50 MB      | Resolve ambiguidades ("torna isso maior", "alinha à esquerda"); adiciona confidence score | `svg-engine/nlu-ml` (lazy-load)      |
| **3** | SLM com function-calling: Llama-3.2-1B / Gemma 2B via **WebLLM** (WebGPU)               | 500 MB – 2 GB | Comandos compostos ("duplica 3 vezes e alinha em grid 2x2")                               | `svg-engine/nlu-slm` (lazy-load)     |

**Importante**: as 3 fases **compõem em cascata** — Fase 1 sempre roda primeiro (instantâneo); cai para Fase 2 se confidence baixa; cai para Fase 3 se a 2 também falhou. Consumer só paga o tamanho que escolher ativar.

### Forma proposta do serviço

```ts
// svg-engine/nlu (Fase 1 — sem ML)
@Injectable({ providedIn: 'root' })
export class NaturalLanguageService {
  /** Registra intent manual (ou auto-descoberta do MenuContributionRegistry). */
  registerIntent(intent: NluIntent): Disposable;

  /** Recebe texto, retorna 0..N comandos candidatos com confidence. */
  parse(text: string, ctx: NluContext): NluResult[] | Promise<NluResult[]>;

  /** Atalho: parse + dispatch. Hook configurável para confirmation gate. */
  execute(text: string, ctx: NluContext): Promise<NluResult | null>;
}

interface NluIntent {
  id: string;
  examples: string[]; // 'criar retângulo', 'add a circle', 'desenhar elipse 100x50'
  slots: Record<string, SlotSchema>; // shape: 'enum[rect,circle,ellipse]', width: 'number?'
  execute: (
    slots: Record<string, unknown>,
    runCtx: MenuContributionContext,
  ) => void | Promise<void>;
}
```

### Surfaces UI possíveis (entry separado `svg-engine/nlu-ui`)

- **Command palette** (Ctrl+K) com input texto + autocomplete de intents conhecidos
- **Voice input** via Web Speech API (gratuito, browser-native) → mesma pipeline `parse()`
- **Chat sidebar** opcional (modo conversacional, útil pra Fase 3)

### Restrições e trade-offs (não esquecer ao reabrir)

| Tópico                 | Tratamento                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Bundle size            | Fase 1 entra default; Fase 2/3 são entry points lazy-loaded — **D-017 preserva headless puro**                                |
| Privacidade            | Tudo local; **zero envio para servidor** — diferencial vs Copilot/Cursor                                                      |
| Determinismo           | NLU sempre tem risco de erro → ações destrutivas (delete, clear) **sempre** com confirmation gate configurável                |
| i18n (D-033?)          | Rule-based: dicionários PT/EN; ML: modelos multilíngues existem (XLM-R, Multilingual MiniLM)                                  |
| Acessibilidade         | Voz + NLU é uma feature **enorme** de acessibilidade (usuários com mobilidade reduzida) — esse é um argumento forte por si só |
| Mosaicoo (D-037)       | Plugin opt-in; **Modo 1 (headless puro) continua sem dependência**                                                            |
| Cold start (Fase 2/3)  | Primeiro uso baixa o modelo (3–10s para SLM); UI deve mostrar progresso. localStorage cache via OPFS / IndexedDB              |
| WebGPU obrigatório (3) | Fallback: se ausente, cai para Fase 2; documentar requisito de hardware                                                       |
| Atualização de modelo  | Hash-pinned download URLs; mecanismo de migração para quando modelo evoluir                                                   |

### Fase 1 implementada (2026-05-22)

Em **dois entry points separados agrupados sob `ai/`** desde 2026-05-22:

- **`svg-engine/ai/nlu`** (headless, rule-based): todo o pipeline parser + service + plugin + dicionários
- **`svg-engine/ai/nlu-ui`** (Material + Web Speech): `<svge-nlu-input>` + `VoiceRecognitionService`

**Evolução da decisão** (3 iterações no mesmo dia):

1. **Primeira tentativa**: tudo dentro de `svg-engine/edit/lib/nlu/` por pragmatismo de tamanho (~10KB) — rejeitada por violar o isolamento combinado (Modo 1 headless puro não deve carregar NLU).
2. **Segunda tentativa**: `svg-engine/nlu` + `svg-engine/nlu-ui` (flat, irmãos dos outros entry points) — funcionou mas misturava namespaces visualmente.
3. **Estrutura final**: agrupados sob `ai/` (subpasta lowercase, consistente com convenção de paths Angular). Razões: (a) comunica visualmente que `ai/` é namespace dedicado; (b) Fase 2 (`ai/nlu-ml`) e Fase 3 (`ai/nlu-slm`) entram naturalmente no mesmo agrupamento; (c) reforça arquiteturalmente o isolamento total da camada AI.

**Convenção adotada**: este é o primeiro agrupamento por subpasta em `projects/svg-engine/`. Estabelece precedente para agrupamentos temáticos futuros (se aparecerem).

**Componentes**:

- `types.ts` — `NluIntent`, `NluContext`, `NluCandidate`, `NluSlotSchema`, `NluParseOptions`, `NluExecuteOptions`, `NluExecuteResult`. `NluContext` espelha `MenuContributionContext` (mesmo shape `{ injector }`) pra reaproveitar D-042/D-043 multi-editor scope.
- `dictionaries/` — `colors.ts` (vermelho/red, azul/blue, 25+ cores), `shapes.ts` (`NluShapeKind` PT+EN, 14 nomes), `actions.ts` (canonical mapping: criar/create/desenhar → 'create', 20+ verbos), `stopwords.ts` (artigos/preposições/conjunções PT+EN).
- `parsers/` — `tokenize.ts` (single-pass scanner que preserva `1.5` / `1,5` decimais e `100x50` dimensões + deacentuação NFD), `levenshtein.ts` (2-row DP com early termination), `fuzzy-match.ts` (adaptive max-dist por tamanho do termo: 0/1/2 pra termos curtos/médios/longos), `slot-extractor.ts` (extrai number/color/enum/string com tracking de consumed indices).
- `natural-language.service.ts` — singleton `providedIn: 'root'`, `registerIntent()` retorna `Disposable`, `parse(text, ctx)` com scoring adaptativo (peso da keyword depende de quantos componentes a intent declara), `execute(text, ctx)` com gate de confirmação para destrutivos.
- `menu-intent-discovery.ts` — `discoverMenuIntents(registry, service)` enumera o `MenuContributionRegistry` e auto-promove cada contribution em intent NLU (label tokenizado → keywords; `delete`/`remove`/`clear` no label → `destructive: true`).
- `builtin-nlu.plugin.ts` — `builtinNluPlugin` opt-in que combina auto-discovery + 2 intents customizados:
  - `create-shape`: keywords PT/EN, slots `shape: enum`, `fill: color`, `width: number`, `height: number`. Dispatcha `InsertNodeCommand(rect|ellipse)` no centro do viewBox.
  - `set-fill`: keywords PT/EN, slot `color: color` obrigatório. Stub honesto (warn) até `SetStyleCommand` aparecer no core — não inventa command improvisado.

**Algoritmo de scoring (adaptive weighting)**:

| Intent declara                | Peso keyword | Bônus action | Bônus slot opcional | Penalidade slot obrigatório |
| ----------------------------- | ------------ | ------------ | ------------------- | --------------------------- |
| Só `keywords`                 | 0.75         | n/a          | n/a                 | n/a                         |
| `keywords` + `actionKeywords` | 0.55         | até +0.25    | n/a                 | n/a                         |
| `keywords` + `slots`          | 0.65         | n/a          | +0.05 cada          | −0.15 cada                  |
| Todos os 3                    | 0.50         | até +0.25    | +0.05 cada          | −0.15 cada                  |

Sort secundário (tiebreaker quando |Δconfidence| ≤ 0.05): `matches.length` desc — intent que captura MAIS componentes do input ganha.

**Garantias verificadas**: 1138/1138 specs (1049 anteriores + 89 novos), 6 entry points build clean, lint clean, D-017 headless preservado (NLU sem Material/CDK).

### Decisão de não fazer agora

- Library ainda está fechando funcionalidades base (Fase 6c restante: 6d EffectRegistry, 6e ScriptRuntime); priorizar o core fundamentado.
- Sem demanda explícita de usuário real ainda — registrar como pendente é o suficiente.
- Quando reabrir: começar **sempre pela Fase 1** (rule-based) — entrega valor imediato, prova o contrato `NaturalLanguageService`, e Fase 2/3 reaproveitam o mesmo API.

### Quando reabrir

- Demanda explícita de consumer (Mosaicoo, third-party) por command palette / voice
- Mosaicoo entrar em modo acessibilidade explícito
- Atingir nível de maturidade onde o catálogo de intents auto-descobertos do `MenuContributionRegistry` cobrir comandos suficientes para validar a Fase 1 standalone

---

## Sprint pós-D-046 — Catchup retroativo de decisões (D-044, D-047 a D-078)

> **Status registral**: este bloco existia como **gap documental** até 2026-05-29
> (auditoria Round 3, item #16). Durante o sprint intensivo de 9 dias entre
> 2026-05-21 e 2026-05-29, ~35 decisões D-XXX foram implementadas e shipadas
> sem que cada uma ganhasse seção dedicada neste doc. **O histórico narrativo
> completo** (com contexto + commits + diffs por feature) já vivia em
> `docs/08-historico-de-alteracoes.md` desde o momento de cada entrega — esta
> seção é a **trilha de auditoria oficial** que cross-referencia cada decisão
> ao seu commit e à entrada narrativa correspondente.
>
> **Formato**: tabela-índice cobrindo todas as 35 decisões + seções completas
> para as 6 decisões de maior peso arquitetural (D-047, D-048, D-072, D-073,
> D-074, D-077). As demais ganham linha na tabela apontando para `docs/08` —
> conforme o protocolo "auditar antes de agir" (cada linha tem evidência
> rastreável). Enriquecer as 29 entradas restantes com seção completa fica
> como pendência catalogada (#16 sub-tarefa) para sessões futuras.
>
> **Por que não enriquecer tudo agora**: escrever 29 seções com rationale
> retrocessivo carrega risco real de hallucinação (assumir motivações que não
> foram declaradas no momento da decisão). A entrada narrativa em `docs/08`
> tem a melhor evidência disponível porque foi escrita junto com o commit.

### Índice — todas as decisões D-044 até D-078 (com cross-refs)

| ID         | Título curto                                                                         | Status            | Commit    | Doc 08 entrada            | Seção completa abaixo? |
| ---------- | ------------------------------------------------------------------------------------ | ----------------- | --------- | ------------------------- | :--------------------: |
| **D-044**  | Built-in menu plugins (edit + ui) + Material dialogs com opener centralizado         | ✅ Aceito + impl  | `868dea7` | §2026-05-20               |           —            |
| **D-047**  | Effects ecosystem — `EffectRegistry` + 19 builtin effects + chain editor             | ✅ Aceito + impl  | `d3900d9` | §2026-05-23               |        **sim**         |
| **D-048**  | Libraries ecosystem — `LibraryRegistry<T>` genérico + 9 catálogos                    | ✅ Aceito + impl  | `6609b65` | §2026-05-23               |        **sim**         |
| **D-049**  | Composição/Recorte — `clipPath` / `mask` / `blend modes`                             | ✅ Aceito + impl  | `3a20768` | §2026-05-23               |           —            |
| **D-050**  | Tools faltantes — Eyedropper / Knife / Smooth / Gradient / Width                     | ✅ Aceito + impl  | `3a20768` | §2026-05-23               |           —            |
| **D-051**  | Tema/UX polish — `<select>` nativo → Material `<mat-select>`                         | ✅ Aceito + impl  | `3a20768` | §2026-05-23               |           —            |
| **D-052**  | Menu Insert/Inserir — submenu de shapes padrão Figma/PowerPoint                      | ✅ Aceito + impl  | `4e61583` | §2026-05-23               |           —            |
| **D-053**  | Edição avançada (text) — Variable Fonts + OpenType + Text on Path                    | ✅ Aceito + impl  | `9f312a1` | §2026-05-23               |           —            |
| **D-054**  | Compound Paths explícitos (commands `Make`/`Release`)                                | ✅ Aceito + impl  | `9f312a1` | §2026-05-23               |           —            |
| **D-055**  | Live Corners — `cornerRadius` opcional + `roundPathCorners` geometry                 | ✅ Aceito + impl  | `9f312a1` | §2026-05-23               |           —            |
| **D-056**  | Boolean Live (non-destructive) — `Make/Refresh/Release LiveBooleanCommand`           | ✅ Aceito + impl  | `9f312a1` | §2026-05-23               |           —            |
| **D-057**  | Auto-trace — documentado como deferido (depois impl. D-062d)                         | ✅ Decisão tomada | `9f312a1` | §2026-05-23               |           —            |
| **D-058**  | Gradient inline editor — panel no Inspector + overlay handles arrastáveis            | ✅ Aceito + impl  | `b4fdfee` | §2026-05-24               |           —            |
| **D-059**  | Symbol Library master/instance — `SymbolUseNode` no union `SvgNode`                  | ✅ Aceito + impl  | `b699105` | §2026-05-24               |           —            |
| **D-060**  | Brush Library — Pencil tool consumption + path expansion algorithm                   | ✅ Aceito + impl  | `b699105` | §2026-05-24               |           —            |
| **D-061**  | `<svge-panel-group>` reutilizável (tabs com 4-side placement)                        | ✅ Aceito + impl  | `70d61b1` | §2026-05-24               |           —            |
| **D-062a** | Symbol Sprayer real (substituindo stub)                                              | ✅ Aceito + impl  | `e9cec42` | §2026-05-24               |           —            |
| **D-062b** | Width Tool real (stroke profile expansion)                                           | ✅ Aceito + impl  | `e9cec42` | §2026-05-24               |           —            |
| **D-062c** | Mesh Tool aproximada (radial 4-stop) — depois REMOVIDA em D-062-fix                  | ⏪ Revertido      | `1d84897` | §2026-05-24 + §2026-05-25 |           —            |
| **D-062d** | Auto-trace básico (marching squares)                                                 | ✅ Aceito + impl  | `1d84897` | §2026-05-24               |           —            |
| **D-063**  | Symbol Sprayer live preview overlay + active-defs scoping                            | ✅ Aceito + impl  | `9924c19` | §2026-05-25               |           —            |
| **D-064**  | Centralizar Undo/Redo/Zoom no slot `toolbar.main` (remover hardcoded)                | ✅ Aceito + impl  | `e1efd52` | §2026-05-25               |           —            |
| **D-065**  | Align/Distribute/Pathfinder submenus completos no menu Object                        | ✅ Aceito + impl  | `3a6ff89` | §2026-05-25               |           —            |
| **D-066**  | Auto-trace polish — dialog UI-side + `TraceProgressService` scoped                   | ✅ Aceito + impl  | `185babf` | §2026-05-25               |           —            |
| **D-068**  | Inspector Type section + fix renderer/exporter emit `id` em paths                    | ✅ Aceito + impl  | `84e9e9d` | §2026-05-26               |           —            |
| **D-069**  | Typography controls — 7 controles novos + 3 campos novos em `TextNode`               | ✅ Aceito + impl  | `52e42db` | §2026-05-26               |           —            |
| **D-070**  | Find & Replace — `FindReplaceService` + `SetPropertyOnManyCommand` + dialog          | ✅ Aceito + impl  | `a3e3f8f` | §2026-05-26               |           —            |
| **D-071**  | Batch operations + Select Same — `SelectSameService` + comandos batch                | ✅ Aceito + impl  | `9177797` | §2026-05-26               |           —            |
| **D-072**  | Logical Layers — `isLayer` helper + commands + persistence híbrida via `<title>`     | ✅ Aceito + impl  | `5953521` | §2026-05-26               |        **sim**         |
| **D-073**  | History Snapshots — `SnapshotsService` + `isDestructive` marker + auto-snapshot      | ✅ Aceito + impl  | `a46a0e0` | §2026-05-26               |        **sim**         |
| **D-074**  | Smart Objects — `MakeSmartObject` + 3 commands + IO round-trip via metadata          | ✅ Aceito + impl  | `072ff22` | §2026-05-26               |        **sim**         |
| **D-076**  | Inspector Smart Object section — icon + name + child count + actions                 | ✅ Aceito + impl  | `a47d28c` | §2026-05-26               |           —            |
| **D-077**  | Asset Export panel — `ExportSlot` interface + `AssetExportRegistry` + panel          | ✅ Aceito + impl  | `a47d28c` | §2026-05-26               |        **sim**         |
| **D-078**  | Properties Panel em tabs (Geometry/Type/Transform/Align/Arrange) + `FlipNodeCommand` | ✅ Aceito + impl  | `8cba0b4` | §2026-05-26               |           —            |

**Convenção de cross-ref**: a coluna "Doc 08 entrada" referencia o cabeçalho
`## YYYY-MM-DD —` da entrada narrativa correspondente. Exemplo: §2026-05-23
significa "consultar a entrada de 2026-05-23 em `docs/08-historico-de-alteracoes.md`".

**Por que algumas linhas têm seção completa abaixo e outras não**: prioridade
arquitetural. As 6 com seção completa (D-047, D-048, D-072, D-073, D-074, D-077)
estabelecem padrões reutilizáveis (registries, marker interface, IO round-trip
via metadata, scope-only services persistentes) que afetam decisões futuras.
As outras 29 são entregas em cima desses padrões — seu rationale fica natural
nas entradas narrativas onde foi documentado no momento da decisão.

---

### D-047 — Effects ecosystem (`EffectRegistry` + 19 builtin + chain editor)

- **Data**: 2026-05-23
- **Commit**: `d3900d9` ("D-047 effects ecosystem")
- **Status**: ✅ Aceito — implementado em 4 fases
- **Sucessor de**: D-023 categoria 7 (Effects) — antes apenas reservada

**Contexto.** O `<svge-effects-panel>` (D-048-pre) já tinha hooks pra aplicar
filtros SVG no nó selecionado, mas faltava: (a) catálogo extensível de effects
built-in via plugin system (D-020); (b) UI pra encadear múltiplos effects;
(c) infraestrutura de active-effects scoped (cada editor mantém seu próprio
filter chain sem vazamento entre instâncias D-042).

**Decisão.**

1. **`EffectRegistry`** em `svg-engine/edit/lib/effect/effect-registry.service.ts:41`
   (`providedIn: 'root'`) seguindo o padrão signal-backed dos outros registries
   (Tool/Menu/Shortcut/Palette). API: `register(effect): Disposable`, `get(id)`,
   `effects()` signal.
2. **15 builtin single-filter effects** + **4 chained presets** (totalizando 19)
   no `builtinEffectsPlugin` — categorias: shadow (drop-shadow, inner-shadow, glow),
   color (brightness, contrast, saturate, hue-rotate, grayscale, sepia, invert),
   blur, blend (multiply, overlay), opacity, color-matrix custom.
3. **Chain editor** dentro do `<svge-effects-panel>` — drag-drop reorder, enable
   toggle por effect, parameter inputs por tipo (sliders / color pickers /
   number inputs conforme schema do effect).
4. **`ChainFilterRegistry` scoped** (exceção entre registries — está no scope
   provider D-042 porque deriva do documento e cada editor tem o seu) para
   manter o filter chain ativo por nó.

**Consequências positivas.**

- Effects viram extensíveis: plugin de terceiros pode `register()` filtros
  custom seguindo o mesmo schema dos built-in
- Chain editor entrega edição visual de filter pipelines complexos sem precisar
  editar SVG `<filter>` markup à mão
- `ChainFilterRegistry` scoped garante que um editor não "vê" effects ativos
  em outro editor da mesma página

**Consequências negativas.**

- `<svge-effects-panel>` ficou complexo (~470 linhas) — débito de spec
  dedicado registrado no audit log (item #14)
- Built-in count cresceu: 19 effects é muito para um catálogo "minimal";
  consumers que querem listas curtas precisam filtrar pelo `id`

---

### D-048 — Libraries ecosystem (`LibraryRegistry<T>` genérico + 9 catálogos)

- **Data**: 2026-05-23
- **Commit**: `6609b65` ("D-048 Libraries ecosystem")
- **Status**: ✅ Aceito — fundação + 9 sub-libraries
- **Padrão estabelecido**: registry genérico reutilizado por todos os catálogos

**Contexto.** Até D-047, cada catálogo de assets (shapes, palettes, gradients,
patterns, etc.) seria implementado ad-hoc. Para evitar 9 implementações
divergentes de "registrar item + filtrar por categoria + signal-back", criamos
**um pattern único** que serve para qualquer "biblioteca de items tipados".

**Decisão.**

1. **`LibraryRegistry<T extends LibraryItem>`** classe abstract base em
   `library/library-registry.ts:36`. Generic em `T` para preservar type-narrowing
   por catálogo. API uniforme: `register(item)`, `get(id)`, `update(id, patch)`,
   `byCategory(cat)`, `categories()`, `items()` signal.
2. **9 catálogos concretos** estendendo a base, cada um em diretório próprio
   sob `edit/lib/library/`:
   - `ShapeLibraryService` (12 builtin shapes)
   - `PaletteRegistry` (já existia desde D-023, alinhado ao mesmo shape)
   - `GraphicStyleLibraryService` (6 presets, apply-1-click)
   - `GradientLibraryService` (com `ActiveGradientsService` scoped)
   - `PatternLibraryService` (5 builtin + defs injection)
   - `TemplateLibraryService` (4 builtin documents)
   - `ClipPathLibraryService` + `MaskLibraryService` (D-049 follow-up)
   - `BrushLibraryService` (D-060 follow-up)
   - `SymbolLibraryService` (D-059 follow-up)
3. **`ActiveDefsService` composer** que injeta os 5 active-defs services
   (gradients/patterns/clip-paths/masks/symbols), permitindo o `<svge-renderer>`
   consumir todos os defs ativos do documento numa chamada só.
4. **`<svge-libraries-panel>`** com 6 tabs (D-061-pré) mostrando as bibliotecas
   no editor.

**Consequências positivas.**

- Adicionar uma 10ª biblioteca é trivial — estender `LibraryRegistry<T>`,
  registrar via plugin, criar tab no panel
- Behavior consistente entre todos os catálogos (cli, signals, filtragem)
- Catálogos root (singleton global) + active-defs scoped (per-editor) — separação
  natural entre "catálogo da library" e "estado do documento atual"

**Consequências negativas.**

- 9 services concretos + 5 active-defs + composer = 15 classes só pra Libraries,
  contribuindo para o crescimento de `edit/` (49 services total — audit Round 3)
- Pattern abstrato exige internalização: consumer escrevendo a 10ª library
  precisa entender `LibraryRegistry<T>` + a convenção de active-defs

---

### D-072 — Logical Layers via `GroupNode` metadata flag

- **Data**: 2026-05-26
- **Commits**: `5953521` (main) + `ecb469b` (D-072g follow-up: persistência via `<title>`)
- **Status**: ✅ Aceito — implementado + persistência iterada 2 vezes (D-072g-v2)
- **Padrão estabelecido**: GroupNode + flag de metadata para "tipo lógico"

**Contexto.** Illustrator/Affinity têm "Layers" como conceito separado dos
groups, com restrições (só top-level, drag-drop com regras, ícone distinto).
Não queríamos um tipo de nó novo no union `SvgNode` (`LayerNode`) — isso
quebraria invariantes do D-058 (compactação do modelo). Solução: layers são
**GroupNodes flaggeados** via metadata.

**Decisão.**

1. **Flag `svgeKind = 'layer'`** em `core/model/layer.ts:38`. Slot único
   `metadata.customData.svgeKind` — mesmo slot que SmartObject (D-074) e Page
   (D-079) usarão depois, sempre mutuamente exclusivo.
2. **Helpers em `core/model/layer.ts`**: `isLayer(node)`, `withLayerFlag(group)`,
   `withoutLayerFlag(group)`.
3. **3 commands**: `MakeLayerCommand`, `UnmakeLayerCommand`, `CreateLayerCommand`
   (factory que cria um group já com a flag).
4. **UI distinction** no `<svge-layers-panel>`: ícone diferente (folha vs
   pasta para group regular), classe CSS `.is-layer`.
5. **Drag/drop validation**: layers só podem ficar em top-level — qualquer
   tentativa de dragar pra dentro de outro group falha em `MoveNodeInTreeCommand`.
6. **Persistência IO**: 3 iterações
   - **v1** (rejeitada): `data-svge-kind="layer"` no SVG → polui markup
   - **v2** (rejeitada após pequeno tempo): id slug + `<inkscape:label>` → falha de
     interop entre editores externos
   - **v3 (final, D-072g-v2)**: persiste via `<title>` element dentro do group,
     parseado pelo importer + serializado pelo exporter. Convenção mais
     compatível com viewers SVG e Inkscape.

**Consequências positivas.**

- Zero modelo novo — union `SvgNode` continua com 9 tipos (D-059 depois
  acrescenta o 10º, `SymbolUseNode`, num caso onde GroupNode-com-flag não
  servia)
- Round-trip SVG-→-modelo-→-SVG preserva o "tipo lógico" via `<title>`
- Pattern reaproveitado por D-074 (SmartObject) e D-079 (Page) — 3 kinds
  totalmente compatíveis no mesmo slot

**Consequências negativas.**

- Layer != GroupNode no comportamento (drag-drop restringido), mas é no shape
  → consumer pode confundir; mitigado pelo helper `isLayer()` óbvio
- 3 iterações de persistência custaram trabalho — lição: validar interop
  contra Inkscape/Illustrator antes de commitar formato de persistência

---

### D-073 — History Snapshots + `Command.isDestructive` marker + auto-snapshot interceptor

- **Data**: 2026-05-26
- **Commits**: `a46a0e0` (main) + `e7dc789` (D-073-fix snap controls)
- **Status**: ✅ Aceito — `SnapshotsService` + persistência + auto-snapshot wireado
- **Padrão estabelecido**: marker interface boolean em command para gate de comportamento

**Contexto.** O `HistoryService` (D-002) cobre undo/redo de mutações via
commands, mas não cobre "recuperar de uma operação destrutiva que limpa o
buffer de undo" (ex: deletar última página, rasterize smart object — após
isso, undo não desfaz porque a operação envolve perda estrutural).
Precisávamos de um buffer de **snapshots** (estado completo do documento)
separado do undo stack, com auto-captura antes de operações destrutivas.

**Decisão.**

1. **`SnapshotsService` em core** (`core/snapshots/snapshots.service.ts:35`).
   Per-editor scope (D-042) — `@Injectable()` simples, **não** `providedIn: 'root'`.
   Mantém ring buffer de N snapshots (default 10).
2. **`Snapshot` interface**: `{ id, label, source: 'manual' | 'auto-open' |
'auto-destructive' | 'auto-restore', doc, thumbnail?, createdAt }`.
3. **Marker `Command.isDestructive: boolean`**. Comandos que destroem
   estrutura recuperável via undo declaram `readonly isDestructive = true`.
4. **Auto-snapshot interceptor em `CommandBus`** (`command-bus.service.ts:82-91`):
   antes de executar, lê `command.isDestructive === true` + `snaps.limits()
.autoOnDestructive === true` (default `false` — **double opt-in**), e dispara
   `snaps.take(source: 'auto-destructive')`.
5. **`RestoreSnapshotCommand`** undoable (declara explicitamente
   `isDestructive = false` para não disparar nova snapshot em loop).
6. **`SnapshotsPersistenceService` em `edit`** (scope-only): localStorage
   round-trip schema-versioned, token `SNAPSHOTS_STORAGE_KEY` para
   multi-editor.
7. **`<svge-snapshots-panel>`** em UI + menu entries + atalhos (Ctrl+Shift+S
   Take, Ctrl+Alt+Z Restore Last).

**Consequências positivas.**

- Operações destrutivas (DeletePage, BatchConvertToPath, Pathfinder ops)
  ganham "buffer de recuperação" automático sem wire-up por call-site
- Double opt-in (`isDestructive` + `autoOnDestructive`) evita capturas em
  excesso por consumers conservadores
- Pattern do marker interface reaplica para outras dimensões futuras
  (ex: `isExpensive` para batch ops que precisam de progress dialog)

**Consequências negativas.**

- **6 comandos candidatos a `isDestructive` ainda não marcados**: Ungroup,
  Knife, MakeLiveBoolean, MakeCompoundPath, MakeSmartObject,
  RasterizeSmartObject (registrado como audit item #7 — pendência)
- snapshot do documento inteiro pode ser caro em docs grandes (~MB);
  consumers conservadores podem manter `autoOnDestructive = false` (default)
  e usar snapshots manuais apenas

---

### D-074 — Smart Objects via `GroupNode` metadata flag + IO round-trip

- **Data**: 2026-05-26
- **Commit**: `072ff22`
- **Status**: ✅ Aceito — 4 commands + IO round-trip + edit-in-place dialog
- **Reaplica padrão**: kind flag em metadata (mesmo slot que D-072 Layer)

**Contexto.** Photoshop/Illustrator "Smart Objects" são instâncias editáveis
de um sub-documento — você pode editar o conteúdo isoladamente sem afetar
posição/escala do container. Decisão paralela ao D-072 (Layer): não criar
tipo novo no union, usar GroupNode flagged.

**Decisão.**

1. **Flag `svgeKind = 'smart-object'`** em `core/model/smart-object.ts:57`.
   Mesmo slot mutuamente exclusivo com Layer e Page.
2. **4 commands**:
   - `MakeSmartObjectCommand` — wrap a seleção em um GroupNode com a flag
   - `EditSmartObjectContentsCommand` — abre dialog para edição isolada do
     SVG interno (consumer-side rendering, edita string SVG)
   - `ReplaceSmartObjectContentsCommand` — substitui o `d` markup interno
     (estende Edit, usado pelo dialog)
   - `RasterizeSmartObjectCommand` — converte para `<image>` PNG embedded
     (destrutivo, perdesão editabilidade)
3. **IO round-trip via `data-svge-kind="smart-object"` attribute** no SVG
   exportado. **Diferente do D-072 que escolheu `<title>`** porque smart
   object precisa preservar SVG markup interno verbatim (não cabe num `<title>`).
4. **`<svge-smart-object-editor-dialog>`** em UI (D-074f) — textarea para SVG
   markup interno, com preview.
5. **Layers Panel ícone distinto + accent color** para distinguir visualmente.

**Consequências positivas.**

- Pattern do kind flag prova generalidade — D-079 (Page) reaplica logo depois
- IO round-trip funciona em viewers terceiros (vê smart object como group
  normal com metadata custom; abre editado preserva a marcação)
- Edit-in-place via dialog mantém o consumer sem precisar mexer no modelo
  diretamente

**Consequências negativas.**

- `RasterizeSmartObjectCommand` é destrutivo mas **não marca `isDestructive`**
  (audit item #7 — pendência)
- Edit via textarea SVG é low-fi — usuário precisa entender SVG markup
  (debit: editor visual de smart object contents fica para futuro)
- IO format `data-svge-kind` é proprietary — não-svgengine viewers ignoram
  (aceitável: degradação graciosa)

---

### D-077 — Asset Export panel via `ExportSlot` interface + `AssetExportRegistry`

- **Data**: 2026-05-26
- **Commit**: `a47d28c`
- **Status**: ✅ Aceito — registry + runner + panel + (depois) persistência
- **Sucessor de**: D-023 follow-up "Export with Options dialog" (audit Round 1 #5,
  considerado OBSOLETO porque este Asset Export Panel cobre o use-case completo)

**Contexto.** Single export ad-hoc via menu File → Export é um modelo de
"one-shot": cada export é uma escolha completa de formato/scale/target. Para
fluxos profissionais (preparar assets para web/mobile/print simultâneo) o
padrão de mercado (Sketch, Figma) é o "export presets" persistente: usuário
declara `[{name: 'logo @2x', exporterId: 'png', scale: 2}, ...]` e dispara
"export all" quando quer.

**Decisão.**

1. **`ExportSlot` interface** em core: `{ id, target: 'document' | nodeId,
exporterId: string, scale?: number, filename: string, options?: any }`.
   `target='document'` significa "exporta o documento inteiro"; um nodeId
   exporta só a sub-árvore daquele nó.
2. **`AssetExportRegistry`** (scoped via D-042) gerencia a lista de slots
   per-editor: `add`, `update`, `remove`, `setAll`, `slots()` signal.
3. **`AssetExportRunner`** (também scoped): coordena a execução `exportAll()`
   — resolve cada slot ao `Exporter` correspondente via `ExporterRegistry`,
   renderiza, e dispara download (ou callback configurável).
4. **`<svge-asset-export-panel>`** em UI: lista de slots, add/edit/remove,
   botão "Export all". Cada slot mostra preview com exporter resolvido.
5. **Persistência (entregue retroativamente em 2026-05-29, autonomous round 2)**:
   `AssetExportPersistenceService` espelhando o pattern do D-073 — token
   `ASSET_EXPORT_STORAGE_KEY`, schema v1, debounce 500ms. Auto-hidrate no
   constructor.

**Consequências positivas.**

- Workflow "preparar 10 assets pra web + mobile" não exige 10 cliques de File
  → Export — slots ficam configurados e "export all" gera tudo
- Persistência preserva slots entre sessões (audit Round 1 item #1 fechado)
- Cada slot referencia `exporterId` — qualquer exporter customizado registrado
  via plugin (cat 5 do D-023) automaticamente aparece como opção

**Consequências negativas.**

- 3 services scoped (Registry + Runner + Persistence) por editor — overhead
  de DI inicial
- "Export all" é síncrono — docs muito grandes (~16k nodes) podem travar UI
  brevemente (mitigação: cada exporter pode ser async, mas Runner ainda
  serializa)
- UI do panel ainda não permite reorder de slots (débito UX)

---

### Pendência catalogada — enriquecer as 29 entradas restantes

Itens **D-044, D-049-D-066, D-068-D-071, D-076, D-078** ficam com **linha
de cross-ref na tabela** acima como trilha de auditoria mínima. Cada um tem
narrativa completa em `docs/08-historico-de-alteracoes.md` (com contexto +
diffs no momento da decisão, escrita junto com o commit).

**Quando enriquecer** (registrado como sub-tarefa de audit item #16):

- Quando alguma dessas decisões for revisitada (refactor, supersedure, bug
  estrutural) — o turno de revisão é o melhor momento para escrever a entrada
  completa porque o autor já está lendo o código com o protocolo "auditar
  antes de agir".
- Não escrever entradas completas retroativamente "só pra ter" — o risco de
  hallucination é real (assumir motivações que não foram declaradas) e o
  valor marginal pequeno (a narrativa em `docs/08` já cobre o "o quê" e
  "por quê" minimamente).

---

## D-079 — Pages / Artboards via GroupNode metadata flag

**Status**: ✅ Aceito — implementado em PAGES-A→E (2026-05-26/27)

### Contexto

A lista original de 20 features (bootstrap, seção 10) cobria "Camadas"
mas não Pages/Artboards explicitamente. Editores profissionais
(Illustrator, Figma, Affinity) tratam pages/frames/artboards como
contêineres top-level com viewBox próprio — permite múltiplas variantes
de logo, mockups multi-tela, batch export de assets.

### Alternativas consideradas

**A — Mudar `SvgDocument` para `pages[]`**: refatoração estrutural do
model. Quebraria centenas de arquivos (Inspector, Renderer, tools,
IO, ~1660 testes precisariam de ajuste). Custo enorme + risco alto.

**B — Página como `<svg>` aninhado (compound document)**: válido SVG,
mas Renderer atual não trata `<svg>` recursivo. Mudança significativa
no Renderer + complexidade no parser/serializer.

**C — Página = `GroupNode` flagado com `metadata.customData.svgeKind = 'page'`**
(escolhido): zero alteração no model. Pages viram first-class no
Layers Panel automaticamente. Reaproveitamento total do pattern já
aplicado em D-072 (Layer) e D-074 (Smart Object) — mesmo slot
`svgeKind` documentado como genérico para "future group-like
concepts".

### Decisão

**Adotar abordagem C.** Pages são `GroupNode` com:

- `metadata.customData.svgeKind === 'page'` (single-slot kind)
- `metadata.customData.svgePageViewBox = {x,y,width,height}` (viewBox próprio)
- `metadata.customData.svgePageName?: string` (nome opcional, fallback `metadata.name`)

### Implementação

Entregue em 5 fases (PAGES-A→E):

- **PAGES-A** (`796a301`): core helpers (`isPage`, `getPageViewBox`,
  `getPageName`, `withPageFlag`, `withoutPageFlag`, `withPageViewBox`,
  `withPageName`) + 4 commands (`CreatePageCommand`,
  `DeletePageCommand`, `RenamePageCommand`, `ResizePageCommand`).
  +34 specs.
- **PAGES-B** (`4f9fcdd`): `PagesService` (derived list) +
  `ActivePageService` (signal activePageId + auto-recovery effect)
  per-editor scope (D-042). +10 specs.
- **PAGES-C** (`e5d1b13`): `<svge-pages-panel>` (browser-tab style
  UI) + wire no shell-pro (nova grid row + override de
  resolvedTree/ViewBox via ActivePageService.treeForRendering /
  viewBoxForRendering). +10 specs.
- **PAGES-D** (`4964c08`): svg-exporter emite `data-svge-kind="page"`
  - `data-svge-page-viewbox`; svg-importer parseia ambos.
    Inspector ganha tab "Page" condicional com nome editável +
    viewBox 2×2 grid + delete action. +7 specs.
- **PAGES-E**: doc-catchup (este arquivo + 05 roadmap + 08
  histórico) + verificação final + push.

**Total**: 5 commits, +61 specs novos, zero regressão em qualquer
fase. Suite saiu de 1672 (pré-PAGES) para 1733 passing / 1 skipped.

### Consequências

**Positivas**:

- Back-compat 100%: docs sem pages renderizam idênticos ao
  comportamento pré-D-079 (renderer cai no `document.root` quando
  `activePageId === null`).
- Pages aparecem no Layers Panel automaticamente (são groups).
- Layer Panel drag-drop, lock, visibility — tudo funciona sem
  código novo, herdou de D-072.
- Round-trip SVG → re-import preserva pages mesmo via editores
  terceiros (data-attrs são preservados por Inkscape/Illustrator/
  Figma).
- 4 commands undoable via `CommandBus` padrão.
- `<svge-pages-panel>` auto-hide em docs single-root (sem zeropage
  state visível).

**Negativas / limitações**:

- Multi-page export via UI usa página ativa apenas; export
  multi-page completo requer plugin custom (slot pattern já
  existe via `AssetExportRegistry` D-077). Deferido para
  follow-up se houver demanda.
- Reorder de tabs via drag-drop deferido pra v2 (model já
  suporta, UX da DnD precisa wire CDK).
- Pages não suportam transform próprio diferente do GroupNode
  (herdam comportamento — é uma feature, não bug).

---

## D-080 — Pages como camada contextual (PAGES-REFACTOR, Fases 1-9)

**Status**: ✅ Aceito — implementado em PAGES-REFACTOR Fases 1-9 (2026-05-27)

### Contexto

Pós PAGES-A→E (D-079), a auditoria técnica do sistema de Pages
revelou três sintomas de complexidade arquitetural espalhada:

1. **3 P0 regressions** (Symbol Sprayer, Auto-trace, NLU) — cada nova
   ferramenta que dispatchava `InsertNodeCommand` esquecia de
   resolver o parent via `ActivePageService.effectiveDrawTargetId()`,
   inserindo shapes como SIBLINGS da página em vez de filhos.
   Padrão clássico de "todo plugin precisa lembrar de algo".
2. **Sobreposição visual** entre `WorkspaceService.PageConfig` legacy
   (paper rect via `pageBoundsIn`) e D-079 Page ativa (viewBox próprio
   via `getPageViewBox`) — em docs multi-página, dois "papers"
   diferentes apareciam ao mesmo tempo.
3. **Hit-target rect** (PAGES-FIX-4) dentro do `<g>` da página
   provocava flicker visível ao trocar seleção (Angular re-mount).

O usuário pediu uma refatoração que tratasse Pages como uma
**camada contextual** — quando ativa, dirige o comportamento; quando
ausente, o editor funciona como pré-D-079. Vez de espalhar
"if (pageActive)" por todo lado.

### Decisão

Tratar Pages como uma **layer arquitetural transversal** que se
plugga em pontos centralizados, não em cada call-site. Três pivots
estruturais:

1. **Interceptor no `CommandBus`** (Fase 1): novo
   `InsertParentResolver` injection token. CommandBus consulta o
   resolver quando `InsertNodeCommand` recebe `parentId: AUTO_PARENT`.
   `ActivePageService` implementa o resolver e retorna a página ativa.
   Net effect: TODA ferramenta que usa `AUTO_PARENT` (8 sítios
   migrados + 3 P0 regressions corrigidos) ganha o page-routing
   automaticamente.
2. **Overlay visual dedicado** (Fases 2/4/6): novo
   `<svge-page-selection-overlay>` substitui o paper rect compartilhado
   por brackets em L + label + move handle + 8 resize handlers. Hit-
   target persistente migra para o `<svge-page-overlay>` (que já está
   no slot `svgeBehind`) eliminando o flicker.
3. **Persistência + recuperação automática** (Fase 7):
   `ACTIVE_PAGE_STORAGE_KEY` mirroring `AUTOSAVE_STORAGE_KEY` pattern;
   `DeletePageCommand.isDestructive = true` ativa auto-snapshot via
   D-073 sem wire-up por entry-point.

### Implementação

Entregue em 9 fases atômicas (cada uma um commit + push):

- **Fase 1** (`4319cb3`): `InsertParentResolver` token + `AUTO_PARENT`
  sentinel + CommandBus interceptor. 3 P0 fixes (Symbol Sprayer,
  Auto-trace, NLU) + 8 call-sites migrados.
- **Fase 2** (`cd34651`): `<svge-page-selection-overlay>` visual
  (brackets + label + handle, `pointer-events: none`).
- **Fase 3** (`7bd1af2`): `PageOptions` (background/margins/
  orientation/format) + `SetPageOptionsCommand` + PageOverlay deriva
  da página ativa (fim do conflito visual).
- **Fase 4** (`d868e7c`): Hit-target persistente no PageOverlay
  (fim do flicker — single source of truth para click-on-empty-page).
- **Fase 5** (`a3362eb`): Paridade `<svge-editor>` ↔ `<svge-shell-pro>`
  (PageSelectionOverlay + opt-in Pages strip + opt-in bootstrap +
  resolvedTree/ViewBox delegam a ActivePageService).
- **Fase 6** (`12e2473`): Resize via 8 handlers + move via handle
  interativo + `MovePageCommand`.
- **Fase 7** (`4d23e8d`): Persistência activePageId + auto-snapshot
  pré-Delete + selection clear no page switch.
- **Fase 8** (`7b04e04`): Inspector Page tab estendido (background/
  margins/format/orientation via `SetPageOptionsCommand`).
- **Fase 9**: Cleanup + doc-catchup (este D-080 + ajustes 06/09 +
  wrap-up no 08) + validação final.

**Total**: 9 commits, +60+ specs novos, suite saiu de 1733 (pós
PAGES-E) para 1792+ passing. Zero regressão em nenhuma fase.

### Consequências

**Positivas**:

- Zero per-plugin wire-up para page-routing: tudo passa pelo
  `CommandBus` interceptor. Adicionar uma nova tool é uma linha
  (`new InsertNodeCommand(AUTO_PARENT, node)`) e ela já desenha
  na página ativa.
- Editor sem páginas (legacy single-root) renderiza idêntico ao
  pré-D-079 — ActivePageService.treeForRendering / viewBoxForRendering
  caem de volta automaticamente.
- Visual de página é distinto de visual de shape (brackets em L vs
  handles quadrados) — usuário enxerga "isto é um artboard, não um
  objeto" sem ler legenda.
- Persistência cross-reload — usuário não perde memória de qual
  página estava editando.
- Inspector Page tab é o único lugar de edição de page properties
  (não 3 dialogs diferentes) — ergonomia padrão Figma/Affinity.

**Negativas / limitações**:

- `WorkspaceService.PageConfig` legacy permanece no código para
  back-compat com docs pré-D-079 + Workspace Settings dialog
  (PRO-GAP G1). Não é fonte de erro: a fonte de verdade do "paper"
  na UI é o `ActivePageService.activePage()` quando há página
  ativa; fallback automático para o legacy quando não há.
- Move handle no overlay translada o `viewBox.x/y` da página, mas o
  conteúdo continua nas coords originais (renderer mostra o
  "novo recorte" da página). Comportamento idêntico ao "Move
  Artboard with Content" desligado no Illustrator. Modo "with
  content" seria uma flag futura.
- Live preview do conteúdo durante drag de resize/move foi adiado
  (Fase 6 entrega preview-only via brackets/handles, conteúdo só
  salta no pointerup). Comprimisso: undo stack limpo (1 drag =
  1 entrada) vs feedback completamente live. Pode virar plugin
  opcional via gesture service futuro.

---

## D-082 — Animation Timeline (camada de animação não-destrutiva)

**Status**: ✅ Aceito + **MVP implementado** (F0–F8) — registrado 2026-06-03,
implementado 2026-06-03 (commits `17eefcb` → `f23f519`). Export animado e
path-`d` morph permanecem **adiados** (F9+, fora do MVP).

### Contexto

O usuário pediu uma **timeline de animação** (termo correto de mercado —
_animation timeline_, como After Effects / Adobe Animate / Rive / editores
Lottie): poder animar as propriedades de uma ou mais formas (na verdade
tudo que estiver na **página**), com as propriedades **guiadas pelo shape
selecionado**, definindo **keyframes**, **função de easing**, **tempo**, e
controles de transporte **play/pause/avançar/recuar/seek**.

Restrição central e explícita: **não quebrar o existente**. A animação deve
viver em uma **"camada acima"** — uma sobreposição que lê o documento e
calcula valores no tempo `t`, **sem nunca mutar** o modelo base. É o mesmo
princípio não-destrutivo já validado em D-055 (Live Corners), D-056 (Boolean
Live) e D-074 (Smart Object): o estado autoral é a fonte de verdade; o que se
vê é **derivado**.

### Alternativas consideradas

1. **Mutar o documento a cada frame** (timeline destrutiva). ❌ Rejeitado:
   quebraria undo, autosave, hit-test, export e o princípio não-destrutivo.
2. **Exportar direto para SMIL/CSS/Lottie sem preview interno.** ❌ Rejeitado
   como base: sem feedback de edição não há "timeline" de verdade; export
   vira alvo **opcional** depois.
3. **Camada não-destrutiva derivada (escolhida).** Playhead é um signal; um
   `computed` deriva a "árvore animada em `t`" e alimenta o renderer. Em `t`
   parado e sem tracks, a árvore animada **é** a base (identidade) → render,
   hit-test, overlays e export idênticos ao editor atual.

### Decisão (arquitetura "camada acima")

A animação é uma **layer não-destrutiva**. Pilares e onde cada peça mora
(reusando o que já existe — sem reinventar):

1. **Modelo (core, puro/headless)** — `AnimationDoc`: lista de _tracks_ por
   `(nodeId, propertyPath)` → `keyframes[] { time, value, easing }` +
   `duration`. Mora em `metadata.customData` da **página ativa** (round-trip
   no save/load, igual aos flags de Page/Smart Object). **Não toca** os
   campos do shape.
2. **Interpolação (core, funções puras)** — `sampleAnimation(anim, t)` →
   mapa de overrides `{ nodeId → { prop → value } }`; `applyAnimationToTree(
baseTree, overrides)` → nova árvore com _structural sharing_ (só os nós
   afetados são clonados). Easing = funções puras (linear, ease-in/out,
   cubic-bezier).
3. **Motor (edit, escopado)** — `AnimationService` (CRUD de tracks/keyframes
   via comandos undoable) + `PlaybackService` (`playhead` signal, loop
   `requestAnimationFrame`, play/pause/step/seek/scrub/loop/speed).
   Registrados em `provideSvgEngineEditorScope()` como todo serviço stateful.
4. **Comandos undoable (core/edit)** — `AddKeyframe` / `MoveKeyframe` /
   `RemoveKeyframe` / `SetKeyframeEasing` / `SetTrackDuration` no `CommandBus`
   (Ctrl+Z unificado com o resto).
5. **Preview (shell + render)** — o shell passa `[tree]="animatedTree()"` ao
   `<svge-renderer>`, onde `animatedTree = applyAnimationToTree(baseTree,
sampleAnimation(anim, playhead))`. **Única fiação cross-cutting**, atrás
   de flag.
6. **UI (ui)** — `<svge-timeline>` em dock **inferior**: lista de tracks
   (shapes da página, cada um expandindo nas suas **propriedades animáveis**)
   - régua de tempo + keyframes (losangos) + transporte + scrubber do
     playhead. As "propriedades guiadas pelo shape" reusam o **catálogo de
     props por tipo de nó que o Inspector já conhece** (x/y, w/h, cx/cy/rx/ry,
     opacity, fill/stroke, rotation/scale via `decomposeTransform`).
7. **Plugin (edit)** — `builtinAnimationPlugin` registra serviço + comandos +
   entradas de menu + atalhos via DI (`ctx.injector.get(...)`). Nada
   hardcoded fora do shell.

### Garantias de NÃO quebrar o existente (invariantes da camada)

- O `EditorStateService.document()` **nunca é mutado** pela reprodução —
  só o `playhead` muda; a árvore exibida é derivada.
- Em `playhead = 0` **sem** tracks, `animatedTree() === baseTree`
  (**identidade referencial**) → render/hit-test/overlays/export idênticos
  ao editor de hoje.
- Animação é **opt-in**: sem o plugin instalado e sem o dock montado, o
  editor é **exatamente** o atual. As mudanças no shell ficam atrás de
  `@if`/input (`[showTimeline]`), como `[showRulers]`/Pages.
- Edição normal de shape (mover/escalar/estilo) continua nos comandos
  existentes sobre a base. A timeline só **lê** a base e **grava keyframes**
  via comandos próprios.
- Export padrão (SVG/PNG) continua exportando o **estado base** (em `t`
  corrente). Export **animado** é alvo separado e opcional.

### Plano de fases (cada fase = 1 commit + push, gate build/lint/test verde, zero regressão)

- **F0 — Contrato headless + specs-trava (sem UI)**: tipos `AnimationDoc`,
  `sampleAnimation`, easing puros e `AddKeyframe` no core; specs unitários.
- **F1 — Interpolação + `applyAnimationToTree`** (core puro) + specs:
  **identidade em t0**, lerp numérico, cor, transform (via
  `decomposeTransform`).
- **F2 — `AnimationService` + `PlaybackService`** (escopados) + comandos
  undoable (Add/Move/Remove keyframe, SetEasing, SetDuration) + specs.
- **F3 — Catálogo de propriedades animáveis por tipo de nó** (reusa o
  conhecimento do Inspector) — fonte das linhas da timeline.
- **F4 — `<svge-timeline>` read-only** (ui): render de tracks/keyframes +
  régua + playhead, **sem editar**. Mount opcional no shell (dock inferior
  atrás de `[showTimeline]`, default `false`).
- **F5 — Edição na timeline**: criar/mover/deletar keyframes (drag), escolher
  easing, definir duração; scrubbing do playhead.
- **F6 — Preview no canvas**: shell alimenta `animatedTree()` ao renderer +
  transporte ao vivo (play/pause/step/loop/speed). **Aqui** entra a única
  fiação cross-cutting do shell.
- **F7 — Persistência (metadata/AutoSave) + round-trip** + auto-snapshot
  pré-ação destrutiva (reusa D-073).
- **F8 — Doc-catchup** (06 componentes / 09 API / 10 guia-plugin) +
  validação final + atualização desta decisão para `✅ Aceito + impl`.
- **(Futuro, fora do MVP) F9+** — Export (SMIL `<animate>`/`<animateTransform>`,
  CSS `@keyframes`, Lottie JSON, GIF/vídeo), **path-`d` morph**, curvas de
  easing custom (UI bezier), motion path.

### Decisões em aberto (fechar antes de iniciar F0)

1. **v1 = só preview** no canvas (recomendado) vs já exportar — e **qual
   alvo** (SMIL / CSS / Lottie / vídeo).
2. **Persistência**: no documento (round-trip — recomendado, metadata da
   página) vs só sessão.
3. **Props do v1**: posição/tamanho/opacidade/cor/transform; **adiar**
   path-`d` morph.
4. **Entry point**: reusar `core`/`edit`/`ui` (como Pages/Snapshots —
   recomendado, **sem novo entry point**) vs extrair `svg-engine/animate`
   depois (como o NLU foi extraído em D-...). Reusar evita mexer nos
   specs-trava de "N entry points".
5. **Escopo do timeline = página ativa** (confirmado pelo usuário).

### Consequências

**Positivas**:

- Feature de alto valor (motion design) sobre infra **já existente**
  (signals / commands / scope / não-destrutivo) — pouco código novo
  "estrutural".
- **Zero impacto quando desligada** (identidade em t0 + opt-in).
- Ergonomia padrão de mercado (After Effects / Animate).
- Reaproveita `decomposeTransform`, catálogo do Inspector, AutoSave,
  Snapshots (D-073), `panel-group`, CommandBus/undo.

**Negativas / limitações**:

- Preview ao vivo usa `requestAnimationFrame` → custo de CPU durante o
  play (mitigado: só recomputa os nós com track ativo no `t`).
- **Path-`d` morph adiado** (interpolar formato de path exige normalizar
  contagem de comandos — caro; fora do MVP).
- **Export animado** é outro pipeline (SMIL/CSS/Lottie) — adiado para F9+.
- 1 fiação cross-cutting no shell (`animatedTree` + dock inferior) —
  pequena e atrás de flag, mas é a parte que **não** é "puro plugin"
  (não há registry genérico de dock/painel hoje).
