# 02 — Arquitetura

## 1. Visão macro

O **SVGEngine** é um **workspace Angular v21** contendo:

- Uma **library** publicável: `@mosaicoo/svg-engine` (núcleo + UI do editor) com **8 secondary entry points + 1 umbrella** (versão atual 0.1.0).
- **Duas** aplicações consumers (D-041 follow-up de 2026-05-28):
  - `playground` — showcase/sandbox para devs integrando (8 rotas, plugins demo)
  - `svg-studio` — deliverable de produto (full-bleed `<svge-shell-pro>` puro, 1 rota)

## 2. Estrutura real (atualizada 2026-05-29)

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
│   ├── playground/                # app demo (--prefix=app, --routing, --style=scss)
│   │   ├── public/                # assets estáticos (favicon, etc.)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── app.config.ts        # provedores raiz (30+ plugins, incl. stampToolPlugin demo)
│   │   │   │   ├── app.routes.ts        # 8 rotas + 6 redirects legados + catch-all
│   │   │   │   ├── app.ts
│   │   │   │   ├── app.html             # header banner + <router-outlet>
│   │   │   │   ├── app.scss
│   │   │   │   └── app.spec.ts
│   │   │   ├── index.html               # links Roboto + Material Icons
│   │   │   ├── main.ts                  # bootstrapApplication
│   │   │   └── styles.scss              # tema M3 azure-blue + light dark
│   │   ├── tsconfig.app.json
│   │   └── tsconfig.spec.json
│   └── svg-studio/                # app produto (--prefix=studio) — adicionado 2026-05-28
│       ├── public/                # favicon
│       ├── src/
│       │   ├── app/
│       │   │   ├── app.config.ts        # set de plugins espelhado do playground MENOS demos
│       │   │   ├── app.routes.ts        # 1 rota só ('/') + catch-all redirect (deep-links ⇒ editor)
│       │   │   ├── app.ts               # full-bleed sem header
│       │   │   └── pages/pro-editor/    # único componente, providers: [provideSvgEngineEditorScope()]
│       │   ├── index.html
│       │   ├── main.ts
│       │   └── styles.scss
│       ├── tsconfig.app.json
│       └── tsconfig.spec.json
├── .editorconfig
├── .gitignore
├── .prettierrc
├── angular.json                   # 3 projetos: svg-engine, playground, svg-studio
├── package.json                   # @angular/* @21.2.0, @angular/material @21.x
└── tsconfig.json                  # strict + strictTemplates + flags fortes
```

**Por que 2 apps consumidores** (D-041 follow-up de 2026-05-28):

- **`playground`**: sandbox+showcase para devs integrando a library — mostra todos os modos D-037, inclui plugins demo (`stampToolPlugin`), tem 8 rotas explicando cada Modo, redirects legados de URLs antigas. Audiência: plugin author, dev integrando.
- **`svg-studio`**: deliverable de produto — full-bleed `<svge-shell-pro>` puro, 1 rota só, set de plugins espelhado do playground **menos** demos pedagógicos, deep-links sempre caem no editor. Audiência: end-user.

A coexistência prova um princípio importante do D-041: a library serve dois consumers reais (showcase + produto) sem precisar de fork — só configurações diferentes de `provideSvgEnginePlugin(...)` no bootstrap.

## 3. Estrutura-alvo: multi-entry-point (D-018)

Library dividida em **secondary entry points** via `ng-packagr` para
permitir consumo headless (D-017) e tree-shaking real:

```
projects/svg-engine/
├── ng-package.json                 # primary entry (agregador)
├── package.json
├── src/public-api.ts               # re-exporta de */public-api.ts
├── core/
│   ├── ng-package.json
│   └── src/
│       ├── public-api.ts           # surface de svg-engine/core
│       └── lib/
│           ├── model/              # SvgNode, RectNode, GroupNode, ...
│           ├── commands/           # Command pattern + concrete commands
│           ├── history/            # HistoryService (undo/redo)
│           ├── state/              # EditorStateService (signals)
│           └── types/              # tipos compartilhados (Transform, BBox, ...)
├── render/
│   ├── ng-package.json
│   └── src/
│       ├── public-api.ts           # surface de svg-engine/render
│       └── lib/
│           ├── renderer/           # <svge-renderer> (viewer read-only)
│           └── viewport/           # ViewportService (pan/zoom)
├── io/
│   ├── ng-package.json
│   └── src/
│       ├── public-api.ts
│       └── lib/
│           ├── parser/             # string SVG -> SvgNode tree
│           ├── serializer/         # SvgNode tree -> string SVG
│           └── sanitizer/          # remove scripts/eventos, valida hrefs
├── optimize/
│   ├── ng-package.json
│   └── src/
│       ├── public-api.ts
│       └── lib/
│           ├── passes/             # PathOptimizer, Deduper, Minifier, ...
│           └── pipeline/           # composição de passes configurável
├── edit/                            # SelectionService, TransformService, registries (D-023),
│   ├── ng-package.json              # plugin scaffolding, scope provider D-042,
│   └── src/                         # diretivas (incl. svgeShellInteractions),
│       ├── public-api.ts            # built-in plugins (shape/pen/text/extra/page/pencil),
│       └── lib/                     # library catalogs (D-048), snapshots (D-073),
│           └── ...                  # asset-export (D-077), pages (D-079/D-080), etc.
├── ui/                              # ~42 componentes Material (shells + bars + panels +
│   ├── ng-package.json              # dialogs com padrão D-044 + tool-options components +
│   └── src/                         # ToolOptionsRegistry + ThemeService +
│       ├── public-api.ts            # builtinUiMenuContributionsPlugin (D-044)
│       └── lib/...
└── ai/                              # AI layer (D-046, opt-in)
    ├── nlu/                         # NaturalLanguageService (rule-based, Fase 8.1)
    │   ├── ng-package.json          # parsers PT/EN, dicionários, 33 intents,
    │   └── src/...                  # builtinNluPlugin (auto-discovery one-shot)
    └── nlu-ui/                      # <svge-nlu-input> + VoiceRecognitionService
        ├── ng-package.json          # (Web Speech API wrapper, default pt-BR)
        └── src/...
```

### Dependências entre entry points (regra inviolável — D-017)

```
ai/nlu-ui → ai/nlu  (+ @angular/material — único caso de Material fora de ui/)
ai/nlu    → edit, core
ui        → edit, io, render, core  (+ @angular/material + @angular/cdk)
edit      → optimize, io, render, core
render    → core
io        → core
optimize  → core
core      → (nenhum entry interno; apenas @angular/core + polygon-clipping bundled)
```

`core/`, `render/`, `io/`, `optimize/`, `edit/`, `ai/nlu/` **não importam** de
`@angular/material` nem de `@angular/cdk`. Apenas `ui/` e `ai/nlu-ui/` podem.

### Consumo por terceiros — exemplos

```ts
// Caso 1 — render-only (viewer leve)
import { SvgRenderer } from '@mosaicoo/svg-engine/render';

// Caso 2 — manipulação programática (headless, sem UI)
import { EditorStateService, MoveNodeCommand } from '@mosaicoo/svg-engine/core';
import { SvgParser } from '@mosaicoo/svg-engine/io';

// Caso 3 — otimização standalone (CLI/server-side futuro)
import { OptimizationPipeline, PathOptimizer } from '@mosaicoo/svg-engine/optimize';

// Caso 4 — editor completo (consumo Mosaicoo / playground)
import { SvgEditorComponent } from '@mosaicoo/svg-engine/ui';
```

### Princípios inegociáveis

- **Toda feature nasce na library**; a `playground` apenas consome.
- **Headless-first**: nada do core/render/io/optimize/edit pode forçar
  a inclusão de Material no bundle do consumidor.
- `public-api.ts` é a **única** superfície exportada por entry point.
  Internos não vazam.

## 4. Mapa de dependências (verificado por código)

> Os diagramas abaixo refletem a **estrutura real** do repositório
> (verificada via `grep "from '@mosaicoo/svg-engine/(core|render|io|optimize|edit|ui)'"`).
> Renderizam nativamente no GitHub, VS Code (com a extensão Markdown
> Preview Mermaid Support) e na maioria das plataformas modernas.

### 4.1 Visão macro — entry points, consumers e peer deps

```mermaid
flowchart TD
  subgraph Consumers["CONSUMER APPS (Angular)"]
    direction LR
    PG["playground<br/>(desenvolvimento)"]
    MOS["Mosaicoo<br/>(produto interno)"]
    STD["svg-studio<br/>(deliverable produto)"]
    EXT["3rd party<br/>(npm consumer)"]
  end

  subgraph Library["@mosaicoo/svg-engine (library, 8 secondary entry points + 1 umbrella)"]
    direction TB

    subgraph AIBox["AI / NLU layer (opt-in, separada)"]
      AINLU["@mosaicoo/svg-engine/ai/nlu (headless)<br/>NaturalLanguageService + parsers PT/EN<br/>dictionaries (actions/colors/shapes/stopwords)<br/>builtinNluPlugin + 33 intents (5 builtin + 28 pro)<br/>menu auto-discovery (one-shot)"]
      AINLUUI["@mosaicoo/svg-engine/ai/nlu-ui<br/>&lt;svge-nlu-input&gt; + VoiceRecognitionService<br/>(Web Speech API, default pt-BR)<br/>UNICA dep Material fora de svg-engine/ui"]
    end

    subgraph UIBox["@mosaicoo/svg-engine/ui &nbsp; - &nbsp; ~42 componentes Material/CDK"]
      UI["Shells: svge-editor / svge-shell-pro<br/>Bars: svge-menu-bar / svge-toolbar / svge-status-bar /<br/>svge-context-menu / svge-tool-options / svge-tools-palette<br/>Panels: svge-inspector (2314 linhas) / svge-layers-panel /<br/>svge-color-palette / svge-color-picker /<br/>svge-effects-panel / svge-libraries-panel /<br/>svge-pages-panel / svge-snapshots-panel /<br/>svge-asset-export-panel / svge-panel-group<br/>Dialogs (padrão D-044): svge-dialog-shell +<br/>SvgSourceDialog / WorkspaceSettings / FindReplace /<br/>SmartObject / TraceImage / About<br/>Misc: svge-rulers / svge-isolation-breadcrumb /<br/>svge-theme-toggle / svge-gradient-editor<br/>+ 14 tool-options components<br/>+ ToolOptionsRegistry (D-066)<br/>+ builtinUiMenuContributionsPlugin (D-044)"]
    end

    subgraph HeadlessBox["HEADLESS BOUNDARY (D-017) - Material/CDK PROIBIDOS abaixo"]
      EDIT["@mosaicoo/svg-engine/edit (49 services, 27 plugins, 6 registries + 9 library catalogs)<br/>Core services: SelectionService, IsolationService,<br/>WorkspaceService, LayersService, SnapService,<br/>TransformService, ToolHostService, AutoSaveService,<br/>AnchorSelectionService, AlignmentService, MarqueeService,<br/>ShapeToolService, PenToolService, ViewportCullingService<br/><br/>PAGES (D-079 + D-080): PagesService, ActivePageService<br/>(implements InsertParentResolver), PageDragService<br/><br/>Snapshots/persistence (D-073/D-077): SnapshotsPersistence,<br/>AssetExportRegistry + Runner + Persistence, ClipboardService<br/><br/>Library catalogs (D-048, root): Shape/Template/GraphicStyle/<br/>Pattern/Mask/ClipPath/Gradient/Brush/Symbol +<br/>5 active-defs scoped + ActiveDefsService composer<br/><br/>Capability registries: ToolRegistry,<br/>MenuContributionRegistry, ShortcutRegistry,<br/>PaletteRegistry, EffectRegistry, AssetExportRegistry<br/><br/>Plugin scaffolding: EditorPlugin, PluginRegistry,<br/>provideSvgEnginePlugin, provideSvgEngineEditorScope (D-042)<br/><br/>Directives: svgeShellInteractions (D-039),<br/>SvgeCanvasGestures, PageOverlay, PageSelectionOverlay,<br/>WorkspaceBackground, IsolationFilter, AnchorOverlay,<br/>SelectionOverlay, RotationPivot, Marquee, SnapGuides<br/><br/>Pointer: capturePointer/releasePointer/isEditableTarget (D-036)<br/>Hit-testing: findOwningNodeId, resolveSelectableNodeId<br/><br/>Built-in plugins (27): shape-tools, pen-tool, text-tool,<br/>extra-tools (6 tools), page-tool, selection-nudge,<br/>builtin-editor-shortcuts, builtin-menu-contributions,<br/>builtin-insert-menu, builtin-advanced-edit-menu,<br/>builtin-palettes, builtin-effects, builtin-io,<br/>png-exporter, builtin-optimizers, 9 library plugins"]

      OPT["@mosaicoo/svg-engine/optimize<br/>OptimizerRegistry / OptimizeCommand<br/>4 builtin passes (D-072g):<br/>precision / dropDefaults /<br/>stripAuthoredTitles (opt-in) / pruneEmptyGroups"]

      IO["@mosaicoo/svg-engine/io<br/>ImporterRegistry / ExporterRegistry<br/>svgImporter (sanitiza script/on*/javascript:)<br/>svgExporter (determinístico 6 decimais)<br/>pngExporter + renderPng (helper público)"]

      RENDER["@mosaicoo/svg-engine/render<br/>SvgeRenderer + NodeRendererRegistry<br/>ViewportService / screenToDoc (D-036)<br/>9 per-type directives (rect/ellipse/line/<br/>polygon/polyline/path/text/image/symbol-use)<br/>+ Dispatcher SvgeNodeRenderer"]

      CORE["@mosaicoo/svg-engine/core (base, sem deps internas)<br/>10 tipos no union SvgNode (rect/ellipse/line/<br/>polygon/polyline/path/text/image/group/symbol-use)<br/>3 kinds via metadata: Layer/SmartObject/Page<br/>SvgDocument + tree ops imutáveis (findNodeById, walk, etc)<br/><br/>38 Commands (Insert/Remove/Move/Resize/Rotate/Flip/<br/>Group/Ungroup/SetProperty×3/Anchor×4/<br/>Compound×2/LiveBoolean×3/Pathfinder×5/<br/>Layer×3/Page×6+EnsureDefault/SmartObject×4/<br/>Snapshot×1/Duplicate/KnifeCut/BatchConvertToPath)<br/>4 marcam isDestructive: Pathfinder base, DeletePage,<br/>BatchConvertToPath, RestoreSnapshot=false explícito<br/><br/>CommandBus (auto-snapshot gate via isDestructive)<br/>EditorStateService / HistoryService<br/>SnapshotsService (D-073, scope-only)<br/>Geometry: bbox, anchors, scale-bake, path-d-scaler,<br/>transform-decompose, round-corners (D-055), flatten<br/>AUTO_PARENT (D-080) + INSERT_PARENT_RESOLVER token"]
    end
  end

  subgraph Peers["PEER DEPS (declaradas em projects/svg-engine/package.json)"]
    direction LR
    NG["@angular/core,common,forms,animations,platform-browser ^21.2"]
    CDK["@angular/cdk ^21.2 &nbsp;(optional)"]
    MAT["@angular/material ^21.2 &nbsp;(optional)"]
    POLY["polygon-clipping ^0.15 &nbsp;(bundled — pathfinder engine)"]
  end

  PG ==>|"Modos 1-4:<br/>showcase de todos"| UI
  STD ==>|"Modo 2 puro:<br/>shell-pro full-bleed"| UI
  MOS ==>|"Mosaicoo escolhe<br/>por painel<br/>(D-037)"| UI
  EXT -.->|"Modo 2"| UI
  EXT -.->|"Modo 1<br/>(headless puro)"| EDIT
  EXT -.->|"Modo 1"| RENDER
  EXT -.->|"opt-in NLU"| AINLU

  UI --> EDIT
  UI --> IO
  UI --> RENDER
  UI --> CORE
  UI -.->|optional| CDK
  UI -.->|optional| MAT

  AINLUUI --> AINLU
  AINLU --> EDIT
  AINLU --> CORE
  AINLUUI -.->|optional| MAT

  EDIT --> OPT
  EDIT --> IO
  EDIT --> RENDER
  EDIT --> CORE

  OPT --> CORE
  IO --> CORE
  RENDER --> CORE

  CORE --> NG
  CORE --> POLY

  classDef boundary fill:#fff3cd,stroke:#b88600,stroke-width:2px
  classDef ui fill:#d1e7ff,stroke:#0d6efd,stroke-width:2px
  classDef ai fill:#e7d4ff,stroke:#7c3aed,stroke-width:2px
  classDef core fill:#d4edda,stroke:#198754,stroke-width:2px
  classDef consumer fill:#f8d7da,stroke:#dc3545,stroke-width:1px
  classDef peer fill:#e2e3e5,stroke:#6c757d,stroke-width:1px

  class HeadlessBox boundary
  class UIBox ui
  class AIBox,AINLU,AINLUUI ai
  class CORE,RENDER,IO,OPT,EDIT core
  class PG,MOS,STD,EXT consumer
  class NG,CDK,MAT,POLY peer
```

**Convenção de setas**:

| Estilo               | Significado                                     |
| -------------------- | ----------------------------------------------- |
| Grossas (`==>`)      | Consumer instalado por padrão                   |
| Pontilhadas (`-.->`) | Caminho opcional / por modo                     |
| Finas (`-->`)        | Import direto (`from '@mosaicoo/svg-engine/X'`) |

**Regras invioláveis codificadas no grafo**:

1. **D-017 Headless boundary**: tudo abaixo de `ui` é Material-free e CDK-free. Verificado: **todos** os 16 arquivos que importam `@angular/material|cdk` estão em `@mosaicoo/svg-engine/ui`.
2. **Sem ciclos**: `core` não importa ninguém de `@mosaicoo/svg-engine/*`. `render`, `io`, `optimize` só importam `core`. `edit` importa `core+render+io+optimize`. `ui` é o topo.
3. **`polygon-clipping`** está em `core` (motor de pathfinder boolean ops) — bundled como dep direta, não peer.
4. **Material + CDK são `optional` peer deps** — consumer headless (Modo 1) não precisa instalá-los.

### 4.2 Zoom — como `ui` se conecta ao `edit` (registries + plugins)

```mermaid
flowchart LR
  subgraph EditServicesRoot["@mosaicoo/svg-engine/edit - Capability Registries (root, providedIn)"]
    MR[MenuContributionRegistry<br/>slots menu.* + context.*]
    TR[ToolRegistry + ToolHostService]
    SR[ShortcutRegistry + ShortcutService]
    PAL[PaletteRegistry]
    EFR[EffectRegistry]
    AER[AssetExportRegistry D-077]
  end

  subgraph EditServicesScoped["@mosaicoo/svg-engine/edit - Per-editor scope (D-042)"]
    SEL[SelectionService]
    ISO[IsolationService]
    LAY[LayersService]
    SNAP[SnapService]
    WS[WorkspaceService]
    APS[ActivePageService D-079/D-080<br/>implements InsertParentResolver]
    PGS[PagesService]
    SSV[SnapshotsService D-073<br/>+ SnapshotsPersistence]
    SMOA[SmartObjectActions D-074]
  end

  subgraph LibCatalogs["@mosaicoo/svg-engine/edit/library - 9 catálogos (root) + 5 active-defs (scoped)"]
    SHL[ShapeLibrary]
    GRL[GradientLibrary]
    SYL[SymbolLibrary]
    BRL[BrushLibrary]
    OTHER[+ 5 catalogs:<br/>Template/GraphicStyle/Pattern/<br/>Mask/ClipPath]
  end

  subgraph UIComponents["@mosaicoo/svg-engine/ui - Componentes leem signals dos registries"]
    TB[svge-toolbar] --> MR
    MB[svge-menu-bar] --> MR
    CM[svge-context-menu] --> MR
    TP[svge-tools-palette] --> TR
    TO[svge-tool-options] --> TR
    INSP[svge-inspector<br/>2314 linhas]
    INSP --> SEL
    INSP --> LAY
    INSP --> PAL
    LP[svge-layers-panel] --> LAY
    LP --> SEL
    LP --> ISO
    IB[svge-isolation-breadcrumb] --> ISO
    SB[svge-status-bar] --> SEL
    SB --> SNAP
    SB --> WS
    SB --> APS
    EP[svge-effects-panel] --> EFR
    EP --> SEL
    PP[svge-pages-panel D-079] --> PGS
    PP --> APS
    SNP[svge-snapshots-panel D-073] --> SSV
    AEP[svge-asset-export-panel D-077] --> AER
    LBP[svge-libraries-panel D-048] --> SHL
    LBP --> GRL
    LBP --> SYL
    WSC[svge-workspace-settings] --> WS
  end

  subgraph PluginsLayer["27 plugins built-in populam os registries"]
    BP1[shape-tools / pen-tool / text-tool /<br/>extra-tools / page-tool / pencil-tool] -.registra.-> TR
    BP2[builtinEditorShortcuts /<br/>selectionNudge] -.registra.-> SR
    BP3[builtinMenuContributions D-043 /<br/>builtinInsertMenu /<br/>builtinAdvancedEditMenu /<br/>builtinUiMenuContributions D-044] -.registra.-> MR
    BP4[builtinPalettes /<br/>extraPalettes] -.registra.-> PAL
    BP5[builtinEffects D-047] -.registra.-> EFR
    BP6[9 library plugins<br/>shapes/symbols/brushes/templates/<br/>gradients/patterns/styles/<br/>clipPaths/masks] -.registra.-> SHL
    BPN[builtinNlu D-046] -.registra intents.-> AINLUR["NaturalLanguageService<br/>(em ai/nlu)"]
    BPX[seu plugin custom] -.registra em qq registry.-> TR
  end

  classDef reg fill:#ffe5b4,stroke:#cc7700,stroke-width:1px
  classDef scoped fill:#fde2c8,stroke:#b25a00,stroke-width:1px
  classDef cat fill:#cce5ff,stroke:#0066cc,stroke-width:1px
  classDef comp fill:#d1e7ff,stroke:#0d6efd,stroke-width:1px
  classDef plug fill:#e7d4ff,stroke:#7c3aed,stroke-width:1px

  class MR,TR,SR,PAL,EFR,AER reg
  class SEL,ISO,LAY,SNAP,WS,APS,PGS,SSV,SMOA scoped
  class SHL,GRL,SYL,BRL,OTHER cat
  class TB,MB,CM,TP,TO,INSP,LP,IB,SB,EP,PP,SNP,AEP,LBP,WSC comp
  class BP1,BP2,BP3,BP4,BP5,BP6,BPN,BPX,AINLUR plug
```

**Padrão arquitetural**: registries em `edit` são a **fonte de verdade**; componentes em `ui` apenas **lêem**. Plugins (built-in ou de terceiros) **populam** os registries via `EditorPlugin.install(ctx)`. Nenhum componente UI tem lista hardcoded de tools/menus/shortcuts — toda funcionalidade aparece via registro dinâmico.

### 4.3 Os 4 modos de consumo (D-037)

```mermaid
flowchart TB
  subgraph Mode1["Modo 1 - Headless puro (zero UI Angular)"]
    M1["Consumer importa so:<br/>core + render + edit (services)<br/>Constroi sua propria UI<br/>(React? Vue? Angular custom? CLI?)"]
  end

  subgraph Mode2["Modo 2 - Shell completo (drop-in)"]
    M2["svge-shell-pro ou svge-editor [shell]=true<br/>Toolbar + menu + inspector +<br/>layers + canvas + status bar +<br/>tools-palette + context-menu"]
  end

  subgraph Mode3["Modo 3 - Shell parcial (pick and choose)"]
    M3["svge-canvas + svge-toolbar +<br/>svge-layers-panel (qualquer combinacao)<br/>Consumer monta o layout"]
  end

  subgraph Mode4["Modo 4 - Canvas only"]
    M4["svge-renderer + [svgeShellInteractions] opcional<br/>Embed minimo: so render +<br/>pan/zoom. Sem tools, sem paineis."]
  end

  M1 -.->|usa apenas| L1["core / render / edit (services)"]
  M2 -.->|usa| L2["TODOS os 8 entry points<br/>+ Material + CDK (+ opcional ai/nlu)"]
  M3 -.->|usa| L3["core / render / edit / ui (parte)<br/>+ Material + CDK"]
  M4 -.->|usa| L4["core / render / edit (gestures)"]

  classDef m1 fill:#d4edda,stroke:#198754
  classDef m2 fill:#d1e7ff,stroke:#0d6efd
  classDef m3 fill:#fff3cd,stroke:#b88600
  classDef m4 fill:#f8d7da,stroke:#dc3545

  class Mode1,M1,L1 m1
  class Mode2,M2,L2 m2
  class Mode3,M3,L3 m3
  class Mode4,M4,L4 m4
```

### 4.4 Tabela de referência rápida — o que cada entry point possui

| Entry point            | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Material? | Imports de svg-engine/\*             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: | ------------------------------------ |
| `core`                 | 10 tipos no union `SvgNode` (incl. `SymbolUseNode` D-059); 3 kinds via metadata (`Layer`/`SmartObject`/`Page`); 38 commands; `CommandBus` com auto-snapshot gate; `EditorStateService`; `HistoryService`; `SnapshotsService` (D-073, scope-only); geometry (bbox/anchors/scale-bake/path-d-scaler/decompose/round-corners/flatten); `AUTO_PARENT` + `INSERT_PARENT_RESOLVER` (D-080)                                                                                      |    Não    | — (base, importa só `@angular/core`) |
| `render`               | `SvgeRenderer` + `NodeRendererRegistry`; `ViewportService`; **9 per-type directives** (rect/ellipse/line/polygon/polyline/path/text/image/`symbol-use`) + Dispatcher; `screenToDoc` util (D-036)                                                                                                                                                                                                                                                                          |    Não    | `core`                               |
| `io`                   | `ImporterRegistry`, `ExporterRegistry`, `svgImporter` (sanitiza `<script>`/`on*`/`javascript:`), `svgExporter` (determinístico 6 decimais, atributos alfabéticos), `pngExporter` + `renderPng` helper                                                                                                                                                                                                                                                                     |    Não    | `core`                               |
| `optimize`             | `OptimizerRegistry`, `OptimizeCommand`, **4 builtin passes** (`precision`, `dropDefaults`, `stripAuthoredTitles` D-072g opt-in, `pruneEmptyGroups`)                                                                                                                                                                                                                                                                                                                       |    Não    | `core`                               |
| `edit`                 | **49 services**: Selection/Isolation/Layers/Snap/Workspace/Transform/Marquee/Alignment/Tool×N/AutoSave/Clipboard/Pages×3 (D-079/D-080)/Snapshots/AssetExport×3 (D-077)/SmartObjectActions/FindReplace/SelectSame/TraceProgress + 9 library catalogs + 5 active-defs scoped. **6 capability registries** (Tool/Menu/Shortcut/Palette/Effect/AssetExport). **27 plugins built-in**. **Scope provider** `provideSvgEngineEditorScope()` (D-042). Pointer + hit-testing utils |    Não    | `core`, `render`, `io`, `optimize`   |
| `ui`                   | **~42 componentes Material** divididos em Shells (2) / Bars (6) / Panels (10) / Dialogs (7 com padrão D-044) / Misc (4) / Tool-options (14). `ToolOptionsRegistry` (D-066) + `provideSvgeBuiltinToolOptions()`. `builtinUiMenuContributionsPlugin` (D-044) e `ThemeService`. Inspector mega-componente (2314 linhas) com tabs (D-078)                                                                                                                                     |    Sim    | `core`, `render`, `io`, `edit`       |
| `ai/nlu`               | `NaturalLanguageService` (rule-based, D-046 Fase 1). Parsers PT/EN (tokenize/Levenshtein/fuzzy/slot-extractor). Dicionários (actions/colors/shapes/stopwords merged PT+EN). `discoverMenuIntents` (one-shot, audit item #12). `builtinNluPlugin` registra ~33 intents (5 customizados + 28 professional)                                                                                                                                                                  |    Não    | `core`, `edit`                       |
| `ai/nlu-ui`            | `<svge-nlu-input>` (Material, único componente). `VoiceRecognitionService` (Web Speech API wrapper, default `pt-BR`)                                                                                                                                                                                                                                                                                                                                                      |    Sim    | `ai/nlu`                             |
| `@mosaicoo/svg-engine` | **Umbrella** (não funcional). Apenas exporta `SVG_ENGINE_VERSION = '0.1.0'`. Política D-018: consumers devem importar dos secondary entry points específicos                                                                                                                                                                                                                                                                                                              |    Não    | — (não importa nada)                 |

### 4.5 Como manter esses diagramas em dia

Quando adicionar/remover entry points, services, registries ou alterar imports cross-entry-point, **atualize esta seção** no mesmo PR. Comando para reverificar a fronteira headless:

```bash
# Deve retornar apenas arquivos em svg-engine/ui/:
grep -r "from '@angular/(material|cdk)" projects/svg-engine/
```

Comando para reverificar grafo de deps interno:

```bash
# Mostra todos os imports cross-entry-point:
grep -rn "from '@mosaicoo/svg-engine/" projects/svg-engine/
```

---

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
