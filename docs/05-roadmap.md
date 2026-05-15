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

### Bloco 3 — Transform interativo + pivot persistente

- [ ] `TransformService`: signals `dragState`, `customPivots` (`Map<NodeId, Point>` em node-local)
- [ ] APIs: `setPivot`, `setPivotAnchor(9-point)`, `resetPivot`, `clearAllPivots`
- [ ] **Persistência por nó (D-022.persist)**: pivot custom é restaurado ao reselecionar.
      Para multi-selection, pivot relativo à bbox composta e reseta na mudança de composição.
- [ ] Métodos: `startDrag/drag/endDrag`, `startRotate/rotate/endRotate`, `startResize/resize/endResize`
- [ ] `RotateNodeCommand` (no `core`): recebe `angleRad` + `pivot` para undo correto
      (matriz `T(p) ⋅ R(θ) ⋅ T(-p) ⋅ existente`)
- [ ] `ResizeNodeCommand` (handle oposto = âncora; pivot **não** afeta scale na Fase 3 — D-022b futura)
- [ ] Integração com `MoveNodeCommand` existente

### Bloco 4 — Marquee + alinhamento

- [ ] `<svge-marquee>`: drag-to-select com box visual
- [ ] Snap-to-grid e snap-to-objects opcionais (`SnapService`)
- [ ] Alinhamento e distribuição (esquerda/centro/direita/topo/meio/base)

### Bloco 5 — Plugin extensibility (D-020)

- [ ] `ToolRegistry`: plugins registram ferramentas customizadas
- [ ] Tool API: `id`, `label`, `icon?`, `cursor?`, `onPointerDown/Move/Up`, `onKey`
- [ ] Pelo menos 1 ferramenta de referência (ex.: pencil/freehand)

## Fase 4 — UX completa

- [ ] Painel de camadas (drag-drop de ordem, visibilidade, lock)
- [ ] Agrupamento / desagrupamento
- [ ] Inspector de propriedades (geometria, fill, stroke, opacity, transform)
- [ ] Toolbar extensível (slot por categoria de ferramenta)
- [ ] Paleta de cores e gradientes (com swatches salvos)
- [ ] Atalhos de teclado configuráveis

## Fase 5 — IO + extensibilidade

- [ ] Import SVG sanitizado (remoção de scripts/eventos, validação de hrefs)
- [ ] Export SVG determinístico
- [ ] API de plugins (`EditorPlugin` + `provideSvgEngine`)
- [ ] Pelo menos 1 plugin de referência (ex.: ferramenta de desenho livre)

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
