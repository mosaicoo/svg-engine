# 06 — Componentes do Editor SVG

> Catálogo dos componentes/serviços previstos, organizado por **entry point**
> da library (D-018). Detalhes de API só são registrados quando a fase
> correspondente é implementada — antes disso, cada item é escopo +
> responsabilidade. Selectors usam prefixo `svge-` (definido pelo schematic).

> **Headless boundary (D-017)**: nada nos entry points `core`, `render`,
> `io`, `optimize`, `edit` pode importar `@angular/material` ou
> `@angular/cdk`. Apenas `ui` pode.

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

| Uso                                     | SVG host         | Diretiva                |
| --------------------------------------- | ---------------- | ----------------------- |
| `<svg:rect [svgeRect]="rectNode" />`    | `<svg:rect>`     | `SvgeRectDirective`     |
| `<svg:ellipse [svgeEllipse]="..." />`   | `<svg:ellipse>`  | `SvgeEllipseDirective`  |
| `<svg:line [svgeLine]="..." />`         | `<svg:line>`     | `SvgeLineDirective`     |
| `<svg:polygon [svgePolygon]="..." />`   | `<svg:polygon>`  | `SvgePolygonDirective`  |
| `<svg:polyline [svgePolyline]="..." />` | `<svg:polyline>` | `SvgePolylineDirective` |
| `<svg:path [svgePath]="..." />`         | `<svg:path>`     | `SvgePathDirective`     |
| `<svg:text [svgeText]="..." />`         | `<svg:text>`     | `SvgeTextDirective`     |
| `<svg:image [svgeImage]="..." />`       | `<svg:image>`    | `SvgeImageDirective`    |

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

| Símbolo                     | Order | Efeito                                                                    |
| --------------------------- | ----- | ------------------------------------------------------------------------- |
| `precisionOptimizer`        | 10    | Arredonda numerics a 3 casas (rect x/y/w/h, path `d`, styles)             |
| `dropDefaultsOptimizer`     | 50    | Remove `opacity:1`/`fillOpacity:1`/`strokeOpacity:1`/`visibility:visible` |
| `pruneEmptyGroupsOptimizer` | 90    | Remove `<g></g>` recursivamente (root preservado)                         |

Plugin wrapper (`builtinOptimizersPlugin`) fica em `svg-engine/edit`.

---

## Entry point `svg-engine/edit` (Fases 3 e 4)

### Componentes

| Selector                       | Responsabilidade                                                                                                                                                                                                                                                                                                                 | Fase |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `<svge-canvas>`                | Canvas editável (renderer + interações)                                                                                                                                                                                                                                                                                          | 2-3  |
| `<svg:g svgeSelectionOverlay>` | Handles de seleção (camada acima do canvas). Esconde-se quando Direct Select está ativo + focusNode é path (deixa o AnchorOverlay tomar conta)                                                                                                                                                                                   | 3    |
| `<svge-rotation-pivot>`        | Crosshair editável do pivot de rotação (D-022 Affinity-grade): free-drag com snap-to-anchors (Alt=bypass); clique sem drag abre popover 3×3 para snap exato (TL/TC/TR/ML/MC/MR/BL/BC/BR); Esc cancela; double-click reseta; pivot custom persiste por nó                                                                         | 3    |
| `<svge-marquee>`               | Retângulo de seleção por arrasto                                                                                                                                                                                                                                                                                                 | 3    |
| `<svg:g svgeSnapGuides>`       | Linhas-guia de alinhamento (overlay)                                                                                                                                                                                                                                                                                             | 3    |
| `<svg:g svgeAnchorOverlay>`    | Path/anchor editor (Bloco 6-PathEditor): squares editáveis em cada anchor + handle circles (in/out) + segment hit-zones para Alt+click (InsertAnchor). Dblclick cicla kind cusp → smooth → symmetric. Multi-anchor selection via `AnchorSelectionService`. Coords sempre via `composeAncestorMatrix` (segue transforms do grupo) | 6    |
| `<svg:g svgeGridOverlay>`      | Grid lines major/minor reativo ao viewBox + signals do `WorkspaceService`                                                                                                                                                                                                                                                        | 4f   |
| `<svg:g svgeGuidesOverlay>`    | Linhas de guide H/V (ciano), selecionáveis e removíveis via Delete                                                                                                                                                                                                                                                               | 4f   |
| `<svg:g svgePageOverlay>`      | Marca visual da page configurada no WorkspaceService (rect + margens inset dashed). pointer-events: none                                                                                                                                                                                                                         | 4f   |
| `<svge-rulers>`                | HTML overlay top + left com ticks "nice spacing" (1/2/5 × 10ⁿ). Drag-from-ruler cria guide                                                                                                                                                                                                                                       | 4f   |
| `<svge-isolation-breadcrumb>`  | Trail "Document › Group › Group" do nível atual de isolation. Click navega up                                                                                                                                                                                                                                                    | 5    |

### Serviços

| Serviço                                                                                                                   | Responsabilidade                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SelectionService`                                                                                                        | IDs selecionados, foco, hover                                                                                                                                                                                                                                                                                          |
| `TransformService`                                                                                                        | Drag, resize, rotate, scale (gera comandos). Mantém pivot Affinity-grade (D-022): `Map<NodeId, Point>` em coordenadas node-local; default centro; APIs `setPivot/setPivotAnchor/resetPivot/clearAllPivots`. Snap a 9 anchors (Alt bypass). Para multi-selection, pivot é relativo à bbox composta e reseta na mudança. |
| `MarqueeService`                                                                                                          | Drag-to-select state (start/update/end/cancel + rect normalizado). Pure helper `nodesInsideMarquee` para hit-test (D-022, padrão Illustrator/Affinity)                                                                                                                                                                 |
| `SnapService`                                                                                                             | Snap-to-grid + snap-to-objects (D-022.snap). Config `enabled`/`mode`/`gridSize`/`thresholdPx`. Pure resolver `resolveSnap(moving, targets, threshold)`. ActiveGuides signal lido pelo `<svg:g svgeSnapGuides>`                                                                                                         |
| `AlignmentService`                                                                                                        | 6 alinhamentos (left/center-x/right/top/center-y/bottom) + 2 distribuições (horizontal/vertical centers) anchorados na union bbox. Dispara `TranslateManyCommand` (1 entrada de undo)                                                                                                                                  |
| `ClipboardService`                                                                                                        | Copy/paste interno e integração com clipboard do SO                                                                                                                                                                                                                                                                    |
| `PluginRegistry`                                                                                                          | Plugin extensibility infra (D-020 + Bloco 5a): install/uninstall com lifecycle, semver gate, dep check, LIFO disposal de `Disposable`s trackeados. Universal: toda capability registry (Tool/Optimizer/Importer/...) pluga sobre essa infra                                                                            |
| `ToolRegistry`                                                                                                            | Capability registry de tools (D-020 + Bloco 5b — primeira categoria mapeada em D-023). Plugins registram `Tool` (id/label/cursor/shortcut/hooks pointer/key) via `ctx.track(reg.register(tool))`                                                                                                                       |
| `ToolHostService`                                                                                                         | Tool ativa + roteamento de eventos do canvas (`activate`/`deactivate`/`route*`). `activeTool` é computed que re-deriva da registry — resiliente a uninstall do plugin do tool ativo                                                                                                                                    |
| `AnchorSelectionService`                                                                                                  | Multi-anchor selection (Bloco 6-PathEditor): `Set<AnchorRef>` reativo + helpers add/toggle/selectOne/clear. Refs estáveis durante a vida do gesto; consumer deve invalidar/rebase em `InsertAnchorCommand` (shift de índices)                                                                                          |
| `IsolationService`                                                                                                        | Isolation mode (entra em um grupo focado, dimming dos outros). Signal `isolationRootId` + breadcrumb computed                                                                                                                                                                                                          |
| `AutoSaveService`                                                                                                         | Debounced auto-save em localStorage (key `svge.autosave`, default 800ms). `recover()` retorna doc serializado se existe; `clear()` limpa entrada                                                                                                                                                                       |
| `LayersService`                                                                                                           | Visibility (`hiddenIds`) + lock (`lockedIds`) Set signals. Lock = totalmente off-limits — SelectionService filtra writes, TransformService rejeita gestos. Unlock NÃO restaura seleção (convenção Affinity/Figma)                                                                                                      |
| `WorkspaceService`                                                                                                        | Background + page config + grid + guides + rulers + outline (presentation meta acima do `SvgDocument`). Não persiste no SVG (D-021)                                                                                                                                                                                    |
| `MenuContributionRegistry`/`ShortcutRegistry`/`PaletteRegistry`/`ImporterRegistry`/`ExporterRegistry`/`OptimizerRegistry` | Capability registries do D-023 categorias 4-9. Todas seguem mesmo padrão: signal-backed, `register(item): Disposable`, throw em duplicate id, lookup helpers (`bySlot`/`byCategory`/`byExtension`/`byMediaType`)                                                                                                       |

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

| Selector                   | Responsabilidade                                                                                                                                                                                                                                  | Fase |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `<svge-editor>`            | Composição completa: canvas + toolbar + painéis                                                                                                                                                                                                   | 4    |
| `<svge-toolbar>`           | Barra de ferramentas extensível                                                                                                                                                                                                                   | 4    |
| `<svge-layers-panel>`      | Lista de camadas, reordenação, visibilidade, lock                                                                                                                                                                                                 | 4    |
| `<svge-inspector>`         | Propriedades do elemento selecionado                                                                                                                                                                                                              | 4    |
| `<svge-color-palette>`     | Cores e gradientes                                                                                                                                                                                                                                | 4    |
| `<svge-context-menu>`      | Menu contextual sobre elementos                                                                                                                                                                                                                   | 4    |
| `<svge-theme-toggle>`      | Toggle light/dark explícito (D-012 part 2)                                                                                                                                                                                                        | 4    |
| `<svge-svg-source-dialog>` | **(2026-05-20)** Visualizador live do SVG exportado via `svgExporter` + `ExporterRegistry`. Copy-to-clipboard com fallback `execCommand`. Reativo a mudanças no document. Inkscape "XML Editor" / Boxy SVG "Source" parity. Abrir via `MatDialog` | 6    |

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

## Modelo de dados (preview)

```
SvgNode (abstrato)
├── ShapeNode
│   ├── RectNode
│   ├── EllipseNode
│   ├── LineNode
│   ├── PolygonNode
│   ├── PolylineNode
│   └── PathNode
├── TextNode
├── ImageNode
└── GroupNode  (contém SvgNode[])
```

> Todo nó tem: `id`, `type`, `transform`, `style`, `metadata`.
> Todo nó é tratado como **imutável**: mutações geram nova versão.

---

## A definir nas fases correspondentes

- API pública exata de cada componente/serviço (props, eventos, signals).
- Estratégia de hit-testing (DOM `elementsFromPoint` vs cálculo geométrico próprio).
- Estratégia de path editing (edição de pontos de Bézier).
- Sistema de constraints/guides avançado.
