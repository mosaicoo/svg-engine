# 08 — Histórico de Alterações

> Registro narrativo das mudanças estruturais do projeto. Mais detalhado
> que `git log`, focado em **decisões e contexto**, não em diffs.
> Convenção: ordem cronológica reversa (mais recente no topo).

---

## 2026-05-16 — Fase 4 Bloco 4-IP-FixBugs: 2 bugs reais (resize + picker)

**Contexto**

Usuário reportou que **arrasto das arestas** (handles laterais) e
**controles de cor** estavam com bugs. Auditoria honesta do código
confirmou: dois bugs reais introduzidos/expostos pelos blocos
anteriores (4-Inspector-Polish e 4-IP-Fix).

### Bug 1 — Resize edges quebrado pós-`MoveNodeCommand`

**Sintoma**: depois de mover uma forma (drag para reposicionar), ao
arrastar qualquer handle de aresta a forma "desliza" lateralmente —
o lado oposto da aresta arrastada NÃO permanece fixo.

**Root cause**: `bakeScaleIntoNode(node, sx, sy, anchor)` tratava
`anchor` como se estivesse no MESMO sistema de coordenadas de
`node.x`/`node.y`. Mas:

- `node.x`/`node.y` estão em **coords locais** (pré-transform)
- `anchor` vem do `SelectionOverlay` em **coords de documento**
  (pós-transform — bbox renderizada via `composedAncestorMatrix`)

Quando o nó tem `transform = translate(tx, ty)` (qualquer forma
movida pelo `MoveNodeCommand` cai nesse caso), as coords divergem por
`(tx, ty)`. A bake calculava o intervalo escalado em torno de um
ponto deslocado → lado oposto da aresta arrastada saía do lugar.

Pré-bake-during-drag (4-Inspector-Polish) o bug existia também mas
ficava invisível porque o preview usava scale-transform composition
(que opera em doc coords). Quando o bake passou a rodar a cada frame
do drag, o bug virou um problema visível e severo.

**Fix**: `bakeScaleIntoNode` agora subtrai `(node.transform[4],
node.transform[5])` do `anchor` ANTES de despachar para o helper
per-type. Para o caso recursivo de grupos, passa `localAnchor` (= doc
anchor − group translate) à recursão, garantindo composição correta
ao longo da cadeia de translates aninhados.

`projects/svg-engine/core/src/lib/geometry/scale-bake.ts`:

- `bakeScaleIntoNode`: calcula `localAnchor = anchor − transform[4..5]`
  e passa aos helpers per-type
- Caso `group`: passa `localAnchor` à recursão (não `anchor`) para
  que descendentes herdem o frame correto

### Bug 2 — Color picker abre no canto do viewport

**Sintoma**: clicar no swatch de cor faz o popover do `<input
type="color">` aparecer no canto superior-esquerdo da página, em vez
de ao lado do swatch.

**Root cause**: `.color-input-hidden` foi declarado com `position:
absolute` MAS `.field-row` (o `<label>` que contém o input) não tinha
`position: relative`. Sem ancestor posicionado, o input absolute foge
para o initial containing block (= viewport). Browsers ancoram o
popover do color picker ao elemento `<input>` — portanto o popover
abre na origem do viewport.

**Fix** (`inspector.component.ts`):

- `.field-row` ganha `position: relative` (ancoragem)
- `.color-input-hidden` ganha `top: 50%; left: 36px` (próximo ao
  swatch, dentro da row)

**Decisões técnicas**

- **Bake doc→local na entrada, não nos helpers**: helpers per-type
  permanecem puros e simples (recebem local anchor). Conversão fica
  centralizada em `bakeScaleIntoNode` — único caller-facing entry.
- **Group recursion composta**: cada nível subtrai sua própria
  translate. Resultado idêntico a `doc_anchor − Σ(ancestor translates)`
  na profundidade do nó — sem precisar acumular state no helper.
- **`position: relative` no field-row** sem alterar layout: relative
  sem top/left não move o elemento; só serve de âncora para o
  absolute descendente.

**Cobertura**

- `scale-bake.spec.ts`: +6 testes
  (rect+translate dragging mr fixa lado esquerdo; rect+translate
  dragging tc fixa lado inferior; ellipse+translate; identity-transform
  preservada; rotated retorna null; group+translate com child+translate
  cadeia de composição)
- `inspector.component.spec.ts`: +1 teste
  (`.field-row` tem `position: relative`)
- **Total**: +7 testes → **521 passing** em 41 arquivos. Zero
  regressão. Tests existentes do `bakeGroup` direto continuam verdes
  (eles não vão pelo dispatcher, então a mudança não os afeta).

**Comportamento visível na app**

- Mover qualquer forma + redimensionar por qualquer handle (corner
  OU edge): lado oposto fica perfeitamente parado em doc space
- Clicar em qualquer swatch de cor: popover nativo abre ao lado do
  swatch, como esperado

---

## 2026-05-16 — Fase 4 Bloco 4-IP-Fix: fusão swatch + color picker

**Contexto**

Logo após o 4-Inspector-Polish, screenshot do usuário mostrou que cada
linha de cor (fill / stroke) tinha **dois controles visíveis lado a
lado**: o swatch novo (quadradinho com a cor real) e o `<input
type="color">` nativo (caixa cinza padrão do browser).

Padrão de mercado (Figma, Affinity, Inkscape, Sketch): **um único
controle visual por campo de cor**. O swatch _é_ o picker — clicar nele
abre o seletor nativo. Sem caixa cinza separada.

**Mudanças**

`projects/svg-engine/ui/src/lib/inspector/inspector.component.ts`:

- Template: cada linha de cor agora é um `<label class="field-row">`
  envolvendo o `<span class="swatch">` (visível) + `<input
type="color" class="color-input-hidden">` (no DOM, mas escondido).
  Associação label↔input do browser garante que clique no `<label>`
  abre o picker nativo automaticamente
- CSS: swatch maior (28×22), `border-radius: 4px`, hover destaca a
  borda em `primary`, disabled reduz opacidade
- Nova classe `.color-input-hidden`: `position: absolute; width: 1px;
height: 1px; opacity: 0; pointer-events: none` — input fica
  invisível mas continua **tab-focusable** (acessibilidade
  preservada — usuário de teclado ainda chega no picker via Tab)
- `aria-hidden="true"` no swatch + `aria-label` explícito no input
  (screen readers ouvem "Pick fill color", não veem o swatch redundante)
- Lock: classe `disabled` no `<label>` muda cursor para `not-allowed`
  e reduz opacidade do swatch

**Decisões técnicas**

- **Label-input association vs JS click**: padrão HTML semântico
  (`<label>` envolvendo `<input>`) entrega tudo de graça — clique,
  foco, screen reader. Solução JS-driven seria over-engineering
- **Visually-hidden vs `display: none`**: `display: none` removeria
  o input do tab order e do accessibility tree. Truque "1px com
  opacity 0 e pointer-events none" é o padrão WCAG para visually
  hidden mas tecnicamente presente
- **Por que não Material `mat-form-field` aqui**: color picker nativo
  não se encaixa no design Material padrão (sem floating label, sem
  outline). O `<label>` HTML cru é mais limpo e mais customizável

**Cobertura**

- `inspector.component.spec.ts`: +1 teste
  (lock-down da estrutura fundida — 2 labels `.field-row`, cada um
  com 1 swatch e 1 input `.color-input-hidden`)
- **Total**: +1 teste → **514 passing** em 41 arquivos. Zero regressão

**Comportamento visível na app**

- Inspector mostra **um** quadradinho colorido por campo (fill, stroke)
- Hover destaca a borda; clique abre o picker nativo do browser
- Tab continua chegando no input invisível → picker funciona via
  teclado também

---

## 2026-05-16 — Fase 4 Bloco 4-Inspector-Polish: polimentos solicitados

**Contexto**

Após o 4-Resize-Proper, usuário identificou 3 detalhes via screenshots:

1. **Valores não-inteiros no inspector**: drag produz `496.1125`, `237.6085`
   etc. — visualmente ruidoso. Mercado (Figma/Affinity) mostra inteiros
   por padrão; precisão fica no model.
2. **Controles de STYLE vazios**: color pickers mostram cinza
   `#cccccc` quando o model tem `hsl(...)`, `rgb(...)` ou hex de 3 chars
   (que o `<input type="color">` não renderiza). Opacity mostra texto
   placeholder "opacity" em vez de valor.
3. **Inspector não atualiza durante drag**: bake só roda no commit
   (`endResize`). Usuário espera ver `w`/`h`/`x`/`y` mudando ao vivo.

Confirmação prévia do usuário antes de codar: "padrão de mercado" e
"se aplicar bake, não teremos o problema anterior?" — respondida com
análise arquitetural mostrando que bake-during-drag mantém todas as
invariantes do Resize-Proper (1 undo entry, estado final idêntico,
sem regressão de geometria), apenas tornando o preview fiel.

**Mudanças**

### Item 3 — bake durante drag (arquitetural, mais importante)

`projects/svg-engine/edit/src/lib/transform/transform.service.ts`:

- `DragState` resize variant: novo campo `startNode: SvgNode` (snapshot
  completo do node no início do gesto)
- `startResize`: captura `startNode = node` (não só `startTransform`)
- `updateResize`: chama `bakeScaleIntoNode(startNode, sx, sy, anchor)`
  a cada frame; se não-bakeável (rotacionado), fallback para
  `composeAnchoredScale` (legacy + `vector-effect: non-scaling-stroke`)
- `endResize`: `applyPreviewNode(nodeId, startNode)` (full revert) +
  dispatch `ResizeNodeCommand` (que aplica bake limpo no execute)
- `cancelGesture`: discriminação por kind — `resize` usa
  `applyPreviewNode` (revert geometria + transform); `move`/`rotate`
  continuam com `applyPreviewTransform` (só transform muda)
- Novo helper `applyPreviewNode(nodeId, node)`: replace completo do nó

**Resultado visível**: inspector mostra `width: 100 → 150 → 200`
durante o drag em tempo real (em vez de estagnar em 100 até commit).

### Item 1 — display de inteiros + opacity formatada

`projects/svg-engine/ui/src/lib/inspector/inspector-pipes.ts`:

- Pipes `rectField`/`ellipseField`/`lineField` arredondam para inteiro
  via novo helper `roundForDisplay(value)`
- Display-only — model preserva precisão. Edit user-side aceita decimais
  (`100.5` é gravado como `100.5`)
- Magnitude ≥ 1e15: skip rounding (preserve astronomical edge cases)

`projects/svg-engine/ui/src/lib/inspector/inspector.component.ts`:

- `styleNumber`: usa `roundForDisplay` para `strokeWidth`; usa
  `v.toFixed(2)` para `opacity`; default `'1'` para ambos quando
  undefined (SVG implicit defaults — opacity=1, stroke-width=1)

### Item 2 — swatch visual de cor real

`inspector.component.ts`:

- Novo método `rawStyleColor(field)`: retorna a CSS color string raw do
  model (hex/hsl/rgb/named/url) ou `'transparent'` quando undefined
- Template: `<span class="swatch" [style.background-color]="rawStyleColor(field)" [title]="rawStyleColor(field)">`
  adicionado ao lado de cada `<input type="color">` (fill + stroke)
- CSS: swatch 18×18 com border + checkerboard backdrop (mostra através
  de `transparent` / semi-transparentes)
- `<input type="color">` mantido para edição (sempre escreve `#RRGGBB`);
  swatch é só leitura visual

**Decisões técnicas**

- **Bake-during-drag NÃO regride o Resize-Proper**: preview agora é
  fiel ao commit. `endResize` reverte ao startNode + dispatch — estado
  pós-commit idêntico ao Resize-Proper. 1 undo entry preservada (drag
  não dispatcha por frame; só preview muta direto).
- **Rounding display-only**: model nunca perde precisão (princípio
  fundamental). User pode digitar `12.5` e ver `13` no display após
  blur (model = 12.5, display = 13). Aceita-se trade-off de "vejo
  diferente do que digitei" pelo benefício de eliminar ruído visual.
- **Opacity default `'1'`**: SVG implicit é 1 (opaco); mostrar valor
  explícito é mais honesto que placeholder. Usuário sempre vê um
  número concreto para editar.
- **Swatch backdrop checkerboard**: padrão universal (Photoshop/
  Affinity/Figma) para indicar transparência. `background-image` CSS
  paint-order garante que `background-color` (a cor real) sobrepõe;
  `transparent` ou alpha < 1 deixa o pattern aparecer.
- **`<input type="color">` mantido vs custom picker**: 4d (Bloco
  Color Palettes) substituirá por picker richer com paletas. Por
  agora o native input + swatch dá ergonomia mínima decente.

**Cobertura**

- `transform-gestures.spec.ts`: +3 testes
  (`updateResize` bake real-time em rect; `cancelGesture` reverte
  geometria + transform; rotated usa fallback scale-transform)
- `inspector.component.spec.ts`: +7 testes
  (geometria arredondada no display; model preserva precisão; opacity
  default `'1'` quando undefined; opacity 2 decimais quando setado;
  swatch element renderizado; swatch reflete HSL/RGB; swatch
  `transparent` para undefined)
- **Total**: +10 testes → 513 passing em 41 arquivos. Zero regressão.
  (4-IP-Fix abaixo trouxe o total a 514.)

**Comportamento visível na app**

- Resize: inspector mostra `w`/`h`/`x`/`y` mudando frame-a-frame
- Inspector: valores inteiros nos inputs de geometria; opacity sempre
  com um número (1 default, ou 0.50 etc.)
- Swatches: quadradinhos coloridos lado a lado de cada color picker
  mostram a cor REAL aplicada (mesmo HSL/RGB); checkerboard aparece
  através de `transparent` ou cores semi-translúcidas

---

## 2026-05-16 — Fase 4 Bloco 4-Resize-Proper: bake de geometria no resize

**Contexto**

Usuário identificou que ao redimensionar formas pelos handles ("quadradinhos"),
o **stroke ficava visualmente alterado** — parecia que escala estava sendo
aplicada em vez de mudar `width`/`height`. Auditoria honesta confirmou:
não era percepção, era **erro arquitetural real**.

`ResizeNodeCommand` (Bloco 3) compunha `S(sx, sy)` no `transform` do nó.
Consequências:

1. **Stroke distorcia** — matrix de scale multiplica TUDO inclusive o
   `stroke-width`. Affinity/Illustrator/Figma nunca fazem isso.
2. **Inspector mismatch** — modelo dizia `width=100`, visualmente era 200.
3. **Cantos arredondados (`rx`/`ry`) deformavam** em scale assimétrico —
   round 5px virava oval.
4. **Acumulativo** — cada resize compunha outro scale; matrizes empilhavam.

Usuário escolheu **Caminho B completo**: bake de geometria pra TODOS os
tipos SVG (rect/ellipse/line/polygon/polyline/text/image/path/group).

**Sub-blocos entregues** (4-R1 a 4-R5)

### 4-R1: pure bake helpers para primitivas

`core/lib/geometry/scale-bake.ts`:

- **Primitives**:
  - `scaleAxisInterval(start, length, anchor, scale)` — 1-D interval scale
    com normalização para length≥0 (handle de flip negativo)
  - `scalePoint(p, anchor, sx, sy)` — point scale signed
  - `isIdentityOrTranslate(transform)` — predicate p/ saber se bake é
    aplicável (tolerância 1e-9 p/ floats noise)
- **Per-type bake** (8 funções): rect (x/y/w/h/rx/ry), ellipse (cx/cy/rx/ry),
  line (x1/y1/x2/y2), polygon/polyline (cada point), text (x/y + fontSize
  só se uniforme), image (como rect), group (recursivo via callback)
- **Negative scale handling**: rect flip-position com width positivo;
  ellipse cx/cy mirror com radii sempre positivos; text fontSize via |sx|

35 testes cobrindo: scale positivo/negativo/zero; preservação de id/style/
transform/metadata; flip de sinal; uniforme/não-uniforme p/ text;
recursão de group; isIdentityOrTranslate em 6 casos.

### 4-R2: path d parser/scaler

`core/lib/geometry/path-d-scaler.ts`:

- **Tokenizer regex**: comando-letras OU números (com float/negativo/
  exponencial); aceita tightly-packed (`M10 10-5-5`)
- **`parsePathD(d)`**: agrupa em segments `{cmd, args: number[]}`
- **`scalePathSegments(segs, sx, sy, anchor)`**: per-command scale (abs
  vs rel; H/V/h/v single-axis; A/a com radii absolute + endpoint scaled
  - sweep flip em scale-negativo-XOR)
- **`serializePathD(segs)`**: round 6 decimais p/ noise float; -0 → 0
- **`bakePathD(d, ...)`**: convenience parse+scale+serialize
- **First-`m` quirk** (SVG 1.1 §9.3.3): primeira `m` reinterpretada
  como `M` (preprocessFirstM split em M absoluto + l relativo se >2 args)

36 testes cobrindo parser (incluindo tight-packed, scientific, .5, Z);
scale per-command (abs + rel); first-m quirk; arcs (sweep flip,
radii positive em negativo); end-to-end roundtrip.

### 4-R3: bakeScaleIntoNode unificado + smart ResizeNodeCommand

- `bakeScaleIntoNode(node, sx, sy, anchor): SvgNode | null` — switch
  per-type; retorna null se transform não é identity-or-translate
  (caller fallback para legacy)
- `ResizeNodeCommand` **refatorado** (`core/commands/resize-node.command.ts`):
  - Tenta bake primeiro; se null, fallback para `composeAnchoredScale`
    (legacy mantido)
  - Captura **node inteiro** previamente (não só transform) para undo
    funcionar em ambos os paths
  - `composeAnchoredScale` continua exportado (usado por
    `TransformService.updateResize` para preview rápido)
- `TransformService` **inalterado** — gesture flow já fazia revert+commit;
  agora o command no commit faz bake automaticamente

2 testes novos no rotate-resize.spec.ts: bake em identity-transform,
fallback em rotated. 2 testes existentes em transform-gestures.spec.ts
atualizados para verificar geometry mutada (não transform composto).

### 4-R4: vector-effect="non-scaling-stroke" nos 7 renderers

Aplicado em rect/ellipse/line/polygon/polyline/path/text directives
(image não tem stroke). Cobre o caso fallback (nós rotacionados onde
o bake não roda) — stroke fica visualmente constante mesmo com scale
matrix no transform. Para nós identity-or-translate (caminho bake)
é no-op harmless (sem scale matrix a combater).

### 4-R5: docs + commit

Esta entrada + checkbox no roadmap.

**Decisões técnicas**

- **Bake só no commit, não no preview**: preview durante drag continua
  usando scale-transform (cheap, sem parse per-frame). Path scaler
  parseando 1000-vertex paths a cada move event seria desperdício.
- **Fallback para rotacionados via scale-transform + non-scaling-stroke**:
  alternativa seria converter rotacionados para path on-bake — não trivial,
  destrói o tipo original (rect deixa de ser rect). Fica como capability
  futura ("convert to path"). Por enquanto: fallback elegante.
- **Undo captura node inteiro**: bake mutates geometry, fallback mutates
  transform — snapshot do node funciona para os dois sem branching.
- **Arc rotation aproximada**: arcs com `x-axis-rotation != 0` sob scale
  não-uniforme têm fórmula complexa (rotacionar basis vectors). Para v1
  preservamos rotation e escalamos rx/ry por axis — exato quando
  rotation=0 (caso comum em editores), aproximado fora disso. Documentado.
- **First-`m` absolute quirk**: pega cega comum em path scalers. Tratado
  via `preprocessFirstM` que reescreve a primeira `m` como `M` antes
  do scale; resto fica relativo.
- **Float noise mitigation**: `Math.round(n * 1e6) / 1e6` no serializer
  (6 casas) preserva precisão útil sem inflar d-string.

**Cobertura**

- `scale-bake.spec.ts`: 35 testes
- `path-d-scaler.spec.ts`: 37 testes
- `rotate-resize.spec.ts`: +2 testes (bake + fallback)
- `transform-gestures.spec.ts`: 2 testes atualizados
- **Total**: +74 testes líquido → **504 passing em 41 arquivos**.
  Zero regressão.

**O que muda visualmente na app**

- Resize de retângulo: `width`/`height` mudam (inspector reflete), stroke
  fica em 1px (não distorce), cantos arredondados não viram oval
- Resize de ellipse: `rx`/`ry` mudam, stroke constante
- Resize de linha: endpoints reposicionam, stroke constante
- Resize de path: `d` reescrito com coordenadas escaladas, stroke constante
- Resize de polígono/polilinha: pontos reposicionam, stroke constante
- Resize de texto: `x`/`y` movem; em scale uniforme `fontSize` também
  escala; em não-uniforme `fontSize` preservado
- Resize de imagem: `x`/`y`/`width`/`height` mudam
- Resize de grupo: bake recursivo nos filhos não-rotacionados
- Resize de qualquer shape **rotacionado**: scale-transform composto
  (fallback), mas stroke continua sem distorção via non-scaling-stroke

**Sobre Bloco 4d (palettes)**: adia 1 dia. Próximo agora é a infra
real de paletas de cores.

---

## 2026-05-15 — Fase 4 Bloco 4b-Lock v2: lock = totalmente off-limits

**Contexto da correção**

Usuário esclareceu (corretamente) que o conceito que apliquei no v1
estava errado. v1 seguia Affinity/Figma "lock = sem edição mas pode
selecionar"; usuário queria "lock = invisível para qualquer interação,
incluindo seleção". Razões:

- Locked node não pode ser selecionado (canvas, marquee, layers panel).
- Inspector nunca mostra propriedades de locked.
- Única interação permitida é via botões eye/lock no layers panel
  (continuam funcionando para destravar / mostrar-esconder).

Correção aplicada com **enforcement centralizado no `SelectionService`**.

**Mudanças**

`SelectionService` (em `edit`):

- Injeta `LayersService` (mesmo entry point — coupling justificado).
- `select(id)`, `addToSelection(id)`, `toggle(id)`: silent no-op se
  `isLocked(id)`.
- `selectMany(ids)`: filtra locked antes de aplicar; `selectedIds`
  resultante nunca contém locked.
- `setHover(id)`: silent no-op + clear se locked (sem highlight de
  hover em locked).
- **Effect reativo** no constructor: lê `LayersService.lockedIds()`,
  usa `untracked()` para mutar `_selectedIds`/`_focusId`/`_hoverId`
  removendo qualquer id que tenha virado locked. Garante consistência
  mesmo se `setLocked` for chamado externamente.
- `clear()` e `deselect()` NÃO foram alterados — operam sobre o que
  está selecionado independente de lock. O que não pode é ADICIONAR
  locked à seleção.

Layers panel (em `ui`):

- Locked rows: `cursor: not-allowed`, `aria-disabled="true"`,
  `tabindex="-1"`, hover bg neutralizado.
- `onRowClick`/`onRowKey` early-return se locked (defesa explícita
  no consumer; SelectionService já é no-op de qualquer forma).
- Botões eye/lock continuam funcionando (stop propagation já existia).

Inspector (em `ui`):

- Badge "Locked" + CSS `.inspector-header.locked` + lock-badge
  **REMOVIDOS** — eram dead code agora (locked nunca chega ao inspector
  porque selection nunca o foca).
- `[disabled]="isLocked()"` e setter short-circuits **MANTIDOS** como
  defesa em profundidade — barato e protege se algum consumer futuro
  set focus diretamente sem passar por `SelectionService`.
- Doc comment de `isLocked` atualizado refletindo que é defesa, não
  UI primária.

`TransformService` (em `edit`):

- `startMove/startRotate/startResize` continuam refusando locked.
  Tecnicamente redundante agora (locked nunca está selecionado, então
  o consumer não chama startMove com id locked). Mantido como defesa
  em profundidade (custo zero).

Playground:

- Check `if (!this.layers.isLocked(id))` em `onCanvasPointerDown`
  mantido — evita armar `potentialDrag` com id que nem foi selecionado
  (cleaner UX, sem cursor "grabbing" enganoso).

**Decisões técnicas**

- **Filter no write + effect para sync**: write-time evita ids locked
  entrarem (o caminho normal). Effect cuida do "lockou depois de
  selecionar" (raro mas possível). Combinação cobre todos os caminhos.
- **`untracked()` no effect**: signal updates dentro do effect criariam
  loops se as deps fossem registradas. `untracked` quebra o ciclo;
  effect só re-roda quando `lockedIds` muda.
- **Unlock NÃO restaura seleção**: Affinity/Figma convention. State
  é prune-and-forget; usuário reseleciona manualmente. Caso contrário
  teríamos que guardar "ghost selection" — complexidade desnecessária.
- **Coupling Selection→Layers**: já tinha Transform→Layers (4b-v1).
  Agora Selection também. Ambos em `edit`; lock é cross-cutting
  fundamental. Aceitável.
- **`TestBed.flushEffects()` nos specs**: effects não rodam em
  `Promise.resolve()` em testes (rodam no scheduler do Angular CD).
  `flushEffects` força o flush síncrono.

**Cobertura**

- `selection.service.spec.ts`: +9 testes
  (no-op em select/selectMany/addToSelection/toggle/setHover; effect
  auto-deselect single + multi; focus reassign; hover clear; unlock
  não restaura)
- `layers-panel.component.spec.ts`: +2 testes
  (click em locked row no-op; aria-disabled true)
- `inspector.component.spec.ts`: -5 testes do v1 + 1 novo
  (locking deseleciona → inspector vai pra "No selection")
- **Total**: +9 testes líquidos → 429 passing em 39 arquivos. Zero regressão.

**O que vai parecer diferente no app**:

- Click em forma com cadeado fechado: nada acontece. Cursor `not-allowed`
  no layers panel; cursor default no canvas (sem grabbing).
- Marquee passando por locked: locked NÃO entra na seleção. Seleção
  contém só os unlocked dentro da box.
- Selecionar forma → cadear no layers: forma deseleciona automaticamente,
  inspector vira "No selection".
- Destravar: forma não volta automaticamente para a seleção. Usuário
  precisa clicar de novo.

---

## 2026-05-15 — Fase 4 Bloco 4b-Lock: enforcement real do cadeado

**Contexto**

Usuário levantou (corretamente) que o cadeado do `<svge-layers-panel>` só
trocava ícone/classe CSS — **nenhum consumer consultava `LayersService.isLocked()`**.
Locked nodes continuavam sendo arrastáveis/redimensionáveis/editáveis pelo
inspector. Falha minha que ficou documentada como "follow-up" sem visibilidade.

Padrão de mercado aplicado: **lock previne EDIÇÃO, não SELEÇÃO** (idêntico a
Illustrator / Affinity / Figma). Usuário ainda pode selecionar e ver
propriedades de um locked node; só não pode modificá-lo.

**Pontos de enforcement**

- `TransformService.startMove/startRotate/startResize`: injeta `LayersService`
  e refusam (no-op, sem setar `dragState`) quando `isLocked(nodeId)`.
  Cobertura automática: body-drag, handles de resize/rotate no overlay,
  qualquer gesture programático.
- `<svge-inspector>`:
  - Computed `isLocked()` consulta `LayersService` baseado no `focusNode`.
  - Badge "Locked" no header com `mat-icon lock` + background vermelho
    (`var(--mat-sys-error)`).
  - `[disabled]="isLocked()"` em todos os inputs (14 ao total: 4 geometry
    rect + 4 ellipse + 4 line + 2 color pickers + strokeWidth + opacity).
  - Setters (`setNumber`, `setStyle`, `setStyleNumber`) também short-circuit
    em locked — defense in depth. Mesmo se o consumer remover `[disabled]`
    via DevTools, o dispatch é bloqueado.
- Playground `onCanvasPointerDown`: locked nodes ainda selecionam ao click,
  mas `potentialDrag` não é armado (UX: cursor não fica em "grabbing"
  enganoso).

**Decisões técnicas**

- **Acoplamento controlado**: `TransformService` agora depende de
  `LayersService`. Ambos em `svg-engine/edit`, mesmo entry point.
  Consumers que não usam o layers panel ainda pagam o cost de injetar
  `LayersService`, mas como o default é `hiddenIds`/`lockedIds` vazios,
  o comportamento é idêntico ao anterior. Sem opt-out por enquanto
  (premature optimization).
- **Lock NÃO afeta seleção**: marquee continua selecionando locked;
  click direto seleciona; layers panel click seleciona. Você precisa
  destravar pra editar. Padrão Illustrator/Affinity/Figma.
- **Badge no header, não toast/snackbar**: feedback persistente é mais
  honesto que notificação efêmera. Usuário sempre vê "isso está locked"
  enquanto a seleção estiver locked.

**Cobertura**

- `transform-gestures.spec.ts`: +4 testes
  (startMove/startRotate/startResize refusam locked; unlock restaura)
- `inspector.component.spec.ts`: +5 testes
  (badge aparece/some; .locked class no header; todos inputs disabled;
  setter short-circuit mesmo com input force-enabled)
- **Total**: +9 testes → 420 passing em 39 arquivos. Zero regressão.

**Sobre undo/redo (questão paralela do usuário)**

Confirmado: **todas as mutações de documento já passam pelo `CommandBus`
e são undoable**: add shape, drag, resize, rotate, align (6 axes),
distribute (2 axes), inspector edits (geometry + style), nudge, remove.
Coisas não undoable são editor session state (pivot move, visibility/lock
toggle, background config, snap config, tool ativo, pan/zoom) — padrão
de mercado consistente.

---

## 2026-05-15 — Fase 4 Bloco 4c: Inspector de propriedades

**O que foi entregue**

Painel de propriedades (`<svge-inspector>`) reativo a `selection.focusId()`.
Edita geometria por tipo + estilos comuns (fill/stroke/strokeWidth/
opacity). Cada edit dispara `SetPropertyCommand` — undo limpo
(1 entrada por field).

**Estrutura nova** (`projects/svg-engine/ui/src/lib/inspector/`):

- `inspector.component.ts` — `<svge-inspector>` standalone Material:
  - **Estados**: empty (placeholder "No selection") / multi
    (placeholder "Multiple selection (N)") / single (header + sections).
    Multi-edit (apply same value across N nodes) é polish futuro.
  - **Header**: type icon + type label + id slice (8 chars).
  - **Geometry section** via `@switch (node.type)`:
    - `rect`: x/y/w/h
    - `ellipse`: cx/cy/rx/ry
    - `line`: x1/y1/x2/y2
    - `polygon|polyline|path|text|image`: placeholder "edit via canvas
      tools" (editores específicos vão em sub-blocos quando demandados)
    - `group`: section omitida (sem geometry inerente)
  - **Style section**: fill + stroke (`<input type="color">`),
    strokeWidth + opacity (number inputs)
  - Material 3 design tokens via `var(--mat-sys-*)` herdam tema
- `inspector-pipes.ts` — `RectFieldPipe` + `EllipseFieldPipe` +
  `LineFieldPipe`: type-narrowed accessors (evitam `$any()` no template
  para os campos numéricos mais comuns).

**Commits via SetPropertyCommand**:

- `setNumber(field, raw)`: parse via `parseNumericInput()` helper
  (rejeita strings vazias — `Number('')` returns 0, sem o helper
  digitar e apagar acidentalmente commitaria 0).
- `setStyle(field, value)`: spread + `SetPropertyCommand(id, 'style',
newStyle)` (style é nested; SetPropertyCommand opera em top-level keys).
- `setStyleNumber(field, raw)`: idem com parse.
- Cada chamada faz dedup: se valor idêntico ao atual, no-op (sem
  poluir undo stack com no-ops).

**Decisões técnicas**

- **`(change)` em vez de `(input)`**: input dispara per-keystroke —
  digitar "1500" criaria 4 entradas de undo. `(change)` dispara
  on-blur ou Enter, um edit = uma entrada.
- **`<input type="color">` em vez de Material color picker**: Material
  21 não tem color picker built-in; usar `<input type="color">` é
  trivial e cross-browser. Color picker richer (com paletas) chega
  no Bloco 4d via `PaletteRegistry`.
- **Sem sliders**: number inputs cobrem opacity/strokeWidth com menos
  imports; sliders são polish (4c-Polish).
- **Sem animations provider em testes**: `@angular/animations` não
  está instalado; Material funciona em modo no-anim por default em
  testes (componentes form-field não dependem de animations runtime).
- **Pipes em arquivo separado**: tinha colado os pipes no fim do
  inspector.component.ts; Angular precisa imports no `@Component.imports`
  array — mover para `inspector-pipes.ts` resolve circular reference
  e mantém arquivo principal focado.
- **`parseNumericInput()` standalone**: pequeno utility no fim do
  arquivo. Bug pego nos testes: `Number('')` retorna 0, então input
  vazio acidentalmente commitaria 0. Helper rejeita whitespace-only.
- **Pivot picker integrado e transform decomposto ADIADOS**: 4c-Polish.
  Transform decomposition (translate/rotate/scale/skew) precisa
  matrix → angle/factors algorithm (não trivial); pivot integration
  precisa coordenar com TransformService.

**Cobertura** (`inspector.component.spec.ts`): 14 testes

- Empty / multi placeholders.
- Header type + id slice.
- Geometry per type (rect/ellipse/line) + path placeholder + group sem geometry.
- Command dispatch: rect.x via input commits node mutation;
  fill via color input commits style mutation;
  empty input dropped silently;
  same value = no-op (no spurious command).
- Reactive: header refresh on focus change; inputs refresh on
  external command.

**Total**: +14 testes → 411 passing em 39 arquivos. Zero regressão.

**Próximo (4d)**: `<svge-color-palette>` + `PaletteService` consumindo
`PaletteRegistry` (categoria 8 do D-023). Built-in palettes (Material
colors, Tailwind, custom HSL) via plugins. Integração com inspector
fill/stroke pickers.

---

## 2026-05-15 — Fase 4 Bloco 4b: Layers panel + visibility/lock

**O que foi entregue**

Painel hierárquico de camadas (`<svge-layers-panel>`) com expand/collapse,
visibility toggle, lock toggle, e selection sync. Visibility de fato
esconde nós do canvas via uma directive opt-in (`[svgeLayersFilter]`).

**Estrutura nova em `svg-engine/edit/src/lib/layers/`** (headless):

- `layers.service.ts`:
  - `LayersService`: signals `hiddenIds` + `lockedIds` (Set<NodeId>),
    computeds `hasHidden`/`hasLocked`.
  - APIs: `setVisible/toggleVisible/isVisible`, `setLocked/toggleLocked/isLocked`,
    `showAll/unlockAll`. Setters idempotent (no-op + signal não dispara
    se valor não mudou).
  - **Editor presentation only** — não serializado no SVG export
    (mesma separação do D-021/WorkspaceService).
  - Visibility e lock são **independentes** (testado).
- `layers-filter.directive.ts`:
  - `[svgeLayersFilter]`: opt-in. Consumer attach na renderer ou wrapper.
  - Usa `effect()` (não `afterEveryRender`): re-roda quando `hiddenIds`
    muda — fires na microtask, sem dependência de CD cycle (fix do
    problema visto no rotation-pivot).
  - Walk dos `[data-node-id]` descendants do host; aplica
    `style.display = 'none'` em hidden ids; restaura inline display
    pre-existente via sentinela `data-svge-prev-display` (não clobra
    `display: block` setado pelo consumer).
  - Cleanup em `ngOnDestroy` desfaz todos os hidden.
  - Edge case documentado: re-criação de DOM por tree mutation com
    mesmo id pode escapar até próximo signal change.

**Estrutura nova em `svg-engine/ui/src/lib/layers-panel/`** (Material):

- `layers-panel.component.ts`:
  - `<svge-layers-panel>` standalone. Imports: `MatIcon`, `MatIconButton`,
    `NgTemplateOutlet`.
  - Recursive via `<ng-template #rowTpl>` + `<ng-container *ngTemplateOutlet>`
    (CDK Tree é overkill para v1 — swap futuro sem mudar API).
  - Sources: `EditorStateService.document().root` (ou `[root]` input
    explícito); skips a row do root, mostra os children.
  - Cada row: chevron (se group), type icon (folder/rectangle/circle/
    show_chart/pentagon/timeline/gesture/text_fields/image), label
    (`{type} {idSlice}`), botões eye/lock à direita.
  - **Selection sync**: click → `selection.select(id)`; Ctrl/Cmd-click
    → `toggle`; Shift-click → `addToSelection` (range fill = futuro).
  - **Classes condicionais**: `.selected`, `.hidden` (italic + opacity),
    `.locked` (gray label).
  - Buttons stop propagation — toggle não seleciona o row.
  - **`expanded` signal**: Set<NodeId> dos groups abertos; default vazio.
  - Material 3 design tokens via `var(--mat-sys-*)` — herdam tema.

**Headless boundary verificada** — Grep confirma só `ui/` importa Material.

**Decisões técnicas**

- **Visibility = state, application = directive**: service é pure data;
  applier (DOM mutation) é separado e opt-in. Permite outras estratégias
  no futuro (CSS-in-JS global, render-side filtering).
- **`effect()` em vez de `afterEveryRender`**: o segundo não fira
  confiavelmente em jsdom (já visto no rotation-pivot). `effect` reage
  a signal change diretamente — mais correto semanticamente para "aplica
  visibility quando state muda".
- **Recursive em vez de CDK Tree**: trade-off conhecido. CDK dá
  keyboard nav + virtualização; recursive é metade do código. Para v1
  vale; refator é orthogonal e não muda a API pública.
- **Drag-drop reorder ADIADO**: precisa de `MoveNodeInTreeCommand` no
  core (atomic remove-from-old + insert-at-new + undo restaura ambos).
  Vai como sub-bloco 4b-DnD ou parte do 4h (grouping).
- **Row label = `{type} {idSlice}`**: nó SVG não tem nome user-friendly
  no modelo atual. `metadata.name` opcional pode entrar em refinamento
  do inspector (4c).

**Cobertura**

- `layers.service.spec.ts`: 11 testes
  (visibility/lock independentes; idempotência; toggle; showAll/unlockAll;
  hasHidden/hasLocked computeds)
- `layers-filter.directive.spec.ts`: 6 testes
  (no-op default; hide on signal change; restore; multiple ids;
  preserva pre-existing inline display; escopo limitado ao host)
- `layers-panel.component.spec.ts`: 13 testes
  (empty state; rows per child; type icon + label; selection click/
  ctrl-click/.selected class; visibility/lock buttons toggle service +
  classes; stopPropagation no toggle; group expand/collapse)
- **Total**: +30 testes → 397 passing em 38 arquivos. Zero regressão.

**Próximo (4c)**: `<svge-inspector>` — propriedades do focado (geometria,
fill, stroke, opacity, transform decomposto). Refinamento do D-022
(pivot picker integrado).

---

## 2026-05-15 — Fase 4 Bloco 4a: svg-engine/ui + <svge-editor> shell

**O que foi entregue**

Quarto entry point da library — `svg-engine/ui` — com Angular Material
(D-005). Primeiro componente: `<svge-editor>` shell que colapsa
~200 linhas de boilerplate em um único tag para o consumer 80%-case.

**Estrutura nova** (`projects/svg-engine/ui/`):

- `ng-package.json` (auto-discover) + `src/public-api.ts` exporta
  `SvgeEditor` + `src/lib/editor/editor.component.ts` + spec
- `tsconfig.lib.json` e `tsconfig.spec.json` raiz incluem `ui/src/**/*`
- `tsconfig.json` raiz: novo path map `svg-engine/ui` → `dist/svg-engine/ui`
- `package.json` da lib: `@angular/material` + `@angular/cdk` como
  peerDependencies **opcionais** (`peerDependenciesMeta.optional: true`)
  — consumer só paga o custo se importar de `svg-engine/ui`

**`<svge-editor>` shell**:

- Composição: `mat-toolbar` (undo/redo/zoom-out/%/zoom-in/reset com
  `mat-icon-button` + `mat-tooltip`) + área de canvas com
  `<svge-workspace-background>` envolvendo `<svge-renderer>`
- `<ng-content/>` projetado dentro do renderer — slots para selection-
  overlay/rotation-pivot/marquee/snap-guides
- Inputs opcionais `tree`/`viewBox` com fallback para
  `EditorStateService.document()` (consumers bus-driven não precisam
  thread tree manualmente)
- Inputs `title` e `ariaLabel` opcionais
- Outputs `undoTriggered`/`redoTriggered`
- Computeds reativos: `canUndo`, `canRedo`, `zoomPct`
- Sizing: host fills container; toolbar fixed; canvas flex grow

**Headless boundary verificada**:

- `Grep "@angular/(material|cdk)"` em `projects/svg-engine`: 1 hit
  apenas, em `ui/src/lib/editor/editor.component.ts`. Confirma D-017.

**Decisões técnicas**

- **peerDependencies opcionais**: npm/yarn v7+ honram `optional: true`.
  Consumer só recebe warning se importar `svg-engine/ui` sem ter
  Material instalado. Não-consumers de `ui` não precisam de Material.
- **Inputs com fallback para EditorStateService**: dois estilos de uso:
  estado-driven (`<svge-editor></svge-editor>` — DI compartilhado) ou
  props-driven (`<svge-editor [tree]="..."/>` — controle explícito).
- **Sem refator do playground**: continua usando primitives diretamente
  (D-018 dogfooding honest). Shell é para consumers diferentes; specs
  cobrem comportamento. Sample em route futura se demanda surgir.
- **`mat-icon-button` + Material Icons**: consumer precisa importar
  Material Icons CSS (Google Fonts ou local). README de uso futuro.

**Cobertura**

- `editor.component.spec.ts`: 11 testes (composição, input fallbacks,
  toolbar buttons reativos, output emission)
- **Total**: +11 testes → 367 passing em 35 arquivos. Zero regressão.

**Próximo (4b)**: `<svge-layers-panel>` — árvore SVG hierárquica com
drag-drop (CDK), visibilidade, lock, multi-select sincronizado.

---

## 2026-05-15 — Fase 4 Bloco prévio: WorkspaceService + background (D-021 resolvido)

**Contexto**

Antes de abrir `svg-engine/ui` (Fase 4), o usuário levantou requisitos
explícitos: (1) background **transparente** (xadrez), (2) **paletas de
cores**, (3) "outras configurações de mercado" (page/grid/guides/rulers).
Forçou resolução do D-021 (estava pendente).

3 opções avaliadas — A (estender SvgDocument, rejeitada por ferir
D-002), B (Workspace multi-page de cara, overengineering antes da
demanda), **C híbrida (escolhida)**: WorkspaceService separado, single-doc
agora, multi-page como extensão futura sem refator.

**O que foi entregue**

Foundation pré-Fase 4 em `svg-engine/edit/src/lib/workspace/`. Headless
(HTML+CSS, sem Material — fica em `edit`).

- `WorkspaceService` (signals): `BackgroundConfig` discriminated union
  (transparent/solid/image; gradient/pattern adiados); `setBackground`
  valida silenciosamente + dedup; `resetBackground` → default
  transparent. NÃO mutates SvgDocument.
- `<svge-workspace-background>` HTML wrapper: `<ng-content/>` projetado
  com background via classe (transparent → CSS xadrez 4 linear-gradients
  16×16, idêntico Photoshop/Illustrator/Affinity/Figma) ou inline style
  (solid color / image url). pointer-events: none.

**Wire no playground**:

- Renderer envolto em `<svge-workspace-background>`.
- Toolbar nova "Background": 4 presets (Transparent/White/LightGray/Dark)
  - `<input type="color">` custom.

**Decisões técnicas**

- HTML wrapper, não SVG `<rect>`: xadrez via CSS gradient é trivial e
  GPU-compositado; via SVG pattern seria pesado e teria sub-pixel snap
  issues. Bonus: não polui SVG export.
- WorkspaceService em edit (não render): vai abrigar grid/guides/rulers
  edit-only; bundling coerente.
- Paletas usam PaletteRegistry (categoria 8 do D-023) — sem service novo
  específico.

**Cobertura**

- workspace.service.spec.ts: 9 testes
- workspace-background.component.spec.ts: 5 testes
- **Total**: +14 testes → 356 passing em 34 arquivos. Zero regressão.

**Próximo: Fase 4 com 9 blocos planejados** (`05-roadmap.md`):
ui entry + editor shell (4a), layers (4b), inspector (4c), color
palettes via PaletteRegistry (4d), toolbar extensível +
MenuContributionRegistry (4e), workspace settings completos (4f),
shortcuts ShortcutRegistry (4g), grouping (4h), theme toggle (4i).

---

## 2026-05-15 — Fase 3 Bloco 5c: Documentação canônica de plugins (D-020/D-023/D-024)

**O que foi entregue**

Bloco sem código — formaliza a arquitetura de plugins no doc de
decisões agora que a infra está sólida (5a + 5b). Três decisões
tocadas, uma tabela reorganizada, refs cruzados atualizados.

**`docs/04-decisoes-tecnicas.md`**:

- **D-020 expandido**: substitui o esboço de 2026-05-14 pelo design
  real entregue. Inclui interfaces formais (`EditorPlugin`,
  `PluginContext`, `Disposable`, `PLUGIN_API_VERSION`), exemplo de
  bootstrap (`provideSvgEnginePlugin`), padrão fixo de capability
  registry, garantias do `PluginRegistry` (atomicidade, semver
  major-only, idempotent uninstall, LIFO disposal, resiliência a
  uninstall a quente), e justificativa explícita do `injector` cru
  no PluginContext (vs façade que cresce a cada release).
- **D-023 novo (Categorias de plugin)**: tabela de 9 categorias
  mapeadas — Renderers (Fase 2 ✅), Tools (Fase 3 ✅), Optimizers/
  Importers/Exporters (Fase 5), Inspectors/Palettes/Menus+Shortcuts
  (Fase 4), Effects (Fase 6). Padrão fixo: cada registry implementa
  exatamente o mesmo template (signal reativo + `register(): Disposable`
  - helpers de lookup). Omissões deliberadas explicitadas
    (DataSourceRegistry, ThemeRegistry, ProjectorRegistry — com razão
    para cada).
- **D-024 novo (ScriptRuntimePlugin, deferido Fase 6+)**: scripts
  ≠ plugins. Decisão tomada de antemão para que o desenho da infra
  já não precluda scripts depois. Sandbox escolhido = WebWorker
  isolado + API curated por message passing (alternativas avaliadas:
  Function/eval ❌, QuickJS-WASM fallback se latência virar gargalo,
  DSL próprio descartado por custo). API ScriptHostAPI esboçada —
  scripts montam sequência de `CommandRequest`s e retornam ao main
  thread, que aplica via CommandBus (1 entrada de undo "Run script:
  X" por execução). Não-objetivos explícitos: NÃO acesso a Injector/
  DOM/window/state síncrono; NÃO TypeScript inicialmente; NÃO npm
  install dinâmico; NÃO persistência automática.

**Tabela "Decisões pendentes"**:

- Removidas linhas D-023? (cumprida) e D-024? (renumerada).
- "Versionamento + changelog" passa a D-031?.
- Nota de rastreio adicionada explicando o reuso de IDs.

**`docs/06-componentes-editor-svg.md`**:

- Tabela de Serviços do `svg-engine/edit` ganha 5 entradas novas:
  `MarqueeService` (Bloco 4a), `AlignmentService` (Bloco 4c),
  `PluginRegistry` (Bloco 5a), `ToolRegistry` + `ToolHostService`
  (Bloco 5b). `SnapService` ganha descrição completa.

**Decisões técnicas (sobre as próprias decisões)**

- **D-020 reescrito ao invés de adicionar D-023 "API formal"**: o
  doc de decisões fica mais legível com 1 entrada canônica por tema,
  não cadeia de erratas. D-020 agora é a única referência sobre como
  plugins funcionam.
- **D-024 como decisão "tomada mas deferida"** (não pendente): o
  caminho técnico está escolhido (WebWorker + curated API); só a
  implementação é Fase 6+. Pendentes são decisões EM ABERTO; D-024
  está fechada com data de execução em aberto.
- **Reuso de IDs D-023/D-024**: documentado na nota da tabela. Próximas
  decisões pendentes ganham IDs >= D-031 sem gap.

**Bloco 5 completo** (5a infra + 5b ToolRegistry + Pencil/Select +
5c docs canônicas). **Fase 3 completa**: edit + selection + overlays

- transforms + marquee + snap + align/distribute + plugin scaffolding
- tool API + reference plugins.

**Próximo: Fase 4 — UX completa**

`svg-engine/ui` com Angular Material (D-005/D-012). Bloco prévio de
UX completa: painel de camadas, agrupamento, inspector de propriedades,
toolbar extensível (já preparada para `MenuContributionRegistry`),
paleta de cores e gradientes, atalhos configuráveis (já preparados
para `ShortcutRegistry`).

Recordação do D-021 PENDENTE (Workspace/Página) — precisa ser resolvido
ANTES do início da Fase 4 porque o painel de configuração de página
vive em `svg-engine/ui`. Ver D-030? na tabela pendentes.

---

## 2026-05-15 — Fase 3 Bloco 5b: ToolRegistry + builtin tools (Pencil, Select)

**O que foi entregue**

Primeira capability registry sobre o scaffolding do 5a. `Tool` interface,
`ToolRegistry` (registra/lista/dispose), `ToolHostService` (tool ativa
e roteamento de eventos do canvas) e dois plugins builtin:
`selectToolPlugin` (passthrough) e `pencilToolPlugin` (freehand path
drawing end-to-end).

**Estrutura nova** (`svg-engine/edit/src/lib/tool/`):

- `tool.ts`: `Tool` interface com hooks opcionais (onActivate/Deactivate/
  PointerDown/Move/Up/Cancel/KeyDown), `ToolPointerEvent` (raw +
  docPoint pré-convertido + flags), `ToolContext` (`injector` cru).
- `tool-registry.service.ts`: `register(tool): Disposable`, `tools`
  signal reativo, `get(id)` / `getByShortcut(key)`. Throws em id vazio
  ou duplicado.
- `tool-host.service.ts`: `activeId` signal + `activeTool` computed
  (re-deriva da registry — resiliente a uninstall do tool ativo);
  `activate(id)` dispara onDeactivate(prev)→onActivate(next);
  `routePointerDown/Move/Up/Cancel` + `routeKeyDown` (no-op se hook
  ausente ou tool null). Consumer roteia (host não conhece DOM do canvas).

**Plugins builtin** (`builtin-tools.ts`):

- `selectToolPlugin` (id `com.svge.tools.select`, shortcut V):
  passthrough — sem hooks. Existe para o toolbar mostrar "Select" e o
  consumer branchar `activeId === SELECT_TOOL_ID` para manter pipeline
  nativo. Migrar select+marquee+body-drag+snap PARA a tool é follow-up.
- `pencilToolPlugin` (id `com.svge.tools.pencil`, shortcut P):
  Implementação completa. Classe `PencilTool` com state interno
  (points, drawing). onActivate: clear selection. onPointerDown: inicia.
  onPointerMove: append. onPointerUp: se ≥2 pontos, monta `d` via
  `pointsToPathD` (M+L, 1 decimal), dispatch `InsertNodeCommand`.
  onPointerCancel + onDeactivate: descarta draft. Sem live preview
  (snapshot-on-up — reference simples).

**Wire no playground**:

- `app.config.ts`: 2 providers via `provideSvgEnginePlugin` (select
  primeiro p/ ser default natural).
- `app.ts` constructor: ativa Select via queueMicrotask (espera bootstrap).
- `routeToActiveTool(event, kind)`: helper. Se tool ativa ≠ Select, monta
  `ToolPointerEvent` e roteia ao host; retorna true para skipar nativo.
- onCanvasPointerDown/Move/Up: chamam routeToActiveTool no topo,
  early-return se true.
- onKeyDown: 1) Esc handlers; 2) shortcuts via getByShortcut, gated em
  `isEditableTarget()`; 3) `toolHost.routeKeyDown` para tools.
- Template: novo `<fieldset>` "Tool" com `@for` reativo + `[class.active]`.

**Decisões técnicas**

- Tools são singletons no registry: 1 instância por id; classes com
  state interno usam fields. Sem factory pattern.
- PencilTool sem live preview: validar API end-to-end primeiro.
- SelectTool passthrough: refactor proper é orthogonal — adiar evita
  mistura de escopo.
- Shortcuts gated por `isEditableTarget()`: digitar "p" em input não
  deve virar pencil.
- Default tool em queueMicrotask: bootstrap providers rodam via
  ENVIRONMENT_INITIALIZER; constructor da App veria registry vazia
  se chamasse activate sincronamente.
- routeToActiveTool retorna boolean: convenção "tool consumiu →
  consumer skip". Mesmo se docPoint for null, retorna true (não cair
  no fallback dá UX melhor).

**Cobertura**

- `tool-registry.service.spec.ts`: 8 testes
- `tool-host.service.spec.ts`: 14 testes
- `builtin-tools.spec.ts`: 11 testes (provider install; shortcuts
  wired; uninstall remove tool; PencilTool gesture end-to-end commits
  InsertNodeCommand; click sem drag = no-op; pointercancel descarta;
  switch mid-draft cancela; clear selection em onActivate; pointsToPathD
  edge cases).
- **Total**: +33 testes → 342 passing em 32 arquivos. Zero regressão.

**Próximo (5c)**: D-020 expandido + novo D-023 (9 tipos de plugin
mapeados) + D-024 reservando ScriptRuntimePlugin (Fase 6+).

---

## 2026-05-15 — Fase 3 Bloco 5a: Plugin scaffolding (infra)

**Contexto**

Antes de começar o `ToolRegistry` (Bloco 5 original), pausa estratégica
para validar se a estrutura suportaria plugins de outros tipos no
futuro (otimização, IO, scripts). Conclusão: **suporta, mas só se
construirmos a infra de plugin AGORA** — não pode ser reativo.

Decisão do usuário (com base em opções apresentadas):

1. Scaffolding completo agora (Bloco 5a) ANTES de `ToolRegistry`.
2. Scripts entram no roadmap como D-024 (Fase 6+, via
   `ScriptRuntimePlugin` que se instala como qualquer outro plugin).

**O que foi entregue (Bloco 5a)**

Estrutura unificada para plugins de qualquer categoria. `ToolRegistry`
(Bloco 5b) e futuros `OptimizerRegistry`/`ImporterRegistry`/
`ExporterRegistry` (Fase 5) plugam SEM mudar a infra.

**Estrutura nova** (`svg-engine/edit/src/lib/plugin/`):

- `plugin.ts`:
  - `EditorPlugin` interface: `id`, `name`, `version`, `apiVersion`,
    `dependencies?`, `install(ctx)`, `uninstall?(ctx)`.
  - `PluginContext`: `pluginId`, `injector`, `track<T extends Disposable>(d)`.
    Injector é exposto cru — capability registries (Tool, Optimizer,
    etc.) são pegas via `ctx.injector.get(...)`. Sem façade método-por-
    método (cresceria a cada nova categoria); sandboxes/scripts vão
    construir suas próprias APIs curated por cima.
  - `Disposable { dispose() }`: contrato uniforme de cleanup.
  - `PLUGIN_API_VERSION = '1.0.0'` constante.
  - `InstalledPlugin`: snapshot read-only (plugin + installedAt).
- `plugin-registry.service.ts`:
  - `install(plugin)`: valida id (não vazio + único), semver major
    contra `PLUGIN_API_VERSION`, deps presentes. Cria `PluginContext`
    com `track` que coleta disposables. Chama `install(ctx)`. Erros
    em install() rollbackam (dispõe os já trackeados).
  - `uninstall(id)`: idempotent (false se id não existe). Sequência:
    1. hook `uninstall(ctx)` se existir (errors caught + log; não
       abortam cleanup); 2) dispose LIFO (errors per-disposable caught +
       log); 3) remove entry. Errors em qualquer ponto NÃO impedem o
       resto do cleanup.
  - `installed` signal reativo (UI panel pode subscribe).
  - `has`/`get`/`list` para introspection.
- `provide-plugin.ts`:
  - `provideSvgEnginePlugin(plugin): EnvironmentProviders` via
    `ENVIRONMENT_INITIALIZER` (multi:true). Múltiplos providers
    instalam na ordem de declaração — natural p/ deps.

**Decisões técnicas**

- **Errors em install = throw, não Result**: install é configuration
  error (deveria detectar em build/boot), não user action. Compare com
  `CommandBus.dispatch` que retorna `Result` porque user actions
  falham recuperavelmente.
- **PluginContext.injector cru**: capability registries crescem (Tool,
  Optimizer, Importer, Exporter, Inspector, Effect, Palette, Menu,
  Shortcut, ScriptRuntime, ...). Façade método-por-método obrigaria
  editar core a cada nova categoria. Sandbox de scripts será camada
  por cima (não substitui a infra).
- **`track()` opt-in**: plugin pode optar por gerenciar disposables
  manualmente (caso raro). Helper retorna o próprio `d` para
  chainability: `ctx.track(reg.register(x))`.
- **LIFO disposal**: simétrico a teardown de DI; convenção universal
  para resource cleanup.
- **Semver major-only check**: minor/patch são compat por contrato
  semver. Major mismatch = breakage real.
- **Sem auto-uninstall em DI teardown**: aplicações Angular criam um
  injector e mantém pela vida da SPA. Hot-reload de plugins é o caso
  raro; uso comum é install no bootstrap, viver até o app fechar.
- **Sem priority/order de execução** (por enquanto): contributions
  rodam em ordem de install (que = ordem de declaração no providers).
  Quando precisarem de ordering explícito (ex.: optimizer pipelines),
  adiciona-se `priority?: number` na contribution-side, não no plugin.

**Cobertura**

- `plugin-registry.service.spec.ts`: 16 testes
  - install: empty id rejeitado; duplicate id throws; semver mismatch
    throws; minor/patch OK; missing dep throws; ordem deps respeitada;
    rollback LIFO em install() throw.
  - uninstall: idempotent (false em id inexistente); hook + LIFO
    disposal; hook throwing não bloqueia disposable cleanup;
    disposable throwing não bloqueia outros disposables.
  - signal reativo: install/uninstall atualiza `installed()`.
  - PluginContext: passa pluginId/injector/track corretos; track
    chainable (retorna o próprio d).
- `provide-plugin.spec.ts`: 2 testes
  - install via ENVIRONMENT_INITIALIZER no TestBed.
  - múltiplos providers respeitam ordem de declaração (deps OK).
- **Total**: +18 testes → 309 passando em 29 arquivos. Zero regressão.

**Próximo (5b)**: `Tool` interface, `ToolRegistry` (built ON the
scaffolding — registra como plugin, não service global solto),
`ToolHostService` (tool ativa + roteamento), `PencilTool` plugin de
referência, `selectTool` builtin (comportamento atual = tool explícita).

**Próximo (5c)**: D-020 expandido + novo D-023 (roadmap de 9 tipos de
plugin) + D-024 pendente (`ScriptRuntimePlugin` Fase 6+, com sandbox
WebWorker isolado e API curated).

---

## 2026-05-15 — Fase 3 Bloco 4c: Alinhamento + distribuição

**O que foi entregue**

6 alinhamentos (left/center-x/right/top/center-y/bottom) + 2
distribuições (horizontal/vertical centers) operando em multi-seleção.
Cada operação dispara **um único** `TranslateManyCommand` — undo
limpo (1 entrada por clique de toolbar, restaura todos os nós).

**Estrutura nova no core** (`svg-engine/core/src/lib/commands/`):

- `TranslateManyCommand(translations: Map<NodeId, Point>, label?)`:
  - Translada N nós por deltas individuais em uma transação.
  - Construtor valida: throw `RangeError` se algum delta é não-finito.
  - Execute em 2 passes: 1) valida que todos os ids existem (atomicidade
    — falha sem aplicar nada se 1 sumir); 2) aplica + captura
    `previousTransforms` para undo.
  - Empty map = no-op success (caller pode construir command otimista).
  - Undo restaura todos; nó deletado entre execute/undo é silenciosamente
    pulado (best-effort).
  - 8 testes Vitest cobrindo execute/undo round-trip + atomicidade +
    rejeição de NaN/Infinity + label custom.

**Estrutura nova no edit** (`svg-engine/edit/src/lib/alignment/`):

- `alignment-math.ts` (puro):
  - `computeAlignDeltas(items, axis)`: anchor = union bbox (Affinity/
    Figma default). Omite zero-deltas (já alinhados) — undo limpo
    de verdade, sem entries no-op no histórico.
  - `computeDistributeDeltas(items, axis)`: sort por center na axis,
    espaça inner items entre leftmost-center e rightmost-center.
    Edge items mantêm posição. Requer ≥3 nós; degenerado
    (leftmost == rightmost) retorna empty map.
  - `unionBBox(items)` exportado para overlays futuros (ex.: anchor
    visual durante hover do botão).
  - 12 testes (alinhamento em cada axis + zero-deltas + distribute
    com 3/4 itens + degenerados + sem mutação do array de input).
- `alignment.service.ts`:
  - `AlignmentService.align(items, axis)` / `.distribute(items, axis)`:
    chama o math puro, dispara `TranslateManyCommand` se `deltas.size > 0`.
    Retorna `boolean` (true = dispatched, false = no-op).
  - 9 testes (align/distribute com state real + undo via CommandBus).

**Wire no playground**:

- 2 fieldsets novos na toolbar:
  - **Align (X sel)** com 6 botões (⫷ ⫶ ⫸ · ⊤ ─ ⊥), disabled quando
    seleção <2.
  - **Distribute** com 2 botões (↔ ↕), disabled quando seleção <3.
- `collectSelectionBBoxes()` lê via `getRenderedNodeBBox` cada nó
  selecionado e monta `NodeBBox[]` para o service.
- Computeds `canAlign`/`canDistribute` reagem ao `selection.count()`
  para ativar/desativar botões automaticamente.

**Decisões técnicas**

- `TranslateManyCommand` no core (não no edit): é uma op pura sobre o
  modelo, reusável por qualquer feature futura ("nudge selection",
  "duplicate offset", paste-with-position-shift, etc.). O fato de ser
  usada por alinhamento agora é circunstancial.
- Atomicidade no execute (validar antes de aplicar) > apply-as-far-as-
  possible. Undo de uma op parcial seria confuso.
- Math puro separado do service: o service é Angular (DI, dispatch),
  o math é zero-deps. Permite testar lógica isolada e reusar
  fora do contexto Angular se necessário.
- Anchor de center alignment = union bbox (Affinity/Figma). Illustrator's
  "Align to Key Object" mode é uma extensão futura simples (parâmetro
  opcional no `computeAlignDeltas`).
- Distribute = "centers" (não "equal gaps"). Affinity expõe ambos;
  ship o mais usado primeiro.
- Service retorna boolean para consumers atualizarem UI ("nada mudou,
  toast de feedback?"). No playground por ora não é usado — toolbar
  desabilitada já cobre 99% dos casos.

**Cobertura**

- `translate-many.spec.ts`: 8 testes
- `alignment-math.spec.ts`: 12 testes
- `alignment.service.spec.ts`: 9 testes
- **Total**: +29 testes → 291 passando em 27 arquivos. Zero regressão.

**Bloco 4 completo** (4a marquee + 4b snap + 4c align/distribute).
Próximo: Bloco 5 (`ToolRegistry` D-020 plugin extensibility).

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
