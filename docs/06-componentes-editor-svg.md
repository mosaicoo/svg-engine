# 06 — Componentes do Editor SVG

> Catálogo dos componentes/serviços previstos. Detalhes de API só são
> registrados quando a fase correspondente é implementada — antes disso,
> cada item aqui é apenas escopo e responsabilidade.

---

## Componentes Angular

| Nome                      | Responsabilidade                                  | Fase |
| ------------------------- | ------------------------------------------------- | ---- |
| `<svg-canvas>`            | Render da árvore SVG, pan, zoom, viewport         | 2    |
| `<svg-selection-overlay>` | Handles de seleção (camada acima do canvas)       | 3    |
| `<svg-marquee>`           | Retângulo de seleção por arrasto                  | 3    |
| `<svg-layers-panel>`      | Lista de camadas, reordenação, visibilidade, lock | 4    |
| `<svg-inspector>`         | Propriedades do elemento selecionado              | 4    |
| `<svg-toolbar>`           | Barra de ferramentas extensível                   | 4    |
| `<svg-color-palette>`     | Cores e gradientes                                | 4    |
| `<svg-snap-guides>`       | Linhas-guia de alinhamento (overlay)              | 3    |
| `<svg-context-menu>`      | Menu contextual sobre elementos                   | 4    |

## Serviços (core)

| Serviço              | Responsabilidade                                          |
| -------------------- | --------------------------------------------------------- |
| `EditorStateService` | Estado global do editor (signals). Fonte única de verdade |
| `HistoryService`     | Pilhas de undo/redo, commit de comandos                   |
| `CommandBus`         | Despacho de comandos (todas as mutações passam por aqui)  |
| `SelectionService`   | IDs selecionados, foco, hover                             |
| `ViewportService`    | Pan, zoom, transformação de coordenadas tela ↔ documento  |
| `SnapService`        | Cálculo de snaps (grid, objetos, distâncias)              |
| `ClipboardService`   | Copy/paste interno e integração com clipboard do SO       |
| `IoService`          | Import/export SVG, sanitização                            |
| `PluginRegistry`     | Registro e ciclo de vida de plugins                       |

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
