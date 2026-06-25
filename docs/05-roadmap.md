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

### Bloco 1 — `@mosaicoo/svg-engine/core` (headless puro) ✅ concluído

- [x] Estrutura multi-entry-point: `projects/svg-engine/core/` com
      `ng-package.json` próprio e `public-api.ts`
- [x] tsconfig path mapping `@mosaicoo/svg-engine/core` → `dist/svg-engine/core`
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
      `import { ... } from '@mosaicoo/svg-engine/core'` valida tree-shaking real
      (bundle separado em `dist/svg-engine/fesm2022/svg-engine-core.mjs`)

### Bloco 2 — `@mosaicoo/svg-engine/render` (read-only viewer + plugin point) ✅ concluído

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

## Fase 3 — Seleção e transformação (`@mosaicoo/svg-engine/edit`)

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

## Fase 4 — UX completa ✅ (todos os blocos entregues, 632 testes)

> **Foundation pré-Fase 4** (D-021 resolvido):
>
> - [x] **Bloco 4-pre**: `WorkspaceService` + `<svge-workspace-background>` (background transparente xadrez / sólido / imagem). Headless (HTML+CSS, sem Material). Toolbar de presets no playground

- [x] **Bloco 4-IP-FixBugs2**: picker valor sempre `#cccccc` para cores não-hex (hsl/rgb/named)
  - **Sintoma**: após FixBugs corrigir a posição do popover, o seletor abria com cinza (`rgb(204,204,204)`) em vez da cor real (que aparecia corretamente no swatch ao lado)
  - **Root cause**: `styleColor()` fazia fallback para `#cccccc` em qualquer formato ≠ `#RRGGBB`. Formas seedadas via `randomPastel()` (HSL) sempre caíam no fallback
  - **Fix**: novo helper `cssColorToHex6(input)` com cascata por custo — regex de hex (sem DOM) → parser JS de rgb()/rgba() (legacy + CSS Color 4) → parser JS de hsl()/hsla() com conversão HSL→RGB conforme spec → Canvas fillStyle round-trip como fallback para named/lab/lch. Alpha sempre descartado (native picker é RGB-only). `styleColor()` agora chama esse helper
  - +7 testes em `inspector.component.spec.ts` (hex passthrough; expansão 3-char; rgb legacy/CSS4/alpha/percent; hsl com formato do `randomPastel`; hue normalizado; integrado: picker.value mostra `#008040` para `rgb(0,128,64)`) → **528 passing**
- [x] **Bloco 4-IP-FixBugs**: dois bugs reais reportados pelo usuário
  - **Bug 1 (resize edges)**: depois de mover uma forma, arrastar qualquer aresta fazia o lado oposto deslizar. Root cause: `bakeScaleIntoNode` tratava `anchor` (doc coords) e `node.x/y` (local coords pré-transform) como se estivessem no mesmo sistema. Para `transform = translate(tx,ty)` (caso comum pós-Move), as coords divergiam por `(tx,ty)`. Fix: dispatcher subtrai `(transform[4],transform[5])` do anchor; recursão de grupos passa `localAnchor` p/ compor cadeia de translates aninhados
  - **Bug 2 (color picker no canto)**: clique no swatch abria o popover do `<input type="color">` no canto do viewport. Root cause: `.color-input-hidden` era `position: absolute` sem ancestor positioned → input escapava para o initial containing block. Fix: `.field-row` ganhou `position: relative` + input reposicionado com `top: 50%; left: 36px`
  - +6 testes em `scale-bake.spec.ts` (translated rect mr/tc; translated ellipse; identity preservada; rotated null; nested group+translate cadeia) + 1 teste no inspector (`.field-row` é relative) → **521 passing**
- [x] **Bloco 4-IP-Fix**: fusão swatch + color picker (eliminação do controle duplicado)
  - **Problema reportado** (via screenshot): cada linha de cor mostrava DOIS controles — o swatch (cor real) E o `<input type="color">` nativo (caixa cinza padrão), lado a lado. Padrão de mercado (Figma/Affinity/Inkscape) é um único controle por campo
  - **Solução**: `<label class="field-row">` envolvendo `<span class="swatch">` + `<input type="color" class="color-input-hidden">`. Label↔input association do browser garante que clique no swatch abre o picker nativo. Native input fica visually-hidden (1×1px, opacity 0, pointer-events none) mas tab-focusable (a11y preservada)
  - CSS: swatch 28×22 com border-radius, hover destaca borda em primary, disabled reduz opacidade. `aria-hidden="true"` no swatch + `aria-label` explícito no input ("Pick fill/stroke color") → screen readers ouvem semântica limpa
  - +1 teste (lock-down da estrutura fundida: 2 labels, 1 swatch + 1 input-hidden cada) → **514 passing**
- [x] **Bloco 4-Inspector-Polish**: 3 fixes solicitados pelo usuário após Resize-Proper
  - **Item 3 (mais importante)**: bake **durante o drag** — `TransformService.updateResize` agora chama `bakeScaleIntoNode` a cada frame em vez de só compor scale-transform; `DragState` resize ganha `startNode` snapshot; `endResize`/`cancelGesture` revertem ao node inteiro antes de dispatch. Inspector mostra `w`/`h`/`x`/`y` atualizando em tempo real durante o resize.
  - **Item 1**: pipes `rectField`/`ellipseField`/`lineField` arredondam para inteiro (display-only; model preserva precisão). `styleNumber('opacity')` mostra 2 decimais; `styleNumber` default `'1'` (SVG implicit) quando undefined.
  - **Item 2**: swatch visual com `[style.background-color]="rawStyleColor(field)"` ao lado de cada color picker — mostra a cor **REAL** do modelo (hsl/rgb/named/url/hex). `<input type="color">` continua só pra editar.
  - Garantias preservadas: 1 undo entry por gesto; estado final pós-commit idêntico; fallback rotacionado mantido para shapes que não bakeiam
- [x] **Bloco 4-Resize-Proper**: resize via handles agora baka geometria (não compõe scale matrix)
  - **Problema corrigido**: era reportado que ao arrastar o "quadradinho" (handle) o contorno (stroke) ficava visivelmente alterado — confirmado como erro real (scale matrix aplicada via transform afeta stroke + gera mismatch inspector-vs-visual)
  - **Solução** (Caminho B completo, como solicitado pelo usuário):
    - `core/geometry/scale-bake.ts`: pure helpers `bakeRect/bakeEllipse/bakeLine/bakePolygon/bakePolyline/bakeText/bakeImage/bakeGroup/bakePath` + primitives `scaleAxisInterval`/`scalePoint`/`isIdentityOrTranslate` + entry unificado `bakeScaleIntoNode`
    - `core/geometry/path-d-scaler.ts`: parser/scaler/serializer do `d` attribute (M/L/H/V/C/S/Q/T/Z + arcos com limitação documentada de rotação)
    - `ResizeNodeCommand` agora tenta bake primeiro; fallback para `composeAnchoredScale` quando nó é rotacionado
    - `vector-effect="non-scaling-stroke"` nos 7 renderers que têm stroke (rect/ellipse/line/polygon/polyline/path/text); cobre o caso fallback rotacionado
    - Preview durante drag continua usando scale-transform (rápido, sem parse per-frame); bake só no commit (endResize)
    - Undo restaura node inteiro (geometria + transform) com snapshot pré-execute
  - **Padrão de mercado atingido**: inspector reflete geometria real, stroke nunca distorce, cantos arredondados preservados, paths editados corretamente
  - Limitação documentada: nós rotacionados não bakeam (fallback usa scale-transform composition; visual correto via non-scaling-stroke; inspector mostra geometria pre-scale)

- [x] **Bloco 4a**: `@mosaicoo/svg-engine/ui` entry point + `<svge-editor>` shell
  - Quarto secondary entry point criado (`projects/svg-engine/ui/`); ng-packagr auto-discover; tsconfig paths + lib/spec includes atualizados
  - `@angular/material` + `@angular/cdk` adicionados como peerDeps **opcionais** (consumer só puxa se importar `@mosaicoo/svg-engine/ui`)
  - `<svge-editor>` compõe `<svge-workspace-background>` + `<svge-renderer>` + `<ng-content>` + Material toolbar (undo/redo/zoom/reset reativos a `HistoryService`+`ViewportService`)
  - Inputs `tree`/`viewBox` opcionais com fallback para `EditorStateService.document()`
  - Outputs `undoTriggered`/`redoTriggered` para telemetria/analytics
  - Headless boundary verificada por Grep: zero imports de `@angular/material|cdk` em `core/render/edit`
- [x] **Bloco 4b**: Painel de camadas (`<svge-layers-panel>`)
  - `LayersService` (em `edit`): `hiddenIds`/`lockedIds` Set signals + togglers (idempotent, dedup); `showAll`/`unlockAll`
  - `[svgeLayersFilter]` directive (em `edit`): aplica `display: none` em `[data-node-id]` matching `hiddenIds` via `effect()`; preserva pre-existing inline display ao restaurar; opt-in (consumer attach na renderer)
  - `<svge-layers-panel>` (em `ui`): recursive Material UI; expand/collapse de groups; ícone por tipo; visibility/lock buttons; click-to-select com Ctrl/Shift modifiers; classes `.selected`/`.hidden`/`.locked` p/ styling
  - ~~Drag-drop reorder ADIADO~~ → **entregue em 4b-DnD** (ver abaixo)
- [x] **Bloco 4b-DnD**: drag-drop reorder no layers panel
  - `MoveNodeInTreeCommand(nodeId, newParentId, newIndex)` em core: move + reparent atomic (same-parent reorder OR cross-parent move). Semantic "final-state index" (newIndex = posição que o node ASSUME na children array pós-move). Valida: not-root, target-exists, target-é-group, no-cycle (não pode mover group para descendente). No-op em mesma posição. Undo restaura parent + index originais
  - `<svge-layers-panel>` recebe HTML5 drag handlers: `draggable="true"` (exceto locked), `dragstart`/`dragover`/`drop`/`dragend`. Visual indicators: `.drop-before` (linha primary no topo), `.drop-after` (linha primary no bottom), `.drop-inside` (ring + bg primary-container — só quando target é group). Y-zonas top 30% → before, bottom 30% → after, middle 40% → inside (se group). Skip locked target, self, descendant (cycle prevention)
  - Após drop, o nó movido fica selecionado (Figma/Affinity UX)
  - +21 testes (15 do command em `move-node-in-tree.spec.ts` + 6 de integração no layers panel) → **670 passing**
- [x] **Bloco 4b-Lock v2**: enforcement do cadeado — locked = totalmente off-limits
  - **Correção do v1**: usuário esclareceu que locked NÃO pode ser selecionado nem ter propriedades exibidas; única interação permitida é via botões eye/lock do próprio layers panel
  - `SelectionService`: injeta `LayersService`. Filter no write em `select`/`selectMany`/`addToSelection`/`toggle`/`setHover`. Effect com `untracked()` auto-deseleciona quando `lockedIds` cresce (pruning + focus reassignment + hover clear)
  - `TransformService.startMove/startRotate/startResize` continuam refusando locked (defense in depth — agora redundante mas barato)
  - Layers panel: `cursor: not-allowed` em rows locked, `aria-disabled="true"`, `tabindex="-1"`, hover bg neutro; click/keyboard handlers fazem early-return em locked
  - Inspector: badge "Locked" e CSS `.inspector-header.locked` REMOVIDOS (locked nunca chega aqui agora); `[disabled]="isLocked()"` e setter short-circuits MANTIDOS como defesa em profundidade
  - Lock NÃO afeta `clear()` ou `deselect()` (usuário pode programaticamente remover; o que não pode é ADICIONAR locked à seleção)
  - Unlock NÃO restaura seleção (Affinity/Figma convention — usuário precisa reselecionar manualmente)
- [x] **Bloco 4c**: Inspector de propriedades (`<svge-inspector>`)
  - Reativo a `selection.focusId()` via computed; estados: empty / multi (placeholder com count) / single (header + sections)
  - Geometry per type: rect (x/y/w/h), ellipse (cx/cy/rx/ry), line (x1/y1/x2/y2). polygon/polyline/path/text/image mostram placeholder "edit via canvas tools"; group sem geometry
  - Style: fill + stroke (`<input type="color">`), strokeWidth + opacity (number inputs)
  - Pipes type-narrowed (`rectField`/`ellipseField`/`lineField`) evitam `$any()` no template
  - Cada `(change)` dispara `SetPropertyCommand` (1 undo entry por edit; sem per-keystroke pollution)
  - `parseNumericInput()` helper rejeita strings vazias (evita commit de `0` quando `Number('')` retorna 0)
  - **Pivot picker integrado e transform decomposto adiados** para sub-bloco 4c-Polish (precisa matrix decomposition + integração com TransformService)
- [x] **Bloco 4d**: Paleta de cores + `PaletteRegistry` (categoria 8 do D-023)
  - `Palette` type (id/name/category?/swatches[]) + `PaletteRegistry` (signal-backed, register retorna `Disposable`, throw em duplicate/empty-id/empty-swatches, `byCategory(...)`)
  - `builtinPalettesPlugin` (categoria 8 do D-023) registra 3 paletas via `ctx.track`: `default-greys` (utility, com `transparent` como 1ª swatch), `material-primary` (brand, 10 cores Material 500), `tailwind-pastels` (brand, 9 pastels Tailwind 200)
  - `<svge-color-palette>` em `@mosaicoo/svg-engine/ui`: standalone, input `palettes` opcional (fallback `PaletteRegistry.palettes()`) + input `transparentLabel`, output `colorPicked`. Swatches 24×16 com checkerboard, hover scale, focus ring; swatch `transparent` ganha ícone block vermelho (padrão Figma/Affinity)
  - Integração no inspector: palette strip abaixo das color rows; `.active-target` class marca qual field (fill/stroke) recebe o próximo click (default fill, troca por `pointerdown` na row). Padrão de mercado (Photoshop swatches panel)
  - `builtinPalettesPlugin` provisionado em `app.config.ts` do playground
  - +22 testes (8 registry/plugin + 9 UI component + 5 integração inspector) → **550 passing**
- [x] **Bloco 4e**: Toolbar extensível + `MenuContributionRegistry` (categoria 9 parte 1 do D-023)
  - Tipo `MenuContribution` (id/slot/label/icon?/tooltip?/shortcut?/order?/disabled?/visible?/run). Campos `disabled`/`visible` são `Signal<boolean>` — UI re-renderiza automaticamente quando estado muda
  - `MenuContributionRegistry` (signal-backed): `register(contrib)` → `Disposable`. `bySlot(slot)` retorna `Signal<readonly MenuContribution[]>` filtrado por slot + visible + ordenado por `order` (default 100, stable sort em ties). Throw em id vazio/duplicado/slot vazio
  - `<svge-toolbar slot="..."/>` em `@mosaicoo/svg-engine/ui`: renderiza Material `<mat-icon-button>` por contribuição visível. Icon ou text fallback. Tooltip com shortcut hint. Disabled honra signal do item. Componente standalone, OnPush
  - Slot convention documentada (`toolbar.main`/`toolbar.shape`/`toolbar.transform`/`sidebar.*`/`context.*`). Plugins podem inventar slots novos; UIs ignoram slots desconhecidos
  - +13 testes (registry: basics 3, validation 3, bySlot 5; UI: render/disabled/click/icon-fallback/order 6) → **578 passing**
- [x] **Bloco 4f**: Workspace settings — page + grid + guides + rulers
  - `WorkspaceService` expandido com 4 signals novos + tipos: `PageConfig` (width/height/orientation/margins), `GridConfig` (enabled/spacing/majorEvery/color), `RulersConfig` (enabled), `Guide[]` (axis/position). APIs: `patchPage`, `resetPage`, `patchGrid`, `toggleGrid`, `resetGrid`, `setRulersEnabled`, `toggleRulers`, `addGuide`, `moveGuide`, `removeGuide`, `clearGuides`. Validação silent-reject + signal-dedup
  - `GridOverlay` (em `edit`, selector `g[svgeGridOverlay]`): linhas SVG cobrindo o viewBox atual; major/minor distinção por opacity; `vector-effect="non-scaling-stroke"`; `pointer-events: none`; computed re-roda apenas quando viewBox ou grid signals mudam
  - `GuidesOverlay` (em `edit`, selector `g[svgeGuidesOverlay]`): linhas SVG ciano por guide; horizontal/vertical span do viewBox; v1 display-only (drag-to-move adiado)
  - `<svge-rulers>` (em `ui`): HTML overlay top + left, ticks com algoritmo "nice spacing" (1/2/5 × 10ⁿ, ~8 majors), labels formatados; visibilidade reativa via `rulers().enabled`
  - **Settings panel UI adiado**: o `WorkspaceService` expõe toda a API; consumers (playground / shells custom) montam o dialog quando quiserem. Reduz dependências Material no bloco
  - +20 testes em `workspace.service.spec.ts` (page 6, grid 5, rulers 3, guides 6) → **624 passing**
- [x] **Bloco 4g**: Atalhos configuráveis + `ShortcutRegistry` (categoria 9 parte 2 do D-023)
  - Tipo `Shortcut` (id/combo/when?: Signal<boolean>/description?/run(event)). `parseCombo()` + `comboMatches()` puros: aceitam `Ctrl`/`Control`, `Shift`, `Alt`/`Option`, `Cmd`/`Meta`/`Win`, `CmdOrCtrl` (cross-platform). Key tokens (`g`/`ArrowUp`/`Escape`/`F5`) normalizados via lower-case. Throw em token desconhecido / empty
  - `ShortcutRegistry` (signal-backed): `register(shortcut): Disposable`, `tryMatch(event): Shortcut | null`. Duplicate id → throw; duplicate combo permitido (when guards mantêm disjunto). Insertion order tiebreak
  - `ShortcutService`: opt-in `start()`/`stop()` — adiciona listener `document.keydown`, ignora editable targets (input/textarea/contenteditable), chama `shortcut.run(event)`. `preventDefault` é responsabilidade do `run()` (permite shortcuts não-destrutivos)
  - +26 testes (parseCombo 8 + comboMatches 4 + registry 7 + service 4 + interação) → **604 passing**
- [x] **Bloco 4h**: Agrupamento / desagrupamento
  - `GroupSelectionCommand`: wraps seleção em novo `GroupNode`. Valida common-parent (mixed → fail), insere o group no índice do TOP child da seleção (preserva stacking), children em PARENT-order (não selection-order), undo restaura cada child em seu índice original
  - `UngroupCommand`: promove children do group para o grand-parent no índice original do group. Rejeita root + non-group. Group transform é DROPPED (limitação documentada — futuro `BakeGroupTransformCommand`). Undo recria o group com mesmo id + transform + style
  - Playground: handlers `Ctrl+G` / `Ctrl+Shift+G` (Mac: `Cmd+G`); botões "Group" / "Ungroup" no toolbar (disabled-when-inválido com `canUngroupFocus` computed)
  - +11 testes (group ordering / common-parent validation / undo roundtrip / single-node group / ungroup positioning / undo restore-with-transform) → **561 passing**
- [x] **Bloco 4i**: Theme toggle explícito (D-012 part 2)
  - `ThemeService` (em `@mosaicoo/svg-engine/ui`): tipos `Theme = 'system'|'light'|'dark'` + `ResolvedTheme = 'light'|'dark'`. `setTheme()` persiste em `localStorage` chave `svge.theme`; init lê valor persistido (fallback `'system'` se inválido); `cycle()` light→dark→system→light. `_systemPrefersDark` signal escuta `prefers-color-scheme` (`addEventListener` moderno + `addListener` fallback Safari antigo). `effect()` reflete resolved theme para `<html data-theme="...">` (Material 3 / Tailwind picks up; sem flash-of-unstyled). Safe-fallback p/ SSR (typeof localStorage/window === 'undefined')
  - `<svge-theme-toggle>` Material `<mat-icon-button>` com ícone do tema CHOSEN (light_mode/dark_mode/brightness_auto) — tooltip mostra current + hint do próximo. Click chama `cycle()`
  - +8 testes (defaults+setTheme 4, resolved+DOM 2, persistence boot 2) → **632 passing**

## Fase 5 — IO + extensibilidade ✅ (entregue, 708 testes)

> **2026-05-20 — Alinhamento estrutural (D-026)**: `Importer`/`Exporter`/`Optimizer` (registries + tipos + built-ins) movidos de `@mosaicoo/svg-engine/edit` para entry points dedicados `@mosaicoo/svg-engine/io` e `@mosaicoo/svg-engine/optimize`. Plugin wrappers (`builtinIoPlugin`, `pngExporterPlugin`, `builtinOptimizersPlugin`) ficam em `/edit` porque dependem do scaffolding `EditorPlugin`. Backward-compat preservada via re-exports em `/edit/lib/io` e `/edit/lib/optimize`. Build + 948 specs + playground compilam sem ajuste.

> **2026-05-20 — Consolidação de helpers (D-036)**: `screenToDoc` (5 cópias → 1 em `@mosaicoo/svg-engine/render/lib/util`), `capturePointer`/`releasePointer` (7 cópias inline → 1 em `@mosaicoo/svg-engine/edit/lib/pointer`), `isEditableTarget` (2 cópias → 1 canonical em `/edit/lib/pointer`, re-importada por `ShortcutService`). 8 arquivos da library + 1 do playground migrados. **973/973 specs** (+25 novos), 6 entry points clean.

> **2026-05-20 — Shell-refinement (D-034 + D-035 + D-037) ✅**: `<svge-toolbar>` integrado ao `<svge-editor>` (lê `MenuContributionRegistry` automaticamente). Novo `<svge-status-bar>` lendo 8 services com 7 sections opt-in. `<svge-editor>` ganhou inputs `[showToolbar]`/`[showStatusBar]` + slots de projeção, garantindo 3 modos de consumo (D-037 — invariantes Mosaicoo): headless puro / shell completo / shell parcial. Playground ganhou rota `/shell-partial-demo`. **993/993 specs** (+15 novos), 6 entry points clean.

> **2026-05-20 — Sprint Pro-Editor (D-038) ✅**: editor profissional drop-in em 4 phases incrementais. **Phase 1** `<svge-menu-bar>` (Material dropdowns lendo slots `menu.*`, submenus via `parentId`, dividers). **Phase 2** `<svge-context-menu>` + `[svgeContextMenu]` diretiva (CDK Overlay, slots `context.*`). **Phase 3** `<svge-tool-options>` + `Tool.optionsComponent` (NgComponentOutlet) + Stamp Tool demo. **Phase 4** `<svge-shell-pro>` composição final grid (menu / toolbar / tool-options / [tools palette | canvas | layers+inspector] / status) + `<svge-tools-palette>` auxiliar. Nova rota `/shell-pro-demo`. **1016/1016 specs** (+23 dos novos componentes), invariantes D-037 preservadas (modos 1-4 inalterados por padrão). `<svge-editor>` ganhou 4 flags opt-in (`showMenuBar`/`showContextMenu`/`showToolOptions` + slot configs) que defaultam false. `<svge-shell-pro>` coexiste — não substitui.

> **2026-05-20 — D-039 Shell interactions full kit ✅**: `[svgeShellInteractions]` expandido (110→330 linhas) cobrindo drag-move + snap, marquee, multi-select Shift/Ctrl, dblclick→isolation, ShortcutService auto-start, Escape hierarchy. Migrou ~120 linhas do `playground-home` para a diretiva. svge-editor e svge-shell-pro herdam automaticamente.

> **2026-05-20 — D-040 Shell interactions polish ✅**: 2 entregas independentes. (1) `[svgeContextMenuResolver]` function input no `[svgeContextMenu]` — right-click em shape → `context.node`, no fundo → `context.canvas`. (2) `builtinEditorShortcutsPlugin` opt-in registrando Ctrl+Z/Y/Shift+Z/G/Shift+G/A no ShortcutRegistry. Playground instala por padrão.

> **2026-05-20 — D-031 Release tooling ✅**: `standard-version` (9.5.0) wired ao workspace gerando bump + CHANGELOG + tag a partir de Conventional Commits. `.versionrc.json` aponta `projects/svg-engine/package.json` como única fonte de versão (root permanece `private: true / 0.0.0`). Scripts npm: `release`, `release:dry`, `release:patch|minor|major`, `release:first`. Workflow `.github/workflows/release.yml` (trigger `push tag v*`) executa lint + test + build + `npm pack` (artifact upload sempre) + `npm publish --access public --provenance` condicional ao secret `NPM_TOKEN`. Sem o secret o workflow termina pacificamente — "ready when you add token". Registry-url default `npmjs.org` (a escolha definitiva pertence a D-025?, pendente).

- [x] **Bloco 5-IO**: Import + Export SVG (categorias 4 e 5 do D-023)
  - Tipos `Importer` (id/name/mediaTypes/extensions/import) e `Exporter` (id/name/mediaType/extension/export). `ImportResult = { ok:true, document, warnings } | { ok:false, error }` (warnings não-fatais para sanitização)
  - `ImporterRegistry` + `ExporterRegistry` signal-backed seguindo a forma das outras: register retorna Disposable, lookup helpers `byExtension`/`byMediaType` (extensão case-insensitive, tolera leading dot)
  - `svgImporter` (built-in): parser via DOMParser, suporta rect/ellipse/circle (folded como ellipse rx=ry)/line/polygon/polyline/path/text/image/g recursivo. Sanitização: drop `<script>`, strip `on*` handlers, block `javascript:` hrefs em `<image>`. ONE warning per unsupported tag (não per occurrence). XXE estruturalmente impossível via `parseFromString('image/svg+xml')`. Parse de transform via parser existente; parse de style via attrs + inline CSS (CSS sobrescreve)
  - `svgExporter` (built-in): saída byte-stable / deterministic — atributos em ordem canônica, números via `Math.round(n * 1e6) / 1e6` (6 decimais, trailing zeros strip), identity transforms OMITIDOS (default implícito), translate-only emitido compacto `translate(x,y)` em vez de matrix completa. Style emitido como presentation attrs (não inline CSS), em ordem alfabética
  - `builtinIoPlugin` registra ambos via ctx.track. Provisionado em `app.config.ts` do playground
  - Round-trip parse→export→parse preserva estrutura
- [x] **Bloco 5-Optimize**: `OptimizerRegistry` + pipeline encadeável
  - Tipo `Optimizer` (id/name/description?/order?/defaultEnabled?/optimize)
  - `OptimizerRegistry` signal-backed. `runPipeline(doc, enabledIds?)` ordena por `order` (lower runs first, stable sort em ties), filtra por enabledIds OU `defaultEnabled !== false`, encadeia, retorna mesma ref quando nenhum pass mudou
  - **3 builtin passes conservadores** (nunca alteram render visual):
    - `precisionOptimizer` (order 10): arredonda numerics para 3 decimais. Cobre geometria, transform components, path `d` tokens via regex, style strokeWidth/opacity/fillOpacity/strokeOpacity
    - `dropDefaultsOptimizer` (order 50): strip `fillOpacity=1`, `strokeOpacity=1`, `opacity=1`, `visibility='visible'`. NÃO strip `fill='black'` ou similar (mudaria render via CSS inheritance)
    - `pruneEmptyGroupsOptimizer` (order 90): remove `<g></g>` recursivamente (cadeia de groups encadeados também). Root document preservado mesmo se vazio
  - `builtinOptimizersPlugin` registra os 3. Provisionado no playground
  - Playground ganha 3 botões no toolbar "IO": **Import…** (file picker `.svg`), **Export** (download `.svg`), **Optimize** (run pipeline)
  - +38 testes (IO 16 + Optimize 22) → **708 passing** em 52 arquivos

## Fase 6 — Performance e refinamento

- [x] **Bloco 6a — Perf baseline harness** ✅ (rota `/perf` no playground)
  - Synthetic doc generator (Mulberry32, mix 50/30/20 rect/ellipse/path, presets 10-5k)
  - FpsMeter cliente (rAF ring-buffer, ~4Hz tick callback)
  - 4 benchmarks instrumentados: Pan/Zoom 3s, Reset→paint, Export+Import, Optimize
  - File picker para SVG real (Illustrator/Inkscape) com parse-only timing + warnings
- [x] **Bloco 6b-1 — Audit + dispatcher cleanup** ✅
  - 17/17 componentes confirmados em OnPush; 14/14 @for com track estável
  - SvgeNodeRenderer: 8 computed type-narrowed removidos via `$any()` template cast (~62k wrappers a menos em mem @ 7.8k nodes)
- [x] **Bloco 6b-2 — Viewport culling opt-in** ✅
  - `getNodeBBox(node, parentTransform?)` puro em core/geometry (9 tipos, over-est seguro)
  - `intersectsBBox` em core/types
  - `ViewportCullingService` (edit) — DFS recursivo + early-termination + WeakMap cache
  - `[svgeViewportCulling]` diretiva opt-in com rAF batching + single-pass DOM walk
  - Toggle no /perf p/ comparar A/B no mesmo doc
- [x] **Meta `60fps@1k+` atingida com folga** ✅: 1k=161 FPS (2.7×), 2k=114 FPS (1.9×), 5k=41 FPS
  - Docs reais Illustrator 7-16k ficam em 14-22 FPS (fora do escopo do roadmap; limite arquitetural de paint cost no browser)
- [x] **Bloco 6-PathEditor — Path/Anchor Point editor + Pathfinder boolean ops** ✅
  - **Core (69e18c4)**: `path-anchors.ts` parser/serializer round-trip (M/L/H/V/C/S/Q/T/Z + Q/T→C exato); tipos `AnchorPoint`/`AnchorSubpath`/`AnchorKind` (cusp/smooth/symmetric); `classifyAnchorKind` heurística via cross product + length compare. 4 commands: `MoveAnchorCommand` (com enforcement de constraint na opposite handle para smooth/symmetric), `InsertAnchorCommand` (de Casteljau subdivision, geometria preservada exatamente), `RemoveAnchorCommand`, `ConvertAnchorTypeCommand`. `ConvertNodeToPathCommand` para rect/ellipse/line/polygon/polyline (ellipse via 4 cubic beziers com kappa=0.5522847)
  - **UI (4508ef4)**: `<svg:g svgeAnchorOverlay>` standalone OnPush; render-gating por tool (Direct Select) + single-selection path; preview-then-commit no drag; Alt+click no segmento dispara `InsertAnchorCommand(0.5)`; dblclick cicla `cusp → smooth (assimétrico) → symmetric → cusp (handles colapsam)` — cada step produz mudança visível; `AnchorSelectionService` permite multi-anchor selection; `compose-ancestor-matrix.ts` garante anchors seguem o transform do grupo pai (modelo-based, evita layout flush)
  - **Pathfinder (4508ef4)**: motor `polygon-clipping` (Martinez algorithm, 24KB gzipped, escolhido vs paper.js por footprint + dep-free); 5 commands `UnionCommand`/`IntersectCommand`/`SubtractCommand`/`ExcludeCommand`/`DivideCommand` partilhando pipeline abstrato (flatten via `path-flatten.ts` tolerance 0.5px → applyTransform → polygon-clipping → ringsToPathD). Divide retorna N regions tipadas `PathfinderRegion { rings, styleSourceIdx? }` — regiões "privadas" herdam style do input originador, slivers de intersection fallback para operand A (convenção top-of-stack Illustrator)
  - **Polish (b825454 + bugfixes)**: 4 melhorias UX (cycle kind, Alt+insert, Delete prioriza anchors, Divide style per region); 3 bugfixes encadeados (parser classifyKind, synthesizeHandles assimétrico, enforceKind cusp colapsa, AnchorOverlay ancestor matrix)
  - **Limitação documentada**: o `d` string não persiste `kind` como metadata; sempre será inferido da geometria. Cycle preso em symmetric requer arrastar handle para escapar — entrada nova em [04 — Decisões técnicas]
  - **Total**: +30 specs novos → **884 passing** em 65 arquivos
- [x] **Bloco 6c — Acessibilidade + Docs** ✅
  - [x] **6c-1**: Suporte a `<defs>` e `<clipPath>` no svgImporter — `SvgDocument.defs?: string` opaque fragment + sanitização (script/on\*/javascript:); exporter round-trip verbatim; renderer injeta via `insertAdjacentHTML`. Resolve warnings vistos em Paranagua/Gransol
  - [x] **6c-2**: Audit ARIA + navegação por teclado nos overlays e panels (Layers/Inspector/Color Picker)
  - [x] **6c-3**: README + `docs/09-api-publica.md` preenchidos (cobrindo core/render/io/optimize/edit/ui APIs)
  - [x] **6c-4**: Guia "como escrever um plugin" (`docs/10-guia-plugin.md`) referenciando D-020/D-023 — atualizado em 2026-05-29 para refletir 10 categorias (incluindo NLU intents, D-046)
- [x] **Bloco 6d — EffectRegistry** ✅ (D-047 — entregue em 2026-05-23)
  - 15 builtin effects single-filter (drop-shadow, blur, glow, inner-shadow, brightness, contrast, saturate, hue-rotate, grayscale, sepia, invert, opacity, blend-overlay, blend-multiply, color-matrix) + 4 chained presets
  - `EffectRegistry` em `edit/effect/effect-registry.service.ts` + `builtinEffectsPlugin` + `ChainFilterRegistry` (scoped via D-042)
  - UI `<svge-effects-panel>` com pipeline editor (drag-drop reorder, enable toggle, parameter inputs)
- [ ] **Bloco 6e — ScriptRuntimePlugin** (D-024) — não iniciado
- [ ] **Débitos reconhecidos**:
  - LayersPanel virtualization (CDK virtual-scroll requer ResizeObserver — jsdom mock pendente; refactor de specs para component-instance testing)
  - Margem de stroke-width na bbox de culling (caso ainda não-observado)
  - Web Worker para parser (descartado por dado — 99ms@16k é aceitável)
  - ~~**Workspace Settings — page config não aplica no canvas**~~ ✅ **resolvido** em 2026-05-18 via `<svge-page-overlay>` (opção b — page como overlay/marca). Mudar width/height/orientation no dialog reflete imediatamente como rectângulo dentro do canvas. Margens > 0 desenham inset dashed (safe-area). Auto-incluído no `<svge-editor>` shell; opt-in via attribute selector pra consumers que compõem primitives direto. +7 specs
- [ ] **Polish de tema light/dark** (parking lot — coletar conforme aparecer):
  - Combobox / `<select>` nativo: background em dark mode (cor padrão do browser não harmoniza com a paleta Material)
  - Outros controles que vamos descobrir ao usar a app em ambos os temas
  - Idealmente migrar `<select>` da toolbar para Material `<mat-select>`

## Sprint pós-D-046 — Produto profissional (2026-05-21 a 2026-05-29) ✅

> **Contexto**: depois da Fase 6c/6d e da Fase 8.1 (NLU rule-based), o
> projeto entrou num sprint intensivo de ~9 dias para atingir paridade
> de feature com Illustrator/Affinity em superfícies profissionais.
> Resultado: ~35 decisões D-XXX (D-047 até D-080) implementadas, ~700
> specs novas (1138 → 1825), 2 entry points novos (`ai/nlu` e `ai/nlu-ui`,
> totalizando 8 secondary). **Roadmap original (Fases 7-8) preservado
> abaixo como tracks paralelos opcionais**.
>
> Sprint registrado retroativamente em 2026-05-29 após auditoria Round 3
> (`docs/11-auditoria-pendencias.md`). Cada D-XXX abaixo tem detalhamento
> em `docs/08-historico-de-alteracoes.md` e (pendente) em
> `docs/04-decisoes-tecnicas.md`.

### Bloco Pro-A — Libraries & Composição

- [x] **D-047 — Effects ecosystem** (commit `d3900d9`): documentado no Bloco 6d acima
- [x] **D-048 — Libraries ecosystem** (commit `6609b65`): foundation `LibraryItem`/`LibraryRegistry` genérico + 8 libraries concretas:
  - Shape Library (12 builtin shapes) + panel
  - Palette Library (5 builtin paletas, integrada com `PaletteRegistry` D-023)
  - Graphic Styles Library (6 presets, apply-1-click)
  - Gradient Library (`GradientRegistry` + builtin + render + editor)
  - Pattern Library (5 builtin patterns + defs injection)
  - Template Library (4 builtin documents)
  - Asset Manager (scoped) + Symbol (stubs) + Brush (stubs)
  - UI `<svge-libraries-panel>` em 6 tabs + scope provider + `builtinLibrariesPlugin`
- [x] **D-049 — Composição/Recorte** (commit `3a20768`): `clipPath`/`mask`/`blend modes` no modelo + render + export
- [x] **D-050 — Tools faltantes** (commit `3a20768`): Eyedropper / Knife / Smooth / Gradient / Width — registrados em `extraToolsPlugin`
- [x] **D-051 — Tema/UX polish** (commit `3a20768`): migração de `<select>` nativo → Material `<mat-select>`
- [x] **D-052 — Menu Insert/Inserir** (commit `4e61583`): submenu de shapes padrão Figma/PowerPoint

### Bloco Pro-B — Edição avançada (D-053 a D-058)

- [x] **D-053 — Variable Fonts + OpenType + Text on Path** (commit `9f312a1`): TextNode estendido com 3 campos novos (fontVariationSettings, fontFeatureSettings, textPathRef/Offset)
- [x] **D-054 — Compound Paths explícitos** (commit `9f312a1`): `MakeCompoundPathCommand` + `ReleaseCompoundPathCommand` em core
- [x] **D-055 — Live Corners** (commit `9f312a1`): `cornerRadius` opcional em `PathNode` + `roundPathCorners` helper em geometry
- [x] **D-056 — Boolean Live (non-destructive)** (commit `9f312a1`): 3 commands `Make/Refresh/Release LiveBooleanCommand` — foundation
- [x] **D-057 — Auto-trace** (commit `9f312a1`): documentado como deferido (depois implementado em D-062d via marching squares)
- [x] **D-058 — Gradient inline editor** (commit `b4fdfee`): panel no Inspector + overlay no canvas com handles arrastáveis

### Bloco Pro-C — Symbol + Brush + Panels (D-059 a D-066)

- [x] **D-059 — Symbol Library master/instance** (commit `b699105`): `SymbolUseNode` no union `SvgNode` + render + exporter + `ActiveSymbolsService`
- [x] **D-060 — Brush Library** (commit `b699105`): Pencil tool consumption + path expansion algorithm + `builtinBrushesPlugin`
- [x] **D-061 — Panel-group base** (commit `70d61b1`): `<svge-panel-group>` reutilizável (4-side tab placement com user picker + persistence, atualizado em `392c362`)
- [x] **D-062 (a-d) + D-062-fix — Tools reais** (commits `e9cec42`, `1d84897`, `9924c19`): Symbol Sprayer (a), Width Tool (b), Mesh aproximada (c — depois REMOVIDA em fix), Auto-trace (d). Mesh tool **removida** após validação UX. Vestígio `MESH_TOOL_ID` removido em 2026-05-29 (commit `d450689`, audit item #9 closed)
- [x] **D-063 — Symbol Sprayer live preview** (commit `9924c19`): `SymbolSprayerPreviewService` + `SymbolSprayerOverlay` projetado em todos os shells
- [x] **D-064 — Centralizar Undo/Redo/Zoom** (commit `e1efd52`): Zoom no `toolbar.main` slot, botões hardcoded removidos de `<svge-editor>` e `custom-editor`
- [x] **D-065 — Align/Distribute/Pathfinder submenus** (commits `3a6ff89`, `3178b0a`): 6 align axes + 2 distribute + 5 pathfinder ops, todas no Menu Object
- [x] **D-066 — Auto-trace polish** (commit `185babf`): `TraceProgressService` scoped + `<svge-trace-image-dialog>` + menu+shortcut UI plugin + Status bar Tracing pill

### Bloco Pro-D — Inspector polish (D-068 a D-074)

- [x] **D-068 — Inspector Type section** (commit `84e9e9d`): seção Type completa no Inspector + fix renderer/exporter para emitir `id` em paths referenciados por `<textPath>`
- [x] **D-069 — Typography controls** (commit `52e42db`): 7 controles novos (fontStyle, textDecoration, lineHeight, letterSpacing, ...) + 3 campos novos em `TextNode`
- [x] **D-070 — Find & Replace** (commits `a3e3f8f`, `1b73cc3`): `FindReplaceService` (edit) + `SetPropertyOnManyCommand` + `<svge-find-replace-dialog>` + menu Edit + Ctrl+H
- [x] **D-071 — Batch operations + Select Same** (commits `9177797`, `68b57db`): `SelectSameService` + comando + menu; batch Convert to Path no Inspector; batch Lock/Hide no Layers Panel
- [x] **D-072 — Logical Layers** (commits `5953521`, `ecb469b`): `isLayer` helper + `MakeLayerCommand`/`UnmakeLayerCommand`/`CreateLayerCommand` em core + UI distinction + drag/drop validation (layers só top-level) + persistence híbrida via `<title>` em IO (D-072g-v2)
- [x] **D-073 — History Snapshots** (commits `a46a0e0`, `e7dc789`): `SnapshotsService` (core, scope-only) + `RestoreSnapshotCommand` undoable + marker `Command.isDestructive` + auto-snapshot no `CommandBus` + scope provider + `<svge-snapshots-panel>` + menu/shortcuts (Ctrl+Shift+S Take, Ctrl+Alt+Z Restore Last) + `SnapshotsPersistenceService`
- [x] **D-074 — Smart Objects** (commit `072ff22`): helpers + 4 commands (`Make/Edit/Replace/Rasterize SmartObjectContents`) + IO round-trip via `data-svge-kind=smart-object` + Object ▸ Smart Object submenu + ícone distinto no Layers Panel + `<svge-smart-object-editor-dialog>`

### Bloco Pro-E — Export + Panels finais + Tool Options (D-076 a D-078, TOOL-OPT)

- [x] **D-076 — Inspector Smart Object section** (commit `a47d28c`): icon + name + child count + actions (Edit Contents, Rasterize)
- [x] **D-077 — Asset Export panel** (commit `a47d28c`): `ExportSlot` interface + `AssetExportRegistry` + `<svge-asset-export-panel>` (list + add + export-all) + scope provider; persistência adicionada em 2026-05-29 (round 2 autonomous: `AssetExportPersistenceService` espelhando D-073 — audit item #1 fechado)
- [x] **D-078 — Properties Panel em tabs** (commit `8cba0b4`): refactor Inspector pra `<svge-panel-group>` com tabs + `FlipNodeCommand` no core + Tab Transform (Flip H/V) + Tab Align (6 align + 2 distribute) + Tab Arrange (z-index, group/ungroup, lock/visibility)
- [x] **TOOL-OPT Fases A/B/C/D** (commits `c0866e8`, `aa0cbf7`, `95a08e0`, `2153e06`): `ToolOptionsRegistry` em UI + 14 components especializados por tool + `provideSvgeBuiltinToolOptions()` helper wireado no playground
- [x] **KNIFE-FIX** (sem D-XXX): Knife tool de stub para real — auto-convert source → path + split + feedback + tolerance wired

### Bloco Pro-F — Pages / Artboards (D-079 e D-080)

- [x] **D-079 — Pages / Artboards** (5 commits PAGES-A→E):
  - PAGES-A: core helpers (`isPage`, `getPageViewBox`, `getPageName`, `withPageFlag`) + 4 commands (`Create/Delete/Rename/Resize PageCommand`)
  - PAGES-B: `ActivePageService` + `PagesService` + renderer page-filter
  - PAGES-C: `<svge-pages-panel>` UI (tabs + add/delete/rename/reorder) + wire shell-pro
  - PAGES-D: IO (export per-page + import multi-page) + Inspector page section
  - PAGES-E: doc-catchup + D-079 decisão técnica
  - Follow-ups: PAGES-FIX (UI sempre visível pra criar primeira page) + PAGES-FIX-2 (auto-bootstrap Page 1 + tools desenham na página ativa + default Select tool)
- [x] **D-080 — PAGES-REFACTOR (Fases 1-9)** (9 commits):
  - Fase 1: CommandBus interceptor + `AUTO_PARENT` constant + `InsertParentResolver` interface
  - Fase 2: `<svge-page-selection-overlay>` com brackets em L
  - Fase 3: fusão `WorkspaceService` → `ActivePage` (single source of truth para PageOptions)
  - Fase 4: hit-target persistente no `PageOverlay` (fim do flicker)
  - Fase 5: paridade `<svge-editor>` ↔ `<svge-shell-pro>`
  - Fase 6: resize visual via brackets + move via handle (`MovePageCommand` novo) + `PageDragService`
  - Fase 7: persistência `activePageId` via localStorage + auto-snapshot pré-Delete + selection clear no page switch
  - Fase 8: Inspector Page tab estendido (background / margins / format / orientation — `SetPageOptionsCommand`)
  - Fase 9: cleanup + doc-catchup (D-080 + atualização de 04/06/08/09)
- [x] **PAGES Follow-ups** (commits posteriores):
  - Page tool (Illustrator Artboard Tool pattern) — page chrome só ativa quando Page tool selecionada (`pageToolPlugin`)
  - Page tool drag preview — paper rect segue cursor + ESC cancela
  - Mid-edge brackets nos 4 lados (top/bottom/left/right) com cursor `ns-resize`/`ew-resize` (commit `3b5dc33`, sessão 2026-05-29)

### Bloco Pro-G — Consumer apps & polish final

- [x] **svg-studio app standalone** (commits `2b1496d`, `1fd6a10`, `27e93d1`): novo Angular app em `projects/svg-studio/`, full-bleed `<svge-shell-pro>`, set de plugins espelhado do playground **menos demos pedagógicos** (sem `stampToolPlugin`). É o **deliverable de produto** vs playground (showcase/sandbox). Provê `provideSvgEngineEditorScope()` por rota (D-042).
- [x] **Régua — selection-band feedback** (commit `72ddc34`): faixa translúcida nos rulers X/Y projetando bbox da seleção. Acompanha drag/resize/zoom/pan em tempo real
- [x] **Audit rounds 1+2+3** (commits `622b96a`, `b152f49`, `2687588`, `42f8334`, `7b254b5`, `8cd8408`): metodologia de auditoria persistente (`docs/11-auditoria-pendencias.md`) — 22 itens catalogados com evidência `file:line`. Protocolo "auditar antes de agir" estabelecido como regra absoluta pelo proprietário em 2026-05-29

**Validação final do sprint**: 1825 specs passando / 1 skipped (FUTURE-FIX NLU intencional, documentado). 9 entry points buildando clean. Lint clean nos 3 projetos (svg-engine, playground, svg-studio).

---

## Fase 7 — Backend .NET (condicional)

- Só inicia se surgir necessidade real (ver `07-backend-dotnet.md`).

## Fase 8 — NLU / SLM para comandos por linguagem natural (D-046? — condicional)

> Pendente — apenas registrada. Veja [04 — Decisões técnicas › D-046?] para
> rationale, encaixe arquitetural, restrições e trade-offs. Reabrir só
> quando houver demanda explícita ou push de acessibilidade.

- [x] **Fase 8.1 — Rule-based NLU** ✅ (sem ML, < 50 KB)
  - Entry points separados agrupados sob `ai/`: `@mosaicoo/svg-engine/ai/nlu` (headless) + `@mosaicoo/svg-engine/ai/nlu-ui` (Material + Web Speech). Toda camada AI desacoplada — Modo 1 headless puro não importa NLU. Fase 8.2 (`ai/nlu-ml`) e 8.3 (`ai/nlu-slm`) entrarão no mesmo agrupamento.
  - `NaturalLanguageService.parse(text, ctx)` com regex + dicionário PT/EN + fuzzy match (Levenshtein)
  - Auto-descoberta de intents do `MenuContributionRegistry` (todo menu item vira candidato; `label` como exemplo)
  - `registerIntent(...)` para plugins adicionarem intents customizados
  - Confirmation gate configurável para ações destrutivas (delete, clear)
  - `builtinNluPlugin` opt-in: auto-discovery + intents customizados `create-shape` / `set-fill` (slot extraction completa)
  - Cobertura validada: "undo", "select all", "delete", "criar retângulo vermelho 100x50", "create a blue circle"
  - +89 specs (tokenize/levenshtein/fuzzy/slot-extractor/service/discovery/plugin) → **1138 passing** em 88 arquivos
- [ ] **Fase 8.2 — Intent classifier ML leve** (30–50 MB, lazy-load)
  - Entry point `@mosaicoo/svg-engine/ai/nlu-ml`
  - Distilled BERT / MiniLM via **Transformers.js** (ONNX no browser, sem WebGPU obrigatório)
  - Confidence score → fallback para Fase 1 se baixa
  - Resolve ambiguidades semânticas ("torna isso maior", "alinha à esquerda")
  - Multilíngue (XLM-R / Multilingual MiniLM)
- [ ] **Fase 8.3 — SLM com function-calling** (500 MB – 2 GB, lazy-load, WebGPU)
  - Entry point `@mosaicoo/svg-engine/ai/nlu-slm`
  - Llama-3.2-1B ou Gemma 2B via **WebLLM** (WebGPU obrigatório; fallback para Fase 2 se ausente)
  - Comandos compostos ("duplica 3 vezes e alinha em grid 2x2")
  - Function-calling style: o SLM emite JSON `{intent, slots}`, código clássico executa
  - Cache do modelo via OPFS / IndexedDB (cold start só na 1ª vez)
- [ ] **Surfaces UI (entry separado `@mosaicoo/svg-engine/nlu-ui`)**
  - Command palette (Ctrl+K) com input texto + autocomplete
  - Voice input via Web Speech API (gratuito, browser-native)
  - Chat sidebar opcional (modo conversacional, útil pra 8.3)

**Princípios de execução**:

- As 3 fases **compõem em cascata**: 8.1 sempre roda primeiro; cai para 8.2 se confidence baixa; cai para 8.3 se 8.2 também falhou.
- Consumer paga só o tamanho que escolher ativar (D-017 headless puro continua sem dependência).
- **Privacy-first**: tudo local, zero servidor — diferencial vs Copilot/Cursor.
- **Sempre Fase 8.1 antes** — prova o contrato `NaturalLanguageService`; 8.2 e 8.3 só reaproveitam a API.

---

## Fase 9 — Animation Timeline (D-082 — ✅ MVP implementado, F0–F8)

Timeline de animação **não-destrutiva** ("camada acima": o documento base
nunca é mutado; o `playhead` é um signal e a árvore animada é derivada e
alimenta o renderer). Ver **D-082** em `04-decisoes-tecnicas.md` para a
decisão completa, invariantes de não-quebra e o status de implementação.

- [x] **F0** — Contrato headless (`AnimationDoc` + `sampleAnimation` + easing + `AddKeyframe`) + specs-trava — `17eefcb`
- [x] **F1** — Interpolação + `applyAnimationToTree` (identidade em t0; lerp
      número/cor/transform) — `aa1b115`
- [x] **F2** — `AnimationService` + `PlaybackService` escopados + comandos
      undoable (Add/Move/Remove/SetEasing/SetDuration) — `09c714d`
- [x] **F3** — Catálogo de propriedades animáveis por tipo (reusa Inspector) — `745beb5`
- [x] **F4** — `<svge-timeline>` read-only (dock inferior opt-in `[showTimeline]`) — `64d2a6a`
- [x] **F5** — Edição (criar/mover/deletar keyframe, easing, duração, scrub) — `0d3832c`
- [x] **F6** — Preview no canvas (`animatedTree()` → renderer) + transporte
      ao vivo (play/pause/step/loop/speed) — `244ab57`
- [x] **F7** — Persistência via round-trip do exporter/importer SVG
      (`data-svge-animation`); auto-snapshot dispensado (edições rotineiras) — `f23f519`
- [x] **F8** — Doc-catchup + validação final
- [ ] **(Futuro, fora do MVP)** Export animado (SMIL/CSS/Lottie/vídeo),
      path-`d` morph, motion path, curva de easing custom (UI bezier)

**Decisões em aberto fechadas no F0**: v1 = só-preview (export adiado p/ F9+);
persistência no documento (round-trip via metadata/`data-svge-animation`);
props do v1 = geometria + transform + style (path-`d` morph adiado); reuso dos
entry points `core`/`edit`/`ui` (sem novo `@mosaicoo/svg-engine/animate`).

---

## Gerenciamento de plugins (D-083)

Camada de **produto** sobre o motor de plugins (D-020). Decisão e raciocínio
em **D-083** + [`docs/12-gerenciamento-de-plugins.md`](12-gerenciamento-de-plugins.md).
Princípio: a library entrega **mecanismo, não política** (sem login/papéis; o
consumer controla acesso).

- [x] **Fase 1 — Plugin Manager (plugins bundlados)** (2026-06-11): metadata
      aditiva em `EditorPlugin`; `PluginCatalog` + `PluginStateStore`
      (persistência encapsulada) + `PluginManagerService` (enable/disable =
      uninstall+lembrar; `PluginRegistry` intacto); `provideSvgEnginePlugin`
      ciente do catálogo (pula install se desabilitado); `<svge-plugin-manager>`
      (ui) + rota `/plugins` no playground; +28 specs.
- [x] **Fase 2 — Carregamento runtime de origem confiável** (2026-06-11):
      `ExternalPluginManifest` + validator; `PluginLoader` fail-closed
      (allowlist de origens + gate de apiVersion + shape-check) →
      `installExternal`; `providePluginLoader({ trustedOrigins, moduleLoader })`
      opt-in (o `import()` real + SRI ficam no `moduleLoader` do consumer —
      a lib não embute "carregar URL arbitrária"). +18 specs. Sem marketplace.
- [ ] **Fase 3 — Repositório online**: (3a) scripts **sandboxed** sobre o
      `ScriptRuntimePlugin` (D-024 / Bloco 6e) — o canal aberto seguro; (3b)
      marketplace curado de plugins compilados, só sob demanda. Não iniciada.

---

## Princípios de evolução

- Toda fase termina com **documentação atualizada** e build verde.
- Toda mudança estrutural entra em `08-historico-de-alteracoes.md`.
- Nada é "concluído" sem teste mínimo (unitário ou integração).
