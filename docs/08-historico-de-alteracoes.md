# 08 — Histórico de Alterações

> Registro narrativo das mudanças estruturais do projeto. Mais detalhado
> que `git log`, focado em **decisões e contexto**, não em diffs.
> Convenção: ordem cronológica reversa (mais recente no topo).

---

## 2026-05-15 — Fase 3 Bloco 4b: Snap (grid + objetos)

**O que foi entregue**

Snap durante move-drag, com guides visuais magenta. Configurável em
runtime: enabled toggle, modo (`grid` | `objects` | `both`), gridSize,
threshold em CSS pixels (range visual constante independente de zoom).

**Estrutura nova** (`svg-engine/edit/src/lib/snap/`):

- `resolveSnap(moving, targets, threshold)` puro:
  - Pega 3 features por axis (low/center/high) do moving rect.
  - Para cada target, escolhe a feature mais próxima na mesma axis.
  - Por axis, pick do par (feature, target) com menor distância
    ≤ threshold; ties resolvem por ordem de inserção.
  - Retorna `{delta, guides}` — delta a aplicar para alinhar, ≤ 2 guides
    (1 por axis snapado).
- Geradores puros:
  - `rectsToSnapTargets(rects)`: 6 targets por rect (low/center/high × XY).
  - `gridTargetsNear(moving, gridSize, axis)`: bounded — só emite linhas
    a ±1 grid cell do moving (essencial em docs grandes com grid fino;
    seria 10001 targets em 10000×10000 com grid 1 sem isso).
- `SnapService` (Angular, signals):
  - Config: `enabled`, `mode`, `gridSize`, `thresholdPx` — todos
    expostos como readonly signals + setters validados.
  - `activeGuides` signal + `setActiveGuides`/`clearActiveGuides` —
    consumer empurra os guides após resolver, overlay lê para renderizar.
  - `resolveForMove(moving, staticRects, zoom)`: thin wrapper que monta
    targets conforme `mode` e converte threshold pixel→doc via `1/zoom`.

**Componente novo** (`svg-engine/edit/src/lib/overlay/`):

- `<svg:g svgeSnapGuides>`: lê `SnapService.activeGuides()`, renderiza
  uma `<line>` por guide (vertical p/ axis x, horizontal p/ axis y).
  Span = union(viewport.viewBox, document.viewBox) — guide nunca corta
  na borda visível mesmo se usuário panou pra fora do doc.
- Cores: magenta `#d81b60`. Grid = dashed `2 2`, objects = sólido. CSS
  `vector-effect: non-scaling-stroke`. `pointer-events: none`.

**Wire no playground**:

- Captura `moveStartBBox = getRenderedNodeBBox(...)` no exato momento em
  que o body-drag cruza o threshold (3px) — antes do `startMove`. A
  bbox renderizada DURANTE o gesto é a previewed (já transladada), então
  não dá pra ler durante.
- `applySnappedMove(ds, point)`:
  1. Calcula `proposedBBox = moveStartBBox + delta(startPoint→point)`.
  2. Coleta `staticRects` = todos os filhos do root **exceto** o que
     está em movimento (`collectStaticBBoxes(excludeId)`).
  3. `snap.resolveForMove(proposed, statics, zoom)` retorna `{delta, guides}`.
  4. `transform.updateMove(point + delta)` — gesto preview vai pra posição
     snapada.
  5. `snap.setActiveGuides(guides)` — overlay desenha as linhas.
- `endMove` / `cancelGesture`: `snap.clearActiveGuides()` + reset
  `moveStartBBox = null`.
- Toolbar: checkbox "Enabled" + `<select>` com Grid/Objects/Both.
- Template: novo `<svg:g svgeSnapGuides>` no slot do `<svge-renderer>`
  (depois de selection/pivot/marquee — guides em cima).

**Decisões técnicas**

- Resolver puro, sem signals/DOM. Permite testar isolado e usar fora do
  Angular se necessário.
- `SnapService` NÃO conhece `TransformService` nem `EditorStateService` —
  evita dep circular e mantém o serviço focado em "qual snap acontece
  com este rect contra estes outros rects". O consumer orquestra.
- Threshold sempre em CSS pixels (interface humana) e convertido por zoom
  no momento de uso — Affinity/Figma fazem assim.
- `gridTargetsNear` evita explosão combinatória em docs grandes — emite
  só ~3 linhas por axis em vez de O(docSize/gridSize).
- `collectStaticBBoxes` exclui o nó em movimento (caso contrário ele
  snaparia em si mesmo e travaria o drag).
- Tie-breaker em `resolveSnap` é **ordem de inserção** — em modo `'both'`
  grid vem primeiro, então grid vence empates. Razoável (grid é mais
  "absoluto" que objeto vizinho).

**Cobertura**

- `snap-resolver.spec.ts`: 16 testes (rectsToSnapTargets, gridTargetsNear
  com negativos + edge cases, resolveSnap em todas as combinações de
  axis/feature, threshold ≤ 0, target list vazia, source preserved).
- `snap.service.spec.ts`: 12 testes (config defaults, setters validados,
  activeGuides round-trip, resolveForMove em cada mode, scaling por zoom).
- `snap-guides.component.spec.ts`: 4 testes (renderiza nada sem guides,
  vertical p/ x guide, horizontal p/ y guide, clear reativo).
- **Total**: +32 testes → 262 passing em 24 arquivos. Zero regressão.

**Próximo**: Bloco 4c (alinhamento + distribuição).

---

## 2026-05-15 — Fase 3 Bloco 4a: Marquee selection (drag-to-select)

**O que foi entregue**

Drag-to-select multi-seleção visual via box pontilhado, padrão
Illustrator/Affinity. Clicar no fundo agora abre marquee em vez de
limpar imediatamente — release sem drag preserva o velho comportamento
(clear no `'replace'` mode). Shift-drag soma à seleção corrente sem
perder os pré-existentes.

**Estrutura nova** (`svg-engine/edit/src/lib/marquee/`):

- `MarqueeService` (signals): `start/update/end/cancel`. Estado expõe
  `state` + `isActive` + `rect` (sempre normalizado: w/h ≥ 0). Captura
  defensiva da seleção inicial em modo `'add'` (snapshot via `new Set`).
- `nodesInsideMarquee(rect, candidates, mode)` puro:
  - `'intersect'` (default): qualquer overlap conta — UX rápida
    (Illustrator/Affinity/Figma/Inkscape).
  - `'contain'`: bbox candidato totalmente dentro — modo AutoCAD.
  - Marquee de área zero retorna `[]` (clique não é multi-seleção).
- Helpers exportados: `rectFromPoints`, `rectsIntersect`,
  `rectContainsRect` — preferência por funções puras testáveis sem DOM.

**Componente novo** (`svg-engine/edit/src/lib/overlay/`):

- `<svg:g svgeMarquee>`: visual-only, lê `MarqueeService.rect()`. Sem
  inputs, sem outputs, sem DOM events (`pointer-events: none`). Renderiza
  `<rect>` dashed (rgba blue + stroke-dasharray) com `vector-effect:
non-scaling-stroke`. Pointer-handling fica no consumer — desacoplamento
  D-022.

**Wire no playground**:

- `onCanvasPointerDown` no fundo: começa marquee em vez de `clear()`.
  Shift = `'add'`, sem Shift = `'replace'`. Captura ponteiro.
- `onCanvasPointerMove` com marquee ativo: chama `update` + recomputa
  seleção via `applyMarqueeSelection` (enumera children do root, mede
  bbox via `getRenderedNodeBBox`, alimenta `nodesInsideMarquee`, push em
  `selectMany`). Modo `'add'` faz união com snapshot inicial.
- `onCanvasPointerUp`: encerra marquee. Se zero-area + `'replace'` =
  `selection.clear()` (compatibilidade com clique no fundo).
- Esc cancela marquee se nenhum gesto de transform estiver ativo.
- Template: novo `<svg:g svgeMarquee>` no slot do `<svge-renderer>`.

**Decisões técnicas**

- Service NÃO conhece `SelectionService` — pure state. Razões: testável
  isolado, consumer escolhe quando comitar (futuro: throttle/debounce).
- Hit-test default `'intersect'` (não `'contain'`): match com 100% das
  ferramentas de design relevantes. `'contain'` fica disponível mas
  opt-in (parâmetro do helper).
- `rect` sempre normalizado no signal `computed` — consumer nunca vê
  width/height negativo, mesmo com drag para cima/esquerda.
- Modo `'add'` reconstrói união do snapshot a cada update (não acumula
  delta) — simples e correto: usuário pode mover marquee para fora de um
  alvo e voltar, e a seleção se ajusta sem leftovers.
- Marquee de zero area sempre retorna `[]` no helper — clique não dispara
  multi-seleção; o playground decide se zero-area = clear ou no-op.

**Cobertura**

- `marquee.service.spec.ts`: 9 testes (start/update/end/cancel, modos,
  no-op em estado inválido, normalização de rect, snapshot defensivo).
- `marquee-hit-testing.spec.ts`: 13 testes (intersect/contain, edge
  touching, área-zero, ordem preservada).
- `marquee.component.spec.ts`: 4 testes (render reativo do `<rect>`,
  remoção em `end()`, atualização contínua via signal).
- **Total**: +28 testes → 230 passing em 21 arquivos. Zero regressão.

**Próximo**: Bloco 4b (`SnapService` grid + objetos) e 4c
(alinhamento e distribuição).

---

## 2026-05-15 — Fase 3 Bloco 3: Transform interativo (move/rotate/resize)

**O que foi entregue**

Os handles do overlay agora são **funcionais**: arrastar uma forma a
move, arrastar a rotation handle a gira em torno do pivot atual,
arrastar qualquer dos 8 resize handles a redimensiona com o handle
oposto como âncora. Tudo undoável (1 entrada por gesto).

**Core** (`svg-engine/core/src/lib/commands/`):

- `RotateNodeCommand(nodeId, angleRad, pivot)`: aplica
  `T(pivot) ⋅ R(θ) ⋅ T(-pivot) ⋅ existing`. Captura `previousTransform`
  no execute, restaura no undo. Helper puro `composePivotRotation`
  exportado para previews.
- `ResizeNodeCommand(nodeId, anchor, sx, sy)`: aplica
  `T(anchor) ⋅ S(sx, sy) ⋅ T(-anchor) ⋅ existing`. Anchor = handle
  oposto (Figma/Illustrator-Tool style). Rejeita scale factors não-
  finitos no construtor. Helper puro `composeAnchoredScale` exportado.
- 12 testes Vitest cobrindo math + execute/undo round-trip + edge cases.

**TransformService expandido** (`svg-engine/edit/src/lib/transform/`):

- Signals: `dragState` (discriminated union por kind: move/rotate/
  resize), `isDragging` computed.
- APIs por gesto: `start{Move,Rotate,Resize}`, `update{Move,Rotate,Resize}`,
  `end{Move,Rotate,Resize}`, `cancelGesture`.
- **Padrão revert+commit**: cada `update*` mutua `state.document` para
  preview imediato (sem command bus). `end*` faz revert ao snapshot
  inicial e dispatcha **um único** comando via `CommandBus`. Resultado:
  1 entrada de undo por gesto inteiro.
- Tabela `OPPOSITE_ANCHOR` mapeia handles a anchors (`tl↔br`, `tc↔bc`, etc.).
- `SCALE_AXES_FOR_HANDLE`: corner handles escalam ambos; edge handles
  (TC/BC/ML/MR) constrangem 1 axis.
- 9 testes Vitest cobrindo move/rotate/resize gestures + cancelGesture
  - concurrent gesture rejection.

**SelectionOverlay**:

- Pointer handlers nos 8 resize handles + rotation handle.
- Pointer capture em pointerdown; release em pointerup. Eventos
  durante drag continuam roteados ao handle inicial mesmo se o
  cursor sair.
- `screenToDoc()` via `svg.getScreenCTM().inverse()` + `createSVGPoint`.
- `event.stopPropagation()` previne canvas handler do playground.

**Playground**:

- Body-drag com threshold de **3 CSS px**:
  - Pointer-down sobre nó → arma `potentialDrag` + select se necessário
    - pointer capture.
  - Pointer-move durante potential drag: se delta ≥ 3px → `startMove`
    - `updateMove`. Se já em drag → `updateMove`.
  - Pointer-up: `endMove` (commit ou no-op se delta < threshold).
- **Esc** keydown global → `transform.cancelGesture()` quando `isDragging`.
- Hover handling intacto (só roda quando não há drag ativo).

**Validação**:

- `ng build svg-engine`: OK (4 entry points).
- `ng lint`: OK ambos projetos.
- `ng test svg-engine`: **196 testes verdes em 17 arquivos** (+21 novos).
- `ng build playground`: OK ~1.4MB dev.

**Comportamento esperado no preview**:

1. Selecione uma forma → overlay aparece.
2. **Arraste a forma** (clique no corpo + arraste) → move; ao soltar
   grava (1 undo entry).
3. **Arraste qualquer handle de canto/lado** → redimensiona com handle
   oposto fixo; soltar grava.
4. **Arraste a rotation handle** → gira em torno do pivot atual
   (centro por default; arraste o crosshair antes para mudar);
   soltar grava.
5. **Esc** durante qualquer drag → cancela e restaura sem gravar.
6. **Undo** desfaz o gesto inteiro, não passos intermediários.

**D-022 completo até Fase 3**: pivot Affinity-grade (free-drag, snap-
to-anchors, 9-point picker, persistência per-node) + rotação em torno
do pivot funcional. Pivot **não afeta** scale (D-022b futura).

**Próximo (Bloco 4)**: `<svge-marquee>` (drag-to-select retangular),
`SnapService` (snap durante move/resize), alinhamento/distribuição.

---

## 2026-05-15 — Fase 3 Bloco 2: Selection overlay + Pivot Affinity-grade

**O que foi entregue**

Visualização e interação editorial completa para D-022 Affinity-grade.
Bloco 2 = visual + pivot interativo. Bloco 3 ainda virá com drag de
handles e dispatch de RotateNodeCommand/ResizeNodeCommand.

**Renderer**:

- `SvgeRenderer` ganhou um `<ng-content />` slot **dentro do `<svg>`**
  (depois do `<svg:g svgeNode>` principal). Permite overlays serem
  projetados no mesmo `<svg>`, compartilhando viewBox, coord system e
  namespace SVG. Decisão arquitetural-chave que evita complexidade de
  dois `<svg>` sincronizados via CTM.

**Geometry utils** (`svg-engine/edit/lib/geometry/`):

- `BBoxAnchor` (`'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br'`),
  `BBOX_ANCHORS` ordenado, `anchorPoint`, `allAnchors`,
  `findNearestAnchor` (snap-to-anchors do D-022).
- `findRenderedNode`, `getRenderedNodeBBox`, `getCombinedBBox`
  (DOM-based via `getBBox()` + composição de transforms ancestrais).
- `parseTransformAttr` — parser próprio do atributo `transform`
  SVG-1.1 (matrix/translate/scale/rotate/skewX/skewY) que evita
  dependência de `DOMMatrix` (ausente em jsdom). Usa as helpers de
  matriz de `svg-engine/core`.

**TransformService skeleton** (`svg-engine/edit/lib/transform/`):

- Pivot apenas (Bloco 3 expande com drag/resize/rotate).
- Signals: `customPivots: ReadonlyMap<NodeId, Point>` (em coords
  node-local), `pivotMode` (`'none'|'single'|'multi'`).
- APIs: `resolvePivot/setPivot/setPivotAnchor/resetPivot/`
  `clearAllPivots/syncPivotForSelection`.
- **Persistência per-node** (D-022.persist): pivot custom em coords
  node-local `(0,0)..(1,1)` para sobreviver a transforms posteriores.

**Componentes overlay** (`svg-engine/edit/lib/overlay/`):

- `<svg:g svgeSelectionOverlay>`: bbox + 8 resize handles + rotation
  handle + outline dashed para `hoverId`. Handles pixel-constantes via
  `1/zoom`. Bbox computado via DOM em `afterEveryRender({ read })`.
  Visual only — drag dos handles vem no Bloco 3.
- `<svg:g svgeRotationPivot>` (D-022 Affinity-grade):
  - Crosshair vermelho; preenchido quando custom.
  - **Free-drag** com pointer capture; **snap-to-9-anchors** (≤5px,
    `Alt` = bypass).
  - **Click sem drag** → toggle popover 3×3 anchor picker; clique no
    anchor snap exato.
  - **Esc** durante drag → restaura pivot pré-drag; com popover
    aberto → fecha.
  - **Double-click** → `resetPivot()`.
  - Conversão screen→doc via `svg.getScreenCTM().inverse()`.

**Tests** (Vitest, **175 verdes em 15 arquivos**, +39 novos):

- `bbox-anchors.spec.ts` (8): mapeamento + nearest snap.
- `node-bbox.spec.ts` (9): findRenderedNode, bbox local/com transform,
  união, edge cases.
- `transform.service.spec.ts` (22): pivot default centro, persistência
  per-node sobrevivendo a translate/scale, `setPivotAnchor`,
  `resetPivot`, multi-selection reset on composition change,
  `clearAllPivots`.

**Playground integrado**: `<svg:g svgeSelectionOverlay>` e
`<svg:g svgeRotationPivot>` projetados dentro de `<svge-renderer>`.

**Validação**:

- `ng build svg-engine`: OK (4 entry points).
- `ng lint`: OK ambos projetos.
- `ng test svg-engine`: 175 verdes em 15 arquivos.
- `ng build playground`: OK 1.38MB dev / bundle main 370KB com
  `SelectionOverlay`, `RotationPivot`, `TransformService` confirmados.

**Próximo (Bloco 3)**: TransformService expandido + `RotateNodeCommand`

- `ResizeNodeCommand` para tornar os handles funcionais.

**Lição registrada**: Angular 21 renomeou `afterRender` para
`afterEveryRender` (e `afterRenderEffect` é a forma reativa). O nome
antigo agora exporta apenas `AfterRenderRef`. Atualizei conforme.

---

## 2026-05-15 — D-022 revisada: pivot Affinity-grade

**O que aconteceu**

Pesquisa comparativa solicitada pelo usuário entre Figma, Illustrator,
Affinity Designer e Canva. Resultado:

| Ferramenta            | Movable pivot         | 9-point picker     | Snap    | Persistência   | Scale     |
| --------------------- | --------------------- | ------------------ | ------- | -------------- | --------- |
| Canva                 | ❌                    | ❌                 | ❌      | n/a            | n/a       |
| Figma                 | ⚠️ Alt-drag escondido | ❌                 | ❌      | sessão         | ❌        |
| Illustrator           | ✅ Rotate Tool        | ✅ Transform panel | parcial | reseta         | via panel |
| **Affinity Designer** | ✅ free               | ✅ Anchor 3×3      | ✅      | **per-object** | ✅        |

Usuário decidiu pelo padrão **Affinity-grade** ("desejo a melhor
funcionalidade") em vez do escopo inicial mínimo (que estava no nível
Illustrator-Tool).

**D-022 atualizada com**:

- **Persistência per-node**: `Map<NodeId, Point>` em coordenadas
  node-local; pivot custom restaura ao reselecionar.
- **Snap-to-9-anchors** durante free-drag (Alt = bypass).
- **9-point picker popover** ao clicar no crosshair (sem drag) — UI
  3×3 para snap exato.
- **Numerical input X/Y** mantido para Fase 4 (Inspector).

**Conscientemente NÃO incluído na Fase 3** (registrado como D-022b
futura): pivot afetar scale/resize. Affinity faz isso completo;
adiciona complexidade significativa (todos os 4 handles de scale
precisam considerar pivot). Mantém-se handle oposto como âncora
para scale (Figma / Illustrator-Tool style).

**Multi-selection**: pivot relativo à bbox composta da seleção;
reseta quando a composição muda (não persiste — selection bbox
é transient).

**Componentes afetados** (especs em D-022, implementação Bloco 2 + 3):

- `<svge-rotation-pivot>` ganha popover 3×3 + snap logic
- `TransformService` ganha `Map<NodeId, Point>` + APIs
  `setPivotAnchor`/`resetPivot`/`clearAllPivots`
- `RotateNodeCommand` recebe `pivot` para undo correto

**Docs atualizados**: `04-decisoes-tecnicas` (D-022 expandida +
D-022b pendente), `06-componentes`, `05-roadmap` (Bloco 2 e 3).

---

## 2026-05-15 — Fase 3 Bloco 1: `svg-engine/edit` + SelectionService + hit-testing

**O que foi entregue**

Quarto entry point da library: `svg-engine/edit`. Zero deps de UI Material
(D-017). Bloco 1 implementa as bases para qualquer interação editorial:
saber **o que está selecionado** e **como descobrir o que o usuário clicou**.

- **Entry point**: `projects/svg-engine/edit/` com `ng-package.json`,
  path mapping em `tsconfig.json` (`svg-engine/edit` → `dist/svg-engine/edit`),
  inclusos em `tsconfig.lib.json` e `tsconfig.spec.json`.
- **`SelectionService`** (signal-based, `providedIn: 'root'`):
  - Signals: `selectedIds`, `focusId`, `hoverId` + computeds `count`,
    `hasSelection`, `isSingleSelection`.
  - APIs: `select`, `selectMany`, `addToSelection`, `toggle`, `deselect`,
    `clear`, `isSelected`, `setHover`.
  - Invariantes: `focusId` é sempre membro de `selectedIds` ou `null`.
    `clear()` preserva hover (ortogonal). `select(id)` substitui
    completamente a seleção (single-select padrão).
  - **Estado transient** — não serializa no `SvgDocument`.
- **Hit-testing** (puro, sem Angular DI):
  - `findOwningNodeId(target: Element | null)`: walks `parentElement`
    procurando o `data-node-id` mais próximo. Devolve `null` para clique
    no background.
  - `resolveNodeIdFromEvent(event: Event)`: wrapper que aceita Event;
    `null` para target não-Element.
  - Funciona out-of-the-box porque o dispatcher `<svge-node>` em
    `svg-engine/render` já popula `data-node-id` em cada `<svg:g>`.

**Decisão registrada antes do bloco**

- **D-022 — Pivot de rotação editável**: requisito explícito do usuário
  para a Fase 3. Pivot é estado do editor (no `TransformService` que vem
  no Bloco 3), não do `SvgNode`. Default = centro do bounding box;
  arrastável para qualquer ponto; rotação subsequente acontece em torno
  dele (matriz `T(p) ⋅ R(θ) ⋅ T(-p) ⋅ existente`). Reseta na troca de
  seleção. Esc cancela; double-click reseta. Aplica **apenas** a rotação;
  scale/resize usam handle oposto como âncora (padrão Figma/Illustrator).
  `RotateNodeCommand` (a criar no Bloco 3) recebe `pivot` para undo correto.

**Validação**

- `ng build svg-engine`: **OK** — agora 4 entry points compilam:
  `dist/svg-engine/fesm2022/svg-engine.mjs` (primary),
  `svg-engine-core.mjs`, `svg-engine-render.mjs`, `svg-engine-edit.mjs`.
- `ng lint`: **OK** em ambos projetos.
- `ng test svg-engine`: **136 testes verdes em 12 arquivos** (+24 novos:
  16 do SelectionService cobrindo todas as APIs + invariantes,
  8 do hit-testing cobrindo SVG namespace, walking, edge cases).
- `ng build playground`: **OK** — bundle inclui `SelectionService` (8 matches)
  e `resolveNodeIdFromEvent` (2 matches). Bundle 232KB → 258KB (~26KB
  do edit; tree-shaking confirmado).
- **Playground integrado**: pointer-down no `.canvas` chama
  `resolveNodeIdFromEvent` → `selection.select(id)` ou `selection.clear()`.
  Status bar mostra contagem selecionada + 8 chars iniciais do focus ID.
  Sem visual de overlay ainda (vem no Bloco 2).

**Próximo**: aguardar validação antes de Bloco 2 (`<svge-selection-overlay>`

- `<svge-rotation-pivot>` — handles visuais e marcador de pivot draggable).

---

## 2026-05-15 — Fix: zoom/pan agora aplicam mesmo com input viewBox

**Sintoma reportado**: pan/zoom controls no playground não tinham
efeito visual. Console limpo, sem erro; estado interno do
`ViewportService` mudava (signal `zoom` atualizava), mas o atributo
`viewBox` do `<svg>` renderizado nunca refletia a mudança.

**Causa raiz**: o `SvgeRenderer.viewBoxAttr` priorizava o input
`viewBox` sobre `viewport.viewBox()`:

```typescript
// ANTES (bugado):
const box = explicit ?? this.viewport.viewBox(); // explicit ganha
```

Como o playground passa `[viewBox]="docViewBox"`, o renderer ignorava
qualquer mudança em `viewport.zoom()` ou `viewport.pan()`.

**Fix**: single source of truth = `ViewportService`. O input `viewBox`
torna-se um **seed** para `viewport.contentBox` (via effect que já
existia); o atributo do `<svg>` é **sempre** derivado de
`viewport.viewBox()`, que aplica zoom + pan sobre o contentBox:

```typescript
// DEPOIS:
protected readonly viewBoxAttr = computed(() => {
  const box = this.viewport.viewBox(); // sempre via viewport
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
});
```

Comportamento resultante:

- `zoom = 1`, `pan = 0` (default): `viewBoxAttr` = `contentBox` (=
  input `viewBox`). Sem mudança visível, compatível com o
  comportamento esperado.
- `zoom = 2`: `viewBoxAttr` mostra metade da `contentBox` (centrada),
  conteúdo aparece 2× maior na tela.
- `pan(50, 30)`: `viewBoxAttr` translada o window em 50,30 unidades
  do conteúdo.

**Tests**:

- 2 novos casos no `svge-renderer.component.spec.ts`:
  - "zoom on ViewportService updates the rendered viewBox even when
    input is set"
  - "pan on ViewportService updates the rendered viewBox even when
    input is set"
- Test antigo "uses explicit viewBox when provided" renomeado para
  "uses explicit viewBox as seed (zoom=1, pan=0 → matches input
  exactly)" — semântica mais precisa, asserção idêntica.
- Total: **112 testes verdes em 10 arquivos** (eram 110).

**Docs atualizadas**: `09-api-publica.md` documenta a semântica nova
do input `viewBox` ("seed para viewport.contentBox").

---

## 2026-05-15 — Fix bug visual + refactor renderers para SVG-puro

**Sintoma reportado pelo usuário**: ao adicionar formas via playground,
nada aparecia visualmente apesar dos elementos `<rect>` etc. estarem
corretamente no DOM (com x, y, width, height, fill, stroke aplicados).
Screenshot do DevTools mostrou estrutura `<svge-rect><g><rect/></g></svge-rect>`.

**Causa raiz**: dois problemas em sequência.

1. **Sizing do `<svg>` interno** (commit `1770422`): o `<svg>`
   sem `width`/`height` attrs defaulta para 300×150 px (replaced element
   HTML). CSS no `host` dimensionava o custom element `<svge-renderer>`
   mas não cascateava para o `<svg>` interno. Fix: component styles
   `:host { 100% } svg { 100% }`.
2. **Custom HTML elements dentro de SVG** (este commit): mesmo após o
   sizing, as formas continuavam não renderizando. Razão: as componentes
   `<svge-node>` e `<svge-rect>` etc. são custom HTML elements (Angular
   cria via `document.createElement`, não `createElementNS`). Por
   limitação da spec SVG, o painter **não atravessa elementos não-SVG**
   para renderizar conteúdo embaixo deles. Os `<rect>` etc. estavam
   no DOM mas dentro de wrappers HTML que cortam a cadeia de render.

**Refactor**:

- **8 per-type components → 8 diretivas**: `SvgeRectDirective`,
  `SvgeEllipseDirective`, `SvgeLineDirective`, `SvgePolygonDirective`,
  `SvgePolylineDirective`, `SvgePathDirective`, `SvgeTextDirective`,
  `SvgeImageDirective`. Cada uma com selector attribute (`[svgeRect]`
  etc.) aplicado ao elemento SVG nativo correspondente. Atributos via
  `host: { '[attr.x]': 'node().x', ... }`. Input aliasado ao nome da
  diretiva: `[svgeRect]="rectNode"`.
- **`SvgeNodeRenderer` (dispatcher)**: selector mudou de `svge-node`
  para `g[svgeNode]` (atributo num `<svg:g>`). Host = `<svg:g>` com
  `data-node-id` e `transform`. Template `@switch` cria os elementos
  SVG diretamente (`<svg:rect [svgeRect]="rectNode()" />` etc.). Caso
  `group` itera children com `<svg:g svgeNode [node]="child">` (recursivo).
- **`SvgeRenderer` top-level**: `<svge-node>` no template virou
  `<svg:g svgeNode [node]="tree()"></svg:g>`.
- **8 arquivos `*-renderer.component.ts` deletados**, substituídos por
  `*-renderer.directive.ts`.
- **Tests atualizados** + lint disable inline no selector híbrido.

**DOM resultante** (puro SVG):

```
<svg viewBox="0 0 800 600">
  <g data-node-id="root">
    <g data-node-id="rect-id" transform="...">
      <rect x="..." y="..." width="..." height="..." fill="..." stroke="..." />
    </g>
  </g>
</svg>
```

**Validação**:

- `ng build svg-engine`: OK
- `ng lint`: OK
- `ng test svg-engine`: **110 testes verdes em 10 arquivos** (asserts
  iguais — estrutura final equivalente em jsdom)
- HTTP fetch `/main.js`: `svgeRect`/`svgeNode` (novos) 17/44 matches,
  `svge-rect`/`svge-node` (antigos) **0 matches**.

**Lições**:

- Componentes que renderizam conteúdo SVG devem ter selector compatível
  com SVG (atributo em elemento SVG real ou `svg:tag` no selector).
- Custom HTML elements como wrappers em SVG são **anti-padrão silencioso**:
  o DOM "parece certo" mas o render falha sem erro de console.
- Tests em jsdom validam estrutura DOM mas não chamam o painter SVG real;
  validação visual exige browser real.

---

## 2026-05-14 — Plugin extensibilidade (D-020) + Workspace pendente (D-021)

**O que aconteceu**

Esclarecimento explícito do usuário em 2026-05-14, durante o intervalo
entre Bloco 1 e Bloco 2 da Fase 2:

1. **Plugin/extensão obrigatória**: terceiros devem poder estender a
   library com tipos de nó custom (estrelas, gráficos, etc.), renderers
   custom, ferramentas custom e painéis custom. Toda decisão de design
   subsequente deve prever ponto de extensão.
2. **Workspace / prancheta / página**: conceito acima do `SvgDocument`
   SVG-spec, envolvendo configuração de página (tamanho, orientação),
   background, margens, grid, eventual multi-página. Apenas para
   registro — implementação futura.

**Decisões registradas**

- D-020: sistema de plugins de primeira classe — toda feature subsequente
  expõe registry como ponto de extensão.
- D-021: conceito de Workspace/Página — **PENDENTE**, definir antes da
  Fase 4 (UI). Duas opções a avaliar (estender `SvgDocument` vs novo
  `Workspace`).

**Impacto imediato**

Bloco 2 (renderer) já é desenhado com `NodeRendererRegistry` exposto
desde o primeiro commit, evitando refatoração futura quando o primeiro
plugin chegar.

---

## 2026-05-14 — Fase 2 Bloco 2: `svg-engine/render` entregue

**O que foi entregue**

Novo entry point `svg-engine/render` (zero deps de UI Material — D-017):

- **Top-level**: `<svge-renderer>` standalone com inputs `tree`, `viewBox?`,
  `width?`, `height?`, `ariaLabel?`. Renderiza `<svg>` com `role="img"`
  para acessibilidade.
- **8 renderers per-tipo**: `<svge-rect>`, `<svge-ellipse>`, `<svge-line>`,
  `<svge-polygon>`, `<svge-polyline>`, `<svge-path>`, `<svge-text>`,
  `<svge-image>` — cada um envolto em `<svg:g data-node-id transform>`
  para suportar futura camada de seleção/handles.
- **Dispatcher `<svge-node>`**: `@switch` para os 8 built-ins + `group`
  recursivo inline (evita import circular) + `@default` fallback no
  registry.
- **`ViewportService`**: signals `zoom/panX/panY/contentBox/viewBox`
  com APIs `pan`, `zoomIn/Out`, `multiplyZoom`, `setZoom`, `setPan`,
  `reset`, `fit`, `setZoomLimits`. Clamping automático.
- **`NodeRendererRegistry`** (D-020): API `register/unregister/resolve/registeredTypes`.
  Dispatcher monta plugins via `*ngComponentOutlet`.
- **`renderTransformAttr`**: util que serializa matriz para
  `matrix(a b c d e f)` ou retorna `null` para identidade (omite atributo).
- **`projectDocumentToRenderer`**: helper para extrair `tree`+`viewBox`
  de um `SvgDocument`.

**Validação**

- `ng build svg-engine`: **OK** — 3 entry points (primary + core + render)
  geram FESM separados em `dist/svg-engine/fesm2022/`.
- `ng lint`: **OK** em ambos projetos.
- `ng test svg-engine`: **110 testes verdes em 10 arquivos** (44 novos
  no render: transform-attr 5, registry 5, viewport 17, renderers 12,
  svge-renderer integração 7).
- Playground: substituiu lista de IDs por canvas SVG real com 3 botões
  de Add (rect/ellipse/triangle path), Nudge/Remove/Undo/Redo, controles
  de Zoom in/out/reset, status com node count e zoom %.
- Runtime via `ng serve`: bundle do playground contém `svge-renderer`,
  `svge-rect`, `NodeRendererRegistry` (tree-shaking confirmado).

**Componentização** (cumpre D-016 produto de mercado):

- 1 componente standalone por tipo de nó (focused, OnPush).
- Dispatcher é o único acoplamento entre tipos.
- Plugin extensibility (D-020) embutida desde o primeiro commit.
- Acessibilidade básica: `role="img"` + `aria-label` configurável.

**Próximo**: aguardar validação do usuário antes de Fase 3 (seleção,
transformação, canvas interativo em `svg-engine/edit`).

---

## 2026-05-14 — Fase 2 Bloco 1: `svg-engine/core` entregue

**O que foi entregue**

Library `svg-engine` refatorada para o padrão **secondary-only multi-entry-point**:

- Placeholder do schematic removido (`svg-engine.ts` + spec).
- Primary `svg-engine/src/public-api.ts` reduzido a `SVG_ENGINE_VERSION`
  com docstring explicando o padrão (alinhado a `@angular/material`).
- Tsconfigs ajustados para incluir `core/src/**` (lib + spec).
- `angular.json` com `sourceRoot: "projects/svg-engine"` para
  test discovery encontrar specs em todos os entry points.

Novo entry point `svg-engine/core` (zero deps de UI):

- **Tipos primitivos**: `NodeId` branded, `Transform` (matriz afim
  6-elementos com ops), `Point`, `BoundingBox`, `SvgStyle`, `SvgMetadata`.
- **Modelo**: `SvgNodeBase` + 9 tipos concretos imutáveis (`RectNode`,
  `EllipseNode`, `LineNode`, `PolygonNode`, `PolylineNode`, `PathNode`,
  `TextNode`, `ImageNode`, `GroupNode`) + union discriminated `SvgNode`.
- **Factories**: `createRect`, `createEllipse`, `createLine`,
  `createPolygon`, `createPolyline`, `createPath`, `createText`,
  `createImage`, `createGroup`.
- **Tree ops imutáveis com structural sharing**: `findNodeById`,
  `findParent`, `insertNode`, `removeNode`, `updateNode<T>`, `walk`,
  `collectNodes`, `countNodes`.
- **Document**: `SvgDocument` + `createEmptyDocument`.
- **Command pattern**: `Command` interface + `CommandResult`/`ok`/`fail` +
  4 comandos concretos (`InsertNodeCommand`, `RemoveNodeCommand`,
  `MoveNodeCommand`, `SetPropertyCommand<T, K>`).
- **Services Angular** (signal-based, `providedIn: 'root'`):
  `EditorStateService`, `HistoryService`, `CommandBus`.

**Validação**

- `ng build svg-engine`: **OK** — gera bundles separados:
  - `dist/svg-engine/fesm2022/svg-engine.mjs` (primary, simbólico)
  - `dist/svg-engine/fesm2022/svg-engine-core.mjs` (secondary, real)
- `ng lint`: **OK** em ambos projetos.
- `ng test svg-engine`: **66 testes verdes em 5 arquivos**
  (transform math, tree-ops, 4 comandos com round-trip undo/redo,
  HistoryService stack invariants, CommandBus integration).
- **Dogfooding**: `playground/src/app/app.ts` consome
  `import { CommandBus, createRect, EditorStateService, HistoryService,
InsertNodeCommand, MoveNodeCommand, RemoveNodeCommand } from 'svg-engine/core'`
  e expõe botões para validar a API end-to-end. Build e lint verdes.

**Decisão revisada**

- D-018: **secondary-only sem primary útil** (alinhado a `@angular/material`).
  Após análise do mercado, decidido que libs com camadas funcionais
  distintas não expõem primary entry point — força tree-shaking e enforça
  D-017 (headless boundary) pelo TypeScript.

**Componentização** (cumpre D-016 / produto de mercado):

- Cada conceito em seu próprio arquivo (uma classe/interface/função pública
  por arquivo).
- Barrels (`index.ts`) por subdiretório re-exportam apenas o necessário.
- Imports `type-only` para forward references (sem ciclos em runtime).
- Zero `any`. Tipos branded para identificadores. Discriminated union.

**Próximo**: Bloco 2 — `svg-engine/render` (`<svge-renderer>` read-only +
`ViewportService` pan/zoom).

---

## 2026-05-14 — Reposicionamento: produto de mercado + headless-first

**O que aconteceu**

Esclarecimento explícito do usuário: SVGEngine é tratado como **produto
de mercado**, não MVP. Library deve ser **embutível em sistemas terceiros**
para 3 casos de uso: render, manipulação, otimização — possivelmente
sem qualquer UI Material.

**Decisões registradas**

- D-016: produto de mercado (não MVP) — rigor em componentização e cobertura.
- D-017: **headless-first** — núcleo (`core`/`render`/`io`/`optimize`/`edit`)
  proibido de importar `@angular/material` ou `@angular/cdk`.
- D-018: **multi-entry-point** via `ng-packagr` — library dividida em
  `core`, `render`, `io`, `optimize`, `edit`, `ui`. Tree-shaking real.
- D-019: acessibilidade WCAG 2.2 AA mínimo em qualquer UI.

**Docs afetados**

- `01-visao-geral.md`: positioning + 3 casos de uso + 11 princípios condutores.
- `02-arquitetura.md`: estrutura multi-entry-point + dependências.
- `04-decisoes-tecnicas.md`: D-016 a D-019; pendentes renumeradas.
- `06-componentes-editor-svg.md`: reagrupado por entry point; selectors `svge-*`.
- `05-roadmap.md`: Fase 2 redividida em Bloco 1 (core) e Bloco 2 (render).
- `09-api-publica.md`: **novo doc** para track da surface pública versionada.

**Impacto no código**

Nenhum código foi escrito ainda — esta mudança chega antes de qualquer linha
de produção, evitando refatoração futura. Próximo passo: Bloco 1 da Fase 2
(criar `svg-engine/core` como secondary entry point).

---

## 2026-05-14 — Fase 1: Fechamento (ESLint + Husky + CI)

**O que aconteceu**

- ESLint via `@angular-eslint/schematics@21.4.0` (flat config moderno)
  configurado para os dois projetos (D-013).
- `eslint-config-prettier@10` adicionado como último item do array de
  config para desligar regras formatadoras conflitantes.
- Husky 9 + lint-staged instalados; `.husky/pre-commit` executa
  `npx lint-staged`. Config em `package.json`:
  - `*.{ts,html}` → `eslint --fix` + `prettier --write`
  - `*.{json,md,scss,css,yml,yaml}` → `prettier --write`
- Workflow `.github/workflows/ci.yml` criado (D-015): Node 22, `npm ci`,
  `ng lint`, `ng build svg-engine`, `ng build playground` (dev + prod).
- `prettier --write` aplicado em todo o repo (alinhamento one-shot dos
  arquivos auto-gerados pelo `ng new` e dos docs).
- Referência stale em `03-restricoes.md` corrigida
  (`.claude/settings.local.json` → `.claude/settings.json`).

**Validação**

- `ng lint` (ambos projetos): **OK**
- `prettier --check` (todo repo): **OK** (idempotente)
- `ng build svg-engine`: **OK**
- `ng build playground --configuration=production`: **OK**, 213.54 kB main
  (dentro do budget de 500 kB), 8.05 kB styles.

**Decisões registradas**: D-013 (ESLint), D-014 (Husky+lint-staged), D-015 (CI).

**Fase 1 ✅ encerrada**. Próximo: Fase 2 — núcleo do editor.

---

## 2026-05-14 — Fase 1: Scaffold do workspace Angular v21 (parcial)

**O que aconteceu**

- `ng new SVGEngine --create-application=false --directory=. --skip-git
--commit=false --package-manager=npm --strict --ai-config=claude
--skip-install` executado. Conflito com `.gitignore` resolvido movendo
  o nosso para backup, rodando o schematic, mesclando regras e descartando
  backup.
- Library `svg-engine` gerada (`projects/svg-engine`, prefix `svge`).
- App `playground` gerada (`projects/playground`, prefix `app`, routing,
  style scss).
- Angular Material v21 adicionado ao playground (`--theme=azure-blue
--typography=true --animations=enabled`).
- `color-scheme: light dark` configurado no `body` (D-012 mínimo via OS).
- `.claude/settings.local.json` renomeado para `.claude/settings.json`
  (convenção Claude Code: `settings.json` é compartilhado/commitado;
  `settings.local.json` é override pessoal/gitignored).
- `.gitignore` ajustado para refletir essa convenção.

**Validação**

- Build library (`ng build svg-engine`): **OK** em 9.2s, gerou FESM+DTS.
- Build app dev (`ng build playground --configuration=development`):
  **OK** em 16.4s, 1.31MB main + 8.8kB styles.
- Runtime (`ng serve playground --port 4200`):
  - `GET /` → 200, 815 bytes (index.html com título "Playground").
  - `GET /styles.css` → 200, 8810 bytes, contém `color-scheme: light dark;`.
  - `GET /main.js` → 200, 84066 bytes (bundle Angular).

**Decisões registradas**

- D-007: Vitest como test runner (default v21).
- D-008: file-name-style-guide 2025 (default v21).
- D-009: `--ai-config=claude` ativado.
- D-010: zone.js mantido (revisar Fase 6).
- D-011: SCSS para componentes.
- D-012 (parcial): tema M3 + light/dark via OS preference.

**Pendências para fechar Fase 1**

- ESLint explícito.
- Husky + lint-staged.
- CI mínimo (GitHub Actions).
- Toggle de tema explícito (D-012 segunda parte) — pode ir para Fase 4.

---

## 2026-05-14 — Confirmação da versão Angular (D-006)

- Consultado o npm registry e `angular.dev/reference/releases`.
- Cenário em 2026-05-14: v19 morre em 5 dias, v20 com 6 meses de
  suporte restantes, v21 vira LTS em 5 dias (suporte até 2027-05-19),
  v22 sai em 5 dias.
- **Decisão**: scaffoldar com **Angular v21** imediatamente.
- Roadmap, visão geral e decisões técnicas atualizados.
- Próximo upgrade planejado: Angular v22 quando ecossistema estabilizar
  (provável janela: 2 a 3 meses após release).

---

## 2026-05-14 — Fundação do projeto

**O que aconteceu**

- Projeto SVGEngine iniciado em `C:\Projetos\ClaudeCode\SVGEngine`
  como pasta vazia (greenfield).
- Estabelecidas restrições operacionais do agente Claude Code via
  `.claude/settings.local.json` (deny rules para node_modules, builds,
  secrets, certificados, assets binários e SVGs/3D).
- `.gitignore` criado cobrindo Angular, .NET, secrets e IDE.
- Pasta `docs/` criada com 8 documentos canônicos:
  - `01-visao-geral.md`
  - `02-arquitetura.md`
  - `03-restricoes.md`
  - `04-decisoes-tecnicas.md`
  - `05-roadmap.md`
  - `06-componentes-editor-svg.md`
  - `07-backend-dotnet.md`
  - `08-historico-de-alteracoes.md` (este)

**Decisões registradas**

- D-001: distribuição como **library Angular** + app `playground`.
- D-002: **DOM SVG nativo**, sem `svg.js`/`snap.svg`/`fabric.js`.
- D-003: repositório em `github.com/mosaicoo/svg-engine` (privado).
- D-004: TypeScript estrito.
- D-005: Angular Material como UI lib.

**Pendências imediatas**

- `git init` + commit inicial + push.
- Confirmar versão Angular LTS atual antes do scaffold.
- Aguardar validação dos documentos antes de iniciar Fase 1 do roadmap.
