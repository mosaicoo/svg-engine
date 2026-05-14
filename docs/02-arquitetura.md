# 02 — Arquitetura

## 1. Visão macro

O **SVGEngine** será desenvolvido como um **workspace Angular** contendo:

- Uma **library** publicável: `svg-engine` (núcleo + UI do editor).
- Uma **aplicação demo** consumidora: `playground`.

```
SVGEngine/
├── projects/
│   ├── svg-engine/                   # library (publicável em npm/registry interno)
│   │   ├── src/lib/
│   │   │   ├── core/                 # modelo de dados, comandos, histórico, serviços
│   │   │   ├── canvas/               # componente Canvas SVG (pan/zoom/render)
│   │   │   ├── selection/            # serviço + handles + seleção múltipla
│   │   │   ├── transform/            # drag/resize/rotate/scale + snap/align
│   │   │   ├── layers/               # painel de camadas, agrupamento
│   │   │   ├── inspector/            # propriedades do elemento selecionado
│   │   │   ├── toolbar/              # barra de ferramentas extensível
│   │   │   ├── palette/              # cores, gradientes, paleta de elementos
│   │   │   ├── io/                   # import/export SVG, sanitização
│   │   │   ├── plugins/              # API de plugins/ferramentas extensíveis
│   │   │   └── public-api.ts         # superfície pública da library
│   │   ├── ng-package.json
│   │   ├── package.json
│   │   └── README.md
│   └── playground/                   # app demo (Angular + Angular Material)
│       └── src/app/                  # consome a library svg-engine
├── angular.json
├── tsconfig.json (strict)
├── package.json
├── docs/
└── .claude/
```

> Estrutura final pode ajustar nomes/camadas; o que NÃO muda é o
> princípio: **toda feature nasce na library**, a `playground` apenas
> consome.

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
