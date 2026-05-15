# 02 — Arquitetura

## 1. Visão macro

O **SVGEngine** é um **workspace Angular v21** contendo:

- Uma **library** publicável: `svg-engine` (núcleo + UI do editor).
- Uma **aplicação demo** consumidora: `playground` (Angular Material).

## 2. Estrutura real após Fase 1 (2026-05-14)

```
SVGEngine/
├── .claude/
│   ├── CLAUDE.md                  # guia de boas práticas Angular (auto-gerado)
│   ├── launch.json                # config do dev server para preview tools
│   └── settings.json              # restrições do agente (deny rules)
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   ├── mcp.json                   # MCP server do Angular CLI
│   └── tasks.json
├── docs/                          # documentação canônica (01..08)
├── projects/
│   ├── svg-engine/                # library (--prefix=svge)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── svg-engine.ts        # placeholder gerado pelo schematic
│   │   │   │   └── svg-engine.spec.ts
│   │   │   └── public-api.ts            # superfície pública da library
│   │   ├── ng-package.json
│   │   ├── package.json
│   │   ├── tsconfig.lib.json
│   │   ├── tsconfig.lib.prod.json
│   │   └── tsconfig.spec.json
│   └── playground/                # app demo (--prefix=app, --routing, --style=scss)
│       ├── public/                # assets estáticos (favicon, etc.)
│       ├── src/
│       │   ├── app/
│       │   │   ├── app.config.ts        # provedores raiz
│       │   │   ├── app.routes.ts
│       │   │   ├── app.ts
│       │   │   ├── app.html
│       │   │   ├── app.scss
│       │   │   └── app.spec.ts
│       │   ├── index.html               # links Roboto + Material Icons
│       │   ├── main.ts                  # bootstrapApplication
│       │   └── styles.scss              # tema M3 azure-blue + light dark
│       ├── tsconfig.app.json
│       └── tsconfig.spec.json
├── .editorconfig
├── .gitignore
├── .prettierrc
├── angular.json                   # 2 projetos: svg-engine, playground
├── package.json                   # @angular/* @21.2.0, @angular/material @21.x
└── tsconfig.json                  # strict + strictTemplates + flags fortes
```

## 3. Estrutura-alvo da library (a construir)

À medida que as features forem implementadas, `projects/svg-engine/src/lib/`
crescerá segundo a divisão de responsabilidades:

```
src/lib/
├── core/             # modelo de dados, comandos, histórico, serviços
├── canvas/           # componente Canvas SVG (pan/zoom/render)
├── selection/        # serviço + handles + seleção múltipla
├── transform/        # drag/resize/rotate/scale + snap/align
├── layers/           # painel de camadas, agrupamento
├── inspector/        # propriedades do elemento selecionado
├── toolbar/          # barra de ferramentas extensível
├── palette/          # cores, gradientes, paleta de elementos
├── io/               # import/export SVG, sanitização
└── plugins/          # API de plugins/ferramentas extensíveis
```

> Princípio inviolável: **toda feature nasce na library**; a `playground`
> apenas consome via `import { ... } from 'svg-engine'`.

## 2. Camadas internas da library

### 2.1 `core/` — Núcleo independente de UI

- **Modelo**: árvore de nós (`SvgNode`) — tipos como `RectNode`,
  `EllipseNode`, `PathNode`, `GroupNode`, `TextNode`, `ImageNode`.
- **Estado**: `EditorStateService` (signals do Angular como fonte de verdade).
- **Comandos**: pattern Command para mutações (cada ação = comando reversível).
- **Histórico**: `HistoryService` com undo/redo baseado em pilhas de comandos.
- **IDs**: gerador determinístico por sessão (auditável; sem `Math.random`).

### 2.2 `canvas/` — Renderização e viewport

- Componente `<svg-canvas>` que renderiza a árvore via templates Angular
  (não manipulação DOM imperativa, exceto onde necessário por
  performance — registrado caso a caso).
- Pan/zoom via matriz de transformação aplicada no `<svg viewBox>`.
- Camadas de overlay separadas: conteúdo, seleção, handles, snap-guides.

### 2.3 `selection/` + `transform/`

- `SelectionService` mantém set de IDs selecionados.
- `transform/` aplica operações via comandos (sempre passam pelo
  `HistoryService`).

### 2.4 `layers/`, `inspector/`, `toolbar/`, `palette/`

- Componentes Angular Material puros, **sem lógica de negócio inline**:
  consomem serviços de `core/` e despacham comandos.

### 2.5 `io/`

- Import: parser SVG → árvore de `SvgNode` com **sanitização**
  (script/eventos removidos; `xlink:href` validado).
- Export: serialização determinística (mesma entrada → mesma saída byte-a-byte).

### 2.6 `plugins/`

- Interface `EditorPlugin` com hooks (`onInit`, `registerTool`,
  `registerCommand`, `registerInspectorPanel`).
- Carregamento declarativo via `provideSvgEngine({ plugins: [...] })`.

## 3. Princípios arquiteturais

1. **Separação UI ↔ estado**: componentes não mutam estado direto;
   despacham comandos.
2. **Imutabilidade no modelo**: nós são tratados como imutáveis;
   mutações geram nova versão (estrutural sharing onde fizer sentido).
3. **Signals primeiro**: estado reativo via Angular signals; RxJS
   só onde houver necessidade real (eventos do DOM, async).
4. **Standalone components**: sem `NgModule` (Angular moderno).
5. **Tree-shakable**: `public-api.ts` exporta apenas o necessário;
   internos não vazam.
6. **Sem efeitos colaterais no import**: nenhum side-effect em top-level
   de arquivos da library.
7. **Testabilidade**: serviços puros injetáveis; componentes finos.

## 4. Decisões pendentes

- Estratégia de teste (Karma vs Vitest vs Web Test Runner).
- Estratégia de build da library (apenas `ng-packagr` ou customizar).
- Estratégia de versionamento (SemVer + changelog automatizado?).
- Registry de publicação (npm público, GitHub Packages, registry interno).

> Cada decisão acima vira uma entrada em `04-decisoes-tecnicas.md` quando resolvida.
