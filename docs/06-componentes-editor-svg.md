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

### Componentes top-level + dispatcher

| Selector          | Responsabilidade                                                                    |
| ----------------- | ----------------------------------------------------------------------------------- |
| `<svge-renderer>` | Render read-only top-level. `<svg>` raiz com viewBox/aria                           |
| `<svge-node>`     | Dispatcher: `@switch` por `node.type`; recursivo para `group`; fallback no registry |

### Componentes per-tipo (built-in)

| Selector          | SVG renderizado  |
| ----------------- | ---------------- |
| `<svge-rect>`     | `<svg:rect>`     |
| `<svge-ellipse>`  | `<svg:ellipse>`  |
| `<svge-line>`     | `<svg:line>`     |
| `<svge-polygon>`  | `<svg:polygon>`  |
| `<svge-polyline>` | `<svg:polyline>` |
| `<svge-path>`     | `<svg:path>`     |
| `<svge-text>`     | `<svg:text>`     |
| `<svge-image>`    | `<svg:image>`    |

> Cada per-tipo é envolto em `<svg:g data-node-id transform>` para suportar
> futura camada de seleção/handles sem reestruturação.

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

| Selector                   | Responsabilidade                            | Fase |
| -------------------------- | ------------------------------------------- | ---- |
| `<svge-canvas>`            | Canvas editável (renderer + interações)     | 2-3  |
| `<svge-selection-overlay>` | Handles de seleção (camada acima do canvas) | 3    |
| `<svge-marquee>`           | Retângulo de seleção por arrasto            | 3    |
| `<svge-snap-guides>`       | Linhas-guia de alinhamento (overlay)        | 3    |

### Serviços

| Serviço            | Responsabilidade                                    |
| ------------------ | --------------------------------------------------- |
| `SelectionService` | IDs selecionados, foco, hover                       |
| `TransformService` | Drag, resize, rotate, scale (gera comandos)         |
| `SnapService`      | Cálculo de snaps (grid, objetos, distâncias)        |
| `ClipboardService` | Copy/paste interno e integração com clipboard do SO |
| `PluginRegistry`   | Registro e ciclo de vida de plugins                 |

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
