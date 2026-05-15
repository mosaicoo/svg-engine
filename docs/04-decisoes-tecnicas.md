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

- **Data**: 2026-05-14
- **Status**: Aceita (princípio); implementação em fases
- **Contexto**: Terceiros precisam estender a library (tipos de nó,
  renderers, ferramentas, comandos, painéis). Esclarecimento explícito
  do usuário em 2026-05-14.
- **Decisão**: **Toda decisão de design subsequente prevê ponto de
  extensão** para plugins. Concretamente:
  - `svg-engine/render` (Bloco 2): expõe `NodeRendererRegistry` para
    plugins registrarem renderer de tipos custom.
  - `svg-engine/edit` (Fase 3+): expõe `ToolRegistry` (toolbar) e
    `InspectorPanelRegistry` (painéis customizados).
  - `Command` interface já é extensível (basta implementar).
  - `SvgNode` é discriminated union com `type: string` — terceiros podem
    estender via module augmentation TypeScript ou usando
    `'custom-${id}'` como type discriminator.
- **API de plugin** (esboço, refinada na Fase 5):
  ```typescript
  export interface SvgEnginePlugin {
    readonly id: string;
    readonly version: string;
    install(ctx: PluginContext): void;
    uninstall?(ctx: PluginContext): void;
  }
  ```
- **Consequências**: arquitetura "registry-first" em vez de hard-coded.
  Cada feature da library expõe um registry para o equivalente plugin.

## D-021 — Conceito de Workspace / Prancheta / Página (pendente)

- **Data**: 2026-05-14 (registro)
- **Status**: **PENDENTE** — definir antes da Fase 4
- **Contexto**: Editores profissionais (Figma, Sketch, Affinity, Inkscape)
  têm um conceito de "página" / "frame" / "artboard" / "prancheta" que
  envolve:
  - Tamanho e orientação de página.
  - Background (cor sólida, padrão, imagem, checkerboard de transparência).
  - Margens, grid, guides (linhas-guia).
  - Eventual suporte a múltiplas páginas / artboards.
- **Opções a avaliar**:
  - **A. Estender `SvgDocument`**: adicionar
    `presentation: PresentationSettings` opcional. Simples, mas mistura
    modelo SVG-spec com configuração de UI.
  - **B. Novo conceito `Workspace`**: contém um ou mais `SvgDocument`
    mais metadata de apresentação por documento. Mais flexível, suporta
    multi-page natural.
- **Quando decidir**: até o início da Fase 4 (UI), pois o painel de
  configuração de página vive em `svg-engine/ui`.
- **Quando renderizar background/grid**: o `<svge-renderer>` (Bloco 2)
  intencionalmente **não** desenha background — fica como camada de UI
  por cima ou abaixo do canvas. Plugin / consumidor controla.

---

## Decisões pendentes (em aberto)

| ID provis. | Tema                                                              |
| ---------- | ----------------------------------------------------------------- |
| D-022?     | API formal de plugins (manifesto, install/uninstall, lifecycle)   |
| D-023?     | Versionamento + changelog (changesets / standard-version)         |
| D-024?     | Registry de publicação (npm público / GitHub Packages / Mosaicoo) |
| D-025?     | Estratégia de i18n no editor                                      |
| D-026?     | Migração para zoneless (revisar D-010)                            |
| D-027?     | Lint rule customizada para enforcer headless boundary             |
| D-028?     | Estratégia de testes E2E (Playwright?)                            |
| D-029?     | **Workspace/Página: A vs B** (resolver D-021)                     |
