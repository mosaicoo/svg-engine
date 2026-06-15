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

- **Versão**: `0.1.0` (pré-release; APIs hardening durante Fase 6/7 — `1.0.0`
  alvo após estabilização de superfície pública).
- **SemVer estável**: a partir de `1.0.0`.
- **Política até `1.0.0`**: minor pode ter breaking se devidamente documentado.
- **Política após `1.0.0`**: breaking = major.
- **Cobertura atual**: **1825 specs** passando em 132 arquivos (`npm run test:lib` —
  validado 2026-05-29 no commit `42f8334`).
- **Status por fase** (ver `docs/05-roadmap.md` para histórico completo):
  - Fase 5 (IO + Optimize) ✅
  - Fase 6a (perf baseline) ✅
  - Fase 6b (viewport culling) ✅
  - **Bloco 6-PathEditor** (Path/Anchor editor + Pathfinder 5 boolean ops) ✅
  - **Fase 6c** (defs/clipPath no importer + ARIA + keyboard nav) ✅
  - **Fase 6d** (`EffectRegistry` + 19 builtin effects + chain editor) ✅ (D-047)
  - **Fase 7** (sprint pós-D-046 até D-080) — Libraries (D-048), composição/recorte
    (D-049), tools faltantes (D-050/D-062), Inspector polish (D-068/D-069/D-076/D-078),
    Find & Replace (D-070), Batch ops (D-071), Logical Layers (D-072), History
    Snapshots (D-073), Smart Objects (D-074), Asset Export panel (D-077), Pages /
    Artboards (D-079), PAGES-REFACTOR (D-080). ✅ — _detalhamento por sprint
    pendente em doc 04/05_
  - Fase 6e (`ScriptRuntimePlugin`, D-024) — decisão A/B/C pendente
  - Fase 8.1 (NLU rule-based, D-046 Fase 1) ✅ — 8.2/8.3 não iniciadas

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

| Símbolo                                                                                                                          | Descrição                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `SvgNodeBase`                                                                                                                    | interface base (id, transform, style, metadata)                                              |
| `RectNode`, `EllipseNode`, `LineNode`, `PolygonNode`, `PolylineNode`, `PathNode`, `TextNode`, `ImageNode`, `GroupNode`           | os 9 tipos concretos                                                                         |
| `SvgNode` (union)                                                                                                                | discriminated union dos 9                                                                    |
| `SvgNodeType`, `SVG_NODE_TYPES`                                                                                                  | discriminadores literais                                                                     |
| `isGroupNode(node): node is GroupNode`                                                                                           | type guard                                                                                   |
| `createRect / createEllipse / createLine / createPolygon / createPolyline / createPath / createText / createImage / createGroup` | factories que retornam nós válidos                                                           |
| `NodeFactoryOptions`                                                                                                             | opções comuns das factories                                                                  |
| `readCustomAttrs(node): CustomAttrs` / `hasCustomAttrs(node)`                                                                    | (D-089) lê os atributos `data-*` customizados do nó (sub-chave `customData.svgeCustomAttrs`) |
| `setCustomAttr / removeCustomAttr / renameCustomAttr / withCustomAttrs` (helpers puros)                                          | (D-089) CRUD imutável dos atributos `data-*`; limpam a chave quando vazia                    |
| `isValidCustomAttrName(name)` / `customAttrToDataName(name)` / `dataNameToCustomAttr(attr)`                                      | (D-089) validação (rejeita prefixo reservado `svge`) + conversão `nome`⇄`data-nome`          |
| `CustomAttrs`, `SVGE_CUSTOM_ATTRS_KEY`, `CUSTOM_ATTR_DATA_PREFIX`                                                                | (D-089) tipo do mapa + constantes da sub-chave/prefixo                                       |

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

| Símbolo                                                               | Descrição                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Command` (interface)                                                 | `id`, `label`, `execute(ctx)`, `undo(ctx)`                                                                                                                                                                             |
| `CommandResult`, `ok()`, `fail(error)`                                | resultado padronizado                                                                                                                                                                                                  |
| `CommandContext`                                                      | `{ state: EditorStateService }`                                                                                                                                                                                        |
| `InsertNodeCommand(parentId, node, index?)`                           | inserção reversível                                                                                                                                                                                                    |
| `RemoveNodeCommand(nodeId)`                                           | remoção reversível (captura posição original)                                                                                                                                                                          |
| `MoveNodeCommand(nodeId, dx, dy)`                                     | translação composta sobre transform existente                                                                                                                                                                          |
| `SetPropertyCommand<T extends SvgNode, K extends keyof T>(id, K, V)`  | set/unset de uma propriedade qualquer (≠ id/type)                                                                                                                                                                      |
| `RotateNodeCommand(nodeId, angleRad, pivot)`                          | rotação em torno de pivot arbitrário (matriz `T(p)·R(θ)·T(-p)·prev`); undo restaura snapshot                                                                                                                           |
| `ResizeNodeCommand(nodeId, anchor, sx, sy)`                           | scale em torno de anchor fixo (handle oposto = âncora); rejeita scale factors não-finitos                                                                                                                              |
| `composePivotRotation(existing, angleRad, pivot)` (helper puro)       | retorna a matriz pós-rotação sem dispatchar; útil para preview durante drag                                                                                                                                            |
| `composeAnchoredScale(existing, sx, sy, anchor)` (helper puro)        | retorna a matriz pós-scale sem dispatchar; útil para preview durante drag                                                                                                                                              |
| `MoveNodeInTreeCommand(nodeId, newParentId, newIndex)`                | move + reparent atomic. Final-state index. Valida cycle (não move group p/ descendente)                                                                                                                                |
| `GroupSelectionCommand(selectedIds, groupId?)`                        | wraps seleção em novo GroupNode (parent comum). Preserva stacking + parent order                                                                                                                                       |
| `UngroupCommand(groupId)`                                             | promove children do group p/ grand-parent (no índice original). Rejeita root + non-group                                                                                                                               |
| `ReorderNodeCommand(nodeId, mode)`                                    | z-order: `'forward'\|'backward'\|'toFront'\|'toBack'`                                                                                                                                                                  |
| `RenameNodeCommand(nodeId, name)`                                     | set `metadata.name` (inline-rename no Layer Panel)                                                                                                                                                                     |
| `SetPropertyOnManyCommand<K>(ids, K, V)`                              | mesma mudança em N nós, 1 entrada de undo                                                                                                                                                                              |
| `TranslateManyCommand(deltas)`                                        | translate em N nós (alignment/distribute), 1 entrada                                                                                                                                                                   |
| `AUTO_PARENT`, `ParentRef`                                            | (D-080 Fase 1) sentinel + tipo para inserir um node "na parent ambiente" (página ativa). Resolvido pelo `CommandBus` via `InsertParentResolver` no `INSERT_PARENT_RESOLVER` token                                      |
| `InsertParentResolver`, `INSERT_PARENT_RESOLVER`                      | (D-080 Fase 1) interface + InjectionToken. `ActivePageService` implementa o resolver no scope provider — toda ferramenta que dispatcha `new InsertNodeCommand(AUTO_PARENT, node)` herda o page-routing automaticamente |
| `CreatePageCommand(viewBox?, name?)`                                  | (D-079) cria página com viewBox (default A4 portrait) e nome opcional ("Page N" derivado); insere ao FINAL de root.children. Expõe `getCreatedPageId()` para ativação subsequente                                      |
| `DeletePageCommand(nodeId)`                                           | (D-079) remove a página + subtree. **D-080 Fase 7**: `isDestructive=true` → auto-snapshot via D-073 antes do execute. Restritivo a páginas top-level                                                                   |
| `RenamePageCommand(nodeId, newName)`                                  | (D-079) atualiza `customData.svgePageName`. No-op + zero history entry quando nome igual ao atual                                                                                                                      |
| `ResizePageCommand(nodeId, newViewBox)`                               | (D-079) atualiza o `pageViewBox` inteiro (todos os 4 campos). Children intocados (Illustrator artboard-resize behavior). No-op em viewBox idêntico                                                                     |
| `MovePageCommand(nodeId, {x, y})`                                     | (D-080 Fase 6) translada apenas `viewBox.x/y` (width/height preservados). No-op + silent-undo em origin idêntico                                                                                                       |
| `SetPageOptionsCommand(nodeId, patch)`                                | (D-080 Fase 3) patch parcial de `PageOptions` (background/margins/orientation/format). No-op + silent-undo quando patch não muda nada                                                                                  |
| `EnsureDefaultPageCommand()`                                          | (PAGES-FIX-2) idempotente: cria "Page 1" + migra root-level shapes pra dentro dela; no-op quando já existe ≥ 1 página. Usado pelo bootstrap dos shells                                                                 |
| `SetCustomAttrCommand(nodeId, name, value)`                           | (D-089) cria/atualiza um atributo `data-*` customizado. Valida o nome (rejeita inválido/reservado `svge`). Undoable (snapshot do root)                                                                                 |
| `RemoveCustomAttrCommand(nodeId, name)`                               | (D-089) remove um atributo `data-*`. No-op silencioso quando ausente                                                                                                                                                   |
| `RenameCustomAttrCommand(nodeId, from, to)`                           | (D-089) renomeia preservando o valor. Falha (tree intocada) quando `from` ausente, `to` inválido/duplicado                                                                                                             |
| `ReversePathCommand(ids)`                                             | (D-090) inverte a direção (winding) dos paths — mesmo desenho, âncoras + handles trocados                                                                                                                              |
| `CleanUpPathCommand(ids)`                                             | (D-090) remove âncoras redundantes/degeneradas (conservador, não muda o visível)                                                                                                                                       |
| `SimplifyPathCommand(ids, tolerance?)` / `DEFAULT_SIMPLIFY_TOLERANCE` | (D-090) RDP nos paths (default 1.5). Mesma op da ferramenta Smooth; no menu = "Simplify"                                                                                                                               |
| `OffsetPathCommand(ids, distance?)` / `DEFAULT_OFFSET_DISTANCE`       | (D-090) cópia paralela (default 10; positivo = fora). Achata curvas; out/in winding-independente                                                                                                                       |
| `OutlineStrokeCommand(ids)`                                           | (D-090) traço → forma preenchida (`fill` = cor do traço). Ribbon p/ abertos, donut p/ fechados                                                                                                                         |
| `JoinPathsCommand(ids)`                                               | (D-090) 1 aberto → fecha; 2+ → solda extremidades num único nó (transforms bakeados)                                                                                                                                   |
| `SplitPathCommand(nodeId, cuts)` / `PathSplitCut`                     | (D-090) corta nos âncoras `{subpathIndex, anchorIndex}` → nós separados. Distinto de Knife/Release                                                                                                                     |

##### Path Editor (Bloco 6-PE) ✅

| Símbolo                                                   | Descrição                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AnchorKind` (`'cusp' \| 'smooth' \| 'symmetric'`)        | tipo do anchor — define como handles se relacionam                                                                     |
| `AnchorPoint` (interface)                                 | `{point, handleIn, handleOut, kind}` — handles em coords absolutos                                                     |
| `AnchorSubpath` (interface)                               | `{anchors: readonly AnchorPoint[], closed: boolean}`                                                                   |
| `AnchorRef` (interface)                                   | `{nodeId, subpathIndex, anchorIndex}` — referência estável durante a vida do gesto                                     |
| `parsePathToAnchors(d: string): readonly AnchorSubpath[]` | parser de `d` para anchors. Suporta M/L/H/V/C/S/Q/T/Z. Pós-passa re-classifica kind agora que handleOut está conhecido |
| `anchorsToPathD(subpaths): string`                        | inverso de `parsePathToAnchors`. Emite L para flat segments, C caso contrário                                          |
| `classifyAnchorKind(point, handleIn, handleOut?)`         | heurística via cross product + length compare                                                                          |
| `MoveAnchorCommand(ref, newPosition, which?)`             | move point ou handle. Smooth/symmetric enforce constraint na opposite handle                                           |
| `InsertAnchorCommand(ref, t)`                             | insere anchor via de Casteljau subdivision no parâmetro t ∈ (0, 1). Geometria preservada exatamente                    |
| `RemoveAnchorCommand(ref)`                                | remove anchor; drop subpath se < 2 anchors                                                                             |
| `ConvertAnchorTypeCommand(ref, nextKind)`                 | muda kind via `enforceKind`. cusp colapsa handles ("Convert Anchor Point" Illustrator); smooth/symmetric snap          |
| `ConvertNodeToPathCommand(nodeId)`                        | converte rect/ellipse/line/polygon/polyline para path equivalente. Preserve transform/style/metadata                   |
| `nodeToPathD(node)` (helper puro)                         | exportado para reuso (Pathfinder usa para "virtually" converter sem dispatch)                                          |

##### Pathfinder (Bloco 6-PE) ✅

| Símbolo                                     | Descrição                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `UnionCommand(nodeIds)`                     | A ∪ B (∪ ...). Merge das shapes; resultado herda style do primeiro                                                                         |
| `IntersectCommand(nodeIds)`                 | A ∩ B (∩ ...). Apenas área comum                                                                                                           |
| `SubtractCommand(nodeIds)`                  | A − B (− ...). Remove área das shapes subsequentes do primeiro                                                                             |
| `ExcludeCommand(nodeIds)`                   | A ⊕ B. Symmetric difference (XOR)                                                                                                          |
| `DivideCommand(nodeIds)`                    | Split em N regions. Cada região privada herda style do input originador (Illustrator-style); slivers de intersection fallback p/ operand A |
| `PathfinderRegion` (interface)              | `{rings: readonly FlatRing[], styleSourceIdx?: number}` — emitido pelo `runOp` abstrato                                                    |
| `flattenPathD(d, tolerance?)` (helper puro) | flatten cubic beziers em polylines via de Casteljau (tolerance default 0.5px)                                                              |
| `ringsToPathD(rings): string`               | inverso — polygon rings de volta para `d` (M/L/Z)                                                                                          |

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

| Símbolo                                             | Descrição                                                                                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderTransformAttr(t: Transform): string \| null` | serializa `Transform` em `matrix(a b c d e f)`; retorna `null` para identidade (omite atributo)                                                                   |
| `screenToDoc(svg, clientX, clientY): Point \| null` | **D-036** — projeta coordenadas client/screen px em doc coords via `getScreenCTM().inverse()`. Guards defensivos para jsdom/SSR/SVG detached. Função pura, sem DI |

#### Cobertura de testes (Vitest)

- 5 spec files novos no render: `transform-attr`, `node-renderer-registry`,
  `viewport.service`, `renderers` (smoke por tipo), `svge-renderer.component` (integração).
- Total da library `svg-engine`: **110 testes em 10 arquivos**, todos verdes.

### `svg-engine/io` (Fase 5) ✅

> Parse, sanitização e serialização de SVG/PNG. **Headless** — sem deps de UI.
> **D-026 (2026-05-20)**: extraído de `svg-engine/edit` como entry point dedicado.
> Re-exportado por `svg-engine/edit` para backward-compat (imports existentes continuam válidos).

#### Tipos contributivos (`./lib/io-types.ts`)

| Símbolo        | Descrição                                                                    |
| -------------- | ---------------------------------------------------------------------------- |
| `Importer`     | `id`/`name`/`mediaType`/`extensions` + `import(blob): Promise<ImportResult>` |
| `Exporter`     | `id`/`name`/`mediaType`/`extension` + `export(doc): string \| Promise<Blob>` |
| `ImportResult` | `{ document: SvgDocument; warnings?: readonly string[] }`                    |

#### Registries (`./lib/io-registries.service.ts`)

| Símbolo                                      | Descrição                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ImporterRegistry` (`@Injectable({ root })`) | `register(imp): Disposable`, `get(id)`, `byMediaType(mt)`, `byExtension(ext)`, `list()` |
| `ExporterRegistry` (`@Injectable({ root })`) | API simétrica para exportadores                                                         |

#### Implementações built-in

| Símbolo                  | Descrição                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svgImporter`            | string SVG → `SvgDocument` (rect/ellipse/line/polygon/polyline/path/text + defs/clip). **D-089**: lê todo `data-*` (exceto reservado `data-svge-*`) para `customData.svgeCustomAttrs` |
| `svgExporter`            | `SvgDocument` → string SVG determinística. **D-089**: emite os atributos `data-*` customizados (ordenados) em todo nó                                                                 |
| `pngExporter`            | `SvgDocument` → `Blob` PNG (via `<canvas>`); aceita `{ scale }` para retina @1x/@2x/@3x                                                                                               |
| `renderPng(doc, scale?)` | função pura de rasterização (base do `pngExporter`)                                                                                                                                   |

> **Plugin wrappers** (`builtinIoPlugin`, `pngExporterPlugin`) ficam em `svg-engine/edit` porque dependem de `EditorPlugin`.

### `svg-engine/optimize` (Fase 5) ✅

> Pipeline conservador de otimizações de SVG. **Headless** — sem deps de UI.
> **D-026 (2026-05-20)**: extraído de `svg-engine/edit`.

#### Tipo contributivo (`./lib/optimizer.ts`)

| Símbolo     | Descrição                                                             |
| ----------- | --------------------------------------------------------------------- |
| `Optimizer` | `id`/`name`/`order?`/`defaultEnabled?` + `optimize(doc): SvgDocument` |

#### Registry (`./lib/optimizer-registry.service.ts`)

| Símbolo                                       | Descrição                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `OptimizerRegistry` (`@Injectable({ root })`) | `register(opt): Disposable`, `get`, `optimizers()`, `runPipeline(doc, enabledIds?)` |

#### Comando

| Símbolo                             | Descrição                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `OptimizeCommand(reg, enabledIds?)` | dispara `runPipeline` + push 1 undo entry (skip se nada mudou — sem entrada lixo) |

#### Passes built-in (conservadores)

| Símbolo                     | Order | Efeito                                                                               |
| --------------------------- | ----- | ------------------------------------------------------------------------------------ |
| `precisionOptimizer`        | 10    | Arredonda numerics a 3 casas (rect x/y/w/h, path `d` tokens, style fields numéricos) |
| `dropDefaultsOptimizer`     | 50    | Remove `opacity:1`/`fillOpacity:1`/`strokeOpacity:1`/`visibility:visible`            |
| `pruneEmptyGroupsOptimizer` | 90    | Remove `<g></g>` recursivamente (document root sempre preservado)                    |

> **Plugin wrapper** (`builtinOptimizersPlugin`) fica em `svg-engine/edit`.

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

| Símbolo                                                             | Descrição                                                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findOwningNodeId(target: Element \| null): NodeId \| null`         | Caminha pelos `parentElement` buscando o `data-node-id` mais próximo. Pure function.                                                                                   |
| `resolveNodeIdFromEvent(event: Event): NodeId \| null`              | Wrapper que aceita um Event e delega; `null` quando target não é Element ou sem ancestor com `data-node-id`                                                            |
| `resolveSelectableNodeId(event, opts)` / `SelectableResolveOptions` | Resolução deep/group + escopo (isolation/página) + containers transparentes (layers/pages)                                                                             |
| `resolveSelectableNodeIdFromElement(target, opts)`                  | (D-091) gêmeo por-elemento de `resolveSelectableNodeId` (o evento delega a ele); usado pelo fallback geométrico                                                        |
| `geometricHitTestElement(svgRoot, clientX, clientY, tolerancePx?)`  | (D-091) fallback de tolerância: elemento de geometria mais à frente cuja área/traço (± `tolerancePx`) contém o ponto, via `isPointInFill`/`isPointInStroke` do browser |
| `DEFAULT_HIT_TOLERANCE_PX`                                          | (D-091) tolerância padrão (4 CSS px)                                                                                                                                   |

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

| Símbolo                                    | Descrição                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EditorPlugin` (interface)                 | `id`, `name`, `version`, `apiVersion`, `dependencies?`, `install(ctx)`, `uninstall?(ctx)` + metadata opcional (D-083): `description?`, `author?`, `icon?`, `category?` |
| `PluginContext` (interface)                | `pluginId`, `injector: Injector`, `track<T>(d: T): T`                                                                                                                  |
| `Disposable` (interface)                   | `dispose(): void` — devolvido por todo `register()` de registry                                                                                                        |
| `InstalledPlugin` (interface)              | `plugin`, `installedAt` — snapshot lido via `PluginRegistry.list/get`                                                                                                  |
| `PLUGIN_API_VERSION` (constante)           | `'1.0.0'` no momento. Plugin throws se major não bater                                                                                                                 |
| `PluginRegistry` (`@Injectable({ root })`) | `install(plugin)`, `uninstall(id)`, `has(id)`, `get(id)`, `list()`, signal `installed`                                                                                 |
| `provideSvgEnginePlugin(plugin)`           | provider `ENVIRONMENT_INITIALIZER multi:true` — registra no catálogo + install no boot (pula se desabilitado)                                                          |
| `withPluginMeta(plugin, meta)`             | retorna cópia do plugin com metadata de exibição (`PluginDisplayMeta`) anexada, sem mutar o original — usado para enriquecer builtins no bundle (D-083)                |
| `PluginDisplayMeta` (type)                 | `Pick<EditorPlugin, 'description' \| 'author' \| 'icon' \| 'category'>` — subconjunto de metadata aceito por `withPluginMeta`                                          |

Ver [`docs/10-guia-plugin.md`](10-guia-plugin.md) para receitas práticas.

#### Gerência de plugins (D-083 Fase 1 — `./lib/plugin/`)

| Símbolo                                          | Descrição                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PluginCategory` / `PluginSource` (type)         | `'tool'\|'library'\|…\|'other'` / `'internal'\|'external'`                                                                                                 |
| `PluginManifest` (interface)                     | View de exibição: id/name/version/apiVersion/description?/author?/icon?/category/dependencies/source/`enabled`/`installed`/`error`                         |
| `CatalogEntry` (interface)                       | `plugin`, `source` — entrada do catálogo                                                                                                                   |
| `PluginCatalog` (`@Injectable({ root })`)        | universo de plugins conhecidos: `register(p, source)`, `unregister(id)`, `has/get`, signal `entries`                                                       |
| `PluginStateStore` (`@Injectable({ root })`)     | persistência encapsulada (localStorage) do set desabilitado: `isDisabled`, `setDisabled`, `disabled` signal                                                |
| `PluginManagerService` (`@Injectable({ root })`) | façade: `plugins`/`internalPlugins`/`externalPlugins` (manifests), `enable`/`disable`/`uninstall`/`installExternal`, `canUninstall`, `enabledDependentsOf` |
| `PluginActionResult` (interface)                 | `{ ok, error? }` — retorno de enable/disable/uninstall                                                                                                     |

UI (`svg-engine/ui`): `<svge-plugin-manager>` (painel — lista por tipo + toggle +
uninstall); `SvgePluginManagerDialog` + `SvgePluginManagerDialogService` (wrapper
Material aberto pelo item **File ▸ Manage Plugins…** do
`builtinUiMenuContributionsPlugin`).

#### Carregamento de externos (D-083 Fase 2 — `./lib/plugin/`)

| Símbolo                                                     | Descrição                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ExternalPluginManifest` (interface)                        | id/name/version/apiVersion/`entry`/`integrity?`/dependencies? + metadata de exibição                                                             |
| `validateExternalPluginManifest(input)`                     | valida input não-confiável → `string` (erro) ou `null` (válido)                                                                                  |
| `PluginLoader` (`@Injectable({ root })`)                    | `load(manifest)`: valida → apiVersion gate → allowlist de origem → módulo → shape-check → `installExternal`; `isEnabled`, `isOriginTrusted(url)` |
| `PluginModuleLoader` (type)                                 | `(manifest) => Promise<unknown>` — fornecido pelo consumer (onde vive o `import()` + SRI)                                                        |
| `SVGE_PLUGIN_TRUSTED_ORIGINS` / `SVGE_PLUGIN_MODULE_LOADER` | tokens (default `[]` / `null` — **fail-closed**)                                                                                                 |
| `providePluginLoader({ trustedOrigins, moduleLoader })`     | opt-in do carregamento runtime (configura allowlist + loader)                                                                                    |
| `PluginLoaderConfig` (interface)                            | shape da config de `providePluginLoader`                                                                                                         |

#### Input helpers (`./lib/pointer/`) — D-036

> Consolidados em 2026-05-20 para eliminar 7+ duplicatas inline. Funções puras importáveis por plugins de tools/overlays.

| Símbolo                                                  | Descrição                                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capturePointer(event: PointerEvent): void`              | Defensive `event.target.setPointerCapture(event.pointerId)` com guards uniformes (Element instance, método existe, try/catch para browser rejection — Safari/Firefox) |
| `releasePointer(event: PointerEvent): void`              | Simétrico — `event.target.releasePointerCapture(event.pointerId)`                                                                                                     |
| `isEditableTarget(target: EventTarget \| null): boolean` | True para INPUT/TEXTAREA/SELECT/contenteditable — usado para suprimir shortcuts globais durante edição de texto                                                       |

#### Tools (Bloco 5b — `./lib/tool/`)

| Símbolo                                     | Descrição                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tool` (interface)                          | `id`, `label`, `shortcut?`, `icon?`, `cursor?`, `onActivate/Deactivate`, `onPointerDown/Move/Up/Cancel`, `onKeyDown`, **D-038 `optionsComponent?: Type<unknown>`** (renderizado pelo `<svge-tool-options>`) |
| `ToolPointerEvent` (interface)              | `raw: PointerEvent`, `docPoint: Point`, `screen{X,Y}`, modifier flags                                                                                                                                       |
| `ToolContext` (interface)                   | `injector: Injector` — passado nos hooks de lifecycle                                                                                                                                                       |
| `ToolRegistry` (`@Injectable({ root })`)    | `register(tool): Disposable`, `tools()` signal, `get(id)`, `getByShortcut(key)`                                                                                                                             |
| `ToolHostService` (`@Injectable({ root })`) | `activate(id)`, `activeId()` signal, `activeTool()` computed, `routePointer*` / `routeKeyDown` para event hub                                                                                               |
| `selectToolPlugin` (`EditorPlugin`)         | Built-in: passthrough — consumer mantém pipeline nativo de seleção/marquee                                                                                                                                  |
| `pencilToolPlugin` (`EditorPlugin`)         | Built-in: freehand path drawing; commit via `InsertNodeCommand`                                                                                                                                             |
| `SELECT_TOOL_ID`                            | Constante `'svge.builtin.tool.select'` para checks                                                                                                                                                          |

#### Marquee / Snap / Alignment (Bloco 4a-4c)

| Símbolo                                                                            | Descrição                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MarqueeService` (`@Injectable({ root })`)                                         | `state()` signal, `rect()` computed, `start/update/end/cancel`. Normaliza w/h ≥ 0                         |
| `Marquee` (`g[svgeMarquee]`)                                                       | Overlay dashed visual                                                                                     |
| `MarqueeCandidate` (interface)                                                     | `{ id, bbox }` para `nodesInsideMarquee(rect, candidates, mode)`                                          |
| `nodesInsideMarquee(rect, candidates, mode)`                                       | Hit-test puro — modos `'intersect'` (Illustrator) e `'contain'` (AutoCAD)                                 |
| `SnapService` (`@Injectable({ root })`)                                            | config (`enabled`, `mode`, `gridSize`, `thresholdPx`), signal `activeGuides`, `resolveForMove(...)`       |
| `SnapGuides` (`g[svgeSnapGuides]`)                                                 | Overlay magenta (dashed = grid; sólido = objetos)                                                         |
| `resolveSnap(moving, targets, threshold)`                                          | Resolver puro (matemática); usado por `SnapService.resolveForMove`                                        |
| `rectsToSnapTargets(rects)`                                                        | Gerador puro — 6 features por rect (low/center/high × 2 eixos)                                            |
| `gridTargetsNear(area, gridSize)`                                                  | Targets de grid limitados à área do moving (bounded mesmo em docs grandes)                                |
| `AlignmentService.align(items, axis)`                                              | 6 axes: `left/center-x/right/top/center-y/bottom` — relativo à união da seleção (≥2 nós)                  |
| `AlignmentService.alignToReference(items, axis, reference)`                        | Alinha à `reference` (BoundingBox) fixa — "Align to Page": 1 nó alinha à página ativa                     |
| `AlignmentService.distribute(items, axis)`                                         | `horizontal` / `vertical` — ≥3 nós, edges mantêm posição                                                  |
| `computeAlignDeltas` / `computeAlignToReferenceDeltas` / `computeDistributeDeltas` | Math puro (testáveis sem DI)                                                                              |
| `AlignmentService.distributeSpacing(items, axis, gap)`                             | **D-095** — distribui por **gap** borda-a-borda igual (≠ centros); ≥3 nós, 1º fixo no eixo                |
| `resolveAlignReference(items, keyObjectId, page)`                                  | **D-094** — resolve a referência do Align ("Align To": key object ▸ página ▸ união/`null`). Puro          |
| `computeDistributeSpacingDeltas` / `computeAverageGap`                             | **D-095** — math puro do spacing (deltas por gap; gap médio p/ pré-preencher o diálogo)                   |
| `KeyObjectService` (`@Injectable`, scoped)                                         | **D-094** — `keyObjectId()` (signal validado vs seleção), `setKeyObject(id)`, `clear()`, `hasKeyObject()` |

#### Help links (D-096)

| Símbolo                                             | Descrição                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SVGE_HELP_LINKS` (`InjectionToken<SvgeHelpLinks>`) | Destinos do menu Help (Documentation / Tutorials / Plugin Development / Report Issue). Factory default → `DEFAULT_HELP_LINKS`                                                               |
| `SvgeHelpLinks` (interface)                         | `documentation`, `tutorials`, `pluginDevelopment`, `reportIssue`, `homepage` (link do About — D-096) — todas `string`                                                                       |
| `DEFAULT_HELP_LINKS`                                | Docs em caminhos **relativos** (`/docs/…`, resolvem contra o origin atual → host-independente); Report Issue absoluto (issue tracker)                                                       |
| `provideSvgeHelpLinks(partial)`                     | Provider de override (merge parcial sobre os defaults). **Embedder/host configura aqui, sem tocar na lib** — ex.: `provideSvgeHelpLinks({ documentation: 'https://docs.example.com/svg' })` |

#### Workspace / Layers / Palette / Menu / Shortcut (Fase 4)

| Símbolo                                                   | Descrição                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WorkspaceService` (`@Injectable({ root })`)              | `background()`, `grid()`, `rulers()`, `guides()`, `page()` + setters. Estado presentation (D-021)                                                                                                |
| `WorkspaceBackground` (`<svge-workspace-background>`)     | xadrez / sólido / imagem (D-021)                                                                                                                                                                 |
| `GridOverlay` (`g[svgeGridOverlay]`)                      | Linhas de grid SVG; major/minor; vector-effect non-scaling                                                                                                                                       |
| `GuidesOverlay` (`g[svgeGuidesOverlay]`)                  | Linhas ciano draggable (drag + dblclick remove + Esc cancel + ARIA slider)                                                                                                                       |
| `LayersService` (`@Injectable({ root })`)                 | `hiddenIds()`, `lockedIds()`, togglers (idempotent + dedup)                                                                                                                                      |
| `LayersFilter` (`[svgeLayersFilter]`)                     | Directive opt-in: aplica `display:none` em hidden ids via DOM walk reativo                                                                                                                       |
| `PaletteRegistry` (`@Injectable({ root })`)               | `register(palette): Disposable`, `palettes()` signal, `byCategory(...)`                                                                                                                          |
| `builtinPalettesPlugin` (`EditorPlugin`)                  | 3 paletas: default-greys, material-primary, tailwind-pastels                                                                                                                                     |
| `Palette` (interface)                                     | `id`, `name`, `category?`, `swatches: readonly string[]`                                                                                                                                         |
| `MenuContribution` (interface)                            | `id`, `slot`, `label`, `icon?`, `tooltip?`, `shortcut?`, `order?`, `disabled?`/`visible?` (Signal), `run`                                                                                        |
| `MenuContributionRegistry` (`@Injectable`)                | `register(c): Disposable`, `bySlot(slot)` retorna `Signal<readonly MenuContribution[]>` ordenado                                                                                                 |
| `PanelHostService` (`@Injectable`, escopado) **(D-098)**  | Indireção Window ▸ Panels → shell. `reveal(panelId)` (sinal `revealRequest` com `nonce`), `activePanelId()`/`setActivePanel(id)`. O menu chama `reveal`; o shell mapeia a ID lógica → seu layout |
| `PANEL_ID` / `PanelId` / `PanelRevealRequest` **(D-098)** | IDs lógicas estáveis dos painéis (`layers`/`history`/`properties`/`appearance`/`export`/`gradient`) — contrato menu↔shell, independente de onde o painel está montado                            |
| `Shortcut` (interface)                                    | `id`, `combo`, `when?`, `description?`, `run(event)`                                                                                                                                             |
| `ShortcutRegistry` (`@Injectable({ root })`)              | `register(s): Disposable`, `tryMatch(event)`, signal `shortcuts`                                                                                                                                 |
| `ShortcutService` (`@Injectable({ root })`)               | Opt-in `start()`/`stop()` — listener global de `keydown`, ignora editable targets                                                                                                                |
| `parseCombo` / `comboMatches`                             | Helpers puros (`Ctrl+G`, `Cmd+Shift+G`, `CmdOrCtrl+...`, `ArrowUp`, etc)                                                                                                                         |
| `builtinEditorShortcutsPlugin` (`EditorPlugin`)           | **D-040 (2026-05-20)** — Opt-in plugin que registra `Ctrl+Z` (undo) / `Ctrl+Y` + `Ctrl+Shift+Z` (redo) / `Ctrl+G` (group) / `Ctrl+Shift+G` (ungroup) / `Ctrl+A` (select all)                     |

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

#### Acessibilidade (Fase 6c)

| Símbolo                                 | Descrição                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `selectionNudgePlugin` (`EditorPlugin`) | Registra 8 shortcuts (Arrow* + Shift+Arrow*) para nudge keyboard-only via `TranslateManyCommand` |

**Fase 6c (final)**: todos os overlays e panels com ARIA + keyboard nav completos:

- **anchor-overlay**: anchor squares + handle knobs com `role="button"` + `aria-label` "Anchor X of N, <kind> point" / "In/Outgoing tangent handle" + `tabindex` + keyboard handlers (arrows nudge 1u/10u, Enter cycles kind). `:focus-visible` orange ring
- **selection-overlay**: 8 resize handles + rotation handle com aria-label expandido ("Resize handle, top-left corner") + `aria-keyshortcuts` + keyboard arrows (resize via `startResize/updateResize/endResize`; rotation 1°/15° via `RotateNodeCommand`). Host `role="group"`
- **rotation-pivot**: main dot `role="button"` + `aria-haspopup="menu"` + `aria-expanded` + Enter/Space toggle popover. Popover dots `role="menuitemradio"` + `aria-checked` + Enter/Space activate
- **layers-panel**: treeitems com `aria-level` + `aria-expanded` em groups + `aria-label` ("layer-name, locked, hidden"). ArrowRight/Left expand/collapse (per Tree pattern §3.16)
- **inspector**: host `role="region"` + `aria-label="Properties inspector"`. Botões Reset com aria-label distintos ("Reset rotation and scale" / "Reset pivot")
- **toolbar**: host `role="toolbar"` + `aria-label="Toolbar <slot>"`. Botões com `aria-keyshortcuts` quando `MenuContribution.shortcut` existe
- **rulers**: divs `.ruler` com `role="group"` + aria-label descritivo. Ticks `aria-hidden`
- **guides-overlay**: sliders com `aria-valuemin/now/max` + arrow keys movem + Delete remove
- **Decorativos**: marquee, snap-guides, grid, page, hover/bbox outlines, handle stems com `aria-hidden="true"` (não poluir SR)

#### Path Editor UI (Bloco 6-PE) ✅

| Selector / Símbolo                                 | Descrição                                                                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `g[svgeAnchorOverlay]` (`AnchorOverlay`)           | Renderiza anchor squares + handle circles + segment hit-zones para path focado em Direct Select. Preview-then-commit no drag. Coords sempre via `composeAncestorMatrix` (segue ancestor chain). ARIA + keyboard completos |
| `AnchorSelectionService` (`@Injectable({ root })`) | `selected()` signal, `add/toggle/selectOne/clear/isSelected`. Refs estáveis durante gesto; consumer rebase em `InsertAnchorCommand` (shift de índices)                                                                    |
| `composeAncestorMatrix(root, targetId): Transform` | Helper puro — walking do MODELO (não DOM) compondo `root · ... · parent · target`. Usado pelo overlay para alinhar anchors com a posição visual do path quando dentro de grupos                                           |

#### Isolation mode

| Símbolo                                     | Descrição                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IsolationService` (scope-only via D-042)   | Signal `isolationRootId` + readonly `isActive` + `breadcrumbPath` computed. APIs `enter(nodeId)` (apenas em `GroupNode`), `exit()`, `exitOne()` (drill-up Affinity/Illustrator Esc), `setRoot(nodeId \| null)` (usado pelo breadcrumb), `isInScope(nodeId)` |
| `IsolationFilter` (`[svgeIsolationFilter]`) | Directive opt-in: dimming + pointer-events:none em nós fora do isolation root (DOM walk reativo)                                                                                                                                                            |

#### Auto-save

| Símbolo                                     | Descrição                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AutoSaveService` (`@Injectable({ root })`) | Debounced effect (default 800ms) salva `state.document()` serializado via svgExporter para localStorage key `svge.autosave`. APIs `recover()`, `clear()` |

### `svg-engine/ui` (Fase 4) ✅

> Componentes Angular Material para o editor completo. Peer deps:
> `@angular/material@^21` + `@angular/cdk@^21` (opcionais, só puxa
> se você importar deste entry point).

#### Shell

| Selector        | Componente   | Descrição                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<svge-editor>` | `SvgeEditor` | Drop-in shell modular: toolbar (built-in undo/redo/zoom + `<svge-toolbar>` plugin contributions) + `<svge-workspace-background>` + `<svge-renderer>` + status bar. **D-037 (2026-05-20) — 3 modos garantidos**: inputs `[showToolbar]`/`[showStatusBar]` (default `true`) + slots `[toolbar-extras]`/`[status-bar]` para customização. Veja D-037 para invariantes Mosaicoo. |

**`SvgeEditor` API completa** (inputs / outputs adicionados em D-034/D-035):

| Input / Output                                  | Tipo                  | Default                   | Descrição                                                                      |
| ----------------------------------------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `[tree]`                                        | `SvgNode \| null`     | `null`                    | Override do `state.document().root`. Útil quando o consumer mantém doc próprio |
| `[viewBox]`                                     | `BoundingBox \| null` | `null`                    | Override do `state.document().viewBox`                                         |
| `[title]`                                       | `string \| null`      | `'SVGEngine'`             | Texto na esquerda da toolbar                                                   |
| `[ariaLabel]`                                   | `string \| null`      | `'Editable SVG document'` | aria-label do `<svg>` interno                                                  |
| `[showToolbar]`                                 | `boolean`             | `true`                    | **D-034** — mostrar/esconder toolbar inteira (built-ins + contribuições)       |
| `[showStatusBar]`                               | `boolean`             | `true`                    | **D-035** — mostrar/esconder status bar                                        |
| `[toolbarSlot]`                                 | `string`              | `'toolbar.main'`          | **D-034** — slot do `MenuContributionRegistry` lido pela toolbar interna       |
| `(undoTriggered)` / `(redoTriggered)`           | `EventEmitter<void>`  | —                         | Disparados quando user clica nos botões built-in                               |
| `<ng-content select="[toolbar-extras]">`        | slot                  | —                         | Conteúdo projetado entre `<svge-toolbar>` e os built-ins                       |
| `<ng-content select="[status-bar]">` (fallback) | slot                  | `<svge-status-bar />`     | Custom status bar; quando consumer projeta, substitui o default                |
| `<ng-content>` (default)                        | slot                  | —                         | Overlays projetados dentro do `<svge-renderer>` (selection, marquee, etc.)     |
| `[showMenuBar]` **(D-038)**                     | `boolean`             | `false`                   | Renderiza `<svge-menu-bar>` acima da toolbar (default off preserva D-037)      |
| `[showContextMenu]` **(D-038)**                 | `boolean`             | `false`                   | Aplica `[svgeContextMenu]` ao canvas (right-click abre menu)                   |
| `[contextMenuSlot]` **(D-038)**                 | `string`              | `'context.canvas'`        | Slot do `MenuContributionRegistry` lido pelo context menu                      |
| `[showToolOptions]` **(D-038)**                 | `boolean`             | `false`                   | Renderiza `<svge-tool-options>` entre toolbar e canvas                         |
| `[toolOptionsShowPlaceholder]` **(D-038)**      | `boolean`             | `false`                   | Forwarded ao `<svge-tool-options>` — quando true, bar não colapsa              |

#### Panels

| Selector                  | Componente         | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<svge-layers-panel>`     | `LayersPanel`      | Tree hierárquico com expand/collapse + visibility/lock + drag-drop reorder + click-to-select                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `<svge-inspector>`        | `SvgeInspector`    | Painel de propriedades reativo a `selection.focusId()`: geometry, style, transform decomposto, pivot picker, multi-edit                                                                                                                                                                                                                                                                                                                                                                                            |
| `<svge-color-palette>`    | `SvgeColorPalette` | Strip de swatches; emite `colorPicked`. Renderiza `transparent` com slash icon                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `<svge-toolbar slot="X">` | `SvgeToolbar`      | Material `<mat-icon-button>` por contribuição de `MenuContributionRegistry` no slot. **(2026-05-20) Integrado automaticamente ao `<svge-editor>`** quando `[showToolbar]=true` (default)                                                                                                                                                                                                                                                                                                                           |
| `<svge-status-bar>`       | `SvgeStatusBar`    | **D-035 (2026-05-20)** — Status bar reativa. Lê 8 services (state/selection/viewport/workspace/toolhost/toolregistry/snap/isolation). 7 sections opt-in via `[sections]`: `'tool' \| 'selection' \| 'cursor' \| 'zoom' \| 'snap' \| 'isolation' \| 'dirty'`. Const `STATUS_BAR_SECTIONS` exportada para conveniência. Standalone — usável fora do `<svge-editor>`                                                                                                                                                  |
| `<svge-menu-bar>`         | `SvgeMenuBar`      | **D-038 Phase 1 (2026-05-20)** — Material dropdowns. Lê `MenuContributionRegistry` slots `menu.file/edit/view/object/help` (constantes `MENU_SLOT`). Submenus via `MenuContribution.parentId`, dividers via `MenuContribution.divider`. Inputs `[slots]` / `[labels]` (i18n)                                                                                                                                                                                                                                       |
| `<svge-context-menu>`     | `SvgeContextMenu`  | **D-038 Phase 2 (2026-05-20)** — Material lista vertical para slots `context.*` (constantes `CONTEXT_MENU_SLOT.CANVAS/NODE/LAYER/ANCHOR/GUIDE`). Não usado diretamente (montado pelo service); exportado para consumer que queira usar em overlay próprio. **D-040 (2026-05-20)**: `[svgeContextMenu]` diretiva ganhou input opcional `[svgeContextMenuResolver]: ((event: MouseEvent) => string) \| null` — quando supplied, função decide slot dinamicamente por hit-test (toma precedência sobre slot estática) |
| `<svge-tool-options>`     | `SvgeToolOptions`  | **D-038 Phase 3 (2026-05-20)** — Renderiza `Tool.optionsComponent` da tool ativa via `*ngComponentOutlet`. Input `[showPlaceholder]` (default `false`) controla collapse vs "No options"                                                                                                                                                                                                                                                                                                                           |
| `<svge-tools-palette>`    | `SvgeToolsPalette` | **D-038 Phase 4 (2026-05-20)** — Strip vertical de icon buttons; le `ToolRegistry.tools()`. Active highlight, tooltip label+shortcut, `aria-orientation="vertical"`                                                                                                                                                                                                                                                                                                                                                |
| `<svge-shell-pro>`        | `SvgeShellPro`     | **D-038 Phase 4 (2026-05-20)** — Composição profissional definitiva (Illustrator-grade). Grid 5 linhas: menu-bar / toolbar / tool-options / [tools-palette \| canvas \| layers+inspector] / status-bar. Right-click context menu sempre on (slot configurável). Inputs `[tree]`/`[viewBox]`/`[title]`/`[ariaLabel]`/`[contextMenuSlot]`. **Coexiste** com `<svge-editor>` — não substitui                                                                                                                          |
| `<svge-rulers>`           | `SvgeRulers`       | Overlay HTML top/left com ticks (nice spacing 1/2/5 × 10ⁿ)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `<svge-theme-toggle>`     | `SvgeThemeToggle`  | Icon button + `ThemeService` (light/dark/system, persist em localStorage chave `svge.theme`)                                                                                                                                                                                                                                                                                                                                                                                                                       |

#### Dialog

| Selector / símbolo      | Descrição                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SvgeWorkspaceSettings` | Material dialog: page (width/height/orientation) + grid (enabled/spacing/majorEvery) + rulers + guides                                                                                                                                     |
| `SvgeSvgSourceDialog`   | **(2026-05-20)** Visualizador live de SVG exportado via `ExporterRegistry.byMediaType('image/svg+xml')` (fallback `svgExporter`). Reativo a `state.document()`. Copy-to-clipboard com fallback `execCommand`. Inkscape "XML Editor" parity |

#### Services

| Símbolo                                                        | Descrição                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeService` (`@Injectable({ root })`)                       | `theme: Signal<Theme>`, `resolvedTheme: Signal<ResolvedTheme>`, `setTheme`, `cycle`. Reflete em `<html data-theme>`                                                                                                                                                          |
| `Theme` / `ResolvedTheme` (types)                              | `'system'\|'light'\|'dark'` e `'light'\|'dark'`                                                                                                                                                                                                                              |
| `WorkspaceLayoutService` (`@Injectable({ root })`) **(D-088)** | `reset()` limpa o **layout** persistido (tab side dos panel-groups + collapse dos rails do shell-pro) e bumpa `resetEpoch: Signal<number>`; panel-group/shell-pro observam o epoch e revertem o estado vivo. Reset Workspace; distinto do "Reset defaults" das configurações |

---

## Animation Timeline (D-082) — surface por entry point ✅

Feature **não-destrutiva** ("camada acima"): o documento base nunca é mutado;
o `playhead` é um signal e a árvore exibida é derivada. Opt-in via
`<svge-shell-pro [showTimeline]="true">`. Em `playhead = 0` sem tracks, a árvore
animada **é** a base (identidade referencial).

### `svg-engine/core` — modelo + interpolação + comandos (puros/headless)

| Símbolo                                                                                                                                               | Descrição                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AnimationDoc` / `AnimationTrack` / `Keyframe` (types)                                                                                                | `{ durationMs, tracks[] }`; track = `(nodeId, property, keyframes[])`; keyframe = `{ time(ms), value, easing }`                                            |
| `ANIMATION_KEY`                                                                                                                                       | chave em `metadata.customData` onde o `AnimationDoc` da página mora (`'svgeAnimation'`)                                                                    |
| `emptyAnimationDoc`, `readAnimationDoc`, `isAnimationDoc`, `findTrack`                                                                                | leitura/guarda do modelo                                                                                                                                   |
| `upsertKeyframe`, `removeKeyframe`, `removeTrack`, `moveKeyframe`, `setKeyframeEasing`, `setAnimationDuration`                                        | helpers imutáveis (no-op retorna a mesma referência); `removeTrack` apaga uma track inteira                                                                |
| `EasingSpec`, `DEFAULT_EASING`, `evalEasing`, `easingControlPoints`                                                                                   | easing: `linear`/`easeIn`/`easeOut`/`easeInOut`/`cubicBezier`; avaliação WebKit UnitBezier                                                                 |
| `sampleAnimation(doc, t)` → `AnimationSample`; `sampleTrack`                                                                                          | amostra o doc em `t` → `Map<nodeId, Map<prop, value>>`                                                                                                     |
| `interpolateValue`, `parseColor`, `mixColor`                                                                                                          | interpolação número (lerp) + cor (`#rgb`/`rgb()`/`rgba()`); tipos incompatíveis seguram discreto                                                           |
| `applyAnimationToTree(tree, sample)`                                                                                                                  | overlay não-destrutivo: identidade p/ sample vazio + structural sharing                                                                                    |
| `animatablePropertiesForNode`, `findAnimatableProperty`, `readAnimatableValue`, `AnimatablePropertyDef`                                               | catálogo de props animáveis por tipo (geometria por tipo + transform + style)                                                                              |
| `animationToSmil(doc, nodeId, baseTransform?)` → `string[]` **(F9)**                                                                                  | serializer SMIL puro: geometria/estilo → `<animate>`, transform → `<animateTransform>` (`additive` T·R·S). Consumido pelo exporter via `emitSmilAnimation` |
| `AddKeyframeCommand`, `MoveKeyframeCommand`, `RemoveKeyframeCommand`, `RemoveTrackCommand`, `SetKeyframeEasingCommand`, `SetAnimationDurationCommand` | comandos undoable (escrevem `customData[ANIMATION_KEY]` do container)                                                                                      |

### `svg-engine/edit` — engine + transporte (escopados, `provideSvgEngineEditorScope`)

| Símbolo                            | Descrição                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AnimationService` (`@Injectable`) | `doc()`/`tracks()`/`durationMs()` derivados do documento; `containerId()` (página ativa/root); CRUD (`addKeyframe`/`removeKeyframe`/`removeTrack`/`moveKeyframe`/`setKeyframeEasing`/`setDuration`); `sample(t)`; `animatablePropertiesFor(id)`; `currentValue(id, prop)` |
| `PlaybackService` (`@Injectable`)  | `playhead()`/`isPlaying()`/`loop()`/`speed()`/`durationMs()`; `play`/`pause`/`toggle`/`seek`/`step`/`stepForward`/`stepBackward`/`goToStart`/`goToEnd`/`setLoop`/`setSpeed`/`tick`; loop `requestAnimationFrame` (DestroyRef cancela)                                     |

### `svg-engine/ui` — UI

| Símbolo                            | Descrição                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SvgeTimeline` (`<svge-timeline>`) | dock da timeline: régua + tracks/keyframes + playhead + transporte + criação/edição (drag, easing, duração, scrub). Montado por `<svge-shell-pro [showTimeline]>` |

### `svg-engine/io` — persistência

O `AnimationDoc` faz round-trip via atributo `data-svge-animation` (JSON) no
grupo da página — emitido pelo `svgExporter`, relido pelo `svgImporter`. Como o
`AutoSave` serializa pelo exporter SVG, a animação persiste no save/recovery.

**Export animado SMIL (F9)**: o `svgExporter` injeta `<animate>`/`<animateTransform>`
nativos nos nós animados **apenas** quando
`SvgDocument.exportPreferences.emitSmilAnimation === true` (default `false`).
Nesse modo, nós com transform animado têm o `transform` estático descartado
(reconstruído additive). A ação **File ▸ Export Animated SVG (SMIL)** liga o flag
e baixa `untitled-animated.svg`. Com o flag desligado o export é byte-a-byte
idêntico ao de hoje — o round-trip do AutoSave **não** emite SMIL.

---

## Superfície interna / fora do contrato estável (publish-prep)

Preparação para o release no NPM público — endurecimento da superfície
pública em duas categorias:

### Categoria A — un-exported (interno mono-entry-point)

Símbolos que eram plumbing puro do motor, consumidos **apenas** dentro do
próprio entry point via import relativo de arquivo, **e que não constavam
nas tabelas de referência pública** deste documento. Removidos dos _barrels_
públicos (continuam `export`ados das fontes, para os importadores relativos
e specs). Não eram anunciados nem consumidos externamente — **zero break**:

- `ai/nlu`: `export * from './scoring'`
- `edit/library`: `Active{Gradients,Patterns,ClipPaths,Masks,Symbols}Service`
- `edit/effect`: `composeChainFilter`
- `edit/tool`: `boundsOfDraft`, `simplifySubpath`
- `edit/marquee`: `rectFromPoints`, `rectContainsRect`, `rectsIntersect`
- `edit/workspace`: `wheelZoomSensitivityFromSpeed`

> **Mantidos exportados** — regra: _se está nas tabelas de referência pública
> (09/06) ou tem consumidor cross-entry-point real, permanece público_.
>
> - `workspace/pageBoundsIn` (consumido pelo playground custom-editor).
> - `effect/{extract,make,parse}ChainFilterId` (svge-effects-panel em `ui`).
> - `render/projectDocumentToRenderer`, `render/renderTransformAttr`,
>   `snap/{gridTargetsNear,rectsToSnapTargets}`,
>   `shortcut/{parseCombo,comboMatches,ParsedCombo}` — **anunciados** nas tabelas
>   de referência (09/06). Reavaliados após a pergunta "isso penaliza terceiros?":
>   estavam documentados como helpers puros públicos, logo foram **restaurados**
>   no barrel (revertida a remoção inicial).

### Categoria B — `@internal` (interno cross-entry-point)

Símbolos que **precisam** ficar exportados porque `svg-engine/ui`/`nlu-ui`
os consomem do pacote buildado, mas **não** fazem parte do contrato público
estável. Marcados com `@internal` na fonte (documental — `stripInternal`
está desligado, então as declarações `.d.ts` permanecem). Podem mudar sem
_major bump_; consumidores externos não devem depender diretamente:

- `edit` — serviços-estado das tools: `PenToolService`, `PencilToolService`,
  `ShapeToolService`, `InlineTextEditorService`, `AnchorSelectionService`,
  `EyedropperToolService`, `KnifeToolService`, `SmoothToolService`,
  `GradientToolService`, `WidthToolService`, `SymbolSprayerService`
  (lidos pelos overlays de `ui`).
- `edit` — persistência/runner: `SnapshotsPersistenceService`,
  `AssetExportPersistenceService`, `AssetExportRunner` (painéis de `ui`).
- `ui` — `ColorHistoryService` + dialog services internos do plugin de menu:
  `Svge{About,FindReplace,SmartObjectEditor,WorkspaceSettings,SvgSource,TraceImage}DialogService`.

> `ai/nlu` `tokenize` / `detectLanguage` permanecem **públicos** — são
> primitivos NLU úteis a consumidores, não apenas wiring interno.

### Categoria C — presets builtin (tier `@internal` / avançado)

`edit` exporta **121 constantes de preset builtin** individuais (21 gradientes,
30 patterns, 24 shapes, 12 templates, 6 graphic-styles, 5 clip-paths, 4 masks,
19 effects). Foram oferecidas de propósito "for direct import / customization"
e são **tree-shakeable** uma a uma — então **não foram removidas** (remover
reverteria intenção e pioraria o tree-shaking de 1 preset).

Em vez disso, cada preset foi marcado **`@internal`** na fonte (documental;
`stripInternal` off → `.d.ts` preserva, zero break). Isso sinaliza que são
**tier avançado/secundário**: o **contrato primário** de cada categoria é o
array `BUILTIN_*` + a `*LibraryService`/registry + o `builtin*Plugin`. Os
presets individuais podem mudar sem _major bump_; quem precisa de um preset
específico pode importá-lo (tree-shake), ciente de que é tier secundário.

Como nada foi removido, a **superfície de nomes é idêntica** — o guard-rail
abaixo passa sem regen (mudança 100% doc-only).

### Guard-rail — snapshot da superfície pública

`projects/svg-engine/api-surface/public-api-surface.spec.ts` **trava** o
conjunto de nomes exportados por cada um dos 9 entry points contra um
_golden file_ versionado (`api-surface/public-api.snapshot.json`). Qualquer
adição/remoção na superfície pública — re-exposição acidental de plumbing
interno **ou** remoção de um símbolo anunciado (exatamente o deslize da
Cat. A) — **quebra o teste**, forçando a mudança a ser deliberada.

O teste resolve estaticamente `export *` / `export {…} from` recursivamente
(via TypeScript API), então reflete o `.d.ts` publicado sem precisar de build.
Roda dentro de `npm run test:lib`. Mudança intencional:

```
UPDATE_API_SNAPSHOT=1 npm run test:lib   # regenera o snapshot
```

Depois revise o diff, atualize esta seção/tabelas se o **contrato** mudou, e
commite o `.json` junto. Validado contra um canário (export aditivo →
falha esperada).

O mesmo spec inclui um check **"sem exports duplicados" (Categoria D)**: para
cada entry point, detecta se um mesmo nome é alcançável por **dois `barrels`
diferentes** (`export *` de duas pastas) e falha listando as origens. É a
forma durável da Cat. D — a auditoria pontual achou **zero** duplicatas reais
hoje (a Cat. D original era um falso positivo: leu o comentário
`// Mirror of SnapshotsPersistenceService` em `asset-export/index.ts` como se
fosse um export). Validado contra canário (re-export redundante → falha).

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
