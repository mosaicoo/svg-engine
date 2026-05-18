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

- [x] **Bloco 4a**: `svg-engine/ui` entry point + `<svge-editor>` shell
  - Quarto secondary entry point criado (`projects/svg-engine/ui/`); ng-packagr auto-discover; tsconfig paths + lib/spec includes atualizados
  - `@angular/material` + `@angular/cdk` adicionados como peerDeps **opcionais** (consumer só puxa se importar `svg-engine/ui`)
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
  - `<svge-color-palette>` em `svg-engine/ui`: standalone, input `palettes` opcional (fallback `PaletteRegistry.palettes()`) + input `transparentLabel`, output `colorPicked`. Swatches 24×16 com checkerboard, hover scale, focus ring; swatch `transparent` ganha ícone block vermelho (padrão Figma/Affinity)
  - Integração no inspector: palette strip abaixo das color rows; `.active-target` class marca qual field (fill/stroke) recebe o próximo click (default fill, troca por `pointerdown` na row). Padrão de mercado (Photoshop swatches panel)
  - `builtinPalettesPlugin` provisionado em `app.config.ts` do playground
  - +22 testes (8 registry/plugin + 9 UI component + 5 integração inspector) → **550 passing**
- [x] **Bloco 4e**: Toolbar extensível + `MenuContributionRegistry` (categoria 9 parte 1 do D-023)
  - Tipo `MenuContribution` (id/slot/label/icon?/tooltip?/shortcut?/order?/disabled?/visible?/run). Campos `disabled`/`visible` são `Signal<boolean>` — UI re-renderiza automaticamente quando estado muda
  - `MenuContributionRegistry` (signal-backed): `register(contrib)` → `Disposable`. `bySlot(slot)` retorna `Signal<readonly MenuContribution[]>` filtrado por slot + visible + ordenado por `order` (default 100, stable sort em ties). Throw em id vazio/duplicado/slot vazio
  - `<svge-toolbar slot="..."/>` em `svg-engine/ui`: renderiza Material `<mat-icon-button>` por contribuição visível. Icon ou text fallback. Tooltip com shortcut hint. Disabled honra signal do item. Componente standalone, OnPush
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
  - `ThemeService` (em `svg-engine/ui`): tipos `Theme = 'system'|'light'|'dark'` + `ResolvedTheme = 'light'|'dark'`. `setTheme()` persiste em `localStorage` chave `svge.theme`; init lê valor persistido (fallback `'system'` se inválido); `cycle()` light→dark→system→light. `_systemPrefersDark` signal escuta `prefers-color-scheme` (`addEventListener` moderno + `addListener` fallback Safari antigo). `effect()` reflete resolved theme para `<html data-theme="...">` (Material 3 / Tailwind picks up; sem flash-of-unstyled). Safe-fallback p/ SSR (typeof localStorage/window === 'undefined')
  - `<svge-theme-toggle>` Material `<mat-icon-button>` com ícone do tema CHOSEN (light_mode/dark_mode/brightness_auto) — tooltip mostra current + hint do próximo. Click chama `cycle()`
  - +8 testes (defaults+setTheme 4, resolved+DOM 2, persistence boot 2) → **632 passing**

## Fase 5 — IO + extensibilidade ✅ (entregue, 708 testes)

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

- [ ] Virtualização para documentos com muitos elementos
- [ ] Web Worker para parsing/serialização pesada (se necessário)
- [ ] Profiling: 60fps em pan/zoom com 1k+ elementos como meta
- [ ] Acessibilidade (foco, ARIA, navegação por teclado)
- [ ] Documentação de uso da library
- [ ] **Polish de tema light/dark** (parking lot — coletar conforme aparecer):
  - Combobox / `<select>` nativo: background em dark mode (cor padrão do browser não harmoniza com a paleta Material)
  - Outros controles que vamos descobrir ao usar a app em ambos os temas
  - Idealmente migrar `<select>` da toolbar para Material `<mat-select>`

## Fase 7 — Backend .NET (condicional)

- Só inicia se surgir necessidade real (ver `07-backend-dotnet.md`).

---

## Princípios de evolução

- Toda fase termina com **documentação atualizada** e build verde.
- Toda mudança estrutural entra em `08-historico-de-alteracoes.md`.
- Nada é "concluído" sem teste mínimo (unitário ou integração).
