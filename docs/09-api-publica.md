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

| Símbolo                                                              | Descrição                                         |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `Command` (interface)                                                | `id`, `label`, `execute(ctx)`, `undo(ctx)`        |
| `CommandResult`, `ok()`, `fail(error)`                               | resultado padronizado                             |
| `CommandContext`                                                     | `{ state: EditorStateService }`                   |
| `InsertNodeCommand(parentId, node, index?)`                          | inserção reversível                               |
| `RemoveNodeCommand(nodeId)`                                          | remoção reversível (captura posição original)     |
| `MoveNodeCommand(nodeId, dx, dy)`                                    | translação composta sobre transform existente     |
| `SetPropertyCommand<T extends SvgNode, K extends keyof T>(id, K, V)` | set/unset de uma propriedade qualquer (≠ id/type) |

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

| Símbolo                                             | Descrição                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `<svge-renderer>` (`SvgeRenderer`)                  | Renderer raiz: input `tree`, opcional `viewBox/width/height/ariaLabel` |
| `projectDocumentToRenderer(doc): { tree, viewBox }` | helper para extrair os dois inputs de um `SvgDocument`                 |

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

### `svg-engine/edit` (Fases 3 e 4)

> Seleção, transformação, canvas interativo, plugins.

_(populado conforme entregas)_

### `svg-engine/ui` (Fase 4)

> Componentes Angular Material para o editor completo.

_(populado quando Fase 4 entregar)_

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
