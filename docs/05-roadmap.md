# 05 — Roadmap Técnico

> Roadmap incremental. Cada fase só inicia após validação da anterior.
> Estimativas omitidas propositalmente — foco em ordem e dependências.

---

## Fase 0 — Fundação ✅ concluída

- [x] Restrições do agente (`.claude/settings.local.json`)
- [x] `.gitignore` inicial
- [x] Documentos canônicos (`docs/01..08`)
- [x] `git init` + commit inicial + push para `mosaicoo/svg-engine`
- [x] Confirmação da versão Angular: **v21** (D-006)

## Fase 1 — Scaffold do workspace (Angular v21) ✅ concluída

- [x] `ng new` (com `--ai-config=claude --skip-install --create-application=false`)
- [x] Merge do `.gitignore` (Angular + .NET + secrets + assets)
- [x] `ng generate library svg-engine --prefix=svge`
- [x] `ng generate application playground --prefix=app --routing --style=scss`
- [x] `ng add @angular/material@21 --theme=azure-blue --typography=true --animations=enabled`
- [x] `color-scheme: light dark` no body (D-012 mínimo)
- [x] Build verde da library e da app (dev + prod)
- [x] Verificação runtime: `ng serve` → HTTP 200, styles.css com color-scheme correto
- [x] `02-arquitetura.md` atualizado com estrutura real
- [x] **ESLint** via angular-eslint v21 (flat config) + eslint-config-prettier (D-013)
- [x] **Husky** + **lint-staged** com pre-commit hook (D-014)
- [x] **CI** mínimo em GitHub Actions: lint + build dev + build prod (D-015)
- [ ] Toggle de tema light/dark explícito → **adiado para Fase 4** (faz parte da toolbar)

## Fase 2 — Núcleo: `core` + `render` (entry points D-018)

### Bloco 1 — `svg-engine/core` (headless puro) ✅ concluído

- [x] Estrutura multi-entry-point: `projects/svg-engine/core/` com
      `ng-package.json` próprio e `public-api.ts`
- [x] tsconfig path mapping `svg-engine/core` → `dist/svg-engine/core`
- [x] Refatoração da library: placeholder removido; primary entry point
      vazio (apenas `SVG_ENGINE_VERSION`) — alinhado a `@angular/material`
- [x] Modelo `SvgNode` (union discriminated): 9 tipos concretos imutáveis
- [x] Tipos: `NodeId` (branded), `Transform` (matriz 6-elementos + ops),
      `BoundingBox`, `SvgStyle`, `SvgMetadata`, `Point`
- [x] Tree ops imutáveis com structural sharing: `findNodeById`,
      `findParent`, `insertNode`, `removeNode`, `updateNode`, `walk`,
      `collectNodes`, `countNodes`
- [x] `SvgDocument` + `createEmptyDocument`
- [x] `Command` interface + `CommandContext` + `CommandResult`
- [x] 4 comandos: `InsertNodeCommand`, `RemoveNodeCommand`,
      `MoveNodeCommand`, `SetPropertyCommand<T, K>`
- [x] `EditorStateService` (signals: `document`, `dirty`, `nodeCount`, `allNodes`)
- [x] `HistoryService` (undo/redo + maxSize configurável + signals)
- [x] `CommandBus` (dispatch + undo/redo, único ponto autorizado de mutação)
- [x] Testes Vitest: **66 tests verdes em 5 arquivos**
- [x] `ng build svg-engine` verde, `ng lint` verde
- [x] **Dogfooding**: `playground` consumindo
      `import { ... } from 'svg-engine/core'` valida tree-shaking real
      (bundle separado em `dist/svg-engine/fesm2022/svg-engine-core.mjs`)

### Bloco 2 — `svg-engine/render` (read-only viewer + plugin point) ✅ concluído

- [x] Estrutura `projects/svg-engine/render/` + ng-package + tsconfig paths
- [x] `<svge-renderer>` standalone: inputs `tree`, `viewBox?`, `width?`, `height?`, `ariaLabel?`
- [x] 8 renderer components per-tipo (`<svge-rect>`, `<svge-ellipse>`,
      `<svge-line>`, `<svge-polygon>`, `<svge-polyline>`, `<svge-path>`,
      `<svge-text>`, `<svge-image>`) cada um com `<svg:g data-node-id transform>`
- [x] `<svge-node>` dispatcher: `@switch` dos 8 + `group` recursivo + fallback registry
- [x] `ViewportService`: signals `zoom/panX/panY/contentBox/viewBox` + APIs pan/zoom/reset/fit/setZoomLimits
- [x] **`NodeRendererRegistry`** (D-020): plugins registram renderers para tipos custom; dispatcher monta via `*ngComponentOutlet`
- [x] `renderTransformAttr` util (matrix serialização + omite identidade)
- [x] `projectDocumentToRenderer` helper para SvgDocument
- [x] Testes Vitest: **110 verdes em 10 arquivos** (5 novos no render)
- [x] Playground visual: substitui lista de IDs por `<svge-renderer>` real
      com botões Add(rect/ellipse/path), nudge, remove, undo/redo, zoom in/out/reset
- [x] Runtime verificado: bundle contém `svge-renderer`, `svge-rect`, `NodeRendererRegistry`

## Fase 3 — Seleção e transformação (`svg-engine/edit`)

### Bloco 1 — `SelectionService` + hit-testing ✅ concluído

- [x] Estrutura `projects/svg-engine/edit/` (ng-package + path mapping + tsconfig includes)
- [x] `SelectionService` (signals: `selectedIds`, `focusId`, `hoverId`, `count`, `hasSelection`, `isSingleSelection`)
- [x] APIs: `select`, `selectMany`, `addToSelection`, `toggle`, `deselect`, `clear`, `isSelected`, `setHover`
- [x] Hit-testing: `findOwningNodeId(target)` + `resolveNodeIdFromEvent(event)` — usa `data-node-id` setado pelo renderer
- [x] **136 tests verdes em 12 arquivos** (24 novos: 16 SelectionService + 8 hit-testing)
- [x] Playground integrado: clique no canvas seleciona o nó (ou limpa); status bar mostra contagem + focus ID

### Bloco 2 — Selection overlay visual + pivot Affinity-grade ✅ concluído

- [x] `SvgeRenderer` ganha `<ng-content />` slot p/ overlays projetados (compartilham `<svg>`/viewBox/namespace)
- [x] Geometry utils: `bbox-anchors` (9 pontos + nearest-anchor) + `node-bbox` (DOM-based via `getBBox()` + parser de transform attribute)
- [x] `TransformService` skeleton (pivot only): `Map<NodeId, Point>` em coords node-local + `resolvePivot/setPivot/setPivotAnchor/resetPivot/clearAllPivots/syncPivotForSelection`
- [x] `<svge-selection-overlay>`: bbox outline + 8 resize handles + 1 rotation handle (visual only — Bloco 3 wireia drag)
- [x] Hover outline em `selection.hoverId()` (estilo dashed)
- [x] Handles em pixels constantes via `1/viewport.zoom()` + `vector-effect: non-scaling-stroke`
- [x] `<svge-rotation-pivot>` Affinity-grade:
  - [x] Crosshair draggable; default = centro do bbox
  - [x] **Snap-to-9-anchors** durante drag (≤5 CSS px); **Alt** = bypass
  - [x] **9-point picker popover**: clique no crosshair (sem drag) abre 3×3 anchor picker
  - [x] **Esc** durante drag cancela e restaura pivot; **double-click** reseta ao centro
- [x] **175 tests verdes em 15 arquivos** (+39 do Bloco 2)
- [x] Playground integrado: overlay + pivot ativos dentro do `<svge-renderer>`

### Bloco 3 — Transform interativo + pivot persistente ✅ concluído

- [x] **Core**: `RotateNodeCommand(nodeId, angleRad, pivot)` aplica `T(p)·R(θ)·T(-p)·prev`; undo restaura
- [x] **Core**: `ResizeNodeCommand(nodeId, anchor, sx, sy)` aplica `T(a)·S(sx,sy)·T(-a)·prev`; undo restaura. Helpers exportados: `composePivotRotation`, `composeAnchoredScale`
- [x] **TransformService** expandido: `dragState` signal + `isDragging` computed
- [x] APIs por gesto: `startMove/updateMove/endMove`, `startRotate/updateRotate/endRotate`, `startResize/updateResize/endResize`, `cancelGesture`
- [x] **Padrão revert+commit**: durante drag mutação direta no document (preview); `endDrag` faz revert ao snapshot inicial, depois dispatcha **um único comando** via `CommandBus` — undo limpo (1 entrada por gesto)
- [x] Edge handles (TC/BC/ML/MR) constrangem 1 axis; corner handles escalam ambos
- [x] Persistência per-node (D-022.persist) mantida do Bloco 2
- [x] **SelectionOverlay**: pointer handlers nos 8 resize handles + rotation handle + pointer capture + `screenToDoc` via `getScreenCTM().inverse()`
- [x] **Playground**: body-drag com threshold 3px (potential drag → `startMove` no overflow); **Esc** cancela gesto via `cancelGesture()`
- [x] **196 tests verdes em 17 arquivos** (+21 novos: 12 Rotate/Resize commands + 9 TransformService gestures)

### Bloco 4 — Marquee + alinhamento

- [x] **Bloco 4a**: `<svge-marquee>` (drag-to-select com box visual dashed)
  - `MarqueeService` (signals) — start/update/end/cancel + estado normalizado (`rect` sempre com w/h ≥ 0 mesmo em drag para cima/esquerda)
  - Hit-testing puro: `nodesInsideMarquee(rect, candidates, mode)` com modos `'intersect'` (default, padrão Illustrator/Affinity) e `'contain'` (modo AutoCAD)
  - Modo `'add'` (Shift-drag): captura snapshot da seleção no start e reconstrói a união a cada update — pré-existentes nunca somem
  - Esc cancela o gesto (sem alterar seleção); release sem drag em `'replace'` mode = clear (preserva o velho comportamento "click no fundo limpa")
  - Wired no playground: pointerdown no fundo abre marquee; selectMany acompanha drag em tempo real
- [x] **Bloco 4b**: Snap-to-grid e snap-to-objects (`SnapService`)
  - Resolver puro `resolveSnap(moving, targets, threshold)` — pega features (low/center/high) por axis, escolhe o par (feature ↔ target) com menor distância dentro do threshold
  - Geradores puros: `rectsToSnapTargets` (6 targets/rect: low/center/high × 2 axes), `gridTargetsNear` (limita à área do moving — bounded mesmo em docs gigantes)
  - `SnapService` (signals): config (`enabled`, `mode: 'grid'|'objects'|'both'`, `gridSize`, `thresholdPx`); guides ativos (`activeGuides` lido pelo overlay)
  - Threshold em CSS pixels — divisão por `zoom` mantém range visual constante (Illustrator/Affinity)
  - `<svge-snap-guides>` overlay magenta (dashed para grid, sólido para objetos), span via union(viewport, document)
  - Wired no playground: snap durante body-drag (move). Toolbar com toggle + mode picker
- [x] **Bloco 4c**: Alinhamento e distribuição
  - `TranslateManyCommand` no core (1 entrada de undo p/ N nós; falha atomicamente se algum id for inválido)
  - Math puro: `computeAlignDeltas` (6 axes: left/center-x/right/top/center-y/bottom anchorados na union bbox) + `computeDistributeDeltas` (centers, ≥3 nós, edge items mantêm posição)
  - `AlignmentService.align(items, axis)` / `.distribute(items, axis)` — retorna boolean (true = dispatched), false em no-ops
  - Toolbar no playground: 6 botões align (disabled <2 sel) + 2 distribute (disabled <3 sel)

### Bloco 5 — Plugin extensibility (D-020)

- [x] **Bloco 5a**: scaffolding completo de plugins
  - `EditorPlugin` interface + `PluginContext` (pluginId, injector, track) + `Disposable`
  - `PluginRegistry`: install/uninstall/has/get/list (signals reativos), validação de id, semver gate (major check), dep check, rollback de disposables se install() throws, LIFO disposal, errors em uninstall hook não bloqueiam cleanup
  - `provideSvgEnginePlugin(plugin)` provider via `ENVIRONMENT_INITIALIZER` (multi:true) — bootstrap-time install na ordem de declaração
  - `PLUGIN_API_VERSION` constante (1.0.0) para compat check
- [x] **Bloco 5b**: `ToolRegistry` + `ToolHostService` (primeira capability registry construída sobre o scaffolding)
  - Tool API: `id`, `label`, `icon?`, `cursor?`, `shortcut?`, `onActivate/Deactivate`, `onPointerDown/Move/Up/Cancel`, `onKeyDown`
  - `ToolPointerEvent`: wrap do `PointerEvent` raw + `docPoint` já convertido + flags de modifier (consumer não repete boilerplate)
  - `ToolContext`: `injector` cru (mesmo princípio de PluginContext)
  - `ToolHostService`: signal `activeId` + computed `activeTool` (resiliente a uninstall — vira null automaticamente); routePointerDown/Move/Up/Cancel + routeKeyDown; activate dispara onDeactivate→onActivate
  - `selectToolPlugin` builtin: tool passthrough; consumer mantém o pipeline nativo de select/marquee/snap quando `activeId === SELECT_TOOL_ID`
  - `pencilToolPlugin` builtin: freehand path drawing; commit via `InsertNodeCommand` no pointerup; ≥2 pontos requeridos; cancela em pointercancel/onDeactivate
  - Wire no playground: `provideSvgEnginePlugin(selectToolPlugin)` + `provideSvgEnginePlugin(pencilToolPlugin)` no app.config; toolbar reativa lê `toolRegistry.tools()`; shortcuts V/P (gated em editable target)
- [x] **Bloco 5c**: documentação canônica de plugins
  - D-020 expandido: substitui esboço pelo design real (interfaces formais, garantias do registry, justificativa de injector cru, padrão fixo de capability registry)
  - D-023 novo: 9 categorias de plugin mapeadas (Renderers/Tools/Optimizers/Importers/Exporters/Inspectors/Effects/Palettes/Menus+Shortcuts), qual fase abre cada registry, padrão fixo, omissões deliberadas
  - D-024 novo: `ScriptRuntimePlugin` (Fase 6+) — sandbox WebWorker isolado + API curated, NÃO acesso a Injector/DOM, scripts retornam `CommandRequest`s aplicados via `CommandBus` (1 undo entry por script run). Decisão tomada com não-objetivos explícitos
  - `06-componentes-editor-svg.md` atualizado: refs aos 5 services novos (Marquee/Snap/Alignment/PluginRegistry/ToolHostService)
  - Tabela "Decisões pendentes" reorganizada: D-023/D-024 antigos cumpridos, "Versionamento + changelog" renumerado para D-031

## Fase 4 — UX completa

> **Foundation pré-Fase 4** (D-021 resolvido):
>
> - [x] **Bloco 4-pre**: `WorkspaceService` + `<svge-workspace-background>` (background transparente xadrez / sólido / imagem). Headless (HTML+CSS, sem Material). Toolbar de presets no playground

- [x] **Bloco 4a**: `svg-engine/ui` entry point + `<svge-editor>` shell
  - Quarto secondary entry point criado (`projects/svg-engine/ui/`); ng-packagr auto-discover; tsconfig paths + lib/spec includes atualizados
  - `@angular/material` + `@angular/cdk` adicionados como peerDeps **opcionais** (consumer só puxa se importar `svg-engine/ui`)
  - `<svge-editor>` compõe `<svge-workspace-background>` + `<svge-renderer>` + `<ng-content>` + Material toolbar (undo/redo/zoom/reset reativos a `HistoryService`+`ViewportService`)
  - Inputs `tree`/`viewBox` opcionais com fallback para `EditorStateService.document()`
  - Outputs `undoTriggered`/`redoTriggered` para telemetria/analytics
  - Headless boundary verificada por Grep: zero imports de `@angular/material|cdk` em `core/render/edit`
- [x] **Bloco 4b**: Painel de camadas (`<svge-layers-panel>`)
  - `LayersService` (em `edit`): `hiddenIds`/`lockedIds` Set signals + togglers (idempotent, dedup); `showAll`/`unlockAll`
  - `[svgeLayersFilter]` directive (em `edit`): aplica `display: none` em `[data-node-id]` matching `hiddenIds` via `effect()`; preserva pre-existing inline display ao restaurar; opt-in (consumer attach na renderer)
  - `<svge-layers-panel>` (em `ui`): recursive Material UI; expand/collapse de groups; ícone por tipo; visibility/lock buttons; click-to-select com Ctrl/Shift modifiers; classes `.selected`/`.hidden`/`.locked` p/ styling
  - **Drag-drop reorder ADIADO** para sub-bloco 4b-DnD (precisa de `MoveNodeInTreeCommand` novo no core; mantém 4b focado)
- [x] **Bloco 4b-Lock**: enforcement real do cadeado
  - `TransformService.startMove/startRotate/startResize` injeta `LayersService` e refusam (no-op) em locked nodes — cobre body-drag + handles do overlay
  - `<svge-inspector>`: badge "Locked" no header (vermelho), `[disabled]` em todos os inputs, setters short-circuit (defense in depth)
  - Playground `onCanvasPointerDown`: locked nodes ainda selecionáveis (padrão Illustrator/Affinity/Figma) mas não armam `potentialDrag`
  - Padrão: lock previne **edição**, NÃO seleção (o usuário vê propriedades sem poder mudar)
- [x] **Bloco 4c**: Inspector de propriedades (`<svge-inspector>`)
  - Reativo a `selection.focusId()` via computed; estados: empty / multi (placeholder com count) / single (header + sections)
  - Geometry per type: rect (x/y/w/h), ellipse (cx/cy/rx/ry), line (x1/y1/x2/y2). polygon/polyline/path/text/image mostram placeholder "edit via canvas tools"; group sem geometry
  - Style: fill + stroke (`<input type="color">`), strokeWidth + opacity (number inputs)
  - Pipes type-narrowed (`rectField`/`ellipseField`/`lineField`) evitam `$any()` no template
  - Cada `(change)` dispara `SetPropertyCommand` (1 undo entry por edit; sem per-keystroke pollution)
  - `parseNumericInput()` helper rejeita strings vazias (evita commit de `0` quando `Number('')` retorna 0)
  - **Pivot picker integrado e transform decomposto adiados** para sub-bloco 4c-Polish (precisa matrix decomposition + integração com TransformService)
- [ ] **Bloco 4d**: Paleta de cores + `PaletteRegistry` (categoria 8 do D-023)
  - `PaletteService` consome `PaletteRegistry`; built-in palettes (Material colors, Tailwind, custom HSL); plugins podem contribuir
  - `<svge-color-palette>` UI + integração com inspector (fill/stroke pickers)
- [ ] **Bloco 4e**: Toolbar extensível + `MenuContributionRegistry` (categoria 9 parte 1 do D-023)
  - `<svge-toolbar>` com slots por categoria; contribuições via plugin
  - Migração das ferramentas builtin para usar este sistema
- [ ] **Bloco 4f**: Workspace settings — page + grid + guides + rulers
  - Expansão do `WorkspaceService`: `page`, `grid`, `guides`, `rulers` signals
  - `<svge-workspace-settings>` painel (Material dialog) — page size/orientation/margins
  - `<svge-grid-overlay>` + `<svge-rulers>` + `<svge-guides>` (overlays SVG/HTML conforme apropriado)
- [ ] **Bloco 4g**: Atalhos configuráveis + `ShortcutRegistry` (categoria 9 parte 2 do D-023)
  - `ShortcutService` resolve combinations → command id
  - UI de configuração (capture combo, conflict detection)
- [ ] **Bloco 4h**: Agrupamento / desagrupamento
  - `GroupSelectionCommand` (cria `GroupNode` envolvendo seleção)
  - `UngroupCommand` (dissolve `GroupNode`, promovendo children)
- [ ] **Bloco 4i**: Theme toggle explícito (D-012 part 2)
  - `<svge-theme-toggle>` Material; persiste em `localStorage`; sobrepõe `prefers-color-scheme`

## Fase 5 — IO + extensibilidade

- [ ] **Bloco 5-IO**: Import + Export SVG via novas categorias do D-023
  - `ImporterRegistry` + builtin `SvgImporter` (sanitizado: remove scripts/eventos, valida `xlink:href`)
  - `ExporterRegistry` + builtin `SvgExporter` (determinístico: ordem fixa de atributos, valores formatados)
  - Pelo menos 1 importer/exporter extra de referência (PNG via `<canvas>`?)
- [ ] **Bloco 5-Optimize**: `OptimizerRegistry` + pipeline básico
  - `OptimizationPipeline` encadeável (passes ordenáveis)
  - Builtin passes: `PathOptimizer`, `Deduper`, `Minifier`
  - Pelo menos 1 plugin de otimização externo de referência

## Fase 6 — Performance e refinamento

- [ ] Virtualização para documentos com muitos elementos
- [ ] Web Worker para parsing/serialização pesada (se necessário)
- [ ] Profiling: 60fps em pan/zoom com 1k+ elementos como meta
- [ ] Acessibilidade (foco, ARIA, navegação por teclado)
- [ ] Documentação de uso da library

## Fase 7 — Backend .NET (condicional)

- Só inicia se surgir necessidade real (ver `07-backend-dotnet.md`).

---

## Princípios de evolução

- Toda fase termina com **documentação atualizada** e build verde.
- Toda mudança estrutural entra em `08-historico-de-alteracoes.md`.
- Nada é "concluído" sem teste mínimo (unitário ou integração).
