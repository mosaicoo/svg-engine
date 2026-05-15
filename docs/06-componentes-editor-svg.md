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

---

## Entry point `svg-engine/io` (Fase 5)

### Serviços

| Serviço         | Responsabilidade                                   |
| --------------- | -------------------------------------------------- |
| `SvgParser`     | string SVG → árvore de `SvgNode` (com sanitização) |
| `SvgSerializer` | árvore de `SvgNode` → string SVG (determinístico)  |
| `SvgSanitizer`  | remove scripts/eventos, valida `xlink:href`        |

---

## Entry point `svg-engine/optimize` (Fase 5)

### Serviços

| Serviço                | Responsabilidade                                         |
| ---------------------- | -------------------------------------------------------- |
| `OptimizationPipeline` | Compõe e executa passes de otimização configuráveis      |
| `PathOptimizer`        | Reduz e simplifica `d` attribute de paths                |
| `Deduper`              | Remove definições duplicadas (gradients, patterns, etc.) |
| `Minifier`             | Remove whitespace e atributos default                    |

---

## Entry point `svg-engine/edit` (Fases 3 e 4)

### Componentes

| Selector                   | Responsabilidade                                                                                                                                                                                                                                         | Fase |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `<svge-canvas>`            | Canvas editável (renderer + interações)                                                                                                                                                                                                                  | 2-3  |
| `<svge-selection-overlay>` | Handles de seleção (camada acima do canvas)                                                                                                                                                                                                              | 3    |
| `<svge-rotation-pivot>`    | Crosshair editável do pivot de rotação (D-022 Affinity-grade): free-drag com snap-to-anchors (Alt=bypass); clique sem drag abre popover 3×3 para snap exato (TL/TC/TR/ML/MC/MR/BL/BC/BR); Esc cancela; double-click reseta; pivot custom persiste por nó | 3    |
| `<svge-marquee>`           | Retângulo de seleção por arrasto                                                                                                                                                                                                                         | 3    |
| `<svge-snap-guides>`       | Linhas-guia de alinhamento (overlay)                                                                                                                                                                                                                     | 3    |

### Serviços

| Serviço            | Responsabilidade                                                                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SelectionService` | IDs selecionados, foco, hover                                                                                                                                                                                                                                                                                          |
| `TransformService` | Drag, resize, rotate, scale (gera comandos). Mantém pivot Affinity-grade (D-022): `Map<NodeId, Point>` em coordenadas node-local; default centro; APIs `setPivot/setPivotAnchor/resetPivot/clearAllPivots`. Snap a 9 anchors (Alt bypass). Para multi-selection, pivot é relativo à bbox composta e reseta na mudança. |
| `MarqueeService`   | Drag-to-select state (start/update/end/cancel + rect normalizado). Pure helper `nodesInsideMarquee` para hit-test (D-022, padrão Illustrator/Affinity)                                                                                                                                                                 |
| `SnapService`      | Snap-to-grid + snap-to-objects (D-022.snap). Config `enabled`/`mode`/`gridSize`/`thresholdPx`. Pure resolver `resolveSnap(moving, targets, threshold)`. ActiveGuides signal lido pelo `<svg:g svgeSnapGuides>`                                                                                                         |
| `AlignmentService` | 6 alinhamentos (left/center-x/right/top/center-y/bottom) + 2 distribuições (horizontal/vertical centers) anchorados na union bbox. Dispara `TranslateManyCommand` (1 entrada de undo)                                                                                                                                  |
| `ClipboardService` | Copy/paste interno e integração com clipboard do SO                                                                                                                                                                                                                                                                    |
| `PluginRegistry`   | Plugin extensibility infra (D-020 + Bloco 5a): install/uninstall com lifecycle, semver gate, dep check, LIFO disposal de `Disposable`s trackeados. Universal: toda capability registry (Tool/Optimizer/Importer/...) pluga sobre essa infra                                                                            |
| `ToolRegistry`     | Capability registry de tools (D-020 + Bloco 5b — primeira categoria mapeada em D-023). Plugins registram `Tool` (id/label/cursor/shortcut/hooks pointer/key) via `ctx.track(reg.register(tool))`                                                                                                                       |
| `ToolHostService`  | Tool ativa + roteamento de eventos do canvas (`activate`/`deactivate`/`route*`). `activeTool` é computed que re-deriva da registry — resiliente a uninstall do plugin do tool ativo                                                                                                                                    |

---

## Entry point `svg-engine/ui` (Fase 4) — Angular Material

### Componentes

| Selector               | Responsabilidade                                  | Fase |
| ---------------------- | ------------------------------------------------- | ---- |
| `<svge-editor>`        | Composição completa: canvas + toolbar + painéis   | 4    |
| `<svge-toolbar>`       | Barra de ferramentas extensível                   | 4    |
| `<svge-layers-panel>`  | Lista de camadas, reordenação, visibilidade, lock | 4    |
| `<svge-inspector>`     | Propriedades do elemento selecionado              | 4    |
| `<svge-color-palette>` | Cores e gradientes                                | 4    |
| `<svge-context-menu>`  | Menu contextual sobre elementos                   | 4    |
| `<svge-theme-toggle>`  | Toggle light/dark explícito (D-012 part 2)        | 4    |

## Comandos (exemplos)

| Comando              | Mutação                                 |
| -------------------- | --------------------------------------- |
| `InsertNodeCommand`  | Adiciona nó à árvore                    |
| `RemoveNodeCommand`  | Remove nó                               |
| `MoveNodeCommand`    | Reposiciona nó (translate)              |
| `ResizeNodeCommand`  | Redimensiona                            |
| `RotateNodeCommand`  | Rotaciona                               |
| `SetPropertyCommand` | Altera propriedade (fill, stroke, etc.) |
| `GroupCommand`       | Agrupa nós selecionados                 |
| `UngroupCommand`     | Desfaz agrupamento                      |
| `ReorderCommand`     | Z-order (subir/descer/topo/fundo)       |

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
