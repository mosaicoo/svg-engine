# 06 — Componentes do Editor SVG

> Catálogo dos componentes/serviços implementados, organizado por **entry
> point** da library (D-018). A API pública versionada fica em
> [09 — API Pública](09-api-publica.md); este documento descreve escopo +
> responsabilidade de cada peça. Selectors usam prefixo `svge-` (componentes)
> ou `svge*` (diretivas), definido pelo schematic.

> **Headless boundary (D-017)**: nada nos entry points `core`, `render`,
> `io`, `optimize`, `edit` pode importar `@angular/material` ou
> `@angular/cdk`. Apenas `ui` e `ai/nlu-ui` podem.

---

## Entry point `svg-engine/core` (Fase 2)

### Serviços

| Serviço              | Responsabilidade                                          |
| -------------------- | --------------------------------------------------------- |
| `EditorStateService` | Estado global do editor (signals). Fonte única de verdade |
| `HistoryService`     | Pilhas de undo/redo, commit de comandos                   |
| `CommandBus`         | Despacho de comandos (todas as mutações passam por aqui)  |

### Modelo + comandos: ver tabelas adiante.

---

## Entry point `svg-engine/render` (Fase 2 Bloco 2) ✅

> **Arquitetura SVG-pura**: per-tipo são **diretivas** aplicadas a elementos
> SVG nativos (não componentes com selectors customizados). Custom HTML
> elements dentro de `<svg>` quebram o render tree do SVG (o painter não
> atravessa elementos não-SVG). Diretivas em `<svg:rect>`/`<svg:ellipse>`
> mantêm todo o DOM no namespace SVG.

### Componente top-level + dispatcher

| Uso                              | Tipo                      | Responsabilidade                                                                                                                     |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `<svge-renderer>`                | Component                 | Top-level: `<svg>` raiz com viewBox/aria + sizing 100%                                                                               |
| `<svg:g svgeNode [node]="..."/>` | Component (`g[svgeNode]`) | Dispatcher: host = `<svg:g>` com `data-node-id`+`transform`; `@switch` por `node.type`; recursivo para `group`; fallback no registry |

### Diretivas per-tipo (built-in)

| Uso                                     | SVG host         | Diretiva                                                                                                                                          |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<svg:rect [svgeRect]="rectNode" />`    | `<svg:rect>`     | `SvgeRectDirective`                                                                                                                               |
| `<svg:ellipse [svgeEllipse]="..." />`   | `<svg:ellipse>`  | `SvgeEllipseDirective`                                                                                                                            |
| `<svg:line [svgeLine]="..." />`         | `<svg:line>`     | `SvgeLineDirective`                                                                                                                               |
| `<svg:polygon [svgePolygon]="..." />`   | `<svg:polygon>`  | `SvgePolygonDirective`                                                                                                                            |
| `<svg:polyline [svgePolyline]="..." />` | `<svg:polyline>` | `SvgePolylineDirective`                                                                                                                           |
| `<svg:path [svgePath]="..." />`         | `<svg:path>`     | `SvgePathDirective`                                                                                                                               |
| `<svg:text [svgeText]="..." />`         | `<svg:text>`     | `SvgeTextDirective`                                                                                                                               |
| `<svg:image [svgeImage]="..." />`       | `<svg:image>`    | `SvgeImageDirective`                                                                                                                              |
| `<svg:use [svgeSymbolUse]="..." />`     | `<svg:use>`      | `SvgeSymbolUseDirective` (D-059) — instância de `<symbol>` master; o def é contribuído ao `<defs>` por `ActiveSymbolsService` (`svg-engine/edit`) |

> Cada diretiva popula apenas atributos do próprio elemento via host config.
> O wrapper `<svg:g data-node-id transform>` é fornecido pela host do
> dispatcher (single source of truth para data-node-id e transform).

### Serviços

| Serviço                | Responsabilidade                                                   |
| ---------------------- | ------------------------------------------------------------------ |
| `ViewportService`      | Pan, zoom, contentBox/viewBox via signals                          |
| `NodeRendererRegistry` | Plugin extensibility (D-020): registra renderers para tipos custom |

### Utilitários (`./lib/util/`)

| Símbolo                              | Responsabilidade                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `renderTransformAttr(transform)`     | Serializa `Transform` em SVG `transform=`, omitindo identidade                                                                             |
| `screenToDoc(svg, clientX, clientY)` | **D-036** — projeta coords client (screen) px em doc coords via `getScreenCTM().inverse()`. Guards para jsdom/SSR; retorna `Point \| null` |

---

## Entry point `svg-engine/io` (Fase 5) ✅

> **D-026 (2026-05-20)**: extraído de `svg-engine/edit` como entry point dedicado para viabilizar use case "Caso B — apenas otimização/conversão sem editor" (ver D-016). Re-exportado por `svg-engine/edit` para backward-compat.

### Tipos + registries

| Símbolo            | Responsabilidade                                                                       |
| ------------------ | -------------------------------------------------------------------------------------- |
| `Importer`         | Interface contributiva — `mediaType`/`extensions` + `import(blob): ImportResult` async |
| `Exporter`         | Interface contributiva — `mediaType`/`extension` + `export(doc): string \| Blob`       |
| `ImporterRegistry` | DI service — register/get/list + lookup `byMediaType` / `byExtension`                  |
| `ExporterRegistry` | DI service — análogo, com suporte a binary (Blob) e text (string) exporters            |

### Importadores/exportadores built-in

| Símbolo       | Responsabilidade                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `svgImporter` | parse string SVG → `SvgDocument` (rect/ellipse/line/polygon/polyline/path/group/text + defs/clip) |
| `svgExporter` | `SvgDocument` → string SVG determinística (serializer canonical)                                  |
| `pngExporter` | `SvgDocument` → `Blob` PNG via `<canvas>`; suporta scale @1x/@2x/@3x via opts                     |
| `renderPng`   | Função pura de rasterização (usada pelo `pngExporter` e pelo preset retina)                       |

Plugins wrappers (`builtinIoPlugin`, `pngExporterPlugin`) ficam em `svg-engine/edit` porque dependem do scaffolding `EditorPlugin`.

---

## Entry point `svg-engine/optimize` (Fase 5) ✅

> **D-026 (2026-05-20)**: extraído de `svg-engine/edit`. Mesma motivação que `/io`.

### Tipos + registry

| Símbolo             | Responsabilidade                                                                      |
| ------------------- | ------------------------------------------------------------------------------------- |
| `Optimizer`         | Interface contributiva — `id`/`name`/`order`/`defaultEnabled?` + `optimize(doc): doc` |
| `OptimizerRegistry` | DI service — register/get/list + `runPipeline(doc, enabledIds?)` ordena por `order`   |
| `OptimizeCommand`   | `Command` que dispara o pipeline + push single undo entry (skip se nada mudou)        |

### Passes built-in (conservadores)

| Símbolo                        | Order | Efeito                                                                                |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------- |
| `precisionOptimizer`           | 10    | Arredonda numerics a 3 casas (rect x/y/w/h, path `d`, styles)                         |
| `dropDefaultsOptimizer`        | 50    | Remove `opacity:1`/`fillOpacity:1`/`strokeOpacity:1`/`visibility:visible`             |
| `stripAuthoredTitlesOptimizer` | 80    | Remove `<title>` autorais (opt-in, D-072g) — `metadata.name` vira `<title>` no export |
| `pruneEmptyGroupsOptimizer`    | 90    | Remove `<g></g>` recursivamente (root preservado)                                     |

Plugin wrapper (`builtinOptimizersPlugin`) fica em `svg-engine/edit`.

---

## Entry point `svg-engine/edit` (Fases 3 e 4)

### Componentes

| Selector                           | Responsabilidade                                                                                                                                                                                                                                                                                                                                                                                     | Fase |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `<svge-renderer>`                  | Renderer base (read-only) + slot `<ng-content>` para overlays projetados. Consumer ativa gestures via diretivas `[svgeShellInteractions]` (D-039). **Não existe componente `<svge-canvas>`** — esse selector era da fase de planejamento; a composição real é renderer + diretivas.                                                                                                                  | 2-3  |
| `<svg:g svgeSelectionOverlay>`     | Handles de seleção (camada acima do renderer). Esconde-se quando Direct Select está ativo + focusNode é path (deixa o AnchorOverlay tomar conta)                                                                                                                                                                                                                                                     | 3    |
| `<svg:g svgeRotationPivot>`        | Crosshair editável do pivot de rotação (D-022 Affinity-grade): free-drag com snap-to-anchors (Alt=bypass); clique sem drag abre popover 3×3 para snap exato (TL/TC/TR/ML/MC/MR/BL/BC/BR); Esc cancela; double-click reseta; pivot custom persiste por nó. **Selector é attribute directive** (`g[svgeRotationPivot]`) — precisa morar dentro de `<svg>`.                                             | 3    |
| `<svg:g svgeMarquee>`              | Retângulo de seleção por arrasto. **Selector é attribute directive** (`g[svgeMarquee]`).                                                                                                                                                                                                                                                                                                             | 3    |
| `<svg:g svgeSnapGuides>`           | Linhas-guia de alinhamento (overlay)                                                                                                                                                                                                                                                                                                                                                                 | 3    |
| `<svg:g svgeAnchorOverlay>`        | Path/anchor editor (Bloco 6-PathEditor): squares editáveis em cada anchor + handle circles (in/out) + segment hit-zones para Alt+click (InsertAnchor). Dblclick cicla kind cusp → smooth → symmetric. Multi-anchor selection via `AnchorSelectionService`. Coords sempre via `composeAncestorMatrix` (segue transforms do grupo)                                                                     | 6    |
| `<svg:g svgeGridOverlay>`          | Grid lines major/minor reativo ao viewBox + signals do `WorkspaceService`                                                                                                                                                                                                                                                                                                                            | 4f   |
| `<svg:g svgeGuidesOverlay>`        | Linhas de guide H/V (ciano), selecionáveis e removíveis via Delete                                                                                                                                                                                                                                                                                                                                   | 4f   |
| `<svg:g svgePageOverlay>`          | (D-079 + D-080) Paper rect + margens inset dashed. Deriva de `ActivePageService.activePage()` quando há D-079 page; fallback para `WorkspaceService.page()` em docs legacy. **PAGES-REFACTOR Fase 4**: o rect também carrega `data-node-id={pageId}` + `pointer-events: all` quando há página ativa, servindo como hit-target persistente (substituiu o rect do node-renderer que provocava flicker) | 4f   |
| `<svg:g svgePageSelectionOverlay>` | (D-080 Fases 2/6) Overlay interativo da página selecionada: 4 brackets em "L" (decorativos, padrão draw.io), label flutuante `"Name — W×H"`, move handle (top-center) + 8 resize handles (4 corners + 4 edges, cursores axiais). Drag → ResizePageCommand/MovePageCommand dispatched on pointerup (preview-only durante o drag; conteúdo só salta no commit, mantendo undo stack limpo)              | 4f   |
| `<svge-pages-panel>`               | (D-079 PAGES-C) Strip de tabs (browser-style) com create/select/rename/delete. Auto-hide quando o doc não tem páginas (legacy single-root); flag `[alwaysShow]` força visibilidade para o bootstrap (`<svge-shell-pro>` + opt-in no `<svge-editor>` via `[showPagesPanel]`)                                                                                                                          | 4f   |
| `<svge-rulers>`                    | HTML overlay top + left com ticks "nice spacing" (1/2/5 × 10ⁿ). Drag-from-ruler cria guide                                                                                                                                                                                                                                                                                                           | 4f   |
| `<svge-isolation-breadcrumb>`      | Trail "Document › Group › Group" do nível atual de isolation. Click navega up                                                                                                                                                                                                                                                                                                                        | 5    |

### Serviços

| Serviço                                                                                                                   | Responsabilidade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SelectionService`                                                                                                        | IDs selecionados, foco, hover                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `TransformService`                                                                                                        | Drag, resize, rotate, scale (gera comandos). Mantém pivot Affinity-grade (D-022): `Map<NodeId, Point>` em coordenadas node-local; default centro; APIs `setPivot/setPivotAnchor/resetPivot/clearAllPivots`. Snap a 9 anchors (Alt bypass). Para multi-selection, pivot é relativo à bbox composta e reseta na mudança.                                                                                                                                                                          |
| `MarqueeService`                                                                                                          | Drag-to-select state (start/update/end/cancel + rect normalizado). Pure helper `nodesInsideMarquee` para hit-test (D-022, padrão Illustrator/Affinity)                                                                                                                                                                                                                                                                                                                                          |
| `SnapService`                                                                                                             | Snap-to-grid + snap-to-objects (D-022.snap). Config `enabled`/`mode`/`gridSize`/`thresholdPx`. Pure resolver `resolveSnap(moving, targets, threshold)`. ActiveGuides signal lido pelo `<svg:g svgeSnapGuides>`                                                                                                                                                                                                                                                                                  |
| `AlignmentService`                                                                                                        | 6 alinhamentos (left/center-x/right/top/center-y/bottom) + 2 distribuições (horizontal/vertical centers) anchorados na union bbox. Dispara `TranslateManyCommand` (1 entrada de undo)                                                                                                                                                                                                                                                                                                           |
| `ClipboardService`                                                                                                        | Copy/paste interno e integração com clipboard do SO                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PluginRegistry`                                                                                                          | Plugin extensibility infra (D-020 + Bloco 5a): install/uninstall com lifecycle, semver gate, dep check, LIFO disposal de `Disposable`s trackeados. Universal: toda capability registry (Tool/Optimizer/Importer/...) pluga sobre essa infra                                                                                                                                                                                                                                                     |
| `ToolRegistry`                                                                                                            | Capability registry de tools (D-020 + Bloco 5b — primeira categoria mapeada em D-023). Plugins registram `Tool` (id/label/cursor/shortcut/hooks pointer/key) via `ctx.track(reg.register(tool))`                                                                                                                                                                                                                                                                                                |
| `ToolHostService`                                                                                                         | Tool ativa + roteamento de eventos do canvas (`activate`/`deactivate`/`route*`). `activeTool` é computed que re-deriva da registry — resiliente a uninstall do plugin do tool ativo                                                                                                                                                                                                                                                                                                             |
| `AnchorSelectionService`                                                                                                  | Multi-anchor selection (Bloco 6-PathEditor): `Set<AnchorRef>` reativo + helpers add/toggle/selectOne/clear. Refs estáveis durante a vida do gesto; consumer deve invalidar/rebase em `InsertAnchorCommand` (shift de índices)                                                                                                                                                                                                                                                                   |
| `IsolationService`                                                                                                        | Isolation mode (entra em um grupo focado, dimming dos outros). Signal `isolationRootId` + breadcrumb computed                                                                                                                                                                                                                                                                                                                                                                                   |
| `AutoSaveService`                                                                                                         | Debounced auto-save em localStorage (key `svge.autosave`, default 800ms). `recover()` retorna doc serializado se existe; `clear()` limpa entrada                                                                                                                                                                                                                                                                                                                                                |
| `LayersService`                                                                                                           | Visibility (`hiddenIds`) + lock (`lockedIds`) Set signals. Lock = totalmente off-limits — SelectionService filtra writes, TransformService rejeita gestos. Unlock NÃO restaura seleção (convenção Affinity/Figma)                                                                                                                                                                                                                                                                               |
| `WorkspaceService`                                                                                                        | Background + page config (legacy fallback) + grid + guides + rulers + outline (presentation meta acima do `SvgDocument`). Não persiste no SVG (D-021). **D-080**: deixou de ser a fonte de verdade do "paper" quando há D-079 page ativa — `<svg:g svgePageOverlay>` agora deriva de `ActivePageService.activePage()` primeiro; o `WorkspaceService.page()` só desenha em docs legacy single-root                                                                                               |
| `PagesService` / `ActivePageService` (`svg-engine/edit`)                                                                  | (D-079 PAGES-B + D-080) Lista derivada de páginas + signal da página ativa. `ActivePageService` implementa `InsertParentResolver` (D-080 Fase 1: `AUTO_PARENT` no `InsertNodeCommand` resolve para a página ativa via CommandBus); helpers `treeForRendering`/`viewBoxForRendering` para o renderer; persiste o id em localStorage via `ACTIVE_PAGE_STORAGE_KEY` (D-080 Fase 7); clear da seleção ao trocar de página (efeito interno, padrão Illustrator/Affinity)                             |
| `MenuContributionRegistry`/`ShortcutRegistry`/`PaletteRegistry`/`ImporterRegistry`/`ExporterRegistry`/`OptimizerRegistry` | Capability registries do D-023 categorias 4-9. Todas seguem mesmo padrão: signal-backed, `register(item): Disposable`, throw em duplicate id, lookup helpers (`bySlot`/`byCategory`/`byExtension`/`byMediaType`)                                                                                                                                                                                                                                                                                |
| `AnimationService` / `PlaybackService` (escopados)                                                                        | **D-082 F2 (2026-06-03)** Animation Timeline. `AnimationService`: deriva `doc()`/`tracks()`/`durationMs()` da página ativa (container em `metadata.customData[svgeAnimation]`); CRUD via comandos undoable; `sample(t)` + catálogo (`animatablePropertiesFor`/`currentValue`). `PlaybackService`: `playhead` signal + loop `requestAnimationFrame` (play/pause/seek/step/loop/speed). Ambos no `provideSvgEngineEditorScope`. Não-destrutivo: só o `playhead` muda; a árvore exibida é derivada |

### Input helpers (`./lib/pointer/`) — D-036

> Consolidados em 2026-05-20 (D-036) para eliminar 7+ duplicatas inline espalhadas por overlays e gestos. Funções puras importáveis por plugins de tools/overlays terceiros.

| Símbolo                               | Responsabilidade                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capturePointer(event: PointerEvent)` | Defensive `setPointerCapture(event.pointerId)` no `event.target`. Silent no-op quando target/method indisponíveis ou browser rejeita (Safari/Firefox edge) |
| `releasePointer(event: PointerEvent)` | Simétrico de `capturePointer`                                                                                                                              |
| `isEditableTarget(target)`            | Gate de "estou digitando em INPUT/TEXTAREA/SELECT/contenteditable" — usado pelo `ShortcutService` para suprimir shortcuts globais durante edição de texto  |

---

## Entry point `svg-engine/ui` (Fase 4) — Angular Material

### Componentes

| Selector                            | Responsabilidade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fase |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `<svge-editor>`                     | Composição completa: canvas + toolbar + painéis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 4    |
| `<svge-toolbar>`                    | Barra de ferramentas extensível                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 4    |
| `<svge-layers-panel>`               | Lista de camadas, reordenação, visibilidade, lock                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 4    |
| `<svge-inspector>`                  | Propriedades do elemento selecionado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 4    |
| `<svge-color-palette>`              | Cores e gradientes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 4    |
| `<svge-effects-panel>`              | **D-047 + D-144 + D-146 (2026-06-29)** Editor do pipeline de efeitos. Picker por categoria (adiciona ao pipeline), reordenação/remover por estágio, **chain** (≥2 efeitos). **D-144**: por estágio renderiza controles nativos dos `Effect.params` (slider+number / cor / select / checkbox), chips de `presets` e Reset. **D-146 (UX)**: estágios em **acordeão** (1 expandido por vez; novo efeito auto-expande), **mute** por efeito (não-destrutivo, `EffectInstance.enabled`), picker "Add effect" sob demanda, readout valor+unidade. Aplica via re-encode do `style.filter` + `SetStylePropertyOnManyCommand` (1 undo); storage stateless (`url(#effectId)` / `url(#svge-chain-…)` / `url(#svge-fx-…)`). Só `MatIcon`/`MatIconButton` | 6    |
| `<svge-context-menu>`               | Menu contextual sobre elementos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 4    |
| `<svge-theme-toggle>`               | Toggle light/dark explícito (D-012 part 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 4    |
| `<svge-svg-source-dialog>`          | **(2026-05-20)** Visualizador live do SVG exportado via `svgExporter` + `ExporterRegistry`. Copy-to-clipboard com fallback `execCommand`. Reativo a mudanças no document. Inkscape "XML Editor" / Boxy SVG "Source" parity. Abrir via `MatDialog`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 6    |
| `<svge-smart-object-editor-dialog>` | **D-074 (2026-05-25)** Editor textarea da fonte SVG dos filhos de um Smart Object. Exporta children como `<svg>` parseável, re-parseia no Apply via `svgImporter`, despacha `EditSmartObjectContentsCommand` (single undo). Erros e warnings inline. Abrir via `SvgeSmartObjectEditorDialogService.open(nodeId, injector?)`                                                                                                                                                                                                                                                                                                                                                                                                                  | 6    |
| `<svge-status-bar>`                 | **D-035 (2026-05-20)** Status bar lendo 8 services: tool/selection/cursor/zoom/snap/isolation/dirty. 7 sections opt-in via `[sections]` input. Standalone — usável fora do `<svge-editor>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 6    |
| `<svge-editor>` (expandido)         | **D-034 + D-037 (2026-05-20)** ganhou inputs `[showToolbar]` / `[showStatusBar]` (default `true`), `[toolbarSlot]` (default `'toolbar.main'`). Integra `<svge-toolbar>` para contribuições de plugin + `<svge-status-bar>` para status. Slots de projeção `[toolbar-extras]` e `[status-bar]` para customização. **3 modos garantidos** (D-037): Headless puro / Shell completo / Shell parcial — invariantes Mosaicoo. **D-038 (2026-05-20)** ganhou 4 flags opt-in: `[showMenuBar]` / `[showContextMenu]` + `[contextMenuSlot]` / `[showToolOptions]` + `[toolOptionsShowPlaceholder]` (defaults `false` — preserva D-037)                                                                                                                 | 4+6  |
| `<svge-menu-bar>`                   | **D-038 Phase 1 (2026-05-20)** Material dropdowns lendo `MenuContributionRegistry` slots `menu.file/edit/view/object/help`. Submenus via `MenuContribution.parentId` (aditivo, multi-nível) + dividers via `MenuContribution.divider`. Inputs `[slots]` / `[labels]` (i18n). Standalone                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 6    |
| `<svge-context-menu>`               | **D-038 Phase 2 (2026-05-20)** Lista vertical de items do `MenuContributionRegistry` para um slot `context.*`. Material divider, shortcut hints, ARIA `role="menu"`. Companheiros: `SvgeContextMenuService` (CDK Overlay, single-instance, dismiss em outside-click/Esc) + `[svgeContextMenu="slot"]` diretiva (right-click handler; slot vazio = disabled). Constantes `CONTEXT_MENU_SLOT.CANVAS/NODE/LAYER/ANCHOR/GUIDE`                                                                                                                                                                                                                                                                                                                   | 6    |
| `<svge-tool-options>`               | **D-038 Phase 3 (2026-05-20)** Renderiza `Tool.optionsComponent` da tool ativa via `*ngComponentOutlet`. Tool interface ganhou campo opcional `optionsComponent?: Type<unknown>` (aditivo, zero break). `[showPlaceholder]` controla colapso vs "No options" placeholder                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 6    |
| `<svge-tools-palette>`              | **D-038 Phase 4 (2026-05-20)** Strip vertical de tool icon buttons; le `ToolRegistry.tools()`. Active highlight, tooltip label+shortcut, `aria-orientation="vertical"`. Standalone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 6    |
| `<svge-shell-pro>`                  | **D-038 Phase 4 (2026-05-20)** Composição profissional grid: menu bar (top) + toolbar + tool options + [tools palette \| canvas \| layers + inspector] + status bar. Right-click context menu sempre ativo. Coexiste com `<svge-editor>` (não substitui — é "drop-in Illustrator-grade"). Inputs `[tree]`/`[viewBox]`/`[title]`/`[ariaLabel]`/`[contextMenuSlot]`. **D-082 F6**: input `[showTimeline]` (default `false`) monta o `<svge-timeline>` no dock inferior e alimenta o renderer com `animatedTree()` (preview ao vivo)                                                                                                                                                                                                            | 6    |
| `<svge-timeline>`                   | **D-082 F4–F6 (2026-06-03)** Animation Timeline (dock inferior): régua de tempo + tracks/keyframes (losangos) agrupados por nó + indicador de playhead + transporte (play/pause/step/loop/speed). Edição: criar keyframe no playhead (captura valor vivo), arrastar p/ mover, selecionar+deletar, escolher easing, definir duração, scrubbing. Tudo via comandos undoable do `AnimationService`. Lê `AnimationService`/`PlaybackService`/`SelectionService` (escopados). Não-destrutivo                                                                                                                                                                                                                                                      | 6    |

### Dialog design system — `<svge-dialog-shell>` + `svgeDialogConfig` (D-044 follow-up)

Todo dialog Material que o editor abre deve passar pelo shell padrão.
Sem isso cada dialog re-inventa header/footer/sizing → ruptura de consistência
visual + bug-fix nascido em um dialog (drag/resize, close button, ARIA)
não propaga pra outros. **Regra**: novos consumers do `MatDialog` **devem**
usar essas duas primitivas em conjunto.

**Anatomia**:

| Primitiva                         | Função                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `svgeDialogConfig(size, extras?)` | Factory de `MatDialogConfig` com sizing canônico + `autoFocus: false` + `panelClass` |
| `<svge-dialog-shell>`             | Wrapper Angular com header (icon + title + subtitle + Close) + body + footer         |

**Sizing buckets** (use o menor que comporte o conteúdo sem cortar):

| `size` | width | Caso típico                                       |
| ------ | ----- | ------------------------------------------------- |
| `'sm'` | 440px | Confirmações, About, mini-formulários (≤3 fields) |
| `'md'` | 600px | Settings, find/replace, dialogs principais        |
| `'lg'` | 720px | Source viewers, editors com `<pre>` ou textarea   |
| `'xl'` | 960px | Asset managers, batch operations, previews        |

Altura sempre `maxHeight: '85vh'`. Usuário pode **arrastar** o dialog pela
header zone (cdkDrag) e **redimensionar** pelo handle no canto inferior
direito — herdado automaticamente do shell, sem código no consumer.

**Content-projection slots** (4):

| Slot                        | Default        | Quando usar                                               |
| --------------------------- | -------------- | --------------------------------------------------------- |
| `default`                   | body do dialog | sempre — coloca o conteúdo principal aqui                 |
| `[svgeDialogHeaderActions]` | (vazio)        | botões no header (Copy, Reset, etc.) — apareça ANTES do X |
| `[svgeDialogFooterActions]` | (vazio)        | botões primários/secundários (OK/Cancel/Apply)            |
| `[svgeDialogFooterStatus]`  | (vazio)        | texto de status no footer (contagem, dirty flag, hint)    |

**Pattern centralized opener service**: cada dialog tem um service `Svge*DialogService`
com método `open(parentInjector?)` que encapsula `MatDialog.open(Component, svgeDialogConfig(size, { injector }))`.
Razão: sem essa centralização, cada call site da rota redescobre que `MatDialog.open()` direto pega
o injector da overlay root (D-042 bug multi-editor — mutaria editor errado).
Plugin de menu chama o service via `fromCtx`, nunca instancia `MatDialog` diretamente.

**Exemplo end-to-end** (criar um dialog "Hello World"):

```ts
// 1. Component — projects/svg-engine/ui/src/lib/hello-dialog/hello-dialog.component.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { SvgeDialogShell } from '../dialog-shell';

@Component({
  selector: 'svge-hello-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatButton],
  template: `
    <svge-dialog-shell icon="waving_hand" title="Hello" subtitle="A demo dialog">
      <p>Welcome to SVGEngine.</p>
      <ng-container svgeDialogFooterActions>
        <button mat-button (click)="ref.close()">Close</button>
      </ng-container>
    </svge-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeHelloDialog {
  constructor(readonly ref: MatDialogRef<SvgeHelloDialog>) {}
}

// 2. Service — projects/svg-engine/ui/src/lib/hello-dialog/hello-dialog.service.ts
import { inject, Injectable, Injector } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { svgeDialogConfig } from '../dialog-shell';
import { SvgeHelloDialog } from './hello-dialog.component';

@Injectable({ providedIn: 'root' })
export class SvgeHelloDialogService {
  private readonly dialog = inject(MatDialog);
  open(parentInjector?: Injector): void {
    this.dialog.open(SvgeHelloDialog, svgeDialogConfig('sm', { injector: parentInjector }));
  }
}

// 3. Menu wiring — em builtinUiMenuContributionsPlugin
ctx.track(
  reg.register({
    id: 'svge.builtin.help.hello',
    slot: MENU_SLOT.HELP,
    label: 'Hello…',
    icon: 'waving_hand',
    order: 5,
    run(runCtx) {
      fromCtx(SvgeHelloDialogService, runCtx).open(runCtx?.injector);
    },
  }),
);
```

**Headless boundary (D-017)**: dialog-shell vive em `svg-engine/ui` (importa
`@angular/material/dialog` + `@angular/cdk/drag-drop`). Plugins que usam dialogs
**precisam** ser registrados em `builtinUiMenuContributionsPlugin` (não no
edit-side `builtinMenuContributionsPlugin`) — caso contrário a build do
edit quebra com import inválido. Mesmo motivo do D-066 ter movido o
Trace Image menu entry para o plugin UI.

---

## Entry points de IA `svg-engine/ai/*` (D-046)

Camada de comandos por linguagem natural, **opt-in** e desacoplada do
core (Modos D-037 headless não pagam o custo se não importarem).

### `svg-engine/ai/nlu` — NLU rule-based (headless)

Depende apenas de `@angular/core` + `svg-engine/core` + `svg-engine/edit`
(sem Material). Traduz texto natural em comandos do `CommandBus`.

| Símbolo                                                                | Responsabilidade                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NaturalLanguageService`                                               | Singleton root: `registerIntent` / `parse` / `execute`. Regex + dicionário multilíngue PT/EN + Levenshtein fuzzy matching                  |
| `builtinNluPlugin`                                                     | Bootstrap opt-in: auto-discovery dos menu items (`discoverMenuIntents`) + intents customizados (`create-shape`)                            |
| `LlmIntentResolverService` / `OllamaChatProvider` (`AI_CHAT_PROVIDER`) | Escalonamento opcional para LLM local (Ollama, D-093/D-095) quando o rule-based não resolve; também gera SVG via prompt                    |
| Dicionários / parsers                                                  | `COLOR_DICTIONARY`/`SHAPE_DICTIONARY`/`ACTION_DICTIONARY`/`STOPWORDS` (extensíveis) + `tokenize`/`levenshtein`/`fuzzyMatch`/`extractSlots` |
| Tipos                                                                  | `NluIntent`, `NluContext`, `NluCandidate`, `NluSlotSchema`                                                                                 |

### `svg-engine/ai/nlu-ui` — UI da NLU (Material)

Depende de `@angular/material` + `@angular/cdk` (junto com `ui`, único par
que pode importar Material — D-017).

| Símbolo                             | Responsabilidade                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `<svge-nlu-input>` (`SvgeNluInput`) | Input de texto + botão de voz + autocomplete de intents + lista de resultados com confiança; model picker para o modo LLM |
| `VoiceRecognitionService`           | Wrapper da Web Speech API (detecção de suporte + estado de gravação via signals)                                          |
| `VoiceEngineService`                | Seleciona o provider de voz ativo (Web Speech nativo ou Whisper WASM)                                                     |

### `svg-engine/ai/nlu-voice-wasm` — Voz 100% local (Whisper)

Reconhecimento de voz offline via Whisper (`@huggingface/transformers` +
`onnxruntime-web`, ambos lazy `import()` — só carregam quando a voz Whisper
é acionada). Mesmo contrato do `VoiceRecognitionService`.

| Símbolo                                        | Responsabilidade                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `WhisperVoiceService`                          | Provider de voz local; assets (modelo + `.wasm`) servidos pela própria origem |
| `provideWhisperVoice` / `WHISPER_VOICE_CONFIG` | Configuração de caminhos de assets, dtype e idioma (`WhisperVoiceConfig`)     |

## Comandos

| Comando                                                                              | Mutação                                                                                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Tree ops (Fase 2 + 4)**                                                            |                                                                                                                                       |
| `InsertNodeCommand`                                                                  | Adiciona nó à árvore (parent + index)                                                                                                 |
| `RemoveNodeCommand`                                                                  | Remove nó                                                                                                                             |
| `MoveNodeCommand`                                                                    | Reposiciona nó via translate (compõe no `transform`)                                                                                  |
| `MoveNodeInTreeCommand`                                                              | Move + reparent atomic (cross-group ok, cycle prevention)                                                                             |
| `SetPropertyCommand<T, K>`                                                           | Altera propriedade tipada (fill, stroke, etc.)                                                                                        |
| `SetPropertyOnManyCommand`                                                           | Mesma mudança em N nós, 1 entrada de undo                                                                                             |
| `TranslateManyCommand`                                                               | Translate em N nós (alinhamento/distribuição), 1 entrada                                                                              |
| `GroupSelectionCommand`                                                              | Agrupa seleção em novo group (preserva stacking + parent order)                                                                       |
| `UngroupCommand`                                                                     | Promove children do group; rejeita root; group transform DROPPED (limitação documentada)                                              |
| `ReorderNodeCommand`                                                                 | Z-order (subir/descer/topo/fundo)                                                                                                     |
| `RenameNodeCommand`                                                                  | Set `metadata.name` para inline-rename no Layer Panel                                                                                 |
| **Transform (Fase 3)**                                                               |                                                                                                                                       |
| `RotateNodeCommand`                                                                  | Rotação ao redor de pivot (`T(p)·R(θ)·T(-p)·prev`)                                                                                    |
| `ResizeNodeCommand`                                                                  | Resize com bake real da geometria (não compõe scale matrix). Fallback para `composeAnchoredScale` em nós rotacionados                 |
| **Path Editor (Bloco 6-PE)**                                                         |                                                                                                                                       |
| `ConvertNodeToPathCommand`                                                           | rect/ellipse/line/polygon/polyline → path equivalente (ellipse via 4 cubic beziers com kappa)                                         |
| `MoveAnchorCommand`                                                                  | Move point ou handle. Smooth/symmetric enforce constraint na opposite handle                                                          |
| `InsertAnchorCommand`                                                                | Insere via de Casteljau subdivision no parâmetro t ∈ (0, 1)                                                                           |
| `RemoveAnchorCommand`                                                                | Remove anchor; drop subpath se < 2 anchors                                                                                            |
| `ConvertAnchorTypeCommand`                                                           | Muda kind via `enforceKind`. cusp colapsa handles ("Convert Anchor Point" Illustrator); smooth/symmetric snap                         |
| **Pathfinder (Bloco 6-PE)**                                                          |                                                                                                                                       |
| `UnionCommand`/`IntersectCommand`/`SubtractCommand`/`ExcludeCommand`/`DivideCommand` | 5 boolean ops via polygon-clipping. Divide retorna N regions com `styleSourceIdx` (regiões privadas herdam style do input originador) |

## Modelo de dados

`SVG_NODE_TYPES` (em `svg-engine/core`) define **10 tipos** de nó:

```
SvgNode (união discriminada por `type`)
├── ShapeNode
│   ├── RectNode
│   ├── EllipseNode
│   ├── LineNode
│   ├── PolygonNode
│   ├── PolylineNode
│   └── PathNode
├── TextNode          (rich text via `runs`, D-100)
├── ImageNode
├── SymbolUseNode     (instância de `<symbol>` master, D-059)
└── GroupNode         (contém SvgNode[])
```

> Todo nó tem: `id`, `type`, `transform`, `style`, `metadata`.
> Todo nó é tratado como **imutável**: mutações geram nova versão.

---

## Decisões de design já tomadas

Os pontos que este documento listava como "a definir" foram resolvidos
ao longo da primeira etapa:

- **API pública exata** de cada componente/serviço → ver
  [09 — API Pública](09-api-publica.md) e os `public-api.ts` de cada entry point.
- **Hit-testing**: baseado no DOM (`data-node-id` + `elementsFromPoint`),
  com tolerância por área para formas sem fill/stroke fino
  (`resolveSelectableNodeIdFromElement`, D-091).
- **Path editing**: edição de pontos de Bézier via `AnchorOverlay` +
  comandos `MoveAnchor`/`InsertAnchor`/`RemoveAnchor`/`ConvertAnchorType`.
- **Constraints/guides**: `SnapService` (grid + objetos), smart guides
  durante drag e `AlignmentService` (alinhar/distribuir).
