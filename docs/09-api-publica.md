# 09 — API Pública

> Contrato versionado da library. Tudo que aparece aqui é considerado
> **superfície pública** sujeita a SemVer. Mudanças breaking exigem
> bump major + entrada em `08-historico-de-alteracoes.md` + nota em
> `04-decisoes-tecnicas.md`.
>
> Itens marcados como `@internal` ou `@experimental` **não** entram
> aqui — ficam fora do `public-api.ts` ou anotados explicitamente.

---

## Status

- **Versão**: `0.0.0` (pré-release; APIs ainda em formação durante Fases 2..5).
- **SemVer estável**: a partir de `1.0.0` (após Fase 5 — IO + extensibilidade).
- **Política até `1.0.0`**: minor pode ter breaking se devidamente documentado.
- **Política após `1.0.0`**: breaking = major.

---

## Entry points

Cada entry point tem sua própria seção. A seção é populada conforme
a fase do roadmap implementa o conteúdo.

### `svg-engine/core` (Fase 2 Bloco 1) ✅

> Modelo de dados, comandos, histórico e estado. **Zero deps de UI.**

#### Tipos primitivos (`./lib/types/`)

| Símbolo                                                               | Descrição                                       |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `NodeId`                                                              | branded `string` para IDs de nó                 |
| `toNodeId(value: string): NodeId`                                     | coerção segura a partir de uma string externa   |
| `generateNodeId(): NodeId`                                            | gera UUID via `crypto.randomUUID` (ou fallback) |
| `Transform`                                                           | matriz afim 6-elementos `[a,b,c,d,e,f]`         |
| `IDENTITY_TRANSFORM`                                                  | constante para identidade                       |
| `translate / scale / rotate / multiply / applyTransform / isIdentity` | ops de matriz                                   |
| `Point`, `ORIGIN`                                                     | ponto 2D imutável                               |
| `BoundingBox`, `bbox`, `unionBBox`, `containsPoint`                   | caixa axis-aligned + helpers                    |
| `SvgStyle`, `EMPTY_STYLE`, `DEFAULT_STYLE`                            | atributos de apresentação                       |
| `SvgMetadata`, `EMPTY_METADATA`                                       | metadados do editor (nome, lock, visibilidade)  |

#### Modelo (`./lib/model/`)

| Símbolo                                                                                                                          | Descrição                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `SvgNodeBase`                                                                                                                    | interface base (id, transform, style, metadata) |
| `RectNode`, `EllipseNode`, `LineNode`, `PolygonNode`, `PolylineNode`, `PathNode`, `TextNode`, `ImageNode`, `GroupNode`           | os 9 tipos concretos                            |
| `SvgNode` (union)                                                                                                                | discriminated union dos 9                       |
| `SvgNodeType`, `SVG_NODE_TYPES`                                                                                                  | discriminadores literais                        |
| `isGroupNode(node): node is GroupNode`                                                                                           | type guard                                      |
| `createRect / createEllipse / createLine / createPolygon / createPolyline / createPath / createText / createImage / createGroup` | factories que retornam nós válidos              |
| `NodeFactoryOptions`                                                                                                             | opções comuns das factories                     |

#### Tree (`./lib/tree/`) — operações imutáveis

| Símbolo                                                    | Descrição                                     |
| ---------------------------------------------------------- | --------------------------------------------- |
| `findNodeById(root, id): SvgNode \| null`                  | busca recursiva                               |
| `findParent(root, childId): GroupNode \| null`             | localiza grupo pai                            |
| `insertNode(root, parentId, node, index?): GroupNode`      | insere com structural sharing                 |
| `removeNode(root, id): GroupNode`                          | remove + reallocação do path                  |
| `updateNode<T>(root, id, updater: (n: T) => T): GroupNode` | atualiza imutável; rejeita mudança de id/type |
| `walk(root, visitor)`                                      | traversal pre-order                           |
| `collectNodes(root): readonly SvgNode[]`                   | array flat                                    |
| `countNodes(root, { includeRoot? })`                       | contagem                                      |

#### Document (`./lib/document/`)

| Símbolo                      | Descrição                                     |
| ---------------------------- | --------------------------------------------- |
| `SvgDocument`                | container top-level (id, viewBox, root, defs) |
| `createEmptyDocument(opts?)` | factory                                       |
| `DEFAULT_VIEW_BOX`           | `bbox(0, 0, 800, 600)`                        |
| `CreateDocumentOptions`      | opções da factory                             |

#### Commands (`./lib/commands/`)

| Símbolo                                                              | Descrição                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Command` (interface)                                                | `id`, `label`, `execute(ctx)`, `undo(ctx)`                                                   |
| `CommandResult`, `ok()`, `fail(error)`                               | resultado padronizado                                                                        |
| `CommandContext`                                                     | `{ state: EditorStateService }`                                                              |
| `InsertNodeCommand(parentId, node, index?)`                          | inserção reversível                                                                          |
| `RemoveNodeCommand(nodeId)`                                          | remoção reversível (captura posição original)                                                |
| `MoveNodeCommand(nodeId, dx, dy)`                                    | translação composta sobre transform existente                                                |
| `SetPropertyCommand<T extends SvgNode, K extends keyof T>(id, K, V)` | set/unset de uma propriedade qualquer (≠ id/type)                                            |
| `RotateNodeCommand(nodeId, angleRad, pivot)`                         | rotação em torno de pivot arbitrário (matriz `T(p)·R(θ)·T(-p)·prev`); undo restaura snapshot |
| `ResizeNodeCommand(nodeId, anchor, sx, sy)`                          | scale em torno de anchor fixo (handle oposto = âncora); rejeita scale factors não-finitos    |
| `composePivotRotation(existing, angleRad, pivot)` (helper puro)      | retorna a matriz pós-rotação sem dispatchar; útil para preview durante drag                  |
| `composeAnchoredScale(existing, sx, sy, anchor)` (helper puro)       | retorna a matriz pós-scale sem dispatchar; útil para preview durante drag                    |

#### Services (`./lib/state/`, `./lib/history/`, `./lib/command-bus/`)

| Serviço (`@Injectable({ providedIn: 'root' })`) | Descrição                                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EditorStateService`                            | signals: `document`, `dirty`, `nodeCount`, `allNodes`. APIs: `setDocument`, `resetDocument`, `markClean`                                                    |
| `HistoryService`                                | signals: `undoStack`, `redoStack`, `maxSize`, `canUndo`, `canRedo`. APIs: `push`, `peekUndo`, `peekRedo`, `commitUndo`, `commitRedo`, `clear`, `setMaxSize` |
| `CommandBus`                                    | `dispatch(cmd)`, `undo()`, `redo()` — ÚNICO ponto autorizado de mutação                                                                                     |

#### Cobertura de testes (Vitest)

- 5 arquivos de spec, 66 testes, todos verdes.
- Cobre: matrix transforms, tree-ops (find/insert/remove/update), 4
  comandos (execute + undo + edge cases), HistoryService (stack
  invariants), CommandBus (round-trip dispatch/undo/redo, integration).

### `svg-engine/render` (Fase 2 Bloco 2) ✅

> Renderer **read-only** + viewport + ponto de extensão para plugins
> (D-020). **Zero deps de UI Material.**

#### Top-level (`./lib/renderer/`)

| Símbolo                                             | Descrição                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<svge-renderer>` (`SvgeRenderer`)                  | Renderer raiz. Inputs: `tree` (req), `viewBox?`, `width?`, `height?`, `ariaLabel?`. Input `viewBox` é **seed** para `viewport.contentBox`; o atributo `viewBox` do `<svg>` é sempre derivado de `viewport.viewBox()` (zoom/pan funcionam mesmo com input set). |
| `projectDocumentToRenderer(doc): { tree, viewBox }` | helper para extrair os dois inputs de um `SvgDocument`                                                                                                                                                                                                         |

#### Viewport (`./lib/viewport/`)

| Símbolo                                     | Descrição                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ViewportService` (`@Injectable({ root })`) | signals: `contentBox`, `zoom`, `panX`, `panY`, `viewBox` (computed), `minZoom`, `maxZoom`. APIs: `setContentBox`, `setZoom`, `multiplyZoom`, `zoomIn`, `zoomOut`, `setPan`, `pan`, `reset`, `fit`, `setZoomLimits` |

#### Renderers per-tipo (diretivas) + dispatcher (`./lib/renderers/`)

> **Arquitetura SVG-pura**: per-tipo são diretivas aplicadas a elementos
> SVG nativos. Custom HTML elements dentro de `<svg>` não renderizam o
> conteúdo SVG embaixo deles (limitação da spec) — daí a escolha por
> diretivas em vez de componentes.

| Símbolo (selector)                         | Uso                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SvgeNodeRenderer` (`g[svgeNode]`)         | Dispatcher Component. Host = `<svg:g>` com `data-node-id`+`transform`. `@switch` dos 8 built-ins + `group` recursivo + fallback registry. Uso: `<svg:g svgeNode [node]="root"></svg:g>` |
| `SvgeRectDirective` (`[svgeRect]`)         | Aplicada a `<svg:rect>`. Input alias `svgeRect: RectNode`                                                                                                                               |
| `SvgeEllipseDirective` (`[svgeEllipse]`)   | Aplicada a `<svg:ellipse>`. Input alias `svgeEllipse: EllipseNode`                                                                                                                      |
| `SvgeLineDirective` (`[svgeLine]`)         | Aplicada a `<svg:line>`. Input alias `svgeLine: LineNode`                                                                                                                               |
| `SvgePolygonDirective` (`[svgePolygon]`)   | Aplicada a `<svg:polygon>`. Input alias `svgePolygon: PolygonNode`                                                                                                                      |
| `SvgePolylineDirective` (`[svgePolyline]`) | Aplicada a `<svg:polyline>`. Input alias `svgePolyline: PolylineNode`                                                                                                                   |
| `SvgePathDirective` (`[svgePath]`)         | Aplicada a `<svg:path>`. Input alias `svgePath: PathNode`                                                                                                                               |
| `SvgeTextDirective` (`[svgeText]`)         | Aplicada a `<svg:text>`. Input alias `svgeText: TextNode`. Texto via interpolação `{{ node.content }}` no template                                                                      |
| `SvgeImageDirective` (`[svgeImage]`)       | Aplicada a `<svg:image>`. Input alias `svgeImage: ImageNode`                                                                                                                            |

#### Plugin extensibility (`./lib/registry/`) — **D-020**

| Símbolo                                          | Descrição                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `NodeRendererRegistry` (`@Injectable({ root })`) | API: `register(type, component)`, `unregister(type)`, `resolve(type)`, `registeredTypes()` |
| `SvgNodeRendererComponent` (`Type<unknown>`)     | tipo do componente renderer (loose; runtime contract documentado)                          |

> **Plugin install pattern**:
>
> ```ts
> inject(NodeRendererRegistry).register('star', SvgeStarRenderer);
> ```
>
> O dispatcher monta o componente via `*ngComponentOutlet` para qualquer
> nó com `type === 'star'`, passando `inputs: { node }`.

#### Util (`./lib/util/`)

| Símbolo                                             | Descrição                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `renderTransformAttr(t: Transform): string \| null` | serializa `Transform` em `matrix(a b c d e f)`; retorna `null` para identidade (omite atributo) |

#### Cobertura de testes (Vitest)

- 5 spec files novos no render: `transform-attr`, `node-renderer-registry`,
  `viewport.service`, `renderers` (smoke por tipo), `svge-renderer.component` (integração).
- Total da library `svg-engine`: **110 testes em 10 arquivos**, todos verdes.

### `svg-engine/io` (Fase 5)

> Parse, sanitização e serialização de SVG.

_(populado quando Fase 5 entregar)_

### `svg-engine/optimize` (Fase 5)

> Pipeline de otimizações de SVG.

_(populado quando Fase 5 entregar)_

### `svg-engine/edit` (Fase 3 Blocos 1+2+3) ⏳ em progresso

> Seleção, transformação, canvas interativo, plugins. **Zero deps de UI Material** (D-017).
>
> **Bloco 1** ✅ entregue: `SelectionService` + hit-testing helpers.
> **Bloco 2** ✅ entregue: geometry utils + `TransformService` skeleton + overlay visual + pivot Affinity-grade interativo.
> **Bloco 3** ✅ entregue: `TransformService` expandido com gestos move/rotate/resize; comandos `RotateNodeCommand` e `ResizeNodeCommand` no core; handles do overlay funcionais; body-drag no consumidor (playground).
> **Bloco 4** ⏳ próximo: `<svge-marquee>`, `SnapService`, alignment.
> **Bloco 5** ⏳: `ToolRegistry` (D-020 plugin point).

#### Selection (`./lib/selection/`)

| Símbolo                                      | Descrição                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SelectionService` (`@Injectable({ root })`) | signals: `selectedIds`, `focusId`, `hoverId`, `count`, `hasSelection`, `isSingleSelection`. APIs: `select`, `selectMany`, `addToSelection`, `toggle`, `deselect`, `clear`, `isSelected`, `setHover` |

**Invariantes**:

- `focusId` é sempre `null` ou membro de `selectedIds`.
- `select(id)` substitui a seleção por `[id]` e seta foco em `id`.
- `clear()` zera seleção e foco mas **preserva** hover (ortogonal).
- Hover é independente da seleção (permite highlight on-cursor sem alterar a seleção ativa).

#### Hit-testing (`./lib/hit-testing/`)

| Símbolo                                                     | Descrição                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `findOwningNodeId(target: Element \| null): NodeId \| null` | Caminha pelos `parentElement` buscando o `data-node-id` mais próximo. Pure function.                        |
| `resolveNodeIdFromEvent(event: Event): NodeId \| null`      | Wrapper que aceita um Event e delega; `null` quando target não é Element ou sem ancestor com `data-node-id` |

> O atributo `data-node-id` já é setado pelo dispatcher `<svge-node>`
> em `svg-engine/render`. Hit-testing funciona out-of-the-box.

#### Geometry (Bloco 2 — `./lib/geometry/`)

| Símbolo                                                               | Descrição                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `BBoxAnchor` (`'tl'\|'tc'\|'tr'\|'ml'\|'mc'\|'mr'\|'bl'\|'bc'\|'br'`) | Os 9 anchors padronizados (TL→BR, row-major)                                                      |
| `BBOX_ANCHORS: readonly BBoxAnchor[]`                                 | Tupla ordenada                                                                                    |
| `anchorPoint(bbox, anchor): Point`                                    | Coordenadas absolutas de 1 anchor                                                                 |
| `allAnchors(bbox): Record<BBoxAnchor, Point>`                         | Os 9 pontos de uma vez                                                                            |
| `findNearestAnchor(bbox, point, radius): BBoxAnchor \| null`          | Anchor mais próximo dentro de `radius` (snap-to-anchors do D-022)                                 |
| `findRenderedNode(svgRoot, nodeId): SVGGraphicsElement \| null`       | DOM lookup via `data-node-id`                                                                     |
| `getRenderedNodeBBox(svgRoot, nodeId): BoundingBox \| null`           | Bbox em coords do documento (aplica transforms ancestrais via `parseTransformAttr` + core matrix) |
| `getCombinedBBox(svgRoot, nodeIds): BoundingBox \| null`              | União AABB de várias bboxes (multi-seleção)                                                       |

#### Transform (Bloco 2 pivot + Bloco 3 gestos)

| Símbolo                                      | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransformService` (`@Injectable({ root })`) | **Pivot** (D-022): signals `customPivots`, `pivotMode`. APIs `resolvePivot(bbox)`, `setPivot(point, bbox)`, `setPivotAnchor(anchor, bbox)`, `resetPivot()`, `clearAllPivots()`, `syncPivotForSelection()`. **Gestos** (Bloco 3): signal `dragState` (move/rotate/resize), computed `isDragging`. APIs: `startMove`/`updateMove`/`endMove`, `startRotate`/`updateRotate`/`endRotate`, `startResize`/`updateResize`/`endResize`, `cancelGesture()`. Padrão revert+commit: preview imediato durante drag; single command dispatch no end. |
| `DragState` (type)                           | Discriminated union por `kind`: `'move'`, `'rotate'` ou `'resize'`. Cada variante carrega `nodeId`, `startTransform` e dados específicos.                                                                                                                                                                                                                                                                                                                                                                                              |

**Persistência per-node**: pivot custom armazenado em coordenadas
**node-local** `(0,0)..(1,1)` para sobreviver a movimentação/scale do
nó. Multi-seleção: pivot é transient e reseta na mudança de composição
(detectada via `syncPivotForSelection`).

#### Overlay (Bloco 2 — `./lib/overlay/`)

| Selector / Símbolo                             | Uso                                                                                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `g[svgeSelectionOverlay]` (`SelectionOverlay`) | Bbox outline do nó focado + 8 handles de resize (TL/TC/TR/ML/MR/BL/BC/BR) + 1 handle de rotação (acima do TC); outline leve para hover. Pixel-constante via `1/zoom`. **Bloco 2 = visual only**; drag de handles vem no Bloco 3. |
| `g[svgeRotationPivot]` (`RotationPivot`)       | Crosshair editável do pivot (D-022 Affinity-grade): free-drag com **snap-to-9-anchors** (`Alt` = bypass), **3×3 popover** ao clicar (sem drag), **Esc** cancela drag, **double-click** reseta ao centro                          |
| `HANDLE_DATA_ATTR`                             | Constante `'data-svge-handle'` que o Bloco 3 vai usar para identificar qual handle foi grabbed                                                                                                                                   |

> **Composição**: ambos overlays são projetados dentro do `<svge-renderer>`
> via `<ng-content />` (slot adicionado no Bloco 2). Compartilham o mesmo
> `<svg>`, viewBox e namespace. Uso típico:
>
> ```html
> <svge-renderer [tree]="tree" [viewBox]="viewBox">
>   <svg:g svgeSelectionOverlay></svg:g>
>   <svg:g svgeRotationPivot></svg:g>
> </svge-renderer>
> ```

#### Plugin scaffolding (Bloco 5a — `./lib/plugin/`)

| Símbolo                                    | Descrição                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `EditorPlugin` (interface)                 | `id`, `name`, `version`, `apiVersion`, `dependencies?`, `install(ctx)`, `uninstall?(ctx)` |
| `PluginContext` (interface)                | `pluginId`, `injector: Injector`, `track<T>(d: T): T`                                     |
| `Disposable` (interface)                   | `dispose(): void` — devolvido por todo `register()` de registry                           |
| `InstalledPlugin` (interface)              | `plugin`, `installedAt` — snapshot lido via `PluginRegistry.list/get`                     |
| `PLUGIN_API_VERSION` (constante)           | `'1.0.0'` no momento. Plugin throws se major não bater                                    |
| `PluginRegistry` (`@Injectable({ root })`) | `install(plugin)`, `uninstall(id)`, `has(id)`, `get(id)`, `list()`, signal `installed`    |
| `provideSvgEnginePlugin(plugin)`           | provider `ENVIRONMENT_INITIALIZER multi:true` — install no boot                           |

Ver [`docs/10-guia-plugin.md`](10-guia-plugin.md) para receitas práticas.

#### Tools (Bloco 5b — `./lib/tool/`)

| Símbolo                                     | Descrição                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Tool` (interface)                          | `id`, `label`, `shortcut?`, `icon?`, `cursor?`, `onActivate/Deactivate`, `onPointerDown/Move/Up/Cancel`, `onKeyDown` |
| `ToolPointerEvent` (interface)              | `raw: PointerEvent`, `docPoint: Point`, `screen{X,Y}`, modifier flags                                                |
| `ToolContext` (interface)                   | `injector: Injector` — passado nos hooks de lifecycle                                                                |
| `ToolRegistry` (`@Injectable({ root })`)    | `register(tool): Disposable`, `tools()` signal, `get(id)`, `getByShortcut(key)`                                      |
| `ToolHostService` (`@Injectable({ root })`) | `activate(id)`, `activeId()` signal, `activeTool()` computed, `routePointer*` / `routeKeyDown` para event hub        |
| `selectToolPlugin` (`EditorPlugin`)         | Built-in: passthrough — consumer mantém pipeline nativo de seleção/marquee                                           |
| `pencilToolPlugin` (`EditorPlugin`)         | Built-in: freehand path drawing; commit via `InsertNodeCommand`                                                      |
| `SELECT_TOOL_ID`                            | Constante `'svge.builtin.tool.select'` para checks                                                                   |

#### Marquee / Snap / Alignment (Bloco 4a-4c)

| Símbolo                                          | Descrição                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `MarqueeService` (`@Injectable({ root })`)       | `state()` signal, `rect()` computed, `start/update/end/cancel`. Normaliza w/h ≥ 0                   |
| `Marquee` (`g[svgeMarquee]`)                     | Overlay dashed visual                                                                               |
| `MarqueeCandidate` (interface)                   | `{ id, bbox }` para `nodesInsideMarquee(rect, candidates, mode)`                                    |
| `nodesInsideMarquee(rect, candidates, mode)`     | Hit-test puro — modos `'intersect'` (Illustrator) e `'contain'` (AutoCAD)                           |
| `SnapService` (`@Injectable({ root })`)          | config (`enabled`, `mode`, `gridSize`, `thresholdPx`), signal `activeGuides`, `resolveForMove(...)` |
| `SnapGuides` (`g[svgeSnapGuides]`)               | Overlay magenta (dashed = grid; sólido = objetos)                                                   |
| `resolveSnap(moving, targets, threshold)`        | Resolver puro (matemática); usado por `SnapService.resolveForMove`                                  |
| `rectsToSnapTargets(rects)`                      | Gerador puro — 6 features por rect (low/center/high × 2 eixos)                                      |
| `gridTargetsNear(area, gridSize)`                | Targets de grid limitados à área do moving (bounded mesmo em docs grandes)                          |
| `AlignmentService.align(items, axis)`            | 6 axes: `left/center-x/right/top/center-y/bottom`                                                   |
| `AlignmentService.distribute(items, axis)`       | `horizontal` / `vertical` — ≥3 nós, edges mantêm posição                                            |
| `computeAlignDeltas` / `computeDistributeDeltas` | Math puro (testáveis sem DI)                                                                        |

#### Workspace / Layers / Palette / Menu / Shortcut (Fase 4)

| Símbolo                                               | Descrição                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `WorkspaceService` (`@Injectable({ root })`)          | `background()`, `grid()`, `rulers()`, `guides()`, `page()` + setters. Estado presentation (D-021)         |
| `WorkspaceBackground` (`<svge-workspace-background>`) | xadrez / sólido / imagem (D-021)                                                                          |
| `GridOverlay` (`g[svgeGridOverlay]`)                  | Linhas de grid SVG; major/minor; vector-effect non-scaling                                                |
| `GuidesOverlay` (`g[svgeGuidesOverlay]`)              | Linhas ciano draggable (drag + dblclick remove + Esc cancel + ARIA slider)                                |
| `LayersService` (`@Injectable({ root })`)             | `hiddenIds()`, `lockedIds()`, togglers (idempotent + dedup)                                               |
| `LayersFilter` (`[svgeLayersFilter]`)                 | Directive opt-in: aplica `display:none` em hidden ids via DOM walk reativo                                |
| `PaletteRegistry` (`@Injectable({ root })`)           | `register(palette): Disposable`, `palettes()` signal, `byCategory(...)`                                   |
| `builtinPalettesPlugin` (`EditorPlugin`)              | 3 paletas: default-greys, material-primary, tailwind-pastels                                              |
| `Palette` (interface)                                 | `id`, `name`, `category?`, `swatches: readonly string[]`                                                  |
| `MenuContribution` (interface)                        | `id`, `slot`, `label`, `icon?`, `tooltip?`, `shortcut?`, `order?`, `disabled?`/`visible?` (Signal), `run` |
| `MenuContributionRegistry` (`@Injectable`)            | `register(c): Disposable`, `bySlot(slot)` retorna `Signal<readonly MenuContribution[]>` ordenado          |
| `Shortcut` (interface)                                | `id`, `combo`, `when?`, `description?`, `run(event)`                                                      |
| `ShortcutRegistry` (`@Injectable({ root })`)          | `register(s): Disposable`, `tryMatch(event)`, signal `shortcuts`                                          |
| `ShortcutService` (`@Injectable({ root })`)           | Opt-in `start()`/`stop()` — listener global de `keydown`, ignora editable targets                         |
| `parseCombo` / `comboMatches`                         | Helpers puros (`Ctrl+G`, `Cmd+Shift+G`, `CmdOrCtrl+...`, `ArrowUp`, etc)                                  |

#### IO (Fase 5)

| Símbolo                                 | Descrição                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Importer` (interface)                  | `id`, `name`, `mediaTypes`, `extensions`, `import(text): ImportResult`                      |
| `Exporter` (interface)                  | `id`, `name`, `mediaType`, `extension`, `export(doc): string \| Promise<string \| Blob>`    |
| `ImportResult` (discriminated union)    | `{ok: true, document, warnings} \| {ok: false, error}`                                      |
| `ImporterRegistry` / `ExporterRegistry` | `register(x): Disposable`, helpers `byExtension`, `byMediaType`                             |
| `svgImporter` (built-in)                | DOMParser + sanitização (script/on\*/javascript:) + suporte defs/clipPath opaco (Fase 6c-1) |
| `svgExporter` (built-in)                | Output byte-stable / deterministic — ordem canônica, formato compacto, defs round-trip      |
| `builtinIoPlugin` (`EditorPlugin`)      | Registra `svgImporter` + `svgExporter`                                                      |
| `pngExporter` / `pngExporterPlugin`     | Canvas-based PNG export (binário/async); 2× DPR retina                                      |

#### Optimize (Fase 5)

| Símbolo                                    | Descrição                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `Optimizer` (interface)                    | `id`, `name`, `description?`, `order?` (default 100), `defaultEnabled?`, `optimize(doc): SvgDocument` |
| `OptimizerRegistry` (`@Injectable`)        | `register(o): Disposable`, `runPipeline(doc, enabledIds?)` — sort by order, dedup ref-equal output    |
| `OptimizeCommand`                          | Wraps `runPipeline` em 1 undo entry (Fase 6b)                                                         |
| `builtinOptimizersPlugin` (`EditorPlugin`) | 3 passes: `precisionOptimizer`, `dropDefaultsOptimizer`, `pruneEmptyGroupsOptimizer`                  |

#### Viewport culling (Fase 6b-2)

| Símbolo                                                  | Descrição                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ViewportCullingService` (`@Injectable({ root })`)       | `culledIds: Signal<ReadonlySet<NodeId>>` — DFS recursivo com early-termination + WeakMap cache |
| `SvgeViewportCullingDirective` (`[svgeViewportCulling]`) | Opt-in directive — rAF batching + single-pass DOM walk; toggle attr `data-svge-culled="1"`     |

**Padrão de uso**:

```html
<svge-renderer svgeLayersFilter svgeViewportCulling [tree]="tree()" [viewBox]="viewBox()">
  <svg:g svgeSelectionOverlay></svg:g>
</svge-renderer>
```

Detalhes de quando culling ajuda (e quando não) em
[`docs/08-historico-de-alteracoes.md`](08-historico-de-alteracoes.md)
seção 2026-05-18.

#### Acessibilidade (Fase 6c-2)

| Símbolo                                 | Descrição                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `selectionNudgePlugin` (`EditorPlugin`) | Registra 8 shortcuts (Arrow* + Shift+Arrow*) para nudge keyboard-only via `TranslateManyCommand` |

### `svg-engine/ui` (Fase 4) ✅

> Componentes Angular Material para o editor completo. Peer deps:
> `@angular/material@^21` + `@angular/cdk@^21` (opcionais, só puxa
> se você importar deste entry point).

#### Shell

| Selector        | Componente   | Descrição                                                                                                          |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `<svge-editor>` | `SvgeEditor` | Drop-in shell: toolbar (undo/redo/zoom/reset) + `<svge-workspace-background>` + `<svge-renderer>` + `<ng-content>` |

#### Panels

| Selector                  | Componente         | Descrição                                                                                                               |
| ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `<svge-layers-panel>`     | `LayersPanel`      | Tree hierárquico com expand/collapse + visibility/lock + drag-drop reorder + click-to-select                            |
| `<svge-inspector>`        | `SvgeInspector`    | Painel de propriedades reativo a `selection.focusId()`: geometry, style, transform decomposto, pivot picker, multi-edit |
| `<svge-color-palette>`    | `SvgeColorPalette` | Strip de swatches; emite `colorPicked`. Renderiza `transparent` com slash icon                                          |
| `<svge-toolbar slot="X">` | `SvgeToolbar`      | Material `<mat-icon-button>` por contribuição de `MenuContributionRegistry` no slot                                     |
| `<svge-rulers>`           | `SvgeRulers`       | Overlay HTML top/left com ticks (nice spacing 1/2/5 × 10ⁿ)                                                              |
| `<svge-theme-toggle>`     | `SvgeThemeToggle`  | Icon button + `ThemeService` (light/dark/system, persist em localStorage chave `svge.theme`)                            |

#### Dialog

| Selector / símbolo      | Descrição                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `SvgeWorkspaceSettings` | Material dialog: page (width/height/orientation) + grid (enabled/spacing/majorEvery) + rulers + guides |

#### Services

| Símbolo                                  | Descrição                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ThemeService` (`@Injectable({ root })`) | `theme: Signal<Theme>`, `resolvedTheme: Signal<ResolvedTheme>`, `setTheme`, `cycle`. Reflete em `<html data-theme>` |
| `Theme` / `ResolvedTheme` (types)        | `'system'\|'light'\|'dark'` e `'light'\|'dark'`                                                                     |

---

## Convenções

- **Nomes**: `PascalCase` para classes/interfaces/tipos; `camelCase` para
  funções/serviços; `kebab-case` para selectors (`<svge-canvas>`).
- **Standalone components** sempre.
- **Inputs/outputs**: usar `input()`, `output()` (D-009 Angular guidance);
  nunca `@Input`/`@Output` decorators.
- **Estado reativo**: `signal`, `computed`, `effect`. RxJS apenas onde
  o ecossistema exige.
- **Deprecation**: marcar com `@deprecated` por **um** ciclo minor antes
  de remover (post-`1.0.0`).

---

## Como adicionar uma entrada aqui

1. Implementar e exportar em `projects/svg-engine/<entry>/src/public-api.ts`.
2. Documentar nesta seção do entry point correspondente: nome, assinatura,
   exemplo mínimo, "since" (versão).
3. Cobrir com testes unitários.
4. Confirmar `ng build svg-engine` verde.
5. Linkar no PR.
