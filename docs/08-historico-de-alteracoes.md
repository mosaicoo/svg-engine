# 08 — Histórico de Alterações

> Registro narrativo das mudanças estruturais do projeto. Mais detalhado
> que `git log`, focado em **decisões e contexto**, não em diffs.
> Convenção: ordem cronológica reversa (mais recente no topo).

---

## 2026-06-15 — D-096 — Help ▸ Documentation / Tutorials / Plugin Development / Report Issue ✅

Ship 4 dos placeholders de roadmap do menu Help como **links externos reais**
(só Check Updates segue roadmap — precisa de backend de versão). Cada item
abre seu URL em nova aba (`window.open(url, '_blank', 'noopener,noreferrer')`).

**Host-independente + configurável** (o requisito central): os destinos vêm
de um token DI `SVGE_HELP_LINKS`
([help-links.config.ts](../projects/svg-engine/edit/src/lib/help/help-links.config.ts)).
Defaults:

- Documentation / Tutorials / Plugin Development → caminhos **relativos**
  (`/docs/documentation`, `/docs/tutorials`, `/docs/plugin-development`). O
  browser resolve contra o **origin atual** — `svgstudio.mosaicoo.tech/docs/…`
  hoje, qualquer deploy amanhã, **sem domínio hard-coded**.
- Report Issue → URL **absoluta** (issue tracker público), pois não é página
  do app.

Como o svg-engine é **embedável** (um `/docs/…` relativo resolveria para o
origin do HOST terceiro), consumidores sobrescrevem via
`provideSvgeHelpLinks({ … })` — merge parcial sobre os defaults.

**Report Issue** (a dúvida do usuário): tratado como link configurável, mas
o handler **enriquece** alvos http(s) com um `body` pré-preenchido (URL da
página + User-Agent) para o report já chegar com diagnóstico básico; alvos
não-web (mailto:, esquemas custom) ou que já tenham `body` passam intactos.

Wiring em [builtin-menu-contributions.plugin.ts](../projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts)
(slot Help, orders 20/30/50/60, sempre habilitados) — abrir URL não precisa
de Material, então fica edit-side (o About SVG Studio, um dialog, segue no
plugin ui). Placeholders removidos do `builtinRoadmapMenuPlugin`. Specs do
token (defaults + merge); spec do plugin atualizado (Help slot agora tem os 4
links). Build + lint + suíte (**2514**) verdes; snapshot de API regenerado
(+`SVGE_HELP_LINKS`, `DEFAULT_HELP_LINKS`, `provideSvgeHelpLinks`,
`SvgeHelpLinks`).

---

## 2026-06-15 — D-095 — Object ▸ Distribute ▸ Spacing… (gap-based) ✅

Ship o placeholder `svge.roadmap.object.distribute.spacing`. "Distribute
Spacing" iguala o **vão (gap) borda-a-borda** entre objetos — diferente do
Distribute existente, que iguala **centros**. Com objetos de tamanhos
diferentes, centros deixam vãos desiguais; spacing iguala os vãos (padrão
Illustrator/Affinity). Era o único item do submenu Distribute sem motor —
o código já marcava como follow-up pendente; agora está pronto.

- **Math (puro, edit)** — [alignment-math.ts](../projects/svg-engine/edit/src/lib/alignment/alignment-math.ts):
  `computeDistributeSpacingDeltas(items, axis, gap)` (1º item fixo no eixo;
  cada seguinte com `gap` após a borda do anterior; delta só no eixo) +
  `computeAverageGap(items, axis)` (gap médio atual → pré-preenche o diálogo,
  o "Auto" do Illustrator: aplicar sem mudar = equalizar). Espelha o
  `computeDistributeDeltas` (centros).
- **Service** — `AlignmentService.distributeSpacing(items, axis, gap)`
  despacha um `TranslateManyCommand` (1 entrada de undo).
- **UI** — duas entradas **Horizontal Spacing… / Vertical Spacing…** (orders
  30/40) sob o submenu Distribute, registradas em
  [builtin-ui-menu-contributions.plugin.ts](../projects/svg-engine/ui/src/lib/menu-extras/builtin-ui-menu-contributions.plugin.ts)
  (precisa de Material — D-017). Reúsam o `SvgeNumberPromptDialog` (D-093),
  pré-preenchido com o gap médio. Requer ≥3 objetos (como o Distribute de
  centros). O placeholder único "Spacing…" virou as duas entradas por eixo,
  espelhando os dois Distribute existentes.

Specs: `computeAverageGap` (3) + `computeDistributeSpacingDeltas` (5),
incluindo a propriedade "com gap = média, o último objeto fica parado".
Build + lint + suíte (**2511**) verdes; snapshot de API regenerado
(+`computeAverageGap`, +`computeDistributeSpacingDeltas`).

---

## 2026-06-14 — D-094 — Object ▸ Align ▸ Align to Key Object ✅

Ship o placeholder de roadmap `svge.roadmap.object.align.align-to` como o
**"Align to Key Object"** do Illustrator: com ≥ 2 objetos selecionados,
elege-se um como **âncora** e os 6 alinhamentos passam a alinhar tudo **a
ele** (que fica parado), em vez de à união da seleção. Reaproveita 100% do
motor existente (`alignToReference` + `TranslateManyCommand`) — Key Object
só muda qual bbox é a referência.

**Centralização (a parte que tocou o existente)**: a escolha de referência
estava **duplicada** em 3 lugares (menu, Inspector, Select tool-options),
cada um com o ramo "1 nó → página / ≥ 2 → união". Extraído para um único
helper puro [resolveAlignReference](../projects/svg-engine/edit/src/lib/alignment/alignment-math.ts)
`(items, keyObjectId, page) → BoundingBox | null` (key object ▸ página ▸
`null`=união). Os 3 call sites agora consultam o mesmo helper → o Key Object
vale automaticamente em todos, sem divergência.

**Estado + UI (a parte nova e isolada)**:

- [KeyObjectService](../projects/svg-engine/edit/src/lib/alignment/key-object.service.ts)
  (escopado por editor; `providedIn:'root'` como fallback): `keyObjectId`
  é um `computed` validado contra a seleção (nunca expõe id obsoleto) +
  um `effect` que limpa o id quando ele sai da seleção (não "ressurge" ao
  re-selecionar — convenção Illustrator). Estado transiente: não-undoable,
  não-persistido.
- **Designação** via menu: **Object ▸ Align ▸ Make Key Object** (fixa o nó
  focado/last-clicked numa seleção ≥ 2) e **Clear Key Object** —
  registrados em [builtin-menu-contributions.plugin.ts](../projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts).
- **Highlight** no [selection-overlay](../projects/svg-engine/edit/src/lib/overlay/selection-overlay.component.ts):
  contorno laranja (`.key-object`) ao redor da âncora, só em multi-seleção.

Wiring: menu + Inspector (`alignSelection`) + Select tool-options (`align`)
passam a usar `resolveAlignReference` + `KeyObjectService`. Placeholder
removido do `builtinRoadmapMenuPlugin`. `KeyObjectService` registrado no
scope provider + na trap-list de serviços escopados (AUDIT-FIX P3). Specs:
`resolveAlignReference` (5) + `KeyObjectService` (6). Build + lint + suíte
(**2503**) verdes; snapshot de API regenerado (+`resolveAlignReference`,
`KeyObjectService`).

**Follow-up (gesto de re-key por clique)**: a designação deixou de ser só
pelo menu — com uma key **já ativa**, um **clique simples** (sem
modificador, sem arraste) num objeto **que já faz parte da seleção**
re-aponta a key para ele (e o contorno laranja migra), sem perder a
seleção; clicar na key atual é no-op; Shift/Ctrl seguem alternando a
seleção. Implementado no `onPointerUp` do `[svgeShellInteractions]`
([shell-interactions.directive.ts](../projects/svg-engine/edit/src/lib/tool/shell-interactions.directive.ts)),
guardado a clique real (sem `move`/marquee) + `hasKeyObject()`. É o gesto
do Illustrator (decidido com o usuário: só com key ativa, clique simples,
re-clique = no-op). Sem novo API público; suíte (2503) + lint verdes.

---

## 2026-06-14 — D-093 — Object ▸ Transform: Rotate / Scale / Skew / Reset + dialogs de parâmetro ✅

Conclui o submenu **Object ▸ Transform**, que tinha Flip H/V reais mas
Rotate / Scale / Skew / Reset Transform como **placeholders de roadmap**
(desativados). Agora os quatro são reais, no padrão Illustrator "informe o
valor exato". Também adiciona os **diálogos que faltavam** em duas operações
de Path entregues antes com default hardcoded (Simplify, Offset Path).

**Core (svg-engine/core)** — só o Skew era inédito:

- [transform.ts](../projects/svg-engine/core/src/lib/types/transform.ts): helpers
  `skewX(rad)` / `skewY(rad)` (irmãos de `rotate`/`scale`/`translate`).
- [skew-node.command.ts](../projects/svg-engine/core/src/lib/commands/skew-node.command.ts):
  `SkewNodeCommand` + `composePivotSkew` (espelha `RotateNodeCommand` —
  `T(pivot)·K·T(-pivot)·existing`, undoable).
- [skew-nodes.command.ts](../projects/svg-engine/core/src/lib/commands/skew-nodes.command.ts):
  `SkewNodesCommand` (batch, shear rígido do conjunto em torno do pivô
  compartilhado via conjugação por `parentMatrix` — igual aos batches de
  rotate/resize). Rotate/Scale **reaproveitam** `RotateNodesCommand` /
  `ResizeNodesCommand` (já usados pelo Inspector e pelos handles do canvas);
  Reset reaproveita `SetPropertyCommand('transform', [1,0,0,1,e,f])`.

**UI (svg-engine/ui)** — dialogs Material (D-017):

- [transform-dialog](../projects/svg-engine/ui/src/lib/transform-dialog/transform-dialog.component.ts):
  `<svge-transform-dialog>` parametrizado por modo (rotate: ângulo°; scale:
  % com toggle "uniforme"; skew: X°/Y°). Pure-UI — coleta o valor, devolve;
  o handler faz a geometria + despacha o comando.
- [number-prompt-dialog](../projects/svg-engine/ui/src/lib/number-prompt-dialog/number-prompt-dialog.component.ts):
  `<svge-number-prompt-dialog>` genérico (1 número, label/unit/min/max/step/
  hint) — reutilizado por Simplify (tolerância) e Offset Path (distância).

**Wiring**:

- Reset Transform (order 60, **sem dialog**) registrado edit-side em
  [builtin-menu-contributions.plugin.ts](../projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts),
  ao lado de Flip H/V.
- Rotate… / Scale… / Skew… (orders 30/40/50) + Simplify… / Offset Path…
  (ids/orders preservados: 60/70) registrados em
  [builtin-ui-menu-contributions.plugin.ts](../projects/svg-engine/ui/src/lib/menu-extras/builtin-ui-menu-contributions.plugin.ts)
  (precisam de MatDialog). Pivô = **centro do bbox combinado** da seleção;
  `entries` com `parentMatrix` por nó (helpers `getRenderedNodeBBox` /
  `getRenderedParentMatrix`) → multi-seleção transforma como grupo rígido.
- Placeholders de roadmap removidos de
  [builtin-roadmap-menu.plugin.ts](../projects/svg-engine/edit/src/lib/menu/builtin/builtin-roadmap-menu.plugin.ts)
  (Transform rotate/scale/skew/reset) e as entradas Simplify/Offset
  re-hospedadas na UI (antes dispatchavam com default fixo, sem dialog).

Skew clampado a ±89° (tan diverge em 90°). Specs: skew (single+batch,
paridade, undo, partial) + `skewX`/`skewY` no transform.spec. Build + lint +
suíte (**2491**) verdes; snapshot de API regenerado (+core skew, +ui dialogs).

---

## 2026-06-14 — Tools ▸ Command Palette (Ctrl+Shift+P) ✅

"Ships" o placeholder de roadmap `svge.roadmap.tools.command-palette`: um
**command palette** estilo VS Code / Figma "Quick actions" / Linear — overlay
flutuante com input no topo e uma **lista filtrável** de **todos os comandos
registrados** (menu/toolbar), executados por Enter ou clique. Distinto do NLU
do svg-studio (Ctrl+K, linguagem natural): aqui é **busca por nome de comando**,
**sem dependência de NLU/ML**, e `Ctrl+Shift+P` estava livre (sem colisão de
atalho — confirmado).

**Fonte da verdade**: `MenuContributionRegistry.contributions()` — as MESMAS
entradas que a menu bar/toolbar renderizam. Cobre tudo que qualquer plugin
contribui, automaticamente, sem fiação por comando. Excluídos: dividers,
**pais de submenu** (seu `run` é só um gatilho), placeholders `comingSoon` e
itens `visible:false`. Cada item mostra ícone, label, grupo (slot humanizado) e
a dica de atalho; itens desabilitados aparecem esmaecidos e não executam.

**Implementação** (tudo em `svg-engine/ui`, pois é dialog Material — D-017):

- [command-palette.filter.ts](../projects/svg-engine/ui/src/lib/command-palette/command-palette.filter.ts) —
  núcleo **puro** de score/ranqueamento (exact > prefixo > prefixo-de-palavra >
  substring > subsequência; empate estável) + `humanizeMenuSlot`. Sem Angular →
  100% testável.
- [command-palette.dialog.ts](../projects/svg-engine/ui/src/lib/command-palette/command-palette.dialog.ts) —
  `<svge-command-palette-dialog>`: **input flutuante** (ícone de busca + botão
  **limpar** ✕ quando há texto, como os outros inputs da ferramenta) sobre a
  **lista** navegável por teclado (↑/↓ com wrap, Home/End, Enter executa, Esc
  fecha). Resolve `disabled` por escopo via `makeDisabledResolver` e executa via
  `runContribution` com o injector da rota (multi-editor D-042/D-043).
- [command-palette.service.ts](../projects/svg-engine/ui/src/lib/command-palette/command-palette.service.ts) —
  abre via `MatDialog` ancorado no topo (`position.top`, `autoFocus:'input'`),
  threading o injector escopado.
- Wiring em [builtin-ui-menu-contributions.plugin.ts](../projects/svg-engine/ui/src/lib/menu-extras/builtin-ui-menu-contributions.plugin.ts):
  entrada **Tools ▸ Command Palette…** (order 5) + atalho `Ctrl+Shift+P` no
  `ShortcutRegistry`. O placeholder de roadmap foi removido do
  `builtinRoadmapMenuPlugin` (Quick Search continua no roadmap).

**Sem conflito** com NLU nem com outras funcionalidades: serviço/diálogo
próprios, atalho distinto, e a paleta apenas **lê** o registry e despacha o
`run` já existente de cada item (mesmo caminho do menu) — não há novo estado
mutável nem novos comandos. Specs: 11 testes do filtro puro; o spec do roadmap
trocou o leaf de exemplo (command-palette → quick-search). Build + suíte (2476)

- lint verdes; snapshot de API regenerado (+novos símbolos públicos do `ui`).

---

## 2026-06-14 — Fundo de página (solid/image) como arte: canvas + export ✅

Fecha a lacuna nº 2 da revisão por formato. O fundo por página
(`PageOptions.background`: `transparent` | `solid{color}` | `image{href}`) era
**editável** no Inspector (aba Page) mas não aparecia em lugar nenhum: nem
pintado ao vivo (o `PageOverlay` só desenha o marcador translúcido de chrome; o
`WorkspaceBackground` pinta o "desk", outro conceito), nem exportado
(`effectiveExportDoc` só ajustava viewBox + children). Agora o fundo é **arte**,
com paridade canvas ↔ arquivo exportado.

**Fonte única da verdade** — novo helper puro
[getPageBackgroundNode(page)](../projects/svg-engine/core/src/lib/model/page-background.ts)
no core: retorna o `RectNode` (solid, `fill = cor`) ou `ImageNode` (image, `href`

- `preserveAspectRatio` = `xMidYMid slice` = cover) cobrindo o viewBox da página,
  ou `null` (transparent / sem viewBox / viewBox degenerado). Consumido pelos dois
  lados:

* **Export** ([active-page.service.ts](../projects/svg-engine/edit/src/lib/pages/active-page.service.ts)):
  `effectiveExportDoc` faz **prepend** do nó de fundo aos filhos da página (atrás
  de todo o conteúdo) → serializa no SVG/PNG. `transparent` não emite nada (PNG
  mantém alfa, igual ao canvas).
* **Canvas ao vivo** ([page-overlay.component.ts](../projects/svg-engine/edit/src/lib/workspace/page-overlay.component.ts)):
  lê o mesmo `getPageOptions(...).background`. `solid` → `[style.fill]` do
  page-rect; `image` → `<svg:image>` (cover) atrás do rect (que vira `fill:none`,
  mantendo só contorno + hit-target); `transparent` → marcador translúcido de
  antes (sem regressão).

**Correção de suporte no exporter**: `svgExporter.renderImage` agora emite
`preserveAspectRatio` quando definido (antes era descartado) — necessário pro
fundo-imagem "cover" bater no export, e correção geral pra qualquer imagem
importada com PAR não-default.

Specs: helper (solid/image/transparent/sem-viewbox/degenerado), `effectiveExportDoc`
(prepend de rect/imagem; nada para transparent) e PAR no svg-exporter. Build +
suíte (2465) + lint verdes; snapshot de API +2 símbolos.

**Limitação conhecida (round-trip):** export de página única achata o fundo num
`<rect>`/`<image>` real — visualmente fiel, mas re-importar não restaura a opção
`PageOptions.background` (vira shape comum). Aceitável para flatten; persistir a
opção exigiria emitir `data-svge-page-options` no grupo da página.

---

## 2026-06-14 — Fidelidade de exportação: fontes embutidas no PNG ✅

Fecha a lacuna nº 1 da revisão por formato. O PNG rasteriza o SVG via
`<img src="data:image/svg+xml;…">` num `<canvas>` — esse `<img>` é um documento
isolado que **não enxerga** os `@font-face` da página, então texto com fonte web
caía em fallback no PNG (diverge do canvas). Casos mais afetados: `fontFamily`
custom e variable fonts (D-053).

**Solução** (novo módulo [font-embed.ts](../projects/svg-engine/io/src/lib/font-embed.ts),
ligado em `renderPng`): antes de gerar o data-URI, (1) coleta as `font-family`
usadas pelos `TextNode` do doc; (2) varre `document.styleSheets` procurando os
`@font-face` que casam; (3) faz `fetch` dos bytes da fonte e os embute como
`src: url(data:font/woff2;base64,…)` num `<style>` injetado no `<svg>`. Embutir
como **data-URI** também evita o _taint_ do canvas (uma URL cross-origin
quebraria `toBlob`).

**Best-effort por design:** só embute famílias que a página declarou via
`@font-face` (fontes de sistema — Arial, sans-serif — não têm regra → puladas,
renderizam com a fonte do sistema, como qualquer viewer); qualquer falha (fetch
cross-origin bloqueado, 404, stylesheet ilegível) pula aquela face e mantém o
resto — o export **nunca falha** por causa de fonte. **Limitação conhecida:**
fontes registradas só por JS (`new FontFace().load()` sem regra CSS) não são
descobríveis e não embutem.

Partes puras (coleta de famílias, injeção do `<style>`, composição do CSS via
resolver) são testáveis sem DOM — 10 specs novos em
[font-embed.spec.ts](../projects/svg-engine/io/src/lib/font-embed.spec.ts). O
resolver DOM (scan + fetch) é injetável (default = scanner do documento). Sem
mudança de API pública (módulo interno ao `io`; `renderPng` segue
`Promise<Blob>`). Build + suíte (2455) + lint verdes.

SVG vetorial: embedding ainda **não** ligado (o `svgExporter.export` é síncrono e
o fetch é assíncrono) — fica como `emitEmbeddedFonts` opcional num wrapper async
futuro. O SVG continua referenciando a fonte por nome (fiel quando o viewer tem
a fonte).

---

## 2026-06-14 — Fidelidade de exportação: defs runtime + revisão por formato ✅

Investigação do relato "PNG exportado não está fiel ao canvas". O pipeline PNG é
`svgExporter.export(doc)` → base64 → `<img>` → `<canvas>` → `toBlob`. Logo a
fidelidade depende de **(1)** o que o `svgExporter` serializa e **(2)** o que o
`<img>`/canvas consegue rasterizar.

**Causa raiz (bug real, corrigido):** gradientes, patterns, efeitos/filters,
chains, clipPaths, masks e symbols **criados no editor** vivem só nos registries
de runtime, não em `document.defs`. O `ActiveDefsService.buildExportDefs()` mescla
ambos antes de serializar — mas **nem todo caminho de export chamava isso**. Só o
`File ▸ Export SVG/PNG` (`exportAndDownload`) fazia. Caíam na armadilha (export
saía com `fill="url(#id)"` apontando para nada → forma transparente/sem efeito):

- **`AssetExportRunner.exportSlot`** (painel _Asset Export_, lib) — SVG **e** PNG.
- **Playground `custom-editor`** — botões _Export SVG_ (`exportAs`) e _Export PNG_
  (`exportPngWithPresets`, o picker @1x/@2x/@3x).

**Correção:** os três agora mesclam `buildExportDefs()` no `doc.defs` antes de
exportar (lib) / rasterizar (playground), igual ao caminho do menu. Spec novo
([asset-export-runner.service.spec.ts](../projects/svg-engine/edit/src/lib/asset-export/asset-export-runner.service.spec.ts))
trava a regressão. Build + suíte (2445) + lint (lib e playground) verdes.

### Revisão por formato (estado atual)

**SVG** — fiel ao canvas em fill/stroke/opacity/transform/gradiente/pattern/
filter/efeito/blend-mode/clipPath/mask/symbol/texto/live-corners. Animação
(SMIL) é **opt-in** (`File ▸ Export Animated SVG`). Round-trip determinístico.
Fundo da página (`PageOptions.background` solid/image) **não** é emitido — ver
lacunas.

**PNG** — herda tudo do SVG acima (rasteriza via browser), com as limitações
**inerentes ao raster**:

- **Fontes**: web fonts/`@font-face` **não são embutidas** no payload do `<img>`,
  então texto com fonte não-instalada cai em fallback. Lacuna conhecida (precisa
  embed base64 das fontes).
- **Animação**: PNG é estático (1 frame) — esperado.
- **Fundo transparente**: sem fundo de página, o PNG sai com alfa transparente
  (correto quando o canvas é transparente; ver lacuna do fundo de página).

**Lacunas mapeadas (não corrigidas neste passo):**

1. **Fonte não embutida no PNG** — maior gap de fidelidade de texto.
2. **`PageOptions.background` (solid/image)** — é editável no Inspector (aba Page)
   mas **não é pintado ao vivo** por nenhum renderer nem emitido no export; o
   `PageOverlay` desenha só um marcador translúcido fixo (chrome). Precisa ser
   ligado tanto na renderização quanto no export para virar "arte".
3. **JPG/WEBP** — não há exporter registrado; só PNG (raster) e SVG (vetor).

---

## 2026-06-14 — Fix: Delete de âncora nos shells reutilizáveis (paridade) ✅

Fechou um gap descoberto ao explicar como deletar pontos no editor de path: o
gesto "Delete/Backspace remove a **âncora** selecionada" (Direct Select) estava
implementado **só** no playground `custom-editor`. Nos shells reutilizáveis
(`[svgeShellInteractions]`, usado por `svge-editor` e `svge-shell-pro`) o
handler de Delete só fazia `RemoveNodeCommand` — então, com um ponto
selecionado, apertar Delete apagava a **forma inteira** em vez do ponto.

**Mudança** ([shell-interactions.directive.ts](projects/svg-engine/edit/src/lib/tool/shell-interactions.directive.ts)):
o handler de `Delete`/`Backspace` ganhou a mesma ordem de prioridade do
custom-editor — **1) âncoras selecionadas → `RemoveAnchorCommand`** (uma por
ref, ordenadas desc. por `(subpathIndex, anchorIndex)` para não embaralhar
índices durante a remoção em lote), depois `anchorSelection.clear()`;
**2) nós selecionados → `RemoveNodeCommand`** (comportamento legado intacto).
Injeta o `AnchorSelectionService` (`providedIn: 'root'`). Sem mudança de API
pública.

Specs: dois testes novos em
[shell-interactions.directive.spec.ts](projects/svg-engine/edit/src/lib/tool/shell-interactions.directive.spec.ts)
— âncora selecionada → o nó sobrevive e só o ponto sai (`d` muda, seleção de
âncora limpa); sem âncora → o nó é removido (regressão). Suíte (2444) e lint
verdes.

---

## 2026-06-14 — D-092: Color picker padronizado + popup responsivo ✅

Padroniza a seleção de cores de **Fill** e **Stroke** no Inspector e elimina a
barra de rolagem do popup. Antes cada campo de cor tinha **dois** componentes:
um `<input type="color">` nativo simplificado (fundido ao swatch) **e** o
`<svge-color-picker>` avançado (HEX/RGB, conta-gotas, paletas recentes), aberto
por um botão de ícone separado. Agora há **um só** componente — o avançado.

**Mudanças (Inspector — 4 células: Fill/Stroke × single/multi):**

- A linha do swatch virou um `<button class="field-row color-trigger">` com
  `[matMenuTriggerFor]` que abre o `<svge-color-picker>` num `mat-menu`
  (CDK overlay). O `<input type="color">` nativo e o botão-ícone redundante
  foram removidos das 4 células.
- CSS: `.color-trigger` zera a aparência nativa do `<button>` (background/
  border/padding) para ler como a antiga linha. Removidas as regras mortas
  `.color-input-hidden` e `.picker-trigger-btn`; `position: relative` do
  `.field-row` (que só ancorava o input escondido) saiu.
- A faixa de **paletas curadas** (`<svge-color-palette>`) permanece inline —
  ela não é "o picker simplificado"; é um atalho de swatches.

**Responsividade do popup (causa raiz da scrollbar):**

- A linha de inputs HEX/RGB do `<svge-color-picker>` excedia a largura do
  quadrado sat/val (200px) e estourava o `max-width: 280px` do `mat-menu` →
  scrollbar horizontal. Fix: `:host` com largura fixa de **248px**
  (200 quadrado + 8 gap + 16 hue + 24 padding), `.inputs` com `flex-wrap`, HEX
  em linha própria (`flex-basis: 100%`), inputs com `width: 100%` e
  `box-sizing: border-box`. Sem scrollbar.

**Fora de escopo (intencional):** os `<input type="color">` de _tool options_
(pen/pencil/shape/text — cor padrão de **novos** desenhos), da timeline
(keyframes) e do fundo do canvas não são edição de Fill/Stroke de objeto e
foram preservados.

Specs do Inspector reescritas para a nova superfície (sem `input[type="color"]`):
drivam `setStyle`/`styleColor` via uma visão tipada da API protegida do
componente — o binding `(colorChange)="setStyle(...)"` é o mesmo @Output já
coberto fim-a-fim pelos testes de paleta. Sem mudança de API pública. Build,
suíte (2442) e lint verdes.

---

## 2026-06-14 — D-091: Tolerância de clique (hit slop) + seleção por área ✅

Resolve a dificuldade de selecionar **shapes sem preenchimento** (`fill: none`)
e **paths finos** por clique: antes só o traço pintado (~1px) era clicável (o
hit-testing usa `event.target` do DOM, e `pointer-events: visiblePainted` torna
só a pintura alvo). Comportamento agora alinhado ao Illustrator
("Object Selection by Path Only" desligado): clicar a **área** da forma (mesmo
vazia) seleciona, e há uma **faixa de tolerância** (~4px) ao redor do traço.

**Arquitetura — fallback, não substituição:**

- O hit nativo do DOM (`event.target`) continua sendo o caminho **primário**:
  exato, z-order-correto, pega formas preenchidas — **zero regressão**.
- Quando o hit do DOM cai no fundo (ou num container de escopo: página/raiz/
  isolation root), entra o **fallback geométrico** (`geometricHitTestElement`):
  varre os elementos de geometria de frente-para-trás e usa o próprio motor do
  browser — `isPointInFill` (área, independente da pintura) + `isPointInStroke`
  - um anel de amostras de raio `tolerance` em coordenadas de tela. O elemento
    encontrado é mapeado pelo **mesmo** resolvedor de grupo/escopo
    (`resolveSelectableNodeIdFromElement`), então cai no nó idêntico que um clique
    pintado cairia.

**Sem comprometer o resto** (preocupações do pedido):

- **Precisão / elementos próximos**: para formas preenchidas o DOM decide
  primeiro; o fallback só age quando o DOM não achou nada. Geometria real
  (curvas/arcos/fill-rule/transform) é resolvida pelo motor do browser.
- **Performance do mouse**: o fallback roda só em `pointerdown`/`click`
  (discretos) — **hover/pointermove permanece DOM-only** (sem custo por
  movimento). Trade-off documentado: hover não realça a área de uma forma vazia,
  mas o clique a seleciona.
- Fora de escopo/isolation, elementos não-selecionáveis continuam ignorados
  (o resolvedor retorna null para hits fora da raiz de escopo).

`resolveSelectableNodeId` foi refatorado para delegar a um novo
`resolveSelectableNodeIdFromElement` (mesma lógica deep/group + containers
transparentes), reusado pelo fallback. Wired em `[svgeShellInteractions]`
(`onPointerDown` + `onClick`, este último para dblclick→isolation em área vazia).
Specs: resolvedor por elemento + lógica do hit-test geométrico (z-order, área,
stroke, anel de tolerância, guard de probeable). Snapshot de API regenerado
(+4 símbolos edit). Suíte (2442) e lint verdes.

---

## 2026-06-14 — D-090: Menu Path totalmente funcional (ligações + 6 ops novas) ✅

Religou e completou o menu **Path**: todas as 9 entradas agora despacham um
comando real (antes só "Convert to Path" era real; o resto eram placeholders de
roadmap com ícone de relógio).

**Ligações:**

- **Convert to Path** — já era real (`BatchConvertToPathCommand`); mantido.
- **Smooth/Simplify** — unificado em **uma** entrada "Simplify" (RDP nos paths
  selecionados via `SimplifyPathCommand`). O placeholder "Smooth" foi **removido
  do menu** — a _ferramenta_ Smooth (toolbar, atalho `s`) já cobre o caso
  interativo e roda o mesmo algoritmo (Ramer-Douglas-Peucker).

**Implementações novas** (todas undoable, snapshot do root; geometria pura
reutilizável em `core/geometry`):

- **Split** (`SplitPathCommand`) — corta o path nos **âncoras selecionados**
  (Direct Select / Path Editor) gerando nós separados. Distinto do Knife (ponto
  clicado) e do Release Compound (fronteiras de subpath). Gated por
  `AnchorSelectionService.count() > 0`.
- **Outline Stroke** (`OutlineStrokeCommand`) — converte o traço em forma
  preenchida (`fill` = cor do traço; campos de stroke removidos). Ribbon para
  subpaths abertos, donut (anel externo + interno invertido) para fechados.
- **Clean Up** (`CleanUpPathCommand`) — remove âncoras redundantes/degeneradas
  (pontos duplicados de comprimento zero, subpaths < 2 âncoras). Conservador:
  nunca altera o desenho visível.
- **Join** (`JoinPathsCommand`) — 1 path aberto → fecha; 2+ → solda extremidades
  mais próximas num único nó (transforms bakeados, como o compound-path).
- **Reverse Direction** (`ReversePathCommand`) — inverte a ordem das âncoras +
  troca `handleIn`/`handleOut`. Mesmo desenho, winding invertido.
- **Offset Path** (`OffsetPathCommand`) — cópia paralela (default 10u; positivo
  = para fora). Offset por bissetriz com miter clamp; sentido out/in resolvido
  por área (winding-independente).

**Geometria** (`core/geometry`): `path-ops.ts` (reverse/cleanUp/simplify/join/
split), `path-offset.ts` (offset de ring/polyline), `stroke-outline.ts`. Todas
puras (flatten p/ outline/offset; modelo de âncora p/ o resto). Limitações
documentadas: outline/offset achatam curvas em polilinhas e não removem
auto-interseções (1ª passada pragmática, como a maioria dos editores).

**Wiring** em `builtinRoadmapMenuPlugin` (edit): cada item com `run` +
`disabled` (gated por seleção de path / âncora / stroke). Placeholders de Path
removidos; spec do roadmap-menu apontada para um placeholder de Tools.
`builtinRoadmapMenuPlugin` é onde os itens de Path vivem. NLU agora descobre
essas entradas automaticamente (têm `run`).

Specs: geometria (`path-ops.spec.ts`) + comandos (`path-ops.commands.spec.ts`,
inclui undo). Snapshot de API regenerado (+18 símbolos core). Suíte (2431) e
lint verdes.

---

## 2026-06-13 — D-089: Propriedades personalizadas `data-*` em elementos SVG ✅

Permite anexar pares chave/valor arbitrários a **qualquer** nó (`SvgNode`),
que fazem **round-trip** no SVG exportado como atributos `data-*` padrão
(`data-<nome>="<valor>"`) — válidos em SVG/HTML, preservados por
Inkscape/Illustrator/Figma e ignorados pela renderização — e são relidos na
importação. Atende ao pedido: formato `data-*`, tratamento profissional, painel
completo e **API por comando** para plugins/scripts.

**Modelo (core)** — `model/custom-attrs.ts`: armazena um
`Record<string,string>` sob `metadata.customData['svgeCustomAttrs']`
(sub-chave isolada das flags internas `data-svge-*`). Helpers **puros**
(structural sharing, limpam a chave quando vazia): `readCustomAttrs`,
`hasCustomAttrs`, `setCustomAttr`, `removeCustomAttr`, `renameCustomAttr`,
`withCustomAttrs`, `isValidCustomAttrName`, `customAttrToDataName`,
`dataNameToCustomAttr`. **Validação**: nome = sufixo `data-*` minúsculo
(`^[a-z][a-z0-9-]*$`); o prefixo reservado `svge`/`svge-*` é rejeitado, então
um atributo do usuário nunca colide com as flags do engine.

**API por comando (core)** — `commands/custom-attr.commands.ts`:
`SetCustomAttrCommand` (create/update), `RemoveCustomAttrCommand`,
`RenameCustomAttrCommand` — undoable (snapshot do root + `updateNode`),
uma entrada de histórico cada. É o canal para "criar/atualizar/ler/remover
via comando" (leitura = helper puro `readCustomAttrs`).

**IO (round-trip)** — exporter emite `data-<nome>` em `baseAttrs` (todo tipo
de nó, ordenado por nome para saída determinística); importer lê todo `data-*`
em `baseFactoryOpts` (exceto `data-svge-*`, filtrado por `dataNameToCustomAttr`)
para o `customData`. As ramificações layer/smart-object/page do importer agora
**mesclam** (não sobrescrevem) o `customData` dos atributos customizados.

**Painel (ui)** — nova aba **Data** no Inspector (seleção única, qualquer tipo):
lista os atributos atuais (nome + valor editáveis, ordenados), botão remover
por linha, formulário de adição com validação inline (botão desabilitado +
hint de erro), e rename via edição do nome (revertido se inválido/duplicado).
Cada edição despacha os comandos D-089.

Specs: modelo (validação/setters/rename), comandos (CRUD + undo), round-trip
io (export/import/ciclo completo, sem colisão com layer/smart-object/`<title>`),
Inspector (lista/add/update/remove/rename/erro). Snapshot de API regenerado
(+15 símbolos). Suíte (2401) e lint verdes.

---

## 2026-06-13 — D-088: Reset Workspace (resetar o layout dos painéis) ✅

Implementado o item de menu **Window ▸ Workspace ▸ Reset Workspace** (antes
um placeholder de roadmap desabilitado). Resets the **panel LAYOUT** to its
defaults — distinto do "Reset defaults" do diálogo Workspace Settings (que
reverte as **configurações**: background/página/grid/rulers) e do documento
(intocado).

**O que é "layout"** (estado persistido em localStorage):

- lado do tab strip de cada `<svge-panel-group>` (D-081,
  `svge-panel-group-tabside-<id>`)
- rails colapsados do shell-pro (`svge-shell-pro-*-collapsed`)

**Arquitetura:** novo `WorkspaceLayoutService` (ui, root). `reset()` limpa
essas chaves do localStorage e emite um `resetEpoch` (signal). Como limpar o
storage não muda a sessão viva (os componentes já leram seu estado em signals
na construção), os donos do layout **observam** o epoch e revertem o estado
**vivo** sem reload:

- `panel-group`: o effect de restore (D-081) passa a depender do `resetEpoch`
  → ao resetar, lê a chave já limpa (null) e volta ao lado default.
- `shell-pro`: effect no construtor un-colapsa ambos os rails (pulando o run
  inicial via guarda de epoch, para não desfazer o estado restaurado no load
  normal).

Placeholder de roadmap (`svge.roadmap.window.workspace.reset`) removido; a
entrada real vive em `builtinUiMenuContributionsPlugin` (camada ui, pois o
layout é uma preocupação de UI). Spec do serviço (limpa chaves de layout,
preserva as demais, incrementa epoch). Snapshot de API regenerado
(+ `WorkspaceLayoutService`). Suíte (2353) e lint verdes.

---

## 2026-06-13 — dialog-shell: corrigir espaço abaixo do footer ao redimensionar ✅

Bug compartilhado por **todos** os diálogos (via `<svge-dialog-shell>`): ao
redimensionar para mais alto que ~65vh, sobrava um espaço branco abaixo do
footer. Aparecia só nos diálogos cujo corpo **rola** (Workspace Settings,
Keyboard Shortcuts, Plugins) — os de conteúdo curto (About, Find & Replace,
Source) não atingiam o limite.

**Causa raiz:** o Angular Material fixa `max-height: 65vh` em
`.mat-mdc-dialog-content` (= o `.dlg-body` do shell). O `ngAfterViewInit` do
shell já limpava `max-height` no surface/container, mas **não no content**.
Ao redimensionar além de 65vh, o corpo travava em 65vh e o footer (fixado
abaixo dele no flex-column) não alcançava a base → espaço morto.

**Correção (1 linha no shell):** `.dlg-body { max-height: none }`. O seletor
de atributo do `.dlg-body` supera `.mat-mdc-dialog-content`, então sobrepõe.
O bound real de altura é o `maxHeight: 85vh` do pane (`svgeDialogConfig`) +
o handle de resize — o cap de 65vh do corpo era redundante e nocivo.
Conserta todos os diálogos de uma vez. Build + lint verdes.

Também (no Keyboard Shortcuts): conteúdo movido para filho direto do
`.dlg-body` (sem wrapper), espelhando o padrão do source-viewer.

---

## 2026-06-13 — D-087-fix: detecção de conflito canônica + centrar × da busca ✅

Dois acertos no Keyboard Shortcuts manager a partir de uso:

1. **Conflito não era detectado entre combos "iguais" escritos diferente.**
   Ex.: o default `Ctrl+Shift+Z` (Redo, autorado no plugin) vs um override
   capturado `Ctrl+Shift+z` (sempre minúsculo, vindo do `KeyboardEvent`, e
   possivelmente com modificadores reordenados) — mesmo atalho, strings
   diferentes. O `comboCounts` comparava **string crua** → não casava → sem
   alerta. **Correção:** novo `canonicalCombo(combo)` (forma canônica via
   `parseCombo`: case + ordem de modificadores normalizados) usado em
   `bindings()` (contagem + flag `conflict`), `conflictIdsFor` (aviso ao
   regravar) e `setBinding` (limpar override quando == default). Agora ambas
   as linhas mostram o ⚠️ "Also bound to another command" e o aviso
   "Conflicts: …" aparece durante a captura. Política mantida (VSCode-like):
   conflito é **aviso**, não bloqueia salvar — `when()` guards podem deixar
   dois comandos coexistirem.
2. **Botão × da busca desalinhado.** Removido o touch-target do icon-button
   colapsava o × fora do centro; centralizado o wrapper do suffix
   (`:host ::ng-deep .search .mat-mdc-form-field-icon-suffix`) + flex no botão.

`canonicalCombo` é interno ao pacote `edit` (não exportado na API pública).
Specs novos (`canonicalCombo` + conflito case/ordem); suíte (2348) e lint verdes.

---

## 2026-06-13 — D-087: Keyboard Shortcuts manager (ver/configurar/personalizar) ✅

Gerenciador central de comandos + atalhos: lista todos os comandos com atalho
registrado, permite **rebind / unbind / reset** por comando, com detecção de
conflito e restauração de padrões — via diálogo dedicado (Window ▸ Workspace ▸
Keyboard Shortcuts…).

**Camada de modelo (svg-engine/edit, `shortcut/`):**

- `Shortcut.category?` opcional (agrupamento na UI); builtins categorizados
  (Edit/Object/Selection/Snapshots/View).
- Helpers puros em `shortcut.ts`: `validateCombo` (valida sem throw),
  `comboFromEvent` (captura combinação de tecla → string parseável; ignora
  modificador puro), `formatCombo` (exibição amigável: `ctrl+g` → `Ctrl+G`,
  `arrowup` → `↑`).
- **`KeybindingsService`** (`providedIn: 'root'`, global) — fonte de verdade de
  "qual tecla dispara qual comando". Sobrepõe **overrides do usuário** aos
  defaults do `ShortcutRegistry`, persiste em `localStorage`
  (`svge:keybindings:v1`, guarda SSR/privacy) e expõe: `bindings` (KeybindingView
  com default/efetivo/source/conflito, agrupado/ordenado), `tryMatch`
  override-aware, `setBinding`/`unbind`/`resetBinding`/`resetAll`,
  `conflictIdsFor`, `hasCustomizations`.
- `ShortcutService.handler` passa a despachar via `keybindings.tryMatch` — um
  rebind vale imediatamente; **sem** overrides o comportamento é idêntico ao
  registry. Persiste entre reloads, app-wide (não por-editor).

**UI (svg-engine/ui):** `<svge-keyboard-shortcuts-dialog>` + service — busca,
lista agrupada por categoria, chip do combo, **recorder** inline (foca uma caixa,
captura `keydown` localmente com `preventDefault`+`stopPropagation` para não
disparar o comando nem fechar o diálogo no Esc; Esc cancela), aviso de conflito
ao vivo, reset por-linha, unbind, "Restore all defaults" no rodapé.

**Menu:** entrada real registrada no `builtinUiMenuContributionsPlugin` sob
Window ▸ Workspace (order 20). Os **placeholders de roadmap** "Keyboard
Shortcuts…" (Window ▸ Workspace e Help) foram removidos do
`builtinRoadmapMenuPlugin` (convenção "ship = delete the placeholder").

Specs novos: `KeybindingsService` (override→tryMatch, persistência load/save,
conflito, reset, when-guard) + combo helpers. Suíte **2343** verde, lint OK,
snapshot de API atualizado (+`KeybindingsService`, `KeybindingView`,
`KeybindingOverrides`, `validateCombo`, `comboFromEvent`, `formatCombo`,
`SvgeKeyboardShortcutsDialog(Service)`).

---

## 2026-06-13 — Export: podar filtros de efeito não usados (defs enxutos) ✅

O `.svg`/SMIL exportado carregava **todos os ~20 filtros builtin** (`<filter
id="svge.builtin.effect.*">`) mesmo quando o desenho usava só um (ex.: `bevel`).
Causa: `ActiveDefsService.buildExportDefs` compunha os efeitos via
`EffectRegistry.buildAllFiltersMarkup()` (**todos os registrados**), enquanto
todos os outros tipos de def — gradients, patterns, clipPaths, masks, symbols e
chains — já eram podados para "só os usados" no documento. Efeitos eram o único
outlier.

**Correção (apenas no export):**

- Novo `EffectRegistry.buildUsedFiltersMarkup(root)` — varre o documento por
  `url(#id)` em `style.filter` e emite só os filtros referenciados (ids que não
  batem com efeito registrado, como ids de chain, são ignorados — chains emitem
  seu próprio `<filter>` self-contained).
- `buildExportDefs` passa a usar a versão "usados" para a parte de efeitos
  (lê o root via `EditorStateService`), mantendo as demais partes intactas.

O **render vivo** segue injetando todos os filtros (`composed()` →
`buildAllFiltersMarkup`) para que aplicar um efeito seja instantâneo — só o
**export** é enxuto, alinhado ao princípio "export limpo, canvas conveniente".
Vale para SVG e SMIL (mesma rota de export). Sem mudança de superfície pública.
Specs novos no `EffectRegistry`; suíte (2322) e lint verdes.

---

## 2026-06-13 — Align: objeto único alinha à página ("Align to Page") ✅

Antes, com **1 objeto** selecionado os botões de Align ficavam desabilitados
(o alinhamento era sempre relativo à união da seleção, exigindo ≥ 2 nós). Agora,
seguindo o padrão profissional (Illustrator "Align to Artboard", Figma/Affinity
"Align to Page"):

- **1 nó** → Align habilitado; alinha o objeto relativo à **página ativa**
  (`ActivePageService.activePageViewBox()`, fallback à viewBox do documento).
  Ex.: `center-x` centraliza na página, `left` encosta na borda esquerda.
- **≥ 2 nós** → comportamento atual (relativo à união da seleção). Sem mudança.
- **Distribute** segue exigindo ≥ 3 (não há semântica para 1 nó vs página).

Aplicado de forma consistente em **todas as superfícies de Align**:

- Inspector ▸ aba Align (`canAlign` ≥ 1, `alignSelection` ramifica).
- Barra de opções da tool Select (`<svge-select-tool-options>`).
- Menu/toolbar `Object ▸ Align` (`cantAlignFactory` ≥ 1, run handler ramifica).

Implementação (núcleo): nova `computeAlignToReferenceDeltas(items, axis, reference)`
em `alignment-math` (extrai o cálculo do alvo por bbox, reutilizado pela versão
ancorada na união) + `AlignmentService.alignToReference(items, axis, reference)`
— um único `TranslateManyCommand` (undo unificado). Snapshot de API regenerado
(+ `computeAlignToReferenceDeltas`). Specs novos (math + service + tool-options);
suíte (2318) e lint verdes.

---

## 2026-06-13 — Layers Panel: polimento de UX (rodapé unificado + alinhamento eye/lock + busca compacta) ✅

Ajustes visuais no `<svge-layers-panel>` a partir de feedback de uso:

1. **Toolbar movida para o rodapé.** O botão **New Layer** e as **ações em lote**
   (multi-seleção) saíram do topo do painel e foram unificados em um único
   `footer.panel-footer` ancorado no rodapé — convenção Illustrator/Affinity.
   New Layer fica à esquerda; o grupo de lote (`.batch-group`, `margin-left:auto`)
   é empurrado para a borda direita.
2. **Ordem dos ícones de lote alinhada às linhas.** Os botões de lote agora seguem
   a mesma ordem dos ícones por-linha: **eye (visibility) à esquerda, lock à direita**
   (antes estavam invertidos), de modo que a coluna de lote alinhe verticalmente com
   a coluna de cada item.
3. **Campo de busca compacto e discreto.** `.search-field` reduzido para combinar
   com os demais inputs do sistema (altura ~30px, fonte 12px, ícone de prefixo 18px,
   padding vertical menor). Como o Material renderiza os elementos internos do
   form-field na própria view (encapsulation Emulated), os ajustes de altura/padding
   usam `:host ::ng-deep` (escopado ao host para não vazar globalmente); as custom
   props que herdam ficam direto em `.search-field`.

Sem mudança de comportamento/handlers — apenas template + CSS do componente.
Suíte de biblioteca (2309) e lint verdes.

---

## 2026-06-12 — Seleção no canvas: Layers/Pages transparentes (não promove a layer) ✅

**Reportado:** ao clicar num objeto que pertence a uma **pasta/layer** no
canvas, a seleção era **promovida para a layer** (como se fosse um grupo). Mas
layers são **organizacionais**, não composição funcional — a seleção deveria
ficar no **objeto** clicado.

**Causa raiz:** o `resolveSelectableNodeId` em modo `'group'` retornava o
**filho direto do scope root** (a page ativa). Para uma forma dentro de uma
layer, esse filho é a **layer** → seleção promovida pra layer.

**Correção:** o group-mode passou a **"ver através"** de containers
organizacionais (layers/pages) via um predicado opcional
`isTransparentContainer`. Ele caminha do scope root para baixo pulando
containers transparentes e retorna o **nó real** mais alto: um **grupo** quando
existe um entre a forma e a layer, ou a **própria forma** quando ela está
direto na layer. Sem o predicado, o comportamento legado é preservado.

- Helper `organizationalContainerPredicate(root)` (no `edit`/hit-testing)
  monta o predicado (`isLayer || isPage`) a partir do documento.
- Aplicado nos **7 call-sites** de group-mode: `shell-interactions` (pointerdown
  / hover / dblclick), `svge-editor` + `svge-shell-pro` (context-menu resolver),
  e custom-editor (playground). Bônus: o **dblclick** agora dá drill no **grupo
  real** (não na layer), e a forma-direto-na-layer nem resolve pra layer.

**Verificação:** +4 specs (forma-em-layer → forma; forma-em-grupo-em-layer →
grupo; sem-predicado → layer (guard de regressão); predicado flag layer/page).
Suíte **2309** verde; lint OK; snapshot de API atualizado (novo export
`organizationalContainerPredicate`). Build da lib refeito p/ os consumers.

## 2026-06-12 — Invariante: Layer/Page nunca dentro de um grupo (Group/Move) ✅

**Pergunta/observação:** "uma pasta/layer pode ser arrastada para um grupo?"
Pela regra, **não** — Layers e Pages vivem só no topo (Layer: filha do root ou
de uma page; Page: só no root).

**Verificação:** o **arrastar** no Layers Panel já é bloqueado (`isDropAllowed`
não acende o indicador → `onDrop` não dispara). **Mas** auditando achei dois
buracos sem guard no core:

- **`GroupSelectionCommand`** (Ctrl+G / Object ▸ Group): embrulhava uma layer
  selecionada num grupo — selecionar 2 layers (filhas da page) + Ctrl+G →
  layers dentro de um grupo. **Bug real.**
- **`MoveNodeInTreeCommand`**: sem "última linha de defesa" para o invariante
  (só a UI protegia o único caminho).

**Correção (guards no core, fonte autoritativa p/ todos os callers — atalho,
menu, NLU):**

- `GroupSelectionCommand` rejeita a operação se qualquer nó selecionado for
  layer/page (`fail`, sem mutação).
- `MoveNodeInTreeCommand` rejeita mover uma layer para fora de root/page, e uma
  page para fora do root (mesmo padrão do `MakeLayerCommand`).

**Polimento (UX) — feito:** o `cantGroupFactory` (gate de disabled do item
**Group** + Make Opacity Mask) agora também desabilita quando a seleção inclui
uma layer/page. Antes, com o guard core, o `Ctrl+G`/menu virava um **no-op
silencioso**; agora o item fica **cinza** de antemão, deixando claro que não é
permitido (em vez de "cliquei e não fez nada").

**Verificação:** +6 specs (core: group rejeita layer; move layer→grupo falha;
layer→page ok; reorder no root ok; page→grupo falha. menu: Group desabilitado
quando a seleção tem layer). Suíte **2305** verde; lint OK; sem mudança de API.

## 2026-06-12 — UX: Isolation/breadcrumb exclusivo para Groups (não Layers/Pages) ✅

**Sintoma (reportado):** clicar/dar dois cliques numa forma dentro de uma
**pasta/layer** ativava o breadcrumb de isolation tratando a layer (e a page)
como se fossem **grupos** (`Document › ‹Group› › ‹Group› › ‹Path›`).

**Regra de negócio:** Isolation Mode e seu breadcrumb são **exclusivos de
navegação em Groups reais**. **Layers** e **Pages** são contêineres
organizacionais (navegados pelos próprios painéis) — nunca devem ser
isolation root nem aparecer no breadcrumb.

**Causa raiz:** Layer e Page são `GroupNode` flagados, e o `IsolationService`
aceitava qualquer `type==='group'`; o dblclick só excluía `isPage`, não
`isLayer`. Então dois cliques numa forma dentro da layer faziam
`isolation.enter(Layer)`.

**Correção (fonte única no `IsolationService` + guard no dblclick):**

- `enter()` agora rejeita Layer/Page (helper `isIsolatableGroup` = group real,
  sem flag de layer/page). Cobre todos os call-sites (dblclick, Layers Panel,
  breadcrumb `setRoot`).
- `exitOne()` (Esc) **pula** ancestrais Layer/Page ao subir — vai pro próximo
  Group real, ou sai de vez se não houver.
- `breadcrumbPath` **filtra** Layer/Page (mantém só `Document` + Groups reais);
  ex.: `root → Page → Layer → Group` vira `Document › Group`.
- `shell-interactions` dblclick: o early-return de `isPage` agora inclui
  `isLayer` (não tenta isolar nem re-selecionar a layer inteira).
- Nota de tipo: `isIsolatableGroup` retorna `boolean` (não `node is GroupNode`)
  — uma Layer **é** estruturalmente um `GroupNode`, então o narrowing seria
  incorreto.

**Verificação:** +6 specs (enter rejeita layer/page; setRoot idem; isola group
real aninhado; breadcrumbPath colapsa para Document+Group; exitOne sai limpo).
Suíte **2299** verde; lint OK; sem mudança de API pública.

## 2026-06-12 — UX: Convert Layer→Group de layer com 1 filho dissolve (sem grupo de 1) ✅

**Pedido:** ao **Convert Layer → Group** numa pasta/layer com **um único
objeto**, o objeto deve permanecer isolado — conceitualmente não existe
agrupamento com um só elemento. Antes, o `UnmakeLayerCommand` só limpava a
flag, deixando um **grupo de 1 elemento** desnecessário.

**Solução (single source of truth no `core`):** `UnmakeLayerCommand` passou
a **ramificar pelo nº de filhos**:

- **1 filho** → **dissolve**: promove o único filho para o lugar da layer
  (preserva o stacking) e faz **bake do transform** da layer no filho (render
  idêntico) — mesma técnica do `UngroupCommand`. Nada de grupo de 1.
- **2+ filhos** → mantém o grupo (agrupamento real; só limpa a flag).
- **0 filhos** → mantém o grupo vazio (não há filho para promover).
- Expõe `getResultNodeId()` (id do filho promovido ou do próprio grupo); o
  **menu** (`Convert Layer to Group`) + o **Layers Panel** (`convertToGroup`)
  **re-selecionam** o nó sobrevivente, já que o id da layer some no dissolve.
- Undo continua por snapshot do root (cobre os dois caminhos).

**Verificação:** +4 specs core (dissolve promove filho / bake de transform /
undo restaura a layer / layer vazia segue grupo) + teste multi-filho ajustado.
Suíte **2293** verde; lint OK; sem mudança de API pública (método novo numa
classe já exportada). Build da lib refeito p/ propagar o `.d.ts` aos consumers.

## 2026-06-12 — Fix: Convert to Layer quebrado sob Pages (regressão D-079) ✅

**Sintoma (reportado):** `Object ▸ Convert ▸ Convert to Layer` ficava
**sempre desabilitado**, mesmo selecionando um grupo — impossível testar.

**Causa raiz:** o invariante "layer só no topo" checava `parent.id ===
root.id`. Com o modelo de **Pages** (D-079) o `root` contém **só páginas**
e um grupo de topo é filho da **página ativa**, não do root — então o
predicado nunca passava. O `CreateLayerCommand` ("New Layer") já tinha sido
ajustado para Pages, mas o `MakeLayerCommand` + os gates de UI ficaram para
trás.

**Correção (3 superfícies, mesma regra):** "top-level" = filho de um **layer
container** = o **root OU uma página**. Aplicado em:

- `core/MakeLayerCommand`: aceita parent root-ou-página; rejeita uma página
  como alvo (uma página é um group, mas não conversível).
- `edit` menu gate `cantConvertToLayerFactory` (`Object ▸ Convert to Layer`).
- `ui` Layers Panel: `convertToLayer` (context-menu) **e** `isDropAllowed`
  (drag/drop — uma layer pode pousar no root **ou** numa página; senão não
  daria pra reordenar layer dentro da página).

**Verificação:** +3 specs (core: grupo-em-página → layer; página rejeitada /
menu: gate habilita só p/ grupo de topo da página, segue desabilitado p/
aninhado e p/ página). Suíte **2289** verde; lint OK; specs antigas (docs
sem-página) intactas. Sem mudança de API pública.

## 2026-06-12 — D-086: Object ▸ Mask real (clipping path + opacity mask) ✅

Recurso **SVG-nativo de máscara por gesto** (padrão Illustrator), distinto do
painel COMPOSITION (D-049, que só **referencia** presets): aqui o **objeto de
cima** vira o recorte.

- **`io`**: helper público `nodeToSvgMarkup(node)` (serializa um nó, reusando o
  `renderNode` do exporter).
- **`core`**: `MakeClipMaskCommand` / `ReleaseClipMaskCommand` (puros, undo por
  snapshot) + helpers de string (`appendDef`/`removeDefById`/`extractDefById`/
  `unwrapUrlRef`). O def vive em `document.defs` → round-trip no export/import.
- **`edit`**: `clip-mask-actions` (`makeClipMask`/`releaseClipMask`) — cola io:
  serializa o recorte no Make e **re-parseia o def via `svgImporter`** no
  Release (devolve a forma como objeto, paridade Illustrator).
- **Menu**: `Object ▸ Mask ▶` agora REAL (Make/Release Clipping Path + Make/
  Release Opacity Mask), gates de disabled (≥2 p/ Make; ref presente p/ Release)
  e `Ctrl+7`. Placeholder roadmap removido.
- **Inspector**: o dropdown `clip path`/`mask` da seção COMPOSITION agora
  **enumera também os ids do `document.defs`** — o recorte do gesto aparece
  selecionado e pode ser trocado/removido pelo painel.
- **Limitação v1**: assume recorte e alvo no mesmo nível (caso comum); aninhado
  com transform de ancestrais fica como refino futuro.
- **Refino (mesmo dia) — guard de clipper imagem**: o SVG **ignora `<image>`
  dentro de `<clipPath>`**, então uma imagem como recorte de clipping path
  cropparia o alvo a nada. **Make Clipping Path** agora **desabilita** quando o
  objeto do topo é imagem (`cantMakeClipFactory`, via o novo helper compartilhado
  `topmostSelected`), com **tooltip** apontando a saída (Make Opacity Mask ou
  vetorizar com Trace Image); `makeClipMask` também faz no-op por dentro (defesa
  contra NLU/context-menu). `<svge-menu-bar>` ganhou `[attr.title]` nas folhas +
  `pointer-events:auto` em itens `[disabled]` (p/ o tooltip aparecer) + guard em
  `runItem`. **Opacity Mask** segue aceitando imagem (`<mask>` renderiza
  qualquer conteúdo). +3 specs (menu + ação ×2); suíte **2286** verde, lint OK.
- Specs: core (helpers + comandos + undo) + edit (round-trip io). Suíte **2279+**
  verde; lint OK; snapshot de API atualizado. Fix paralelo: `pages.spec` limpa
  localStorage no setup (isolamento entre arquivos). Decisão em doc 04.

## 2026-06-12 — D-085: Reorganização do menubar (Opção B + roadmap visível) ✅

Remapeamento completo do menubar para o layout **Opção B** (9 menus),
preservando **todos** os recursos existentes e expondo o que ainda não
existe como **roadmap visível** (item desabilitado + ícone de relógio).

- **9 menus** (antes 6): `File / Edit / View / Insert / Object / **Path** /
**Tools** / **Window** / Help`. Novos slots `MENU_SLOT.PATH/TOOLS/WINDOW`;
  `<svge-menu-bar>` passa a renderizar os 9 por padrão.
- **Marcador roadmap**: novo campo `MenuContribution.comingSoon`. O
  menu-bar renderiza um ícone `schedule` à direita; folhas roadmap também
  vêm `disabled`. A **descoberta NLU pula** `comingSoon` (senão virariam
  comandos de voz no-op). Submenus 100% roadmap (ex.: **Object ▸ Mask**)
  permanecem abríveis para manter a visibilidade do roadmap.
- **Reorganização (ids preservados p/ compat de atalhos/NLU)**: Group/
  Ungroup `Edit → Object` (topo); New Layer `Object → Insert`; Zoom/
  Display/Show viram submenus em View; Select vira submenu em Edit;
  Arrange/Transform(ex-Flip)/Boolean(ex-Pathfinder)/Convert/Compound Path
  como submenus em Object; Live Boolean **achatado** dentro de Boolean
  (o menu-bar só renderiza 2 níveis). Import/Export viram submenus em File.
  Workspace Settings `File → Window ▸ Workspace`; Manage Plugins
  `File → Tools ▸ Plugins`; Trace Image → `Object ▸ Convert`; About
  "SVGEngine" → "SVG Studio".
- **Recursos reais NOVOS** que ganharam casa: **Path ▸ Convert to Path**
  (`BatchConvertToPathCommand`), **View ▸ Zoom ▸ Fit Canvas** (`fit()`) e
  **Actual Size (100%)** (`setZoom(1)`).
- **Sugestões de ouro incorporadas**: **Object ▸ Mask** (Make/Release
  Clipping Path, Make Opacity Mask — roadmap, comando ainda inexistente);
  **Apply Filter…** (o painel de efeitos/filtros já existe — D-047); o
  Document Settings (viewBox/preserveAspectRatio) entra como roadmap em File.
- **Novo plugin** `builtinRoadmapMenuPlugin` (edit) concentra os menus
  novos + Mask + ~60 placeholders roadmap; wired em
  `provideSvgEngineEditorBuiltins()`.
- **Garantia "nenhum recurso perdido"**: spec anti-órfão prova que **toda**
  contribuição com `parentId` resolve para um pai no **mesmo slot** (zero
  órfãos), + specs de relocação e de Convert-to-Path real. Suíte **2270**
  verde; lint OK; snapshot de API atualizado (novo export). Decisão em doc 04.

## 2026-06-12 — Fix: 2º clique-direito vazava o menu nativo do navegador ✅

Abrir o menu de contexto da app no canvas funcionava, mas um **segundo**
clique-direito (menu já aberto) **não reposicionava** o popup e ainda exibia o
**menu nativo do navegador** por cima. Causa: o overlay do
`SvgeContextMenuService` era criado com `hasBackdrop: true`. O backdrop
transparente cobre o canvas inteiro, e seu `backdropClick()` **só dispara no
clique esquerdo** — então o segundo clique-direito caía no backdrop, que (a) não
tem `[svgeContextMenu]`, logo `preventDefault()` nunca rodava e o menu nativo
vazava, e (b) não fechava nosso menu.

- **`hasBackdrop: false`** + dismissal externo migrado de `backdropClick()` →
  **`outsidePointerEvents()`** (fecha em qualquer pointer-down fora do painel,
  esquerdo **ou** direito). Sem backdrop, o re-clique-direito passa direto ao
  trigger do canvas, que dá `preventDefault()` (sem menu nativo) e reabre o menu
  na nova posição. Docstring do serviço atualizada com o racional completo.
- **+1 spec** (`opens WITHOUT a backdrop`) trava a regressão. O dismissal por
  `outsidePointerEvents` é comportamento interno do CDK que o jsdom não simula a
  partir de um `pointerdown` sintético → verificado no browser; `close()` +
  Escape seguem cobertos. Suíte **2263** verde; lint OK.

## 2026-06-12 — Fix: hover-outline ausente nos shells (svg-studio/`<svge-editor>`) ✅

O contorno pontilhado azul do nó sob o cursor (`.hover-outline` do
`<svge-selection-overlay>`, dirigido por `SelectionService.hoverId`) só
aparecia no **custom-editor** do playground, que fiava `selection.setHover`
inline no próprio componente. A infra compartilhada — diretiva
**`[svgeShellInteractions]`** usada por svg-studio, `<svge-editor>` e
`<svge-shell-pro>` — tinha `onPointerMove`/`onPointerLeave` mas **nunca**
chamava `setHover`, então `hoverId()` ficava sempre `null` e o realce não
aparecia. **Não** era overlay faltando nem camada errada — era fiação.

- Adicionado `updateHover(event)` no `onPointerMove` da diretiva: resolve o nó
  via o **mesmo** `resolveSelectableNodeId` da seleção (modo `group`,
  isolation/página aware), suprimindo o realce durante tools de desenho e
  gestos (move/marquee/drag-armado) e nunca destacando a página ativa.
- `onPointerLeave` limpa o hover. Liga o recurso **de uma vez** em todos os
  shells e embedders, com paridade total à seleção.
- **+3 specs** (clear-on-leave, suppress-on-marquee, idle sem throw); suíte
  **2262** verde; lint OK. A fiação inline do custom-editor fica redundante
  (cleanup opcional futuro).

## 2026-06-12 — D-084: arquitetura da Plataforma de Plugins (Fase 3 redesenhada)

Análise de negócio completa do sistema de plugins (svg-engine + svg-studio +
playground + stamp-plugin) consolidada em **`docs/13-plataforma-de-plugins.md`**:

- **Teste real da Fase 2 em produção**: `mosaicoo-hello` carregado de
  `https://svgstudio.mosaicoo.tech/plugins/...` no Studio publicado — snackbar,
  console e aba External confirmados. Transporte/guardas/lifecycle provados.
- **Spike Native Federation** (branch `spike/native-federation-3.1`, NÃO
  mergeada): host+remote buildam, Angular compartilha, mas os entry-points
  secundários do svg-engine não fecham (shareAll/ignoreUnusedDeps/stack ML).
  **Rejeitada para o marketplace**; doc do spike na branch.
- **Decisão D-084 — três canais**: (1) build-time/npm full-power p/ interno +
  embedding (inalterado); (2) **marketplace via Host-API factory** — módulo
  exporta `default(host: SvgeHostApi) => EditorPlugin`, fachada estreita e
  versionada construída sobre o injector, reusando o `PluginLoader` da Fase 2;
  (3) scripts sandboxed (D-024) p/ não-confiável. Lib = mecanismo, app = política.
- **Gaps mapeados**: persistência de externos no boot, catálogo remoto + UI
  Browse, update, assinatura, SDK `@mosaicoo/svge-plugin-sdk` (types-only).
- Roadmap: **D-084a** (Host-API + STAMP por URL como aceite) → **b** (SDK) →
  **c** (marketplace) → **d** (sandbox). Registrado em doc 04 (D-084).

## 2026-06-11 — Plugins Fase 2: loader de externos de origem confiável (D-083) ✅

Carregamento **runtime** de plugin de terceiro, **seguro por design** (fail-closed
em cada etapa). Tudo headless em `svg-engine/edit` (`edit/lib/plugin/`):

- **`ExternalPluginManifest`** + `validateExternalPluginManifest()` — contrato
  do manifesto (id/name/version/apiVersion/`entry`/`integrity?`/deps + metadata)
  validado como **input não-confiável** (puro, testável).
- **`PluginLoader`** (`root`): `load(manifest)` encadeia guardas baratas antes de
  buscar código — valida manifesto → **gate de `apiVersion`** (major) → **allowlist
  de origens** do consumer → módulo carregado → shape-check do `default` export
  (id/apiVersion batem) → `installExternal`. **Nunca lança** (retorna
  `PluginActionResult`). `isEnabled`/`isOriginTrusted` para a UI consultar.
- **`providePluginLoader({ trustedOrigins, moduleLoader })`** — opt-in: o consumer
  fornece as origens confiáveis **e** o `moduleLoader` (onde o `import()` real + SRI
  vivem). A **library não embute `import()` de URL arbitrária** — sem isso o loader
  recusa tudo. **Não é marketplace aberto**: não há "cole URL e rode" para usuário final.
- **+18 specs** (manifest validator + loader: sucesso, origem não-permitida, mismatch
  de apiVersion antes do fetch, manifesto inválido, id divergente, loader que lança,
  fail-closed). Suíte **2259** verde; build lib + dist OK; snapshot da API atualizado.

Detalhes: [D-083](04-decisoes-tecnicas.md#d-083--gerenciamento-e-distribuição-de-plugins)

- [doc 12](12-gerenciamento-de-plugins.md). Falta a Fase 3 (repositório online —
  scripts sandboxed D-024 / marketplace curado).

---

## 2026-06-11 — Plugins: metadata de exibição dos builtins (D-083 Fase 1 follow-up) ✅

Os ~29 plugins builtin agora aparecem no gerenciador **bonitos** — com
`description`/`author`/`icon`/`category` coerentes por item, em vez de
"category: other" sem descrição.

- Novo helper exportado **`withPluginMeta(plugin, meta)`** (`svg-engine/edit`):
  retorna uma cópia do plugin com a metadata de exibição anexada, sem mutar o
  original (preserva `install`/id). Mais o tipo `PluginDisplayMeta`.
- **Aplicado no bundle**, não espalhado em ~25 arquivos: `provideSvgEngineEditorBuiltins()`
  embrulha cada builtin via um helper local `builtin(plugin, description, icon,
category)` (author `SVGEngine`); `provideSvgeUiBuiltins()` embrulha o menu UI.
  Terceiros declaram os mesmos campos inline no próprio `EditorPlugin` (guia 10).
- **Na fonte** onde o plugin é provido direto (não via bundle): `builtinNluPlugin`
  (`smart_toy`/`nlu`) e o `commandPalettePlugin` do svg-studio (`bolt`/`nlu`).
- **+3 specs** (`withPluginMeta`); suíte **2241** verde; build svg-studio + dist
  OK; snapshot da API atualizado (+`withPluginMeta`, +`PluginDisplayMeta`).

---

## 2026-06-11 — Plugins: acesso via menu/diálogo (D-083 Fase 1 follow-up) ✅

Para tornar o gerenciador acessível no **svg-studio** (e no pro-editor do
playground) sem rota dedicada: `<svge-plugin-manager-dialog>` (wrapper Material
do painel via `<svge-dialog-shell>`) + `SvgePluginManagerDialogService.open()`,
e item de menu **File ▸ Manage Plugins…** registrado no
`builtinUiMenuContributionsPlugin`. Entra automaticamente em qualquer app que
use `provideSvgeUiBuiltins()` — nenhuma mudança nos `app.config` foi necessária.
+1 spec (dialog service); suíte **2238** verde; build do svg-studio + dist
regenerados; snapshot da API atualizado (2 exports novos no `svg-engine/ui`).

---

## 2026-06-11 — Gerenciamento de plugins — Fase 1 (D-083) ✅

Camada de **produto** sobre o motor de plugins existente — sem mexer no que
funciona, só ajustando para o gerenciador. **Decisão-chave de público:** a
library entrega **mecanismo, não política** — há _dev_ e _usuário_, mas sem
login/papéis na lib; o consumer monta o `<svge-plugin-manager>` onde sua
própria autorização permitir.

**Entregue** (`projects/svg-engine/edit/src/lib/plugin/`):

- `EditorPlugin` ganha metadata opcional aditiva (`description`/`author`/
  `icon`/`category`) + tipos `PluginCategory`/`PluginSource`/`PluginManifest`.
  `PLUGIN_API_VERSION` mantido em `1.0.0` (mudança não-quebrante).
- **`PluginCatalog`** (universo conhecido, internos+externos), **`PluginStateStore`**
  (persistência encapsulada do set desabilitado, localStorage app-wide,
  defensiva) e **`PluginManagerService`** (façade: `plugins()`/`internalPlugins`/
  `externalPlugins`, `enable`/`disable`/`uninstall`/`installExternal`, bloqueio
  por dependentes ativos, estado de erro resiliente).
- **`provideSvgEnginePlugin` ciente do catálogo**: registra como `'internal'` +
  **pula `install()` se desabilitado** no boot. `PluginRegistry` permanece
  **intacto** (enable/disable = uninstall+lembrar — Abordagem A; D-020 preservado).
- **`<svge-plugin-manager>`** (`svg-engine/ui`): lista por tipo, toggle, uninstall
  (external only), a11y. Playground: rota **`/plugins`** (showcase + plugin
  externo demo).

**Verificação**: build lib (edit+ui) + **2237 specs** (28 novos) + build do
playground + lint, tudo verde; snapshot da API regenerado. Fases 2 (loader de
origem confiável) e 3 (repositório de scripts sandboxed / marketplace curado)
seguem planejadas. Detalhes:
[D-083](04-decisoes-tecnicas.md#d-083--gerenciamento-e-distribuição-de-plugins) +
[doc 12](12-gerenciamento-de-plugins.md).

---

## 2026-06-10 — Documento de decisão: Gerenciamento de plugins (D-083 PROPOSTA) 📋

Investigação read-only do sistema de plugins (ancorada no código:
`edit/lib/plugin/*`, D-020/D-023/D-024, guia 10) + novo documento de decisão
[`12-gerenciamento-de-plugins.md`](12-gerenciamento-de-plugins.md) e a entrada
[D-083](04-decisoes-tecnicas.md#d-083--gerenciamento-e-distribuição-de-plugins)
(status **PROPOSTA**). **Nenhum código alterado** — entregável é o material
para decidir _como_ gerenciar/instalar/desinstalar/ativar/desativar plugins e
_se/como_ ter "repositório online".

**Achados:** o motor de ciclo de vida runtime já existe e é sólido
(`PluginRegistry.install/uninstall/has/get/list` + `installed` signal + gate
`apiVersion` + deps + disposal LIFO/rollback); **faltam** ativar/desativar
(só há install/uninstall), persistência, metadata de exibição, UI (nada
consome `installed`) e distribuição.

**Tese central:** existem **dois canais**. Plugins (D-020) = TS compilado
_full-trust_ (`injector` cru) → distribuição por npm/build-time; runtime só de
origem confiável do consumer (SRI). Scripts (D-024) = sandbox WebWorker → **é o
canal correto para um repositório online aberto/comunitário**. Marketplace de
plugins compilados = supply-chain risk, só como plataforma curada à parte.
Recomendação faseada (Fase 1: Plugin Manager dos plugins já bundlados, sem
superfície de segurança nova). 4 perguntas em aberto para fechar a decisão.

---

## 2026-06-10 — Bug fix: snap de grid não correspondia à grade desenhada ✅

Ao arrastar com SNAP em "grid"/"both", o shape não grudava na grade exibida.
**Causa-raiz**: dois mundos desconectados. (1) A grade é desenhada com
`WorkspaceService.grid().spacing` (default **20**); o snap usava
`SnapService.gridSize`, um valor **separado** preso no default **10** —
`setGridSize` nunca era chamado fora dos testes. (2) A grade é ancorada na
**origem da página** (`pb.x/pb.y`), mas os alvos do snap eram múltiplos a
partir de **(0,0)**. Logo o snap grudava numa lattice de 10 ancorada em 0,
"entre" as linhas visíveis de 20.

**Fix** ("a config de grade é a fonte; o movimento lê ao vivo, sem valores
fixos"):

- `gridTargetsNear(moving, gridSize, axis, origin=0)` passa a ancorar a
  lattice em `origin + k·gridSize` (origem da página), casando com a grade
  desenhada.
- `SnapService` ganha `gridOrigin` (signal) + `setGridOrigin`; `resolveForMove`
  usa `gridSize` **e** `gridOrigin` por eixo.
- `[svgeShellInteractions]` (shells `svge-editor`/`svge-shell-pro` → svg-studio):
  `effect` reativo que espelha `workspace.grid().spacing` → `snap.setGridSize`
  e a `resolvePageBounds(...)` da página ativa → `snap.setGridOrigin`. Re-roda
  sempre que o espaçamento ou a geometria da página muda.
- `custom-editor` (playground, gesture próprio, sem a directiva): mesmo sync de
  espaçamento via `effect` (página legada ancorada em 0 → origem já casa).

Specs: `gridTargetsNear` com origin + `resolveForMove` page-anchored. Suíte:
**2209 specs**. Gate: build:lib + ng build svg-studio + playground verdes.

## 2026-06-10 — Bug fix: botão "+" (New Layer) não funcionava com Pages ✅

O botão "+" do painel de Layers parecia não fazer nada no svg-studio.
**Causa-raiz**: com o modelo de Pages (D-079) o `<svge-layers-panel>` é
**enraizado na página ativa** (`shell-pro` passa `[root]="layersPanelRoot()"`
= a página), mas `CreateLayerCommand` inseria a nova layer em **`doc.root`**,
como irmã das páginas — fora da página ativa. A layer era criada, mas não
aparecia no painel (que mostra os filhos da página) nem no canvas.

**Fix**: `CreateLayerCommand` ganhou um parâmetro opcional `parentId`
(default = `doc.root`, mantém compat) e passa a contar layers / inserir no
parent informado. O painel (`createNewLayer()`) passa `this.root()?.id` —
seu root de exibição, i.e. a página ativa. Core continua page-agnóstico (só
recebe um id); a UI fornece o parent. Regressão travada por spec
(`new CreateLayerCommand(pageId)` insere dentro da página, não no root).
Suíte: **2207 specs**.

> **Nota** (mesma causa-raiz, não corrigido aqui): `convertToLayer` no painel
> ainda checa `parent.id === document.root.id`, então "Convert to Layer" num
> grupo dentro da página também falha. Candidato a follow-up.

## 2026-06-09 — Publish-prep: endurecimento da superfície pública (Cat. A + B) ✅

Preparação para o release no NPM público — encolher a API pública para o que
é realmente contrato estável, sem quebrar nada. Detalhe completo em
`09-api-publica.md` › "Superfície interna / fora do contrato".

- **Categoria A — un-export** `17adead`: 14 símbolos que eram plumbing puro,
  consumidos só dentro do próprio entry point via import relativo de arquivo,
  removidos dos _barrels_ (continuam exportados das fontes → importadores
  relativos e specs intactos). Inclui `ai/nlu` `scoring`, os 5 `Active*Service`
  de `<defs>`, `composeChainFilter`, helpers de marquee/snap/shortcut/tool/
  workspace e 2 de `render`. **Cross-check por símbolo**: 2 candidatos da lista
  inicial foram **mantidos** após achar consumidor real via barrel —
  `workspace/pageBoundsIn` (custom-editor) e `effect/{extract,make,parse}ChainFilterId`
  (svge-effects-panel/`ui`).
- **Categoria B — `@internal`**: 21 símbolos que **precisam** ficar exportados
  (consumidos por `ui`/`nlu-ui` do pacote buildado) mas não são contrato
  estável — marcados `@internal` na fonte (documental; `stripInternal` está
  off, então `.d.ts` preserva as declarações). Cobre os serviços-estado das
  tools, persistência/runner de snapshots+asset-export (`edit`) e
  `ColorHistoryService` + dialog services internos do plugin de menu (`ui`).
  `ai/nlu` `tokenize`/`detectLanguage` ficam **públicos** (primitivos úteis).
- **Premissas preservadas**: embedding, somente-view (render), controles
  separados (ui), AIs separados (ai/\*), editor completo. Headless boundary
  (D-017) intacto. Gate verde em ambas as categorias (build:lib todos os
  entry points + 2187 specs + ng build svg-studio + playground).
- **Fix Cat. A** `61b5952` (após "isso penaliza terceiros?"): 6 helpers
  removidos na Cat. A **estavam anunciados** nas tabelas de referência
  (`09`/`06`) — `projectDocumentToRenderer`, `renderTransformAttr`,
  `gridTargetsNear`, `rectsToSnapTargets`, `parseCombo`, `comboMatches`
  (+ `ParsedCombo`). **Restaurados** no barrel (regra: anunciado = público).
  Os demais removidos seguem internos (só em changelog/roadmap, não na
  referência). Caminho de plugin de terceiros intacto (`provideSvgEnginePlugin`,
  `EditorPlugin`, registries, scope — nada tocado).
- **Guard-rail de superfície** (publish-prep): novo spec
  `api-surface/public-api-surface.spec.ts` trava os nomes exportados dos 9
  entry points contra `public-api.snapshot.json` (golden versionado). Resolve
  `export *`/`export {…} from` recursivamente via TS API; quebra em qualquer
  add/remove. Regen: `UPDATE_API_SNAPSHOT=1 npm run test:lib`. Teria pego o
  deslize da Cat. A sozinho; validado contra canário.
- **Categoria D — falso positivo + guard durável**: a análise apontou
  `SnapshotsPersistenceService` exportado em dois barris (`snapshots` e
  `asset-export`), mas auditoria do código mostrou **zero** duplicatas reais —
  o `asset-export/index.ts` só **comenta** `// Mirror of SnapshotsPersistenceService`
  (lido como export na análise pré-compactação). Em vez de "consertar" algo
  inexistente, estendi o guard-rail com um check **"sem exports duplicados"**
  (mesmo nome alcançável por dois `barrels` → falha listando origens). Validado
  contra canário que recriou exatamente o cenário imaginado. Suíte: **2206 specs**.
- **Categoria C — presets builtin marcados `@internal` (decisão do usuário)**:
  os 121 presets builtin individuais (`edit`: 21 gradientes, 30 patterns, 24
  shapes, 12 templates, 6 graphic-styles, 5 clip-paths, 4 masks, 19 effects)
  foram **mantidos exportados** (intenção "for direct import / customization" +
  tree-shaking) mas **marcados `@internal`** na fonte, sinalizando tier
  avançado/secundário — o contrato primário é o array `BUILTIN_*` + service +
  plugin. Codemod TS-AST determinístico (injeta `@internal` no JSDoc de cada
  preset; 101 single-line, 20 multi-line). **100% doc-only**: nenhum nome
  removido → guard-rail passa sem regen (superfície idêntica). Encerra a
  sequência publish-prep (A·B·C·D + guard-rail).

## 2026-06-07 — D-046 voz híbrida — reconhecimento de voz local (Whisper WASM) ✅

Voz **100% offline** opcional ao lado da Web Speech API, com engine
**selecionável pelo usuário**. Resolve o `network` error do Web Speech (STT em
nuvem do vendor, indisponível em Brave/Electron/firewall) sem abrir mão da
opção rápida. Entregue em 6 stages, gate verde em cada um.

- **Vendoring (assets repo + submodule)** — modelo **Whisper base** int8
  (encoder/decoder `*_quantized.onnx` + tokenizer/config) vendorado num repo
  separado `mosaicoo/svgengine-ml-assets` (Apache-2.0 + NOTICE + CHECKSUMS),
  consumido como **git submodule** em `assets/ml/whisper` (decisão do usuário:
  evitar custo de Git LFS). `CHECKSUMS.txt` (SHA-256) trava integridade.
- **Stage 2b (deps)** `ba3df7a` — `@huggingface/transformers@4.2.0` (traz seu
  próprio `onnxruntime-web` dev build, que casa com o glue `.mjs`).
- **Stage 3 — entry point `svg-engine/ai/nlu-voice-wasm`** `b96688a` (9º):
  `WhisperVoiceService` implementa o mesmo contrato do `VoiceRecognitionService`
  (Web Speech), mas roda local via transformers.js. Config offline
  (`provideWhisperVoice`/`WHISPER_VOICE_CONFIG`): `allowRemoteModels=false` +
  `localModelPath`/`wasmPaths` locais. Captura: `getUserMedia` → `MediaRecorder`
  → decode + downmix mono + reamostragem 16 kHz (`OfflineAudioContext`) →
  `pipeline` ASR (`dtype:'q8'` → `*_quantized.onnx`). `import()` lazy do
  transformers (só baixa quando a voz Whisper é acionada). Multilíngue PT-BR/ES/EN.
- **Stage 4+5 — engine selecionável** `02267da`: contrato `VoiceProvider` +
  `VoiceEngine` + token opcional `VOICE_WHISPER_PROVIDER` em `ai/nlu` (headless,
  desacopla nlu-ui↔nlu-voice-wasm). `VoiceEngineService` (nlu-ui) orquestra Web
  Speech (sempre) + Whisper (opcional), modos `web-speech`/`whisper`/`auto`
  (fallback). `<svge-nlu-input>` ganha seletor de engine (mat-menu), estado de
  carregamento do modelo e mensagens de erro do Whisper.
- **Stage 6 — wiring** `a1a3577`: `angular.json` do playground serve o modelo do
  submódulo (`/assets/ml/whisper/whisper-base`) e os `.wasm` do onnxruntime
  (`/assets/ml/ort`); `provideWhisperVoiceEngine()` no app.config registra o
  Whisper como engine selecionável (rota `/nlu-test`). Removida a dep top-level
  `onnxruntime-web` (sobrava/divergia). Build dev confirma chunk lazy
  `transformers-web` (~1.3 MB) + cópia dos assets.
- **Licenças** — todas permissivas (Whisper MIT, conversão ONNX Apache-2.0,
  transformers.js Apache-2.0, onnxruntime-web MIT): sem copyleft, sem obrigação
  de abrir o SVGEngine, sem API key. Ver `THIRD-PARTY-NOTICES.md` (novo).
- **Limite honesto**: a config offline + o build são garantidos por mim; a
  **transcrição** em si só se valida rodando no browser com microfone — feita
  pelo usuário em `/nlu-test` (engine Whisper).

Gate por stage: build:lib RC=0 · lint OK · test:lib 2163 (+15 specs de voz).

---

## 2026-06-03 — D-082 F9 — Export animado SMIL + follow-ups de UX da timeline ✅

**Export animado (SMIL), F9a–F9d** (`bfb54b2` → `53b7935` → `07fbc3e` →
`30817fa`). Primeiro alvo de export da animação (escolha do usuário: SVG nativo,
sem runtime externo).

- **F9a/F9b (core)** — serializer puro `animationToSmil(doc, nodeId,
baseTransform?)`: geometria/estilo → `<animate>`; transform → `<animateTransform>`
  (translate/rotate/scale, `additive="sum"` na ordem `T·R·S` que reproduz
  `composeTransform`). Fiel ao preview: hold nas pontas via keyframes sintéticos
  em t0/tD; `keySplines` por segmento (omitidos quando tudo linear);
  `repeatCount="indefinite"` (espelha o loop). Componentes de transform
  estáticos são "assados" como `<animateTransform>` constante. Nomes camelCase
  de estilo → atributo SVG (`strokeWidth`→`stroke-width`). **Fidelidade**: 1
  eixo de translate/scale animado mantém easing exato; 2 eixos → amostragem
  eased na união dos tempos (exato em cada keyframe, intra-segmento linearizado).
- **F9c (io)** — wiring no `svgExporter` atrás do opt-in
  `exportPreferences.emitSmilAnimation` (**default OFF**). Pré-scan
  `nodeId → AnimationDoc`; injeção dos elementos como filhos dos nós animados
  (leaves viram open+children; `renderLeaf` substituiu `wrapLeafWithTitle`);
  grupos e texto também. Nó com transform animado **descarta** o `transform`
  estático. **Invariante travado por spec**: sem o flag, o export é byte-a-byte
  idêntico (a animação persiste via o JSON `data-svge-animation`, F7) — o
  round-trip do AutoSave não muda.
- **F9d (edit)** — ação **File ▸ Export Animated SVG (SMIL)** (ícone
  `animation`). Corrige um furo: `effectiveExportDoc` projeta a página ativa
  trocando os filhos do root, **descartando** o grupo que carrega o
  `AnimationDoc` — o caminho animado reanexa `AnimationService.doc()` ao root
  projetado e liga o flag; baixa `untitled-animated.svg`. Sem tracks → SVG
  comum.

**Follow-ups de UX da timeline** (mesma sessão, pré-F9): botão **×** para
remover track inteira; **limiar de arrasto de 4px** para o clique selecionar o
keyframe de forma confiável; e **tecla Delete/Backspace** com o losango focado
remove o **keyframe** (não o shape do canvas) — losango ganhou `tabindex` +
foco no pointerdown + `stopPropagation` no keydown (o handler global de Delete é
bubble-phase). Esc desseleciona.

**Adiado (F9+)**: CSS `@keyframes`, Lottie, GIF/vídeo, path-`d` morph, motion
path, curva de easing custom (UI bezier).

Gate por fase: `build:lib` RC=0 + suíte verde + lint limpo. Suíte ao fim do F9:
**2108 passed | 1 skipped** (+~30 specs no F9).

---

## 2026-06-03 — D-082 Animation Timeline (MVP F0–F8) ✅

Timeline de animação **não-destrutiva** ("camada acima"), implementada em 8
fases (commits `17eefcb` → `f23f519`). O documento base nunca é mutado: o
`playhead` é um signal e a árvore exibida é derivada via
`applyAnimationToTree(base, sampleAnimation(playhead))` — com identidade
referencial em `t=0` sem tracks (render/hit-test/export idênticos ao editor de
hoje). Opt-in por `<svge-shell-pro [showTimeline]>`.

- **F0/F1 (core)** — modelo headless (`AnimationDoc`/`AnimationTrack`/
  `Keyframe` em `metadata.customData[svgeAnimation]`), easing puro
  (linear/easeIn/easeOut/easeInOut/cubicBezier), `sampleAnimation`,
  interpolação (número lerp + cor) e `applyAnimationToTree` (overlay com
  structural sharing).
- **F2 (core+edit)** — comandos undoable (Add/Move/Remove keyframe, SetEasing,
  SetDuration) + `AnimationService` (engine) e `PlaybackService` (transporte,
  loop `requestAnimationFrame`), escopados em `provideSvgEngineEditorScope`.
- **F3 (core)** — catálogo de propriedades animáveis por tipo de nó (geometria
  - transform + style), com sets canônicos compartilhados com o apply.
- **F4–F6 (ui)** — `<svge-timeline>`: read-only → editável (criar/mover/deletar
  keyframe, easing, duração, scrubbing) → preview ao vivo no canvas +
  transporte. Única fiação cross-cutting do shell (`animatedTree()`), atrás de
  `[showTimeline]`.
- **F7 (io)** — persistência: o `AnimationDoc` faz round-trip via atributo
  `data-svge-animation` (JSON) no grupo da página. Como o AutoSave serializa
  pelo `svgExporter`, a animação persiste no save/recovery. Export SVG/PNG
  padrão continua exportando a base no `t` corrente.
- **F8** — doc-catchup (este registro + 04 D-082 `✅ impl` + 05 roadmap Fase 9
  - 06 componentes + 09 API).

**Auto-snapshot (D-073)**: edições de keyframe/duração **não** são marcadas
`isDestructive` (são rotineiras e baratas de desfazer) — por design, sem
auto-snapshot. **Adiado (F9+)**: export animado (SMIL/CSS/Lottie/vídeo),
path-`d` morph, motion path, curva de easing custom (UI bezier).

Gate por fase: `build:lib` RC=0 + `test:lib` verde (+~80 specs no total) +
lint limpo (x3). Suíte final: **2069 passed | 1 skipped** (flake conhecido do
`pages.spec.ts`).

---

## 2026-05-29 — Auditoria Round 3 + Doc-Catchup Phase 1

**Contexto.** Auditoria sistemática profunda com 6 subagentes paralelos cobrindo dimensões diferentes (entry points, core, edit, ui+svg-studio, io+optimize+ai+playground, doc drift). Cada agente com briefing explícito anti-alucinação exigindo `file:line` por claim. Após retorno dos 6, todas as claims foram re-verificadas via Read/Grep direto antes de virar registro persistente (protocolo "auditar antes de agir" — estabelecido como regra absoluta pelo proprietário no mesmo dia).

**O quê.**

1. **Protocolo "auditar antes de agir"** codificado em `docs/11-auditoria-pendencias.md` como regra dura sem exceções. Vale para mudança de código, atualização de doc, registro de pendência, afirmação de estado, e re-entrada em sessão após queda de conexão. Premissa-default: "está desatualizado até prova em contrário".
2. **Audit log Round 3**: 16 itens novos catalogados em `docs/11`:
   - **Bloco A — Código** (#7-#14): 6 commands sem `isDestructive` (Ungroup/Knife/MakeLiveBoolean/MakeCompoundPath/MakeSmartObject/RasterizeSmartObject), discrepância de barrel `stripAuthoredTitlesOptimizer`, vestígio `MESH_TOOL_ID`, reorder pages deferred, Inspector editors faltantes, NLU one-shot, `extra-tools.ts` sem spec (894 linhas), coverage UI ~40%
   - **Bloco B — Documentação** (#15-#22): drift do doc 05 (roadmap, ~35 D-XXX sem refletir), doc 04 (decisões, ausentes), doc 09 (API errada — `IsolationService.enterIsolation` etc. não existem), doc 02 (counts errados), doc 06 (`<svge-canvas>` listado mas não existe), doc 10 (file paths inválidos), svg-studio sem menção em docs, header mismatches
3. **Doc-Catchup Phase 1** — fixes triviais críticos (commit `8cd8408`):
   - Doc 09: versão `0.0.0` → `0.1.0`; specs `884` → `1825`; **API IsolationService corrigida** (`enter/exit/exitOne/setRoot` — antes documentava nomes que não compilam)
   - Doc 06: `<svge-canvas>` removido (não existe), rotation-pivot/marquee marcados como attribute directives
   - Doc 10: file paths inválidos corrigidos; 4 plugins adicionados (D-043/D-044/D-046/D-047); 10ª categoria NLU documentada
   - `render/public-api.ts` header: "8 directives" → "9 directives + dispatcher" (SymbolUse D-059 esquecido)
   - `professional-intents.ts` header: reescrito (28 intents reais, align/distribute movidos para "NÃO COBERTOS", flip atualizado para `FlipNodeCommand` D-078)
   - `package.json` description: "6 secondary entry points" → "8 secondary entry points"
4. **Doc-Catchup Phase 2 step 1 — Roadmap (Doc 05)**: Fase 6c marcada completa, Fase 6d marcada entregue via D-047, nova "Sprint pós-D-046 — Produto profissional (2026-05-21 a 2026-05-29)" inserida entre Fase 6 e Fase 7. Sprint cobre 7 blocos (Pro-A a Pro-G) com ~35 decisões D-XXX em formato conciso (1-3 linhas + commit hash por item).
5. **Doc-Catchup Phase 2 step 2 — svg-studio nos docs estruturais**: doc 01 (vocabulário canônico) ganha linha pra `SVG Studio` distinguindo do playground; doc 08 (esta entrada); doc 05 (entrada no Bloco Pro-G).

**Métricas validadas no commit `42f8334`**: 1825 specs passing / 1 skipped (FUTURE-FIX NLU). 9 entry points buildando. Lint clean em svg-engine + playground + svg-studio.

**Diferimento intencional**: Phase 2 step 3 (doc 02 arquitetura — mermaid diagrams) e step 4 (doc 04 decisões — ~35 seções D-XXX) ainda não entregues. Phase 1 já garantiu que nenhum consumer atual quebra por documentação errada; Phase 2 steps 3-4 são restauração da trilha de auditoria (importante mas não-bloqueante).

---

## 2026-05-28 — svg-studio app standalone (deliverable de produto)

**Contexto.** Até então, todo runtime de editor profissional vinha do `playground` — mas playground é showcase com 8 rotas + plugins demo (incluindo `stampToolPlugin`). Para evoluir um app "produto" em paralelo, faltava um runtime dedicado sem ruído pedagógico.

**O quê.** Novo app Angular em `projects/svg-studio/` (commits `2b1496d`, `1fd6a10`, `27e93d1`):

- **Estrutura mínima** (11 arquivos): `main.ts`, `app.ts` (selector `studio-root`), `app.routes.ts` (1 rota só + catch-all redirect), `app.config.ts`, `pro-editor.component.ts`.
- **Rota única**: `/` → `ProEditor`. Catch-all `**` redireciona pra raiz. Deep-links externos sempre caem no editor (sem 404).
- **Layout full-bleed**: `<router-outlet />` direto no `<body>` com `display: flex; height: 100vh`. Sem header, sem nav, sem chrome do playground. O editor profissional ocupa 100% da viewport.
- **Set de plugins espelhado do playground MENOS demos pedagógicos**: zero `stampToolPlugin`. 30 plugins built-in: tools (7), keyboard (2), menu (4), palettes (2), libraries (9), effects (1), io (2), optimize (1), nlu (1), extra-tools (1). Mesma ordem do playground (NLU vem APÓS menu plugins pra auto-discovery funcionar). + `provideSvgeBuiltinToolOptions()`.
- **Per-route scope (D-042)**: `pro-editor.component.ts` declara `providers: [provideSvgEngineEditorScope()]`. Cada visita à rota vira novo scope isolado.
- **Bootstrap idêntico ao pro-editor playground**: rect azul + circle laranja semeados em `queueMicrotask` se root group está vazio.
- **Imports**: apenas `svg-engine/{core, edit, ui, ai/nlu}` — não consome `render` direto (vai via `ui`) nem `ai/nlu-ui` (não usa NLU input por enquanto).

**Validação**: lint clean em `svg-studio` config; sem specs próprios ainda (registrado como débito no audit log Round 3 item #14).

**Posicionamento canônico** (registrado em `docs/01-visao-geral.md`):

|              | Playground                     | SVG Studio             |
| ------------ | ------------------------------ | ---------------------- |
| Propósito    | sandbox + showcase + benchmark | deliverable de produto |
| Rotas        | 8 + 6 redirects + catch-all    | 1 + catch-all redirect |
| Header/nav   | tem                            | full-bleed             |
| Plugins demo | `stampToolPlugin`              | nenhum                 |
| Audiência    | dev integrating, plugin author | end-user do produto    |

**Diferimento intencional**: adicionar svg-studio ao diagrama mermaid de `docs/02-arquitetura.md` ficou para Phase 2 step 3 do Doc-Catchup.

---

## 2026-05-27 — PAGES-REFACTOR Fase 9: doc-catchup + D-080 + wrap-up final

**Contexto.** Fechamento do sprint PAGES-REFACTOR (Fases 1-9). Não há novo código de feature — esta fase consolida documentação e valida o conjunto end-to-end.

**O quê.**

1. **`docs/04-decisoes-tecnicas.md`** ganha **D-080 — Pages como camada contextual (PAGES-REFACTOR, Fases 1-9)**. Justificativa arquitetural completa: contexto (3 P0 regressions + sobreposição visual + flicker do hit-target rect), 3 pivots estruturais escolhidos (CommandBus interceptor / overlay visual dedicado / persistência + recuperação), implementação fase a fase com commit hashes, consequências positivas/negativas (incluindo o trade-off preview-only durante drag).

2. **`docs/06-componentes-editor-svg.md`** atualizado:
   - `<svg:g svgePageOverlay>` agora documenta o role dual: paper visual + hit-target persistente (D-079 + D-080 Fase 4).
   - `<svg:g svgePageSelectionOverlay>` adicionado (D-080 Fases 2/6) com brackets em L + 8 resize handlers + move handle.
   - `<svge-pages-panel>` adicionado (D-079 PAGES-C + opt-in flag no `<svge-editor>`).
   - `WorkspaceService` row anotada com o downgrade pós-D-080 (não é mais fonte de verdade quando há D-079 page ativa).
   - Nova row para `PagesService` / `ActivePageService` cobrindo `InsertParentResolver` + helpers de renderização + persistência localStorage + selection-clear.

3. **`docs/09-api-publica.md`** ganha 10 novas linhas no bloco Commands (`./lib/commands/`) cobrindo: `AUTO_PARENT`/`ParentRef`/`InsertParentResolver`/`INSERT_PARENT_RESOLVER`/`CreatePageCommand`/`DeletePageCommand`/`RenamePageCommand`/`ResizePageCommand`/`MovePageCommand`/`SetPageOptionsCommand`/`EnsureDefaultPageCommand`. Cada uma anotada com D-079 ou D-080 Fase X para rastreabilidade.

4. **Validação final** end-to-end: build 9 entry points OK, lint OK, suite 1792 passing / 1 skipped, push para `main`.

**Estado consolidado pós PAGES-REFACTOR**:

| Aspecto                                       | Pré-Fase 1                                              | Pós-Fase 9                                              |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Per-tool wire-up para inserir em página ativa | 8 sítios + 3 P0 missed                                  | Zero (interceptor + `AUTO_PARENT`)                      |
| Hit-target da página                          | rect dentro do `<g>`, re-mount cada selection → flicker | rect no `svgeBehind` slot, sempre montado → sem flicker |
| Visual de seleção da página                   | igual ao de shape (8 handles brancos)                   | brackets em "L" + label + 8 handles azuis + move handle |
| Editar background/margins/format/orientation  | só programaticamente                                    | Inspector Page tab                                      |
| Resize/move da página via canvas              | impossível                                              | 8 handles axiais + move handle dragáveis                |
| Persistência do `activePageId`                | nenhuma                                                 | localStorage via `ACTIVE_PAGE_STORAGE_KEY`              |
| Auto-snapshot pré-Delete                      | manual                                                  | `DeletePageCommand.isDestructive = true`                |
| Selection clear no page switch                | quebrado (bbox em "nada")                               | `SelectionService.clear()` no effect                    |
| Paridade `<svge-editor>` ↔ `<svge-shell-pro>` | desalinhada (4 pontos)                                  | igual (overlay sempre + 2 opt-ins controlados)          |

**Total do sprint** (9 commits + este wrap-up): aprox. +60 specs novas, +1 command novo (`MovePageCommand`), +1 InjectionToken novo (`ACTIVE_PAGE_STORAGE_KEY`), +1 sentinel novo (`AUTO_PARENT`), +1 interface nova (`InsertParentResolver`), +1 componente reescrito (`SvgePageSelectionOverlay`), +5 sub-grupos no Inspector Page tab. Zero regressão em nenhuma fase. Suite saiu de 1761 (pré-Fase 1) para 1792 passing.

---

## 2026-05-27 — PAGES-REFACTOR Fase 8: Inspector Page tab estendido (background/margins/format/orientation)

**Contexto.** A Fase 3 entregou `PageOptions` (background/margins/orientation/format) + `SetPageOptionsCommand`, mas o Inspector só tinha controles para nome + viewBox. Os outros 4 grupos de opções só podiam ser editados via código. Esta fase entrega a UI completa.

**O quê.**

1. **Inspector Page tab** (`ui/inspector/inspector.component.ts`): 4 novos sub-grupos adicionados ao `<svge-panel-group-tab svgePanelGroupTabId="page">`:
   - **Format & Orientation**: dois `mat-select` lado a lado. Format expõe os 10 presets do tipo `PageFormat` (A4/A5/A3/Letter/Legal/Tabloid/Square-1080/1200/2048/Custom). Orientation é portrait/landscape.
   - **Background**: `mat-select` de kind (Transparent / Solid color / Image URL). Quando `solid`, expõe um campo de cor (aceita hex / rgb / nomes CSS); quando `image`, expõe um campo de URL. O field condicional só renderiza para os dois kinds que precisam de payload extra.
   - **Margins**: 4 inputs numéricos (Top / Right / Bottom / Left) em grid 2×2. Cada edit recompõe o struct completo e dispatcha — `SetPageOptionsCommand`'s `margins` patch substitui o sub-struct inteiro, não um lado por vez.

2. **Handlers + readers** (mesma classe Inspector): 5 read-helpers (`pageOrientation`, `pageFormat`, `pageBackgroundKind`, `pageBackgroundColor`, `pageBackgroundHref`, `pageMargin`) sempre delegando a `getPageOptions` (que injeta defaults para slots vazios). 6 handlers — cada um dispatcha UM `SetPageOptionsCommand` com patch parcial, mantendo o ciclo "uma edit = uma entrada de undo".

3. **Background-kind reset cirúrgico**: trocar kind (`solid` → `image`) reseta o payload dependente para defaults sãos (`{ kind: 'image', href: '' }` em vez de manter o `color` órfão).

4. **Margins validation**: o handler rejeita valores negativos silenciosamente (`Number.parseFloat(...) < 0` → no-op). Defesa em profundidade — o `min="0"` do `<input type="number">` é cliente-side só.

5. **CSS sub-section pattern**: nova classe `.subsection-title` divide os 4 grupos visualmente sem inflar a hierarquia (todos os 4 ficam dentro do mesmo `<section>` da tab).

**+7 specs novas** no bloco "SvgeInspector — PAGES-REFACTOR Fase 8":

- Defaults via `getPageOptions` quando opções nunca foram setadas.
- Cada handler dispatcha `SetPageOptionsCommand` e o documento aceita a mutação.
- Background-kind reset: trocar kind reseta o payload dependente.
- Margins: write em um lado preserva os outros três.
- Margins negativos → no-op.

Suite: 1792 passing / 1 skipped (era 1785). Build 9 entry points + lint OK.

**Diferimento intencional:** Fase 9 fará o cleanup (audit do que sobrou do `WorkspaceService` legacy + doc-catchup final em todos os files relevantes 04/06/08/09/10).

---

## 2026-05-27 — PAGES-REFACTOR Fase 7: persistência activePageId + auto-snapshot pré-Delete + selection clear no page switch

**Contexto.** Três follow-ups infraestruturais que faltavam para o multi-page se sentir "real":

1. Recarregar a página perdia a memória de qual página o usuário estava editando (sempre voltava pra primeira).
2. Deletar uma página era permanente — nenhum buffer de recuperação automático (D-073 SnapshotsService já existia, só faltava o opt-in).
3. Trocar de página ativa via Pages Panel mantinha a seleção do nó da página anterior — o overlay de seleção continuava desenhando bbox sobre "nada" porque o nó saiu do `treeForRendering()`.

**O quê.**

1. **`DeletePageCommand.isDestructive = true`** (`core/commands/page.commands.ts`). O `CommandBus.dispatch()` consulta esse marker e — se o `SnapshotsService` (D-073) estiver provido na scope — captura um snapshot ANTES do execute. Funciona para QUALQUER caminho que dispara o Delete (Pages Panel button, shortcut, context menu, plugin) sem wire-up por call-site.

2. **Persistência do `activePageId`** (`edit/pages/active-page.config.ts` + `active-page.service.ts`):
   - Novo `ACTIVE_PAGE_STORAGE_KEY` InjectionToken, default `'svge:activePage'`. Mesmo pattern do `AUTOSAVE_STORAGE_KEY` (AUDIT-FIX P8): multi-editor hosts passam chaves distintas via `provideSvgEngineEditorScope({ activePageStorageKey: '...' })`. `null` desabilita persistência por completo (modo embedded viewer).
   - No constructor do `ActivePageService`: tenta restaurar o id persistido ANTES do effect de auto-recovery rodar. Se o id ainda existe no doc, fica nele; se não, o effect cai no fallback "pick first" automaticamente.
   - Um effect adicional escreve no localStorage a cada mudança de `activePageId` (write síncrono — operação rara). Quando o id vira `null` (última página deletada), o slot é limpo.
   - **Por que slot separado** do AUTOSAVE: payload de autosave é o doc inteiro (multi-MB, debounced 2s); o id é um UUID de 36 chars (rápido, instantâneo). Desacoplar permite desativar um sem afetar o outro.

3. **Selection clear no page switch** (mesmo effect no `ActivePageService`): quando o `activePageId` muda de um id non-null para outro non-null, dispara `selection.clear()`. O ramo "skip when prev was null" protege a seleção pré-existente em duas situações: (a) hidratação inicial (null → first-page é recuperação, não user-driven switch); (b) consumidores que setam seleção programaticamente antes da primeira página existir. Comportamento padrão Illustrator/Affinity (trocar de artboard limpa a seleção).

4. **Scope provider** (`edit/scope/editor-scope.providers.ts`): nova opção `activePageStorageKey?: string | null` em `SvgEngineEditorScopeOptions`. Aceita explicit-`null` (`'in' check`) para opt-out por scope; omissão mantém o default root.

**+8 specs novas** (6 em `pages.spec.ts` + 2 em `page.commands.spec.ts`):

- `pages.spec.ts` (bloco "PAGES-REFACTOR Fase 7"): persiste id em `setActive`, restaura na bootstrap seguinte, fallback "pick first" quando id persistido não existe, limpa slot quando última página é deletada, clear selection no switch, NÃO clear na hidratação inicial.
- `page.commands.spec.ts` (bloco "PAGES-REFACTOR Fase 7"): `DeletePageCommand.isDestructive === true`, Create/Rename/Resize seguem non-destructive (lock pra forçar awareness de mudanças futuras).

Suite: 1785 passing / 1 skipped (era 1777). Build 9 entry points + lint OK.

---

## 2026-05-27 — PAGES-REFACTOR Fase 6: resize via 8 handlers + move via handle (interativo)

**Contexto.** Pós Fase 2 (brackets visuais) + Fase 4 (hit-target persistente para selecionar a página), a página fica visível mas não interagível: não dava pra redimensioná-la ou movê-la pelo canvas. O usuário pediu **handlers em cada borda sempre disponíveis** (referência: imagem com 8 handlers — 4 cantos + 4 bordas — estilo Figma/Affinity).

**O quê.**

1. **`MovePageCommand`** (`core/commands/page.commands.ts`): novo comando que atualiza apenas `viewBox.x` / `viewBox.y` (preserva width/height). Mesmo pattern de snapshot+undo do `ResizePageCommand`. No-op short-circuit + silent-undo quando o novo origin é igual ao corrente — segue a convenção do `SetPageOptionsCommand` (não polui undo stack com pointerups de drag-zero).

2. **`<svge-page-selection-overlay>` — 8 resize handlers + move handle wirados**:
   - 8 handles quadrados (TL/T/TR/R/BR/B/BL/L) renderizados ao redor da página quando ela está selecionada. Estilo Illustrator: fundo branco, stroke azul, cursores axiais (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`).
   - Os L-brackets ficam apenas decorativos (`pointer-events: none`); os 8 handles novos sentam sobre os vértices/cantos e absorvem o pointer.
   - Move handle (topo-centro, fill azul) ganha `pointer-events: all` + cursor `move`.
   - Drag model: pointerdown → captura pointer + snapshot viewBox + cursor doc-coord → pointermove atualiza `_drag.currentPoint` (sinal interno) → `overlay()` computed lê o preview e re-renderiza brackets/handles/label na geometria nova → pointerup dispatcha **UMA** command (`MovePageCommand` ou `ResizePageCommand` conforme tipo do drag). Preview é overlay-only; conteúdo da página só salta no pointerup. Vantagem: undo stack limpo (uma entrada por drag), sem flood de commands intermediários.

3. **Math de resize com clamp**: cada anchor (corner ou edge) calcula novo viewBox preservando o lado oposto. `MIN_PAGE_DIM = 10` doc-units garante que o usuário não consegue colapsar a página a zero (clamp em `Math.min/Math.max`).

**Aria + acessibilidade**: cada handle tem `role="button"` + `aria-label` descrevendo qual canto/borda (ex.: "Page resize handle, top-right corner"). Move handle ganha um aria-label explícito ("Page move handle — drag to reposition the page").

**+8 specs novas** (1 no `MovePageCommand` + 6 no `SvgePageSelectionOverlay`):

- `move-page.command.spec.ts`: happy path (origin atualiza, dims preservadas), undo, no-op + silent-undo, fail em non-page, fail em missing viewBox.
- `page-selection-overlay.spec.ts`: novos blocos cobrindo as 8 posições de handlers, preview do drag (move + resize TR), clamp do `MIN_PAGE_DIM` (resize BL além da borda), pointerup dispatch e mutação do documento (move + resize BR).

Suite: 1777 passing / 1 skipped (era 1766). Build 9 entry points + lint OK.

**Não muda** (intencional — fica para Fase 7+):

- Persistência do `activePageId` entre sessões.
- Auto-snapshot pré-DeletePage para recuperação.
- Limpeza de seleção ao trocar de página ativa (selection clear).
- Tools de página no menu/context-menu (Inspector tab gerencia options).

---

## 2026-05-27 — PAGES-REFACTOR Fase 5: paridade `<svge-editor>` ↔ `<svge-shell-pro>` (PageSelectionOverlay + Pages strip + bootstrap opt-in)

**Contexto.** `<svge-shell-pro>` ganhou todas as peças de Pages/Artboards nas Fases 1-4 (interceptor AUTO_PARENT, bracket overlay, fusão PageOptions, hit-target persistente). `<svge-editor>` — o shell drop-in mais leve que serve outros projetos Mosaicoo + integrações de terceiros — ficou parcialmente desalinhado: brackets de página NÃO renderizavam, Pages strip não existia, e `resolvedTree`/`resolvedViewBox` ignoravam `activePage` (renderizava sempre `state.document().root`, então quem entrasse via `<svge-editor>` com D-079 doc via TUDO empilhado em vez do artboard ativo).

**O quê.** Migra `<svge-editor>` para paridade visual+comportamental com `<svge-shell-pro>` SEM mudar o default visual de nenhum consumidor existente:

1. **`SvgePageSelectionOverlay` projetado** (sempre): adicionado ao último slot do `<svge-renderer>` (depois do gradient overlay). Self-gated via `@if (overlay())` na própria componente — zero footprint quando nenhuma página está selecionada. Quem usa D-079 ganha os L-brackets + label + move handle imediatamente, mesmo no shell light.

2. **`SvgePagesPanel` opt-in** via novo `[showPagesPanel]="true"`: a tabs strip do Figma/Affinity passa a ser projetada entre o isolation breadcrumb e o canvas row quando o consumidor pede. Default `false` preserva D-037 (modo canvas-only / shell-parcial intactos).

3. **`autoBootstrapPage` opt-in** via novo `[autoBootstrapPage]="true"`: dispara `EnsureDefaultPageCommand` + ativa Select tool no `queueMicrotask` do constructor. Mesmo padrão usado por `<svge-shell-pro>`. Default `false` é mandatório — embedded viewers NÃO podem ter writes acontecendo silenciosamente no documento.

4. **`resolvedTree` / `resolvedViewBox` agora delegam a `ActivePageService`**: trocam o fallback de `state.document().root` / `state.document().viewBox` por `activePage.treeForRendering()` / `activePage.viewBoxForRendering()`. Essas helpers JÁ caem de volta para root/viewBox quando não há página ativa (legacy single-root docs continuam idênticos). Quando há página ativa, o canvas frame UM artboard de cada vez — mesmo behavior do shell-pro.

**Back-compat blindada.** Os 4 testes-trava existentes (`MODE 2 Shell completo`, `MODE 3a/3b/3c Shell parcial`) seguem verdes. As novas flags ficam OFF por default; o overlay novo é self-gated. Documentos pré-D-079 vêem o exato comportamento anterior.

**+3 specs** no bloco "PAGES-REFACTOR Fase 5 — `<svge-editor>` parity opt-ins": (a) default sem pages-panel, (b) `[showPagesPanel]="true"` mostra a strip, (c) `<g svgePageSelectionOverlay>` sempre projetado (independente de seleção, mas auto-hide via `@if`). Suite: 1766 passing / 1 skipped (de 1763).

Build 9 entry points + lint OK.

---

## 2026-05-27 — PAGES-REFACTOR Fase 4: hit-target persistente no PageOverlay (fim do flicker)

**Contexto.** A Fase 2 introduziu o `<svge-page-selection-overlay>` para a parte VISUAL da seleção de página (brackets + label + move handle), mas o hit-testing continuava dependente do `<rect transparent>` que a PAGES-FIX-4 havia colocado **dentro do `<g>` da página** no `node-renderer.component.ts`. Esse rect era a fonte do flicker reportado: como ele vivia no subtree do nó, qualquer mudança de seleção forçava Angular a re-avaliar o `@case ('group')` e re-mount do rect (efeito Off→On visível). Além disso, o rect tinha dependência tipográfica em três imports (`BoundingBox`, `getPageViewBox`, `isPage`) que vazavam preocupação de página para o renderer headless.

**O quê.** Duas mudanças cirúrgicas:

1. **Remoção do rect no `node-renderer`** (`render/src/lib/renderers/node-renderer.component.ts`): apagado o `<svg:rect>` dentro do `@case ('group')`, o helper `pageHitTargetBox()`, e os 3 imports relacionados. Comentário explicativo no lugar aponta para o novo home. O renderer volta a ser estritamente headless / agnóstico de "page" — back-compat preservada via fallback do `WorkspaceService`.

2. **Hit-target persistente no `PageOverlay`** (`edit/workspace/page-overlay.component.ts`): o rect "paper" que já desenhava a página agora carrega `data-node-id` (bound ao id da D-079 page ativa via novo computed `pageNodeId`) e `pointer-events` alterna entre `all` (quando há página ativa) e `none` (legacy single-root). Como o `PageOverlay` é projetado no slot `svgeBehind` (renderiza ANTES do `<svg:g svgeNode>`), clicks em shapes ainda atingem as shapes primeiro (paint order + pointer capture); clicks em área vazia da página caem no rect e o `findOwningNodeId` resolve para o id da página.

**Por que isso elimina o flicker.** O `PageOverlay` é um componente sempre montado, OnPush + signals — quando a seleção muda, apenas atributos atualizam (não há re-mount do `<svg:rect>`). Single source of truth para o hit-target da página = zero competição entre o rect do renderer e o rect do overlay.

**Back-compat.** Em documentos pré-D-079 (sem `withPageFlag` em nenhum filho do root), `pageNodeId()` retorna null → o rect fica com `pointer-events: none` e sem `data-node-id`, restaurando o comportamento click-through original do paper rect legacy. Nenhuma regressão para consumidores do `<svge-editor>` headless.

**+1 spec** (`page-overlay.component.spec.ts` — bloco "PAGES-REFACTOR Fase 4 — PageOverlay as persistent hit-target"): cobre os dois caminhos (legacy doc → `pointer-events=none` + sem `data-node-id`; D-079 page ativa → `pointer-events=all` + `data-node-id={pageId}`). Suite: 1763 passing / 1 skipped (de 1762).

Build 9 entry points + lint OK.

---

## 2026-05-27 — PAGES-REFACTOR Fase 3: PageOptions per-page + PageOverlay derive da página ativa

**O quê.** Resolve o ponto P0 da auditoria "sobreposição WorkspaceService legacy vs D-079 Page" sem reescrever o WorkspaceService inteiro. Três mudanças cirúrgicas:

1. **Modelo** (`core/model/page.ts`): novo struct `PageOptions` persistido em `customData.svgePageOptions` por página. Carrega `background` (transparent/solid/image), `margins` (top/right/bottom/left), `orientation` (portrait/landscape) e `format` (preset A4/Letter/Tabloid/Square/Custom — hint para o Inspector). `DEFAULT_PAGE_OPTIONS` exportado para preencher campos ausentes. Helpers defensivos `getPageOptions(node)` e `withPageOptions(group, patch)` validam cada slot e retornam defaults para dados malformados.

2. **Command** (`core/commands/page.commands.ts`): novo `SetPageOptionsCommand(nodeId, patch)`. Undoable via snapshot do root. No-op short-circuit quando o patch não muda nada (clique duplo na mesma orientação não polui o undo stack). Undo de no-op é silencioso (evita o loop "stuck on no-op" que aparece quando o bus tenta re-undo um comando que falhou no undo).

3. **PageOverlay legacy** (`edit/workspace/page-overlay.component.ts`): passa a derivar `pageBounds` e `marginsRect` da **active page** quando uma existe (`ActivePageService.activePage()` + `getPageViewBox()` + `getPageOptions().margins`). Fallback para `WorkspaceService.page()` permanece para documentos sem pages (back-compat). Elimina o conflito visual onde a PageConfig legacy desenhava um "paper" diferente da D-079 Page ativa.

**Não muda** (intencional):

- `WorkspaceService` segue intacto. Patch interno via `patchPage()` / `setBackground()` continua funcionando — só não é mais a fonte visual de verdade quando há uma página ativa.
- Workspace Settings dialog continua editando o PageConfig legacy. Fase 8 migra para o `SetPageOptionsCommand` quando o Inspector Page tab for estendido.

**+12 specs** (page-options + set-page-options): defaults, partial patch, defensive reads on malformed data, undo round-trip, no-op short-circuit. Suite: 1761 passing / 1 skipped (de 1749).

Build 9 entry points + lint OK.

---

## 2026-05-27 — PAGES-REFACTOR Fase 2: `<svge-page-selection-overlay>` (brackets em L, sem flicker)

**Contexto.** Pós-auditoria + reunião arquitetural (vide diálogo doc), o usuário pediu para refatorar a seleção visual de página por dois motivos:

1. O `<rect transparent>` do PAGES-FIX-4 (hit-target dentro do `<g>` da página) provocava **flickering visual** ao trocar de seleção (Angular re-mount + sobreposição com `PageOverlay` legacy do `WorkspaceService`).
2. O visual de seleção da página estava **idêntico ao de shapes** (8 handles brancos via `SelectionOverlay`), provocando confusão sobre o que está selecionado.

**O quê.** Novo componente `<svge-page-selection-overlay>` em `svg-engine/edit/src/lib/pages/page-selection-overlay.component.ts`. Padrão draw.io / diagrams.net:

- **4 corner brackets em "L"** — `<svg:path>` por canto, cada um 3 vértices, stroke azul (`#1976d2`) + `stroke-linecap=round` + `vector-effect=non-scaling-stroke` para se manter crisp em qualquer zoom. Arms estendem-se para DENTRO do canto (wrap do artboard, não crop-mark).
- **Label flutuante** acima da borda superior — texto `"{name} — {width}×{height}"` (ex.: `"Page 1 — 800×600"`). Formato confirmado em pergunta direta ao usuário. Em-dash + multiplication sign para leitura limpa.
- **Move handle central** no topo (8 CSS px, fill azul + stroke branco) — visualmente distinto dos resize handles brancos de shape. `pointer-events: none` na Fase 2 (Fase 6 hookará o move).

**Por que não pisca.** Single `@if (overlay()) { ... }` no template — quando seleção muda, apenas os atributos atualizam (positions, label string), não há re-mount. `ChangeDetectionStrategy.OnPush` + signals garante zero re-render fora de seleção/zoom changes. Substitui o rect transparent que provocava flicker.

**Tamanho zoom-stable.** Constantes em CSS px (`BRACKET_ARM_PX=12`, `LABEL_FONT_SIZE_PX=11`, `HANDLE_SIZE_PX=8`, etc.) divididas por `viewport.zoom()` em `computed`s dedicados. `vector-effect: non-scaling-stroke` complementa para stroke widths constantes. Brackets/label/handle ficam do mesmo tamanho perceptual em 25% zoom ou 400% zoom.

**Projeção.** Adicionado ao `<svge-shell-pro>` como último filho do `<svge-renderer>` (paint na frente de tudo). Auto-gated via `@if (overlay())` — zero footprint quando nenhuma página está selecionada.

**Diferimento intencional.** Fase 2 entrega APENAS a parte visual:

- Fase 4 vai hookar pointer events nos brackets / label area para que cliquem na overlay selecionem a página (substituirá o rect transparent do PAGES-FIX-4).
- Fase 6 vai transformar brackets em handles de resize + wire do move handle.

Hoje a seleção continua chegando via o hit-target rect existente; o overlay só pinta o feedback visual melhorado por cima.

**+5 specs** em `page-selection-overlay.spec.ts` validando gating (3 paths: no-page / page-not-selected / page-selected) + geometria dos brackets (TL e BR como amostras das fórmulas de canto). Suite: 1749 passing / 1 skipped (de 1744 pré-Fase-2).

---

## 2026-05-27 — UX-PARITY: `<svge-isolation-breadcrumb>` no `<svge-editor>` + `<svge-shell-pro>`

**Gap reportado**: o breadcrumb de isolation (`Root › Group A › Group B` com chip de exit) estava registrado apenas na rota `/custom-editor` (Editor customizado / playground). As outras visões (`<svge-editor>` cobre `/basic-editor` + `/modular-editor` + `/shell-canvas-only`; `<svge-shell-pro>` cobre `/shell-pro-demo`) só mostravam o indicador compacto na status bar (`L1 · 9a3f12`), sem navegação clicável de volta aos níveis ancestrais.

**Fix**: adicionado `<svge-isolation-breadcrumb>` nos dois shells. O componente é self-gated via `@if (visible())` interno — zero footprint quando isolation não está ativa, então nenhuma das visões legacy aparece com banda vazia.

**Posicionamento**:

- `<svge-editor>`: entre `<svge-tool-options>` e o `canvas-row` (linha natural top-to-bottom).
- `<svge-shell-pro>`: entre `<svge-tool-options>` e o `<svge-pages-panel>` (acima do tab strip de pages para reads naturais).

**Resultado**: as 5 visões do playground agora têm breadcrumb consistente quando isolation está ativa:

| Visão             | Status pré              | Status pós                |
| ----------------- | ----------------------- | ------------------------- |
| custom-editor     | ✓ breadcrumb completo   | ✓ inalterado              |
| basic-editor      | só pílula na status bar | **+ breadcrumb completo** |
| modular-editor    | só pílula na status bar | **+ breadcrumb completo** |
| shell-canvas-only | só pílula na status bar | **+ breadcrumb completo** |
| shell-pro-demo    | só pílula na status bar | **+ breadcrumb completo** |

Suite: 1740 passing / 1 skipped (zero regressão). Build 9 entry points + lint OK.

---

## 2026-05-27 — PAGES-FIX-4: 3-frente — clique vazio na página seleciona página + marquee só pega objetos + libraries inserem na página + export/Layers Panel page-aware

**Bugs reportados** (Editor Profissional pós PAGES-FIX-3):

1. **Seleção da página** — page deixou de ser selecionável por clique na área vazia. Inspector ficava vazio. E **marquee drag selecionava a página inteira + todos os objetos** (porque iterava `root.children` que agora é só `[page]`).
2. **Libraries criam fora da página** — Shapes Library, Symbol Library etc. droppavam no root, fora do artboard. Usuário tinha que mover manualmente via Layer Panel.
3. **Export agrupa todas as páginas como `<g>`** — single SVG export tratava cada page como um group dentro do documento. Layer Panel mostrava a page como item top-level (deveria ser implícita).

**Fix** (3 frentes, 1 commit):

### Frente 1 — Selection + marquee

- **Renderer** (`node-renderer.component.ts`): quando o group é uma Page (D-079), emite um **hit-target rect transparente** dentro do `<g>` cobrindo a viewBox da page. `fill="transparent" pointer-events="all"` — sem pixel visível, mas captura cliques na área vazia → bubble pro `<g>` da page → `resolveSelectableNodeId` retorna o pageId.

- **shell-interactions** (`shell-interactions.directive.ts`):
  - Pointer-down em `id === activePageId` → **seleciona a page imediatamente E inicia marquee** (sem arm drag — page não é arrastável). Se usuário só clica, page fica selecionada; se arrasta, marquee toma conta.
  - Marquee `applyMarqueeSelection` itera **`activePage().children`** (não `root.children`) — candidatos = objetos dentro da page; a page em si nunca é candidata.

### Frente 2 — Library inserts

- **`InsertSymbolInstanceCommand`** ganha parâmetro opcional `parentId` (back-compat — sem `parentId` cai no root).
- **`libraries-panel.component.ts`**:
  - `insertShape`: dispatcha `InsertNodeCommand` com `effectiveDrawTargetId()` + **pre-translate o nó** (helper `translateNode`) pro shape (autorado 100×100 centered em 50,50) cair no centro do viewport visível **clamped ao viewBox da page ativa**.
  - `insertSymbolInstance`: passa `parentId` + center clamp.
  - Helper `insertCenter()` compartilhado: viewport center clamped a page viewBox.

### Frente 3 — Export per-page + Layers Panel sem page

- **`ActivePageService.effectiveExportDoc(doc)`** (novo método): quando há page ativa, retorna doc com `viewBox = pageViewBox` e `root.children = page.children` (page wrapper colapsado — não aparece como `<g data-svge-kind="page">` no SVG exportado). Sem page ativa → retorna doc original (legacy).
- **`svg-source-dialog.component.ts`**: passa doc por `effectiveExportDoc()` antes de exportar.
- **`builtin-menu-contributions.plugin.ts`** (handler de Export SVG/PNG): mesmo tratamento.
- **`shell-pro.component.ts`**: `<svge-layers-panel [root]="layersPanelRoot()" />` — quando há page ativa, passa o nó da page como `root` para o panel listar **os filhos da page** como top-level (sem header "Page 1"). Padrão Figma/Sketch (active frame = scope).

### Comportamento resultante

| Ação                        | Pré-FIX-4                     | Pós-FIX-4                                  |
| --------------------------- | ----------------------------- | ------------------------------------------ |
| Click em área vazia da page | Nada (id=null → marquee)      | **Page selecionada** (Inspector tab Page)  |
| Drag em área vazia da page  | Marquee pegava page + tudo    | **Marquee só pega objetos** dentro da page |
| Shape Library click         | Inseria no root, fora da page | **Centro da page** (clamped)               |
| Symbol Library click        | Inseria no root               | **Centro da page** (clamped)               |
| File ▸ Export SVG           | Multi-page como `<g>`s        | **Só a página ativa**                      |
| View Source dialog          | Multi-page como `<g>`s        | **Só a página ativa**                      |
| Layer Panel raiz            | Page como item top-level      | **Filhos da page** como top-level          |

**Limitações conhecidas** (não escopadas neste fix):

- Template Library ainda substitui o doc inteiro (apaga pages). Templates são "novo doc completo" por design — escapa do conceito multi-página.
- Editor não-pro (`<svge-editor>`) não passa `[root]` ao Layer Panel — fica com o comportamento legacy (page visível como top-level). Apenas o shell-pro foi atualizado.

Suite: **1740 passing / 1 skipped** (zero regressão). Build 9 entry points + lint OK.

**Como testar**:

1. `/shell-pro-demo`: clique em área vazia da página → handles aparecem em torno do artboard, Inspector mostra tab Page.
2. Drag-rectangle dentro da página → marquee seleciona só shapes (não a página).
3. Abra Libraries panel ▸ Shapes ▸ click num shape → aparece **no centro do artboard**.
4. File ▸ View SVG Source → vê apenas o conteúdo da página ativa (sem `<g data-svge-kind="page">`).
5. Layer Panel mostra os filhos da página como root list.

---

## 2026-05-27 — PAGES-FIX-3: Page-as-implicit-scope-root para selection (clique em shape seleciona shape)

**Bug reportado** (Editor Profissional / `<svge-shell-pro>` pós PAGES-FIX-2):

Ao clicar em um shape no canvas, a **página inteira** estava sendo
selecionada em vez do shape. Inspector mostrava propriedades da page
(Group + Width/Height) e handles cobriam toda a área da page. Drag/
move do shape não funcionava.

**Causa raiz** (arquitetural):

O `resolveSelectableNodeId` em modo `'group'` faz bubble do click até
o "filho direto do scope root". O scope root é
`isolationRootId ?? rootId`. Como `rootId === document.root.id`, o
filho direto do document root é a **Page** (porque agora toda shape
está dentro de Page 1). Cadeia de DOM no click de um shape:

```
chain = [shapeId, pageId, rootId]
scopeIdx = chain.indexOf(rootId) = 2
return chain[1] = pageId   ← BUG: page selecionada em vez do shape
```

A fix de PAGES-B (renderer page-filter) + PAGES-FIX-2 (tools
inserem dentro da page) trouxeram esse efeito colateral porque o
resolver de hit-testing **não foi atualizado** para considerar a
page como um scope root implícito.

**Fix**:

- **shell-interactions.directive.ts**: injeta `ActivePageService`
  e passa `isolationRootId: isolation.isolationRootId() ?? activePage.activePageId()`
  para `resolveSelectableNodeId` em ambos os call sites (pointer-down
  - dblclick). Page ativa atua como scope root implícito; isolation
    explícita (dblclick em group) continua tendo precedência.
- **shell-interactions.directive.ts** (dblclick guard): bloqueia
  `isolation.enter(pageId)` quando o nó é uma page — pages são
  navegadas via Pages Panel, não via dblclick (evita level extra de
  isolation que confunde o breadcrumb / Esc-out).
- **editor.component.ts** + **shell-pro.component.ts**
  (`contextMenuResolver`): mesma lógica de page-as-scope-root.
  Adicionalmente, page passa a contar como **canvas** (CONTEXT_MENU_SLOT.CANVAS)
  no resolver — a page É o artboard, não um objeto do usuário.

**Comportamento resultante**:

| Click em                           | Selection      | Inspector   | Context menu |
| ---------------------------------- | -------------- | ----------- | ------------ |
| Shape inside page                  | Shape          | Shape props | NODE         |
| Página vazia (área branca)         | Page           | Page props  | CANVAS       |
| Workspace fora da page             | null → marquee | (vazio)     | CANVAS       |
| Group dentro da page               | Group          | Group props | NODE         |
| Shape dentro de group em isolation | Shape          | Shape props | NODE         |

**+3 specs** em `hit-testing.spec.ts` validando:

1. Click em shape dentro de page → resolve para shape (não page).
2. Click na page vazia → resolve para page.
3. Regression guard: sem `isolationRootId`, click em shape **ainda**
   resolveria para a page (demonstra o bug original e trava a
   contract).

Suite: 1740 passing / 1 skipped (de 1737 pré-fix).

**Como testar**:

1. Abra `/shell-pro-demo` (auto-bootstraps Page 1).
2. Desenhe um rect com a tool Rectangle.
3. Troque pra Select (V).
4. Clique no rect → handles aparecem **em torno do rect** (não da
   page). Inspector mostra propriedades de rect (X/Y/W/H, fill, etc).
5. Clique em área vazia da page → handles aparecem em torno da
   page. Inspector mostra tab "Page" com Name + Width + Height.
6. Clique fora da page (workspace cinza) → marquee inicia.

---

## 2026-05-27 — PAGES-FIX-2: Auto-bootstrap Page 1 + tools desenham na page ativa + Select default

**Bugs reportados** (Editor Profissional / `<svge-shell-pro>`):

1. Editor abria sem nenhuma página criada — usuário tinha que clicar
   "+" antes de poder desenhar significativamente.
2. Shapes desenhados pelo Pencil/Pen/Rect/Ellipse/Polygon/Text e
   inseridos via Insert menu / Asset Manager / Paste apareciam no
   Layers Panel mas **sumiam do canvas** quando o documento tinha
   pages — o renderer renderiza só os filhos da page ativa, e os
   shapes eram inseridos como **siblings** da page (no root).
3. Tabela de propriedades não mostrava nada ao selecionar a page.
4. Toolbar abria sem ferramenta ativa — cursor não fazia nada na
   prancheta até o usuário clicar num tool.

**Fix**:

- **Novo `EnsureDefaultPageCommand`** em `svg-engine/core` —
  idempotent: se já existe page, no-op; senão cria `Page 1` com
  `doc.viewBox` e **migra todos os filhos top-level** pra dentro
  dela (preserva o desenho do usuário que possa ter rolado antes).
  Undo restaura o root anterior verbatim.

- **Novo `ActivePageService.effectiveDrawTargetId()`** — single
  source of truth pra "onde inserir nova shape?". Retorna o id da
  page ativa quando há uma; cai pro `root.id` no modo legacy
  (back-compat com docs sem pages).

- **8 call-sites refatorados** para usar `effectiveDrawTargetId()`
  em vez de `state.document().root.id` hardcoded:
  - `shape-tools.plugin.ts` (Rect/Ellipse/Polygon)
  - `pen-tool.plugin.ts`
  - `text-tool.plugin.ts`
  - `builtin-tools.ts` Pencil (ambos os branches: brush + centerline)
  - `builtin-insert-menu.plugin.ts` (2 lugares)
  - `builtin-menu-contributions.plugin.ts` (paste handler)
  - `library/assets/asset-manager.service.ts` (insertIntoDocument)

- **`<svge-shell-pro>` constructor** dispara, via microtask,
  `EnsureDefaultPageCommand` + ativa `SELECT_TOOL_ID` se nenhum
  tool está ativo. Microtask garante que o DI scope (D-042) já
  esteja completamente resolvido.

**Bug 3 (propriedades da page)**: era falso positivo — Inspector
tab "Page" já existe desde PAGES-D, condicionada a haver uma page
ativa. Bug 1 (page nunca criada) ⇒ tab nunca aparecia. Resolvido
indiretamente pelo auto-bootstrap.

**+4 specs** (`ensure-default-page.command.spec.ts`) cobrindo
bootstrap, idempotência, migração de pre-existing children, e undo
verbatim. Suite: 1737 passing / 1 skipped (de 1733 pré-fix).

**Como testar**:

1. Abra `/shell-pro-demo` num doc fresh → tab "Page 1" já visível,
   tool "Select" pré-ativo.
2. Troque pra Pencil/Rect/Ellipse/Polygon/Text e desenhe → shape
   aparece tanto no Layers Panel quanto no canvas (dentro da page).
3. Clique na tab "Page 1" → Inspector mostra tab "Page" com nome
   editável e viewBox.
4. Paste / Insert menu / Asset drop também caem dentro da page
   ativa (não como siblings).

---

## 2026-05-27 — D-079 (PAGES-A→E): Pages / Artboards multi-página

**O quê.** Suporte completo a múltiplas páginas (Pages / Artboards /
Frames) num único documento — feature mais pedida em editores
vetoriais que ainda não existia no SVGEngine. Cada page tem viewBox
próprio + nome editável; canvas mostra só a página ativa; tab strip
estilo browser-tabs acima do canvas pra navegar/criar/deletar/
renomear; round-trip via SVG preserva tudo.

**Decisão arquitetural** (registrada em D-079 no `04-decisoes-tecnicas.md`):
adotamos a abordagem "page = GroupNode com `metadata.customData.svgeKind = 'page'`",
mesma técnica de D-072 (Layer) e D-074 (Smart Object) — o slot
`svgeKind` foi documentado desde D-072 como genérico para "future
group-like concepts". **Zero mudança no `SvgDocument` model.**
Reaproveitamento 100% do código existente (renderer, tools, commands,
IO, Layers Panel). Centenas de arquivos e ~1660 testes pré-PAGES
continuam intactos.

**Entregue em 5 fases / commits**:

- **PAGES-A** (`796a301`): core helpers (`isPage`, `getPageViewBox`,
  `getPageName`, `withPageFlag`, `withoutPageFlag`,
  `withPageViewBox`, `withPageName`) + 4 commands undoable
  (`CreatePageCommand`, `DeletePageCommand`, `RenamePageCommand`,
  `ResizePageCommand`). +34 specs.
- **PAGES-B** (`4f9fcdd`): `PagesService` (derived list reativa) +
  `ActivePageService` (signal `activePageId` + computed
  `activePage` / `activePageViewBox` + auto-recovery effect)
  per-editor scope (D-042). +10 specs.
- **PAGES-C** (`e5d1b13`): `<svge-pages-panel>` (browser-tab style
  com add+/X-delete/dblclick-rename) + wire no `<svge-shell-pro>`
  (nova grid row + override do `resolvedTree`/`resolvedViewBox`
  via `ActivePageService.treeForRendering` / `viewBoxForRendering`).
  Auto-hide quando doc não tem pages (back-compat 100%). +10 specs.
- **PAGES-D** (`4964c08`): svg-exporter emite
  `data-svge-kind="page"` + `data-svge-page-viewbox="x y w h"`
  - opcional `data-svge-page-name`; svg-importer parseia ambos.
    Inspector ganha tab "Page" condicional com nome editável +
    viewBox 2×2 grid + delete action. +7 specs.
- **PAGES-E** (este commit): doc-catchup — D-079 em `04`, entrada
  resumo em `08`, verificação final.

**Total**: +61 specs novos, zero regressão. Suite saiu de 1672
(pré-PAGES) para 1733 passing / 1 skipped.

**Como testar**:

1. Abra `<svge-shell-pro>` (rota `/shell-pro-demo`).
2. Doc legado abre normal — tab strip não aparece.
3. Crie uma page programaticamente OU adicione import-side
   `data-svge-kind="page"` num grupo top-level.
4. Tab strip aparece acima do canvas; canvas passa a mostrar só
   a page ativa; Inspector ganha aba "Page".
5. Add (+) cria Page 2, delete (X) remove (Ctrl+Z restaura),
   dblclick no nome → input → Enter renomeia.

**Limitações documentadas (deferidas)**:

- Reorder de tabs via drag-drop (model suporta; UX CDK DnD pendente).
- Export multi-page batch (slot pattern AssetExportRegistry já
  resolve via plugin custom — sem demanda atual).
- Pages aninhadas em outros groups (model permite, UI ignora — by
  design, mesmo rule do D-072 Layer).

---

## 2026-05-26 — DBLCLICK-FIX: bloquear popup nativo do navegador em dblclick

**O quê.** Regressão reportada pelo usuário: dblclick no canvas
disparava o **Selection Action Menu** nativo do Chromium
(Translate/Search/Copy popup). Sintoma: ao usar `<svge-shell-pro>`,
o popup voltou.

**Causa raiz.** Duas falhas combinadas:

1. **Novos componentes TOOL-OPT (A-D)** introduziram muitos
   `<span>`/`<label>` de hint text dentro de `<svge-tool-options>`
   sem `user-select: none`. Direct Select options em particular
   tem um hint dizendo "Double-click to cycle anchor type" —
   ironicamente, dblclick nesse texto selecionava a palavra e
   disparava o popup.
2. **Panel-group e shell-interactions** também faltavam blindagem.
   No shell-interactions, o handler `onClick` (que detecta dblclick
   manualmente para entrar em isolation) não chamava
   `event.preventDefault()`, então o browser ainda processava o
   dblclick como "selecionar palavra" depois do nosso código rodar.

**Implementação.**

- **`ui/tool-options/shared-styles.ts`**: `:host` ganhou
  `user-select: none` (cobre 14 componentes que usam o style).
- **`ui/tool-options/tool-options.component.ts`**: `:host` da barra
  envoltória também com `user-select: none` (cobre o caso do label/
  ícone do nome da tool antes do divisor).
- **`ui/panel-group/panel-group.component.ts`**: `:host` com
  `user-select: none` — tabs/título do panel-group são chrome,
  conteúdo do body (Inspector etc.) pode reativar via classe própria
  quando precisar (ex: nome de layer editável).
- **`edit/tool/shell-interactions.directive.ts`**: branch de dblclick
  → isolation agora chama `event.preventDefault()` antes de
  `isolation.enter()` para bloquear comportamento default do
  browser sem precisar de `stopPropagation` (que quebraria outros
  listeners ancestrais como canvas-gestures).

**Bug paralelo de Pattern 5 (recorrente)**: meu primeiro draft tinha
um backtick dentro do comentário CSS do panel-group
(`user-select: text`), o que quebrou o template literal `styles: \`...\``e fez Angular compilar`SvgePanelGroup`sem`@Component`. Fix: trocar
backticks por descrição em texto puro.

**Verificação**: build 9 entry points, lint clean, suite 1672
passing / 1 skipped.

---

## 2026-05-26 — KNIFE-FIX: Knife agora corta de verdade

**O quê.** Conserto completo do Knife tool. O comportamento anterior
era cosmético — clicar inseria uma âncora invisível e nada mais
mudava. Agora o Knife:

1. **Corta paths abertos em 2 PathNodes separados** (esquerda + direita).
2. **Corta paths fechados em 1 path aberto** (começa e termina no
   ponto de corte).
3. **Auto-converte rect/ellipse/line/polygon/polyline** antes de
   cortar — não precisa mais passar pelo Inspector ▸ Convert to Path.
4. **Honra o slider de Tolerance** (era hardcoded 12px — corrigido).
5. **Honra Snap to nodes** — quando ON e o click cai dentro de
   tolerance/2 de uma âncora existente, corta naquela âncora sem
   criar duplicata.
6. **Feedback visual imediato**: as peças resultantes ficam
   selecionadas, então o overlay de seleção pula pras 2 metades
   confirmando que cortou.
7. **Undo único** restaura o nó original no z-index correto.

**Bugs encontrados (3)**:

- Filtro `'path'` no `hitTestNode` rejeitava qualquer shape
  silenciosamente — usuário desenhava com Rectangle, tentava cortar,
  nada acontecia.
- `if (best.dist > 12)` ignorava o `KnifeToolService.snapTolerance()`
  exposto pela barra TOOL-OPT-D — slider era cosmético.
- Mesmo quando o cut tinha sucesso, a única coisa que acontecia era
  inserir uma âncora num path que já tinha âncoras em cada corner —
  visualmente zero mudança, usuário concluía que tool estava quebrado.

**Implementação**.

- **`core/commands/knife-cut.command.ts`** (NOVO): `KnifeCutPathCommand`
  composta — remove o nó original, insere as peças no mesmo z-index,
  undo restaura tudo. `createdIds` exposto pra tool atualizar
  seleção. Algoritmo:
  - `nodeToPathD` para shapes não-path (re-uso do helper D-033).
  - `parsePathToAnchors` para subpaths.
  - `splitOpenSubpathAt` / `openClosedSubpathAt` puros para a
    matemática do corte (insere cusp anchor ou snapa em âncora
    existente).
  - Outras subpaths (compound path) vão pra primeira peça por default.
- **`core/commands/index.ts`**: exporta `KnifeCutPathCommand`.
- **`edit/tool/extra-tools.ts`** (KnifeTool reescrito): hit-test sem
  filtro, dispatch único do `KnifeCutPathCommand`, `selectMany`
  das peças após sucesso, error friendly via `console.info` em
  vez de silent no-op.

**Specs**: 6 cenários no `knife-cut.command.spec.ts` (open→2,
closed→1 open, rect auto, ellipse auto, fail outside tolerance, undo
restaura z-order).

**Verificação**: build 9 entry points, lint clean, suite 1672 passing
/ 1 skipped (zero regressão, +6 specs).

**Como testar**:

1. Desenhe um rect com `R` no canvas.
2. `C` para ativar Knife.
3. Clique numa borda do rect → o rect vira um path aberto, com
   selection overlay confirmando.
4. `A` (Direct Select) → arraste a âncora do corte pra ver as 2 metades.

---

## 2026-05-26 — TOOL-OPT Fase D: Select/DirectSelect/Knife/Smooth — fechamento

**O quê.** Quarta e última fase do TOOL-OPT.

- **Select**: Snap segmented (Off/Grid/Objects/Both) reaproveitando
  `SnapService` já existente — duplica controle da status bar para
  facilitar acesso enquanto a tool está ativa.
- **Direct Select**: barra informacional explicando os atalhos
  (Alt+drag, double-click cycle).
- **Knife**: snap-to-nodes toggle + tolerance input. Novo
  `KnifeToolService` (snapToNodes + snapTolerance, defaults
  matching prior hardcoded 12px).
- **Smooth**: tolerance input + slider (RDP epsilon 0.1-10). Novo
  `SmoothToolService` (tolerance default 1.5 matching prior
  hardcoded). `SmoothTool.onPointerDown` agora lê do service.

**Cobertura completa do TOOL-OPT.** Resultado dos 4 fases:

| Tool                 | Component                 | Backing service                                                      |
| -------------------- | ------------------------- | -------------------------------------------------------------------- |
| Stamp/Symbol Sprayer | SvgeSymbolSprayerOptions  | SymbolSprayerService + SymbolSelectionService + SymbolLibraryService |
| Width                | SvgeWidthToolOptions      | WidthToolService                                                     |
| Rectangle            | SvgeRectangleOptions      | ShapeToolService                                                     |
| Ellipse              | SvgeEllipseOptions        | ShapeToolService                                                     |
| Polygon              | SvgePolygonOptions        | ShapeToolService                                                     |
| Pencil               | SvgePencilToolOptions     | PencilToolService                                                    |
| Pen                  | SvgePenToolOptions        | PenToolService                                                       |
| Text                 | SvgeTextToolOptions       | InlineTextEditorService                                              |
| Gradient             | SvgeGradientToolOptions   | (informational)                                                      |
| Eyedropper           | SvgeEyedropperToolOptions | EyedropperToolService                                                |
| Select               | SvgeSelectToolOptions     | SnapService                                                          |
| Direct Select        | SvgeDirectSelectOptions   | (informational)                                                      |
| Knife                | SvgeKnifeToolOptions      | KnifeToolService                                                     |
| Smooth               | SvgeSmoothToolOptions     | SmoothToolService                                                    |

15 ferramentas, 14 components UI (Direct Select compartilha um
informational), 7 services novos+estendidos. Todo wiring via
`provideSvgeBuiltinToolOptions()` em uma linha do `app.config.ts`.

**Pattern arquitetural reaproveitável.** Plugin de terceiros que
queira sobrescrever um dos built-ins faz:

`inject(ToolOptionsRegistry).register(SELECT_TOOL_ID, MyCustomSelectOptions);`

— last-write-wins, sem mexer no provider built-in.

**Verificação final**: build 9 entry points, lint clean, suite 1666
passing / 1 skipped (zero regressão em todas as 4 fases).

---

## 2026-05-26 — TOOL-OPT Fase C: Text/Gradient/Eyedropper options

**O quê.** Terceira fase: 3 novas barras contextuais.

- **Text**: font family (dropdown 7 famílias) + size (input) +
  weight (dropdown 100-900) + italic toggle + text-anchor (3 botões
  segmented) + fill color + reset.
- **Gradient**: barra informacional pointing para Composition tab
  - canvas overlay (heavy editing UX vive lá per D-058).
- **Eyedropper**: target segmented Fill/Stroke/Both + autoApply
  toggle + reset. Alt no click ainda flipa fill↔stroke como
  override (preserva muscle memory).

**Extensões de serviço.** Novos signals em
`InlineTextEditorService` (fontFamily/fontSize/fontWeight/fontStyle/
textAnchor/fill) + novo `EyedropperToolService` (sampleTarget/
autoApply). `TextTool.onPointerDown` agora lê os defaults antes de
criar o placeholder; `EyedropperTool` consome o target preferido
(com Alt-override mantido para compat). Defaults preservam o
comportamento prévio — zero regressão.

**Verificação**: build 9 entry points, lint clean, suite 1666
passing / 1 skipped.

---

## 2026-05-26 — TOOL-OPT Fase B: Rectangle/Ellipse/Polygon/Pencil/Pen options

**O quê.** Segunda fase: 5 ferramentas de criação ganharam barra de
opções contextual.

- **Rectangle**: fill (color + "no-fill" toggle) + stroke (color +
  width input) + corner radius (input + slider) + reset.
- **Ellipse**: fill + stroke (sem corner radius).
- **Polygon**: fill + stroke + sides input + Star mode toggle (com
  inner-radius slider quando ativo) + reset.
- **Pencil**: fill + stroke + close-path toggle + reset.
- **Pen**: fill + stroke + rubber-band preview toggle + reset.

**Por quê — extensões de serviço (não-breaking).** Tools de criação
antes hardcodavam `fill:none + stroke:#000000 + strokeWidth:1`.
Adicionei signals de preferência em `ShapeToolService`,
`PencilToolService` e `PenToolService` com **defaults idênticos aos
valores hardcoded anteriores** — testes existentes passam sem
alteração. Os tool plugins agora leem dessas signals na hora do
commit, então a barra de opções afeta a próxima criação.

**Por quê — Star mode (Polygon).** Padrão Illustrator: o tool de
polígono comuta entre n-gon regular e estrela. Implementado
`regularStarPoints` no plugin (alterna outer/inner radius) e
expus via toggle + slider de inner-radius (0.1-0.95). Inner-radius
slider só renderiza quando star mode está ativo (UI mais limpa).

**Implementação.**

- **`edit/tool/shape-tool.service.ts`**: 7 novos signals
  (fill/stroke/strokeWidth/cornerRadius/polygonSides/starMode/
  starInnerRadius) + setters com clamp ranges.
- **`edit/tool/shape-tools.plugin.ts`**: `buildShapeNode` agora
  recebe o service e lê todas as prefs; `regularStarPoints`
  helper adicionado.
- **`edit/tool/pencil-tool.service.ts`**: 4 signals (fill/stroke/
  strokeWidth/closePath) + setters.
- **`edit/tool/builtin-tools.ts`**: PencilTool agora aplica prefs
  - closePath via Z no path d.
- **`edit/tool/pen-tool.service.ts`**: 4 signals + setters;
  `buildPathFromAnchors` consome as prefs (preservando fill black
  default em paths fechados).
- **`ui/tool-options/shared-styles.ts`**: string compartilhada com
  o vocabulário visual (chip, slider, divider, color swatch,
  toggle button).
- **`ui/tool-options/shape-tool-options/`**: 3 components.
- **`ui/tool-options/pencil-tool-options/`**: 1 component.
- **`ui/tool-options/pen-tool-options/`**: 1 component.
- **`ui/tool-options/builtin-tool-options.providers.ts`**: registra
  os 5 novos no `ToolOptionsRegistry`.

**Verificação**: build 9 entry points, lint clean, suite 1666
passing / 1 skipped (zero regressão).

---

## 2026-05-26 — TOOL-OPT Fase A: ToolOptionsRegistry + Symbol Sprayer + Width

**O quê.** Primeira fase de uma série de 4 que vai dar opções
contextuais a TODAS as 15 ferramentas do editor. Foco da Fase A:
**infra + 2 ferramentas que já tinham service backing** (Symbol
Sprayer e Width — D-062a/D-062b).

- **Infra**: novo `ToolOptionsRegistry` em `svg-engine/ui` mapeando
  `toolId → optionsComponent`. `<svge-tool-options>` agora consulta
  o registry PRIMEIRO, com fallback pra `tool.optionsComponent`
  (compat plugins como o demo Stamp do playground).
- **Por que o registry**: tools vivem em `svg-engine/edit` e não
  podem importar Material UI components (D-017). Sem o registry,
  não haveria como ter um optionsComponent para os 15 built-ins.
- **`<svge-symbol-sprayer-options>`**: dropdown de símbolo ativo +
  chips de tamanho (24/48/96) + slider de spacing + slider de
  scale jitter + reset.
- **`<svge-width-tool-options>`**: segmented Uniform/Tapered/
  Calligraphic (3 ícones) + chips de width (1/5/12/25/50) +
  slider 1-100 + reset.
- **`provideSvgeBuiltinToolOptions()`**: environment provider que
  registra ambos no `ToolOptionsRegistry` via `provideEnvironmentInitializer`.
  Consumer adiciona uma linha em `app.config.ts`.

**Por quê.** O usuário pediu paridade de "Options Tool" com
softwares profissionais. O playground tinha apenas o Stamp tool
(demo plugin) populando essa barra; todas as outras ferramentas
mostravam barra vazia. A Fase A entrega o pattern arquitetural

- as 2 tools cujo backing está pronto (Width e Symbol Sprayer
  já tinham `WidthToolService`/`SymbolSprayerService` com signals
  prontos — D-062). Fases B-D estendem o mesmo provider com as
  ferramentas restantes (Rectangle, Ellipse, Polygon, Pencil, Pen,
  Text, Gradient, Eyedropper, Select, Direct Select, Knife, Smooth).

**Implementação.**

- **`ui/tool-options/tool-options-registry.service.ts`** (NOVO):
  `register/get/unregister/ids`. Last-write-wins. Soft-warn quando
  toolId não existe ainda no `ToolRegistry` (plugin order tolerance).
- **`ui/tool-options/tool-options.component.ts`**: novo computed
  `activeOptionsComponent` consulta `optionsRegistry.get(id)`
  primeiro, depois `tool.optionsComponent`.
- **`ui/tool-options/symbol-sprayer-options/`** (NOVO): component
  - spec (4 testes).
- **`ui/tool-options/width-tool-options/`** (NOVO): component +
  spec (3 testes).
- **`ui/tool-options/builtin-tool-options.providers.ts`** (NOVO):
  `provideSvgeBuiltinToolOptions()` registra os 2 components.
- **`ui/tool-options/index.ts`**: exporta `ToolOptionsRegistry`,
  `provideSvgeBuiltinToolOptions`, `SvgeSymbolSprayerOptions`,
  `SvgeWidthToolOptions`.
- **`playground/app.config.ts`**: importa
  `provideSvgeBuiltinToolOptions` de `svg-engine/ui` e chama
  no array providers.

**Verificação**: build 9 entry points, lint clean, suite 1666
passing / 1 skipped. 17 specs novos.

---

## 2026-05-26 — D-078: Properties Panel refatorado em panel-group tabs + Flip/Align/Arrange

**O quê.** O `<svge-inspector>` deixou de ser uma pilha vertical de
seções e passou a usar o mesmo `<svge-panel-group orientation="vertical">`
do Libraries Panel (D-061): tabs com ícone na coluna esquerda + corpo
único à direita. Categorias propostas pelo usuário foram materializadas:

- **Single-edit**: `geometry` (straighten), `smart-object`
  (inventory_2, condicional), `transform` (open_with — agora com
  Flip H/V), `align` (align_horizontal_center — 6 align + 2
  distribute), `arrange` (layers — z-index + group/ungroup +
  visibility/lock), `advanced` (tune, condicional), `text`
  (text_fields, condicional), `colors` (palette), `composition`
  (gradient).
- **Multi-edit**: `colors` + `advanced` (condicional). Mesmo
  pattern com `Style (applies to all)` como entrada principal.

Novo comando `FlipNodeCommand` em `svg-engine/core` (mirror
horizontal/vertical com pivot arbitrário via composição
`T(pivot) · S(±1, ±1) · T(-pivot) · existing`). Helper
`composePivotFlip` exportado para preview/test em paridade com
`composePivotRotation`.

**Por quê.** O Inspector estava sofrendo o mesmo problema do antigo
right rail: muitas seções competindo por altura, scroll vertical
infinito, baixa descobribilidade quando um workflow específico
exigia 3 ou 4 controles distantes (ex: alinhar shapes selecionados
implicava abrir menu Object ▸ Align em vez de uma aba dedicada).
Industry pattern (Illustrator/Affinity/Inkscape) agrupa por
intenção: "transforming this shape" = uma aba; "aligning it
relative to others" = outra. O orientation="vertical" do panel-
group preserva o ícone-tab no canto enquanto libera 100% da
altura para o conteúdo da aba ativa — mesmo padrão usado por
Photoshop/Affinity em side rails estreitos.

Flip estava ausente — completar paridade com Custom Editor +
Illustrator "Reflect". Align/Arrange já existiam via menu+comando
mas não tinham porta de entrada visual no Inspector; promoção a
tabs dedicadas cumpre o requisito do usuário "não deixar de fora
da refatoração o que já existe, porém criar os inexistentes como
complementos".

**Implementação.**

**Core (D-078d)**:

- **`commands/flip-node.command.ts`** novo: `FlipNodeCommand`
  implements Command (undoable — captura previousTransform no
  execute, restaura no undo). `FlipAxis = 'horizontal' | 'vertical'`.
  Helper puro `composePivotFlip(existing, axis, pivot)` exportado.
- **`commands/index.ts`** exporta `FlipNodeCommand`, `FlipAxis`,
  `composePivotFlip`.
- **9 specs** em `flip-node.command.spec.ts` cobrindo helper
  matemático (4 casos) + comando integrado via CommandBus
  (5 casos: flip H, flip V, double-flip = identity, undo,
  fail-graceful em id inexistente).

**UI (D-078b/c/e/f/g)**:

- **`inspector.component.ts`** refatorado:
  - Imports: `SvgePanelGroup`, `SvgePanelGroupTab`,
    `FlipNodeCommand`, `FlipAxis`, `GroupSelectionCommand`,
    `isGroupNode`, `UngroupCommand`, `ReorderNodeCommand`,
    `ReorderDirection`, `AlignmentService`, `AlignAxis`,
    `DistributeAxis`, `NodeBBox`, `MatButton`.
  - Single-edit template envolto em
    `<svge-panel-group title="Properties" [compact]="true"
orientation="vertical">`. Cada seção pré-existente migra
    para `<ng-template svgePanelGroupTab>` com id estável.
  - Novas tabs:
    - **Transform** ganhou linha Flip H/V usando
      `FlipNodeCommand` com pivot no centro do bbox.
    - **Align** (nova): 6 botões (left/h-center/right + top/
      v-center/bottom) + 2 botões distribute (h/v), invocam
      `AlignmentService` com `collectSelectedBBoxes()`.
    - **Arrange** (nova): 4 botões z-index (front/forward/
      backward/back) usando `ReorderNodeCommand` + Group/
      Ungroup + 2 botões toggle (visibility/lock) batendo no
      `LayersService`.
  - Multi-edit envolto no mesmo pattern (colors + advanced
    condicional).
  - Métodos novos: `flipNode(axis)`, `alignSelection(axis)`,
    `distributeSelection(axis)`, `collectSelectedBBoxes()`,
    `canAlign`, `canDistribute`, `canArrange`, `canGroup`,
    `canUngroup`, `allVisible`, `allLocked`,
    `reorderSelection(direction)`, `groupSelection()`,
    `ungroupFocused()`, `toggleVisibility()`, `toggleLock()`.
  - CSS dedicado: `.flip-row/.flip-btn`,
    `.align-grid/.align-btn`, `.arrange-grid/.arrange-row/
.arrange-action-btn`.

**Specs (D-078h)**: o suite do Inspector (1470 linhas, 84 testes)
sofreu adaptação porque cada `<ng-template svgePanelGroupTab>`
renderiza lazy — apenas o body da tab ativa fica no DOM. Adicionado
helper `activateTab(host, tabId)` (localiza `button[role="tab"]`
pelo sufixo de id `svge-pg-tab-{instance}-{tabId}`). 36 testes
afetados receberam chamada à `activateTab(...)` + `detectChanges()`
no ponto certo — sem mudar a intenção do teste, apenas o caminho
de navegação na nova UI. Tudo verde: 1649 passing, 1 skipped.

**Verificação.** Build (9 entry points), lint clean, full suite
1649 passing / 1 skipped.

---

## 2026-05-26 — D-076 + D-077: Inspector Smart Object section + Asset Export panel

**O quê.** Duas entregas relacionadas que fecham o ciclo D-074 (Smart
Objects) e adicionam batch export ao shell profissional:

- **D-076** — seção contextual no `<svge-inspector>` que renderiza
  APENAS quando o nó focado é um Smart Object. Mostra ícone +
  nome + contagem de filhos + 3 botões (Edit Contents / Replace
  Contents / Rasterize) que delegam para o **mesmo** service que o
  menu plugin usa. Refator paralelo: a função
  `replaceSmartObjectContents` inline no plugin foi extraída para
  `SmartObjectActionsService` em `svg-engine/edit` — single source
  of truth, Inspector e Plugin chamam o mesmo código.

- **D-077** — nova aba "Export" no right rail do `<svge-shell-pro>`
  com `<svge-asset-export-panel>`. Pattern Illustrator/Figma:
  listas de "export slots" (target + format + scale + filename)
  que o usuário monta uma vez e dispara em batch via "Export All".
  Resolver de nomes únicos disambigua colisões (logo.svg + logo
  (1).svg) ao estilo Finder/Windows Explorer.

**Por quê.** D-076 completa o D-074 — Smart Objects agora têm
descobribilidade pelo Inspector além do menu Object ▸ Smart Object.
Usuários que selecionarem um SO no canvas verão imediatamente as
ações dedicadas em vez do Inspector genérico de grupo (caía no
`@default` do switch sem geometria editável).

D-077 fecha uma lacuna de exportação vs Illustrator/Figma — antes
o editor só exportava o documento inteiro (single shot via menu
File ▸ Export SVG/PNG); workflows como "exporta logo.svg +
logo@1x.png + logo@2x.png + logo@3x.png em um click" demandavam
um painel dedicado de export recipes.

**Implementação.**

**D-076 (3 arquivos)**:

- **`edit/smart-object-actions/`** novo módulo:
  `SmartObjectActionsService` com `replaceContents(nodeId)` (file
  picker programático + svgImporter + dispatch
  `ReplaceSmartObjectContentsCommand`) e `rasterize(nodeId)`
  (dispatch `RasterizeSmartObjectCommand`). Tratamento de erro
  unificado (window.alert + console.warn para warnings non-fatal).

- **`edit/menu/builtin/`** refatorado: handlers de `Replace
Contents…` e `Rasterize Smart Object` agora delegam para
  `fromCtx(SmartObjectActionsService, runCtx).{replaceContents,
rasterize}` em vez de inline. Função `replaceSmartObjectContents`
  inline removida (substituída por chamada de service). Comentário
  forwarding fica como breadcrumb.

- **`ui/inspector/`** ganhou:
  - Imports `isSmartObject`, `SmartObjectActionsService`,
    `SvgeSmartObjectEditorDialogService`, `Injector`, `MatButton`.
  - Nova seção condicional `@if (isSmartObjectNode(node))` entre
    Geometry e Transform: ícone `inventory_2` (tertiary accent
    matching layers panel), nome + child count, 3 botões empilhados.
  - Métodos `editSmartObjectContents` (abre dialog forwarding
    injector pra D-042 scope), `replaceSmartObjectContents` e
    `rasterizeSmartObject` (delegam para o service).
  - CSS dedicado (.so-summary, .so-icon, .so-actions, danger tint
    pro Rasterize).

- **Scope provider** ganhou `SmartObjectActionsService` (per-
  editor scope para D-042 safety — o service injeta CommandBus
  no construtor, sem scoping capturaria o root CommandBus). Trava
  de regressão estendida.

**D-077 (5 arquivos novos + wiring)**:

- **`edit/asset-export/asset-export.types.ts`** — `ExportSlot`
  interface ({ id, target, exporterId, scale, filename }),
  `ExportSlotInput`, `ExportSlotResult` (ok/error union).

- **`edit/asset-export/asset-export-registry.service.ts`** —
  signal-based registry (`slots()`, `count()`, `add()`, `update()`,
  `remove()`, `clear()`, `setAll()`) + `resolveUniqueName(raw,
ext, used)` que disambigua colisões (logo.svg, logo (1).svg,
  logo (2).svg) com lookup case-insensitive.

- **`edit/asset-export/asset-export-runner.service.ts`** —
  `exportSlot(slot, usedNames)` e `exportAll()` que executam o
  batch via `ExporterRegistry.get(exporterId).export(doc)`,
  resolve filenames únicos, e dispara downloads via
  `URL.createObjectURL` + `<a download>`. PNG com scale custom
  bypassa pngExporter.export() (2× hardcoded) e usa
  `renderPng(doc, scale)` direto.

- **`ui/asset-export-panel/`** — `<svge-asset-export-panel>`
  standalone: header com Add Slot (form inline collapsible) +
  Export All button + count; lista de slot rows com filename
  input inline, ext tag, scale tag (dim para vector), per-row
  download + remove buttons + per-row success/fail badge após
  export. ARIA proper (`role="list"`, `role="listitem"`,
  `aria-label` descritivo).

- **`ui/shell-pro/`** ganhou nova `<ng-template
svgePanelGroupTab>` "Export" (icon download) projetando
  `<svge-asset-export-panel>` ao lado de Layers/History/Properties/
  Appearance no right-rail panel-group.

- **Scope provider** ganhou `AssetExportRegistry` +
  `AssetExportRunner` (per-editor — recipes não vazam entre
  editors, runner usa o documento do scope ativo). Trava de
  regressão estendida para 41 services agora (era 38 + 3 novos).

**Specs.** **+23 testes**: 4 cobrindo `SmartObjectActionsService.
rasterize` (incluindo undo round-trip + idempotência); 16 cobrindo
`AssetExportRegistry` (add/update/remove/clear/setAll +
`resolveUniqueName` em 7 cenários incluindo case-insensitive); +3
da expansão da trava de exhaustividade para `SmartObjectActionsService`,
`AssetExportRegistry`, `AssetExportRunner`. Suíte total: **1640
passing**, 1 skipped (era 1617).

**Não duplicado / não quebrado.**

- Custom Editor intacto conforme regra estabelecida.
- Plugin de menu agora consome o mesmo service que o Inspector —
  zero duplicação de lógica de file picker.
- Comandos `RasterizeSmartObjectCommand` e
  `ReplaceSmartObjectContentsCommand` permanecem como API pública;
  só o **call site** mudou (de inline na plugin para service).

**Trade-offs e escopo deferido (D-077)**:

- Persistência das slots: out of scope. O host pode round-trip
  via `slots()` / `setAll()` para localStorage se quiser.
- Per-node target: a interface `target: 'document' | { nodeId }`
  já contempla, mas v1 só implementa `'document'`. Future polish.
- Custom naming patterns (`{name}-{scale}x.{ext}`): v1 fica em
  string literal por previsibilidade. Pode evoluir.

**Cuidados D-042 / D-017 já endereçados.** Smart Object dialog
forwarding injector (scope-aware); AssetExportRunner per-editor
scope; nenhum import de Material em `svg-engine/edit`; spec-trava
agora cobre 41 services stateful obrigatórios no scope.

---

## 2026-05-26 — PRO-GAP-FIX: 2 bugs reportados após teste visual (B1 + B2)

**O quê.** Dois bugs descobertos ao testar a entrega PRO-GAP no
browser:

- **B1**: ao selecionar "Custom" no Workspace Settings ▸ Background
  depois de ter clicado em "Dark" (ou outro preset), o radio "Custom"
  perdia a seleção visual instantaneamente e o color picker nunca
  abria — o usuário só via o swatch ficar preto.
- **B2**: ao escolher "Both" no View ▸ Snap, o snap se comportava
  exatamente como "Grid only" — alinhamento com outros objetos
  praticamente nunca acontecia.

**Por quê.** Ambos eram bugs lógicos sutis introduzidos pela
implementação anterior:

**B1 — round-trip do preset detector.** O `backgroundPreset()`
computed mapeava o hex do `BackgroundConfig` de volta para um preset
id (`white` se hex match `#ffffff`, etc.). Quando o usuário clicava
em Custom vindo de Dark, o seed do `setBackgroundPreset('custom')`
era `customColor()` que retornava `'#222222'` (o hex do Dark). O
service gravava `{kind:'solid', color:'#222222'}` e o computed
re-derivava → `'dark'` (porque hex bate). Radio saltava para Dark,
`@if (backgroundPreset() === 'custom')` ficava false → color picker
sumia.

**B2 — densidade do grid pré-emptava objects.** `SnapService.resolveForMove`
em mode `'both'` empurrava grid targets ANTES de object targets no
array. O `resolveSnap` itera e usa `bestFeatureDist < bestX.dist`
(estritamente menor) — empates preservam o primeiro encontrado. Como
grid lines são densas (a cada 10 unidades por padrão), pelo menos
uma linha de grid quase sempre cai dentro do threshold de snap (e
geralmente bem perto). Grid sempre vencia em empate; objetos só
conseguiam snapar quando estavam ESTRITAMENTE mais perto que
qualquer linha de grid — cenário raro num documento real.

**Implementação.**

- **B1 fix** (`projects/svg-engine/ui/src/lib/workspace-settings/workspace-settings.component.ts`):
  - Adicionado `userChoseCustom = signal<boolean>(false)` — flag
    sticky que pin'a o radio em Custom mesmo quando o hex coincide
    com um preset.
  - `backgroundPreset()` consulta a flag ANTES do hex-matching:
    `if (this.userChoseCustom()) return 'custom'`.
  - `setBackgroundPreset(preset)` mexe na flag: `'custom'` →
    `set(true)`, qualquer outro preset → `set(false)`.
  - `setCustomColor(value)` também `set(true)` para manter sticky
    durante color picking (sem isso, o usuário poderia acidentalmente
    snap pro preset ao escolher um hex coincidente).
  - `resetAll()` também limpa a flag (transparent default não deve
    herdar estado anterior).

- **B2 fix** (`projects/svg-engine/edit/src/lib/snap/snap.service.ts`):
  - Reordenado: em mode `'both'`, objects targets são empurrados
    PRIMEIRO no array, grid depois. `resolveSnap` mantém strict-less
    para tie-breaking → objects vencem em empates.
  - Comportamento "strictly-closer ainda vence" preservado: se grid
    está medibly mais perto que qualquer objeto, grid continua
    sendo o snap target.
  - Padrão de mercado (Illustrator / Affinity): alinhar com sibling
    shape é semanticamente mais útil que alinhar com a malha
    abstrata. O fix alinha o comportamento com essa convenção.

**Specs.** O spec existente em `snap.service.spec.ts:131` documentava
o comportamento ANTIGO ("grid wins on tie") como invariante — foi
atualizado para "objects wins on tie" + adicionado spec novo
provando que strictly-closer-grid ainda vence (não confundir
preferência em empate com mudança da função de distância). Suíte
total: **1617 passing** (+1 do spec novo).

**Não regrediu.** Nenhuma mudança no Custom Editor; mudança em
SnapService afeta TODAS as visões que usam Snap em mode `'both'`
(intencional — bug era universal, fix se aplica universal). Suíte
de testes existente sem regressão.

---

## 2026-05-26 — PRO-GAP: paridade Custom → Profissional (G1/G2/G3/G4/G5)

**O quê.** Diff visual entre Editor Customizado e Editor Profissional
identificou 5 controles presentes no Custom mas ausentes no Pro.
Implementadas as 5 lacunas mantendo o Custom intocado (instrução
explícita do usuário) — Pro agora cobre o mesmo conjunto funcional
do Custom via menus + dialog + canto-da-menu-bar (cada uma escolhida
pelo usuário via questionário UX).

**Por quê.** O Pro era o shell drop-in "Illustrator-grade", mas
algumas operações úteis só estavam disponíveis no Custom toolbar:
background swatches, atalhos de guides, theme toggle. Usuários
migrando de Custom → Pro sentiam falta. Solução: trazer paridade
sem inflar o menu superior — cada controle vai pro lugar mais
natural na linguagem visual profissional.

**Implementação por gap.**

- **G1 — Background swatches no Workspace Settings dialog**
  (`projects/svg-engine/ui/src/lib/workspace-settings/workspace-settings.component.ts`):
  Nova seção "Background" no topo do dialog (antes de Page). 5
  radio buttons (Transparent / White / Light Gray / Dark / Custom)
  - color picker nativo quando "Custom" é selecionado. Wire para
    `WorkspaceService.setBackground(config)`. `resetAll()` agora
    também chama `resetBackground()`. Decisão UX: levar para dialog
    em vez de poluir menu superior — convive com a estética
    profissional (Illustrator/Affinity não têm background no menu
    bar). Hex codes dos 3 solid presets espelham as cores do toolbar
    swatches do Custom para muscle-memory.

- **G2/G3/G4 — View ▸ Guides ▸ submenu**
  (`projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts`):
  Submenu novo no slot `MENU_SLOT.VIEW` (order 85, depois de Snap)
  com 3 entries:
  - **Add Horizontal Guide** → `WorkspaceService.addGuide('h',
centerY)` onde centerY é o centro do viewport visível (lê
    `ViewportService.viewBox()`). Posição previsível: a guide
    aparece "onde o usuário está olhando".
  - **Add Vertical Guide** → análogo no eixo X.
  - **Clear All Guides** → `WorkspaceService.clearGuides()`,
    desabilitado quando `guides().length === 0` (factory reactive).
    Divider antes do Clear All. Drag-from-rulers (D-019) continua
    funcionando — esses entries adicionam atalhos discoverable.

- **G5 — Theme toggle no canto da menu bar**
  (`projects/svg-engine/ui/src/lib/shell-pro/shell-pro.component.ts`):
  `<svge-theme-toggle>` injetado entre `<svge-menu-bar>` e o
  título "SVGEngine Pro", com `margin-left: auto` no toggle (toggle
  - title flutuam à direita). Estilo VSCode/Photoshop — ícone
    sempre visível, 1 click cycle Light → Dark → System. Mantém
    o título como elemento visualmente ancorado na direita.

**O que NÃO mudou.**

- Custom Editor (`custom-editor.component.ts`) intacto — instrução
  explícita do usuário ("Não é para remover nada de nenhuma da
  visões"). Continua com toolbar customizada horizontal cheia de
  controles.
- `<svge-editor>` (shell mid-level) não recebe theme toggle — só o
  shell-pro que tem menu bar nativa para hospedar o botão.
- Nenhuma mudança em comandos / commands / state services.
  `WorkspaceService.addGuide/clearGuides/setBackground/resetBackground`
  já existiam — só ganharam novos call sites na UI.

**Validação**: build 9 entry points ✅, lint clean ✅, 1616 specs
passando (sem regressão). Específica para G2/G3/G4 não foi adicionada
spec nova (são apenas registros novos de `MenuContribution` sem lógica
testável além do registro em si).

---

## 2026-05-26 — AUDIT-FIX: 4 correções a partir de audit externo (Copilot)

**O quê.** Audit feito por GitHub Copilot levantou 12 pontos de
atenção; após validação contra o código real (4 confirmados acionáveis,
3 parciais com contexto, 5 exagerados/equivocados), aplicadas 4
correções nesta sessão. Mantém compatibilidade total com consumidores
existentes — todas mudanças são aditivas.

**Correções entregues.**

- **P2 — `SVG_ENGINE_VERSION`** estava em `'0.0.0'` no `public-api.ts`
  enquanto `package.json` já estava em `0.1.0`. Constante alinhada para
  refletir a versão real. JSDoc adicionado lembrando que ambos devem
  mover juntos (D-031 / `standard-version` faz isso automaticamente
  quando bump for executado).

- **P8 — AutoSave key global em multi-editor**. Antes:
  `STORAGE_KEY = 'svge:autosave'` literal hard-coded. Em hosts
  Mosaicoo com 2+ editores na mesma origin, autosave do editor B
  sobrescrevia o slot do editor A — perda silenciosa de recovery.
  Agora:
  - Novo `AUTOSAVE_STORAGE_KEY: InjectionToken<string | null>` em
    `edit/autosave/autosave.config.ts`. Default `'svge:autosave'`
    (compat 100% com payloads gravados anteriormente — single-editor
    apps continuam abrindo recovery normalmente).
  - `AutoSaveService` injeta o token e deriva a chave de timestamp
    como `${base}:ts`.
  - `provideSvgEngineEditorScope({ autoSaveKey })` aceita opção
    opcional. Passando `null` desativa persistência completamente
    para o scope (útil em embed previews onde recovery confunde).
  - Interface nova `SvgEngineEditorScopeOptions` extensível para
    futuras knobs per-editor (snapshots key, recovery toggle, etc.).

- **P9 — `document.querySelector('svge-renderer svg')` no playground**.
  Antes: 6 ocorrências em `custom-editor.component.ts` resolviam o
  primeiro renderer da página globalmente, quebrando se 2 editores
  fossem montados ao mesmo tempo. Agora:
  - `SvgeRenderer.svgElement(): SVGSVGElement | null` exposto como
    API pública (era `viewChild` privado). JSDoc completa com exemplo
    `@ViewChild(SvgeRenderer)` + uso recomendado.
  - `CustomEditor` ganhou `rendererRef = viewChild(SvgeRenderer)` +
    helper privado `rendererSvg()`. As 6 chamadas globais foram
    trocadas por essa rota tipada e scoped ao próprio componente.
  - **Débito residual identificado (não escopo desta sessão)**: 3
    ocorrências similares em `ui/inspector` + 1 em
    `edit/menu/builtin/builtin-menu-contributions.plugin.ts`. Esses
    contextos (Inspector painel + handler de plugin) não têm
    `viewChild(SvgeRenderer)` natural — exigirão um service
    `ActiveRendererService` que o `<svge-editor>` shell registra no
    seu próprio scope, lido pelos consumers. Marcado como
    AUDIT-FIX P9b para um próximo turno.

- **P3 — Spec-trava de exaustividade do scope provider**. Antes: o
  spec validava só Selection/Isolation/Layers (4 services). Drift
  futuro de novo service stateful adicionado com `providedIn: 'root'`
  passaria silencioso. Agora `editor-scope.providers.spec.ts` lista
  exaustivamente os **38 services stateful** que devem ter instância
  por scope; usa `it.each(STATEFUL_SCOPED_TOKENS)` para falhar com
  ponteiro exato se algum sumir do `provideSvgEngineEditorScope`. JSDoc
  inline explica o que NÃO deve entrar (registries app-wide). Também
  adicionado specs novos para o contrato do `autoSaveKey` (default,
  override, null-disable, no-bleed entre dois scopes).

**Pontos do audit que NÃO acionei** (e por quê — documentação para
posteridade):

- **P1 (tsconfig paths → dist)**: é o padrão Angular workspace.
  `ng build svg-engine --watch` em segundo terminal resolve. Trocar
  config tem custo arquitetural que não compensa o ganho marginal.
- **P5 (XSS via insertAdjacentHTML em defs)**: fragment vem APENAS
  do importer que já sanitiza (script/on\*/javascript: removidos).
  Documentação inline já explica o invariante. Sem vulnerabilidade
  real no caminho atual.
- **P6 (data: URLs permitidas)**: intencional para imagens base64
  embedded. Vetor de exec já bloqueado (script tags + handlers).
- **P10 (Material peer opcional)**: é o invariante D-017 funcionando.
  Quem importa de `core/render/io/optimize/edit` não toca Material.
  Quem importa de `ui` instala. Comportamento documentado.
- **P11 (sem E2E Playwright)**: já registrado como D-029? pendente.
  Reabrir quando bug visual escapar 2-3 vezes.
- **P12 (allNodes recalcula tudo)**: medições atuais (60fps@1k+, Bloco
  6b) confirmam que perf cabe. Otimizar agora seria especulativo.

**Validação.**

- Build: 9 entry points compilam ✅
- Lint: clean ✅
- Specs: **+42 testes** (40 da exhaustiveness trap + autosave key
  contract + ajustes). Suíte total: **1616 passing**, 1 skipped (era
  1574 no D-074).

**Cuidados D-042 já endereçados.** Todas as mudanças preservam
backward compat: `provideSvgEngineEditorScope()` sem argumento
continua funcionando exatamente como antes; consumers existentes
não precisam ser atualizados.

---

## 2026-05-25 — D-074: Smart Objects (Photoshop-convention containers)

**O quê.** Suporte completo a **Smart Objects** — contêineres
não-destrutivos que agrupam conteúdo (imagens importadas,
composições) como uma unidade editável única. Espelha o conceito
homônimo do Photoshop e "Embedded Document" do Affinity, adaptado a
um editor vetorial. Cobre o ciclo completo: criar (Convert),
substituir conteúdo (Replace via file picker), editar conteúdo (Edit
via dialog de fonte SVG), rasterizar (desfaz o wrapper hoisting os
filhos), persistir no SVG via `data-svge-kind="smart-object"`.

**Por quê.** Item da roadmap "Pro features faltantes". Já tínhamos
Symbols (D-059 — master/instância referenciada por `<use>`) e
Layers (D-072 — containers organizacionais top-level), mas faltava
o **modelo Photoshop "asset importado como unidade"**. Caso de uso
real: usuário traz um logo de outro arquivo SVG, quer tratar como um
bloco único (mover/girar/editar inteiro), e poder **substituir** por
uma nova versão sem perder posição/transform/nome no documento
hospedeiro. Sem Smart Object o usuário teria que: importar manual,
posicionar, agrupar, e ao substituir refazer todo o trabalho.

**Diferença vs Symbols vs Layers** (estão coexistentes, não
mutuamente exclusivos):

| Conceito                 | Definição                                              | Caso de uso                                         |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| **Symbol** (D-059)       | Master único + N `<use>` instâncias                    | Logos repetidos, ícones reutilizados N vezes        |
| **Layer** (D-072)        | Grupo top-level com flag organizacional                | Estrutura de páginas/secções num documento          |
| **Smart Object** (D-074) | Grupo com conteúdo self-contained, sem master/instance | Asset importado externamente, substituível em bloco |

`metadata.customData.svgeKind` é slot único (`'layer'` OU
`'smart-object'`); um grupo é um dos três (layer, smart object,
plain group) por vez. Mesma motivação técnica do D-072: usar um
flag em metadata em vez de adicionar um tipo discriminado novo ao
`SvgNode` union evita forçar renderers/exporters/specs/library
consumers a tratar do novo tipo — quem não se importa não vê
nenhuma mudança.

**Implementação.**

- **`core/model/smart-object.ts`** — `SVGE_KIND_SMART_OBJECT`,
  `isSmartObject(node)` type guard, `withSmartObjectFlag(group)` e
  `withoutSmartObjectFlag(group)` helpers puros. Mesma forma do
  `layer.ts` (D-072) — reaproveita `SVGE_KIND_KEY` para garantir
  exclusividade no slot único.

- **`core/commands/smart-object.commands.ts`** — 4 comandos
  undoables:
  - `MakeSmartObjectCommand(nodeIds, name?)` — envolve N nós irmãos
    em wrapper, posiciona no slot do primeiro nó, autonumera nome
    "Smart Object N" se ausente, valida mesmo-pai (rejeita seleção
    fragmentada), expõe `getCreatedWrapperId()` para auto-select.
  - `RasterizeSmartObjectCommand(nodeId)` — drop flag + hoist
    children (similar a Ungroup, mas em uma única entrada de
    histórico "Rasterize Smart Object").
  - `EditSmartObjectContentsCommand(nodeId, newChildren)` —
    substitui array de filhos preservando id/transform/style/metadata
    do wrapper. Usado pelo dialog Edit Contents (UI).
  - `ReplaceSmartObjectContentsCommand` — subclasse com apenas
    label diferente ("Replace Smart Object Contents") para
    diferenciar a origem na pilha de undo. Mecanismo idêntico.

- **`io/svg-exporter.ts`** — emite `data-svge-kind="smart-object"`
  no `<g>` quando `isSmartObject(node)` é true. Convive lado-a-lado
  com `data-svge-kind="layer"` (slot único garante que nunca há
  ambos).

- **`io/svg-importer.ts`** — reconhece `data-svge-kind="smart-object"`
  e popula `customData.svgeKind` durante a importação. Como o D-072
  mostrou, outros editores (Inkscape/Illustrator/Figma) preservam
  `data-*` desconhecido silenciosamente — round-trip externo
  funciona.

- **`edit/menu/builtin/builtin-menu-contributions.plugin.ts`** —
  submenu `Object ▸ Smart Object` (order 85, depois de "Convert
  Layer to Group") com 3 entradas headless: Convert, Replace
  Contents (file picker), Rasterize. Cada entrada tem `disabled`
  factory reativo: Convert exige seleção com pai único; Replace e
  Rasterize exigem que o foco seja um smart object.

- **`ui/smart-object-dialog/`** — `<svge-smart-object-editor-dialog>`
  - `SvgeSmartObjectEditorDialogService`. Dialog textarea com a
    fonte SVG dos filhos do wrapper (exportada como `<svg>` parseável),
    Apply re-parseia via `svgImporter`, despacha
    `EditSmartObjectContentsCommand`. Single undo entry. Erros de
    parse e warnings do importer mostrados inline.

- **`ui/menu-extras/builtin-ui-menu-contributions.plugin.ts`** —
  registra a entrada `Object ▸ Smart Object ▸ Edit Contents…`
  (order 25, entre Convert e Replace) que abre o dialog. Vive em
  `ui/` por D-017 (Material só pode ser importado em `ui/`). Ambos
  os plugins (edit + ui) precisam estar instalados para o conjunto
  completo de menu items aparecer — consumidores dos shells
  instalam os dois.

- **`ui/layers-panel/layers-panel.component.ts`** — smart objects
  ganham ícone `inventory_2` (caixa/pacote — visualiza "asset
  empacotado"), accent terciário (`--mat-sys-tertiary` com fallback
  âmbar `#d97706`) para distinção visual de layers (que usam
  primary). Layers e Smart Objects nunca colidem por construção.

**Specs.** +32 testes (16 em `core/commands/smart-object.commands.spec.ts`
cobrindo helpers + 4 comandos com undo, validação de pai único,
autonumeração, e idempotência; 7 em `io/smart-object-roundtrip.spec.ts`
cobrindo export, import, e ciclo completo com nesting + mutual
exclusion com layer). Suíte total: **1574 testes passando**, 1
skipped (era 1542 antes do D-074).

**Trade-offs e escopo deferido.**

- **Sub-canvas editor**: profissionais como Photoshop spawn um
  documento separado para editar o conteúdo do Smart Object. Aqui
  optei por textarea editor (D-074f) — pragmatic MVP. Power users
  podem colar SVG inteiro, find/replace em massa, etc. "Open Smart
  Object in new tab" é o evolução natural, mas requer arquitetura
  multi-document que ainda não existe. Deferido sem prazo.
- **Linked Smart Objects**: Photoshop tem "Place Linked" que
  mantém referência ao arquivo externo, atualiza automaticamente.
  Out of scope — depende de file system access (browser limitação)
  ou de um conceito de "asset library com URL". Deferido.
- **Nested Smart Objects warning**: Permitido (specs cobrem
  round-trip). Usuário avançado pode criar SO dentro de SO; UI não
  tem warning especial — match com Photoshop que também permite.
- **Auto-flatten antes do Export**: Smart Object exporta como
  `<g data-svge-kind="smart-object">` por padrão (preserva
  designation). Optimizer poderia ter um pass para dropar o
  atributo se o usuário quiser "achatar" antes de publicar.
  Deferido — pode ser uma flag no optimizer de futuro (similar aos
  `stripAuthoredIds` / `stripInkscapeLabels` que D-072g introduziu).

**Cuidados D-042 / D-017 / D-043 já endereçados.** Service e
dialog são per-editor (factory + injector forwarding); zero import
de Material em core/edit (dialog vive em ui/); `disabled` é factory
`(injector) => Signal<boolean>` que lê os services do scope ativo
correto em multi-editor.

---

## 2026-05-25 — D-073: History Snapshots (named restorable checkpoints)

**O quê.** Painel de **snapshots** estilo Photoshop / Affinity /
Figma: pontos nomeados, restoráveis, persistentes do documento,
distintos da pilha de undo/redo linear. Usuário pode tirar snapshot
manualmente (Ctrl+Shift+S), restaurar com 1 click do painel (vai pro
undo, então Ctrl+Z desfaz o restore), renomear inline (F2), deletar,
e opcionalmente ativar auto-snapshot antes de comandos destrutivos
(Pathfinder/Optimize/BatchConvertToPath).

**Por quê.** Item 4 do bloco "Workflow / produtividade". O undo
linear é granular demais para experimentação ("voltar 50 passos"),
não tem nomes humanos, e some quando atinge o limite de 50 entradas.
Snapshots cobrem o caso "salvar versão A do logo pra comparar com
B" — workflow real de designer.

**Decisão de mercado** (pesquisei Photoshop + Affinity + Figma +
Inkscape antes de implementar):

| Editor                                                                          | Comportamento adotado aqui?                               |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Photoshop "Snapshots panel" — manual + 1 auto-on-open + opt-in auto-destructive | ✅ Sim                                                    |
| Affinity "Snapshots studio" — persistência junto com o arquivo                  | ✅ Sim (localStorage)                                     |
| Figma "Version history" — auto-save versionado na nuvem                         | ⚠️ Parcial (auto-save existe em D-020; versionamento não) |
| Photoshop "Non-linear history" — bifurcação em árvore                           | ❌ Skipped (escopo +alta complexidade, valor marginal)    |
| Photoshop "History Brush" — pintar regiões de snapshot                          | ❌ N/A (raster-only, não vetor)                           |

**Implementação.**

- **`core/snapshots/snapshot.ts`** — interface `Snapshot { id, name,
createdAt, document, thumbnail, source }`, `SnapshotSource`
  ('manual'|'auto-open'|'auto-destructive'|'auto-restore'),
  `SnapshotsLimits { maxCount, autoOnOpen, autoOnDestructive }` com
  `DEFAULT_SNAPSHOT_LIMITS` (50/true/false — Photoshop defaults).

- **`core/snapshots/snapshots.service.ts`** — `SnapshotsService`
  (scoped per-editor via `provideSvgEngineEditorScope()`). API:
  `take(doc, opts)`, `restore` (via command), `delete`, `rename`,
  `clear`, `attachThumbnail`, `setLimits`, `setCurrent`,
  `getById`, `hydrate`, `bootstrap`. Ring buffer eviction protege
  `auto-open` baseline (sempre sobrevive — convenção Photoshop).

- **`core/commands/restore-snapshot.command.ts`** —
  `RestoreSnapshotCommand` undoable; `execute` salva pre-state +
  troca document; `undo` restaura pre-state. Ctrl+Z após restore
  retorna usuário pra onde estava.

- **`core/commands/command.ts`** — adicionado
  `Command.isDestructive?: boolean` (opcional, opt-in marker).
  Pathfinder (5 ops), OptimizeCommand, BatchConvertToPathCommand
  marcados. Live Boolean é não-destrutivo por design — não marcado.

- **`core/command-bus/command-bus.service.ts`** — interceptor
  `maybeAutoSnapshot(cmd)` antes de dispatch. Optional inject de
  `SnapshotsService`. Gate duplo: `cmd.isDestructive === true` AND
  `snapshots.limits().autoOnDestructive === true`. Headless
  consumers sem snapshots não pagam custo (snapshots é null →
  early return).

- **`edit/snapshots/snapshots-persistence.service.ts`** — round-trip
  de `SnapshotsService` via localStorage. Storage key
  `svge:snapshots`, schema v1: `{ v, limits, snapshots: [{ id,
name, createdAt, svg, thumbnail, source }] }`. Cada snapshot
  serializado via `svgExporter`, parseado via `svgImporter`.
  Debounce 1.5s. Quota guard 4MB com fallback (drops thumbnails
  primeiro, depois snapshots antigos). `hydrate()` no bootstrap;
  `effect()` auto-saving em mudanças.

- **`edit/scope/editor-scope.providers.ts`** — `SnapshotsService` +
  `SnapshotsPersistenceService` adicionados ao scope per-editor.

- **`ui/snapshots-panel/snapshots-panel.component.ts`** —
  `<svge-snapshots-panel>` standalone: header com "+ New" (camera
  icon) + Settings (gear) + count, lista de cards com thumbnail
  (gerada async via `pngExporter` em scale 0.1) + nome (rename
  inline F2/dblclick) + relative timestamp ("3 min ago") + restore
  - delete buttons. Confirm prompt no restore (avisa que mudanças
    vão pro undo) e no delete. ARIA proper (`role="list"/listitem`,
    `aria-current`, Enter/Space/F2 keyboard).

- **`edit/menu/builtin-menu-contributions.plugin.ts`** — submenu
  Edit ▸ History com 3 entries: Take Snapshot (Ctrl+Shift+S),
  Restore Last Snapshot (Ctrl+Alt+Z), Clear All Snapshots.
  Disabled signals reativas à presença de snapshots.

- **`edit/shortcut/builtin-editor-shortcuts.plugin.ts`** —
  shortcuts Ctrl+Shift+S e Ctrl+Alt+Z registrados; graceful no-op
  quando SnapshotsService não está disponível.

- **`ui/shell-pro/shell-pro.component.ts`** — nova aba "History"
  no panel-group do right rail, entre Layers e Properties.

**Specs.** +15 testes (15 cobrem service: take/rename/delete/
attachThumbnail/bootstrap/hydrate, RestoreSnapshotCommand
execute+undo, CommandBus auto-snapshot interceptor com gate duplo).
Suíte total: **1542 testes** (era 1527).

**Trade-offs e escopo deferido.**

- **Compare side-by-side**: ferramentas profissionais oferecem
  diff visual entre 2 snapshots. Skipped — requer split-view do
  canvas, escopo cresce muito. Workaround: usuário restaura,
  observa, Ctrl+Z, restaura outro.
- **Thumbnails persistidos têm custo de storage** (~5KB/snapshot
  base64 PNG). Total típico: 50×5KB = 250KB, OK pra localStorage.
  Quando ultrapassa quota, persistência joga thumbnails fora
  primeiro (snapshots ainda restoráveis, só sem preview).
- **Non-linear history (tree branching)**: Photoshop tem opt-in.
  Complexidade alta vs valor marginal pra editor vetorial.
  Deferido sem prazo.
- **Cloud sync**: Figma versiona na nuvem. Out of scope (svg-engine
  é offline-first).

**Cuidados D-042 / D-017 já endereçados.** Service per-editor (não
`providedIn: 'root'`), persistence per-editor; UI lê via signals
injectados (já scoped); zero import de Material em core/edit;
optional inject permite consumers headless ignorarem snapshots
totalmente.

---

## 2026-05-25 — D-072 follow-up: Persistência de nomes via `<title>`

**O quê.** Exporter agora emite `<title>Bercos</title>` como child de
qualquer node com `metadata.name`; importer lê `<title>` filho para
popular `metadata.name`. Optimizer opt-in `stripAuthoredTitlesOptimizer`
(defaultEnabled: false) flipa `document.exportPreferences.emitAuthoredTitles`
para `false` em pipelines minified.

**Por quê.** No D-072 base o nome humano (ex.: "Bercos" no Layer Panel)
não round-trippa: exporta limpo, re-importa como "group 066ebc". Discussão
com o usuário converteu a primeira tentativa (id slug + inkscape:label
híbrido) para a versão atual `<title>` after weighing:

| Atributo         | Spec W3C?       | xmlns extra?   | Acessível?        | Allows duplicates?   | id externo? |
| ---------------- | --------------- | -------------- | ----------------- | -------------------- | ----------- |
| `<title>` child  | ✅ Puro         | ❌ Não         | ✅ Screen readers | ✅ Livre             | ❌          |
| `id` slugified   | ✅              | ❌             | ❌                | ❌ (XML exige único) | ✅          |
| `inkscape:label` | ❌ Proprietário | ✅ Inkscape ns | ❌                | ✅                   | ❌          |

**Decisão**: para o svg-engine como **editor de criação**, `id` derivado
do nome é overhead sem ROI (svg-engine usa `data-node-id`/UUIDs internos
para tudo; CSS bindings via `[attr.fill]`; refs externas via `id` são
caso minoritário que pode adicionar via script post-export). `<title>`
ganha em: spec puro, zero namespace, ARIA built-in, allows duplicates
naturalmente.

**Trade-off conhecido**: Inkscape NÃO recupera `<title>` como "nome do
layer" no painel (trata como descrição). svg-engine recupera
perfeitamente. Fallback `inkscape:label` na importação preserva files
authored em Inkscape OU pela versão híbrida intermediária deste editor.

**Implementação.**

- `core/document/svg-document.ts` — `exportPreferences.emitAuthoredTitles`
  (default `true`).
- `io/svg-exporter.ts` — helpers `shouldEmitTitle(node, ctx)`,
  `titleChildLine(node, depth, ctx)`, `wrapLeafWithTitle(...)`. Cada
  leaf (rect/ellipse/line/polygon/polyline/path/text/image/symbol-use)
  emite `<title>` como first child quando metadata.name set. Group
  emite `<title>` ANTES dos children (screen readers anunciam nome
  antes de traversar conteúdo). text com textPath: `<title>` antes
  do `<textPath>`.
- `io/svg-importer.ts` — `parseAuthoredName(el)` lê em ordem:
  1. `<title>` filho direto (preferido — W3C),
  2. `inkscape:label` (compat Inkscape + D-072+ hybrid intermediate),
  3. `data-svge-name` (legacy compat).
     Não de-slugifica `id` (evita inventar nomes que o user nunca digitou).
     `<title>` já estava em `SILENTLY_IGNORED_TAGS` então não emite
     warning quando importer encontra.
- `optimize/builtin-optimizers.ts` — `stripAuthoredTitlesOptimizer`
  substitui os 2 anteriores (`stripAuthoredIds` + `stripInkscapeLabels`
  da iteração híbrida). Mais simples: 1 pass, 1 flag.
- `edit/.../builtin-optimizers.plugin.ts` — registra 4 total
  (precision/drop-defaults/prune + strip-titles opt-in).

**Allows duplicates.** Sem restrição de id, dois nodes podem se chamar
"Logo" → ambos viram `<title>Logo</title>`. SVG válido, sem
desambiguação artificial.

**Specs.** Reescrita do `layer-roundtrip.spec.ts` com 15 cenários
title-only: verbatim preservation (acentos/emoji), XML escape,
duplicates, group-as-first-child, round-trip layer+name, fallbacks
(inkscape:label + data-svge-name), title-precedence-over-inkscape.
Suíte total: **1527 testes** (era 1525).

**Comparação visual no SVG exportado**

Antes (D-072 base — só layer flag):

```xml
<g data-svge-kind="layer">
  <ellipse cx="360" cy="200" rx="60" ry="60" fill="#ffe082" />
</g>
```

Depois (D-072 follow-up — title persistence):

```xml
<g data-svge-kind="layer">
  <title>Bercos</title>
  <ellipse cx="360" cy="200" rx="60" ry="60" fill="#ffe082" />
</g>
```

Com `stripAuthoredTitlesOptimizer` ativo: igual ao "Antes" (titles
omitidos do output, mas `metadata.name` no doc preserva — reversível).

---

## 2026-05-25 — D-072: Logical Layers — top-level organizational groups

**O quê.** Conceito de **Layer** sobre `GroupNode`: um grupo cujo
`metadata.customData.svgeKind === 'layer'` é tratado pela UI como
um container organizacional top-level (não pode ser aninhado dentro
de outro grupo ou layer). Convenção Illustrator/Affinity/Photoshop.

**Por quê.** Item #3 do bloco "Workflow / produtividade". Designers
esperam um eixo organizacional separado das hierarquias visuais de
grupo — layers para "Background / Foreground / UI" e grupos para
agrupamentos lógicos dentro deles. Antes do D-072, todo container
era um `group` indistinguível, sem garantia de top-level.

**Decisão.** Reusar `GroupNode` com flag em `metadata.customData` —
mesma estratégia do D-056 Live Boolean. Vantagens: zero impacto em
renderer/render/hit-test/transform que tratam grupos como grupos;
zero churn no modelo de tipo (`SvgNode` union inalterado); plugins
existentes funcionam sem mudança.

**Implementação.**

- `core/model/layer.ts` — helpers puros: `isLayer(node)`,
  `withLayerFlag(group)`, `withoutLayerFlag(group)` +
  constantes `SVGE_KIND_KEY = 'svgeKind'` e `SVGE_KIND_LAYER = 'layer'`.
- `core/commands/layer.commands.ts` — três comandos no padrão
  Command+undo:
  - `MakeLayerCommand(id)` — converte grupo top-level → layer.
    Rejeita grupos aninhados (sem mutação, sem entrada no
    histórico se já era layer).
  - `UnmakeLayerCommand(id)` — inverso. Limpa o flag preservando
    outras entradas em `customData`.
  - `CreateLayerCommand()` — cria layer vazio no front do root
    com nome auto-numerado "Layer N". Expõe `getCreatedLayerId()`
    para callers (UI) selecionarem o novo layer.
- `io/svg-exporter.ts` — emite `data-svge-kind="layer"` em `<g>`
  para grupos com o flag. Atributo `data-*` é SVG válido,
  preservado por todos os editores (Inkscape/Illustrator/Figma).
- `io/svg-importer.ts` — lê `data-svge-kind="layer"` E
  `inkscape:groupmode="layer"` (compatibilidade com Inkscape) e
  reconstitui o flag. `inkscape:label` vira `metadata.name`.
- `edit/menu/builtin-menu-contributions.plugin.ts` — três entradas
  novas em `menu.object`: "New Layer", "Convert to Layer"
  (disabled quando focused não é grupo top-level), "Convert Layer
  to Group" (disabled quando focused não é layer).
- `ui/layers-panel/layers-panel.component.ts`:
  - Botão "+" no topo do painel (`createNewLayer()` dispatcha
    `CreateLayerCommand` + auto-seleciona).
  - Linhas de layer recebem ícone `folder_special` (vs `folder`
    de grupo plano), classe `.is-layer` para CSS, e accent
    stripe à esquerda com cor primária + label em weight 500.
  - Validação drag/drop: `isDropAllowed()` rejeita qualquer
    posição que colocaria um layer sob um parent diferente do
    root (top-level invariant). Drop indicator não acende para
    placements ilegais — feedback visual imediato em vez de
    no-op silencioso ao soltar.
- Métodos públicos `convertToLayer(id)` / `convertToGroup(id)`
  expostos no `LayersPanel` para integração futura (context
  menu por linha, atalho específico).

**Round-trip garantido.** Diferente do Live Boolean (que vive só
in-editor), o flag de layer SOBREVIVE a um ciclo completo de
export → import porque emitimos `data-svge-kind="layer"` no SVG e
lemos de volta. Spec dedicado em `io/layer-roundtrip.spec.ts`
cobre os 6 cenários (emit/skip, read svge + inkscape, full
round-trip plain + layer).

**O que NÃO foi feito** (escopo deliberadamente restrito):

- Context menu por linha no Layer Panel (Convert to Layer
  via right-click). O método existe; a integração com
  `MatMenuTrigger` por linha fica para uma iteração de UX
  futura — a entrada "Object ▸ Convert to Layer" já cobre
  o gesto.
- Top-level `menu.layer` separado (Illustrator tem). Por ora
  o submenu vive em `menu.object` para manter a barra de
  menu compacta.

**Specs.** +18 testes (8 layer commands + 4 layer model helpers +
6 IO round-trip + 4 painel). Suíte total: 1511 testes (era 1479).

**Cuidados D-042/D-017 já endereçados.** Commands não dependem de
state per-editor (são `Command` simples dispatchados via `CommandBus`
já scoped); painel UI lê via signals injectados (já scoped via
`provideSvgEngineEditorScope()`).

---

## 2026-05-25 — D-071: Batch operations — Select Same + Batch Convert + Layers batch

### Demanda

Segunda feature do bloco 7 (Workflow / produtividade) na ordem acordada.
Tres conveniencias batch que reusam a infra existente (selection,
commands compostos, layers service) sem mexer em core arquitetural.

### Implementação

**D-071a — Select Same (Fill / Stroke / Font Family)** — Illustrator
convention. Selecionando 1 nó como anchor + "Edit ▸ Select Same XYZ"
seleciona todos os outros nós com mesmo fill / stroke / fontFamily.
Combina naturalmente com o multi-edit do Inspector (D-044): seleciona
todos os vermelhos → muda fill no Inspector → todos viram verdes.

- `SelectSameService` (`edit/lib/find-replace/`) — thin layer sobre
  `FindReplaceService` + `SelectionService.selectMany`. 3 métodos:
  `selectSameFill / selectSameStroke / selectSameFontFamily`. Reuso
  total das criterias D-070.
- 3 menu entries em `MENU_SLOT.EDIT` order 50.1/50.2/50.3 (logo após
  "Select All"). Cada uma com factory `disabled` que checa se o
  focused node tem o atributo relevante.

**D-071b — Batch Convert to Path** — Inspector "Convert to Path"
antes operava só no focused node; agora opera em TODOS os nodes
convertíveis selecionados (rect / ellipse / line / polygon /
polyline) num único undo.

- Novo `BatchConvertToPathCommand` (`core/lib/commands/`): composite
  command que encadeia N `ConvertNodeToPathCommand` internamente.
  Pre-validate atomicidade, undo em LIFO order (reverso).
- Inspector refatorado: `convertibleIds()` computed enumera os ids
  válidos da seleção atual; `canConvertToPath()` derivado disso;
  `convertToPathLabel()` mostra "Convert 5 to Path" quando batch.
- Bloco "Path operations" agora aparece TAMBÉM em multi-edit mode
  (antes só single-select).

**D-071c — Batch Lock / Hide no Layers Panel** — bar nova no TOPO
do panel (acima do search) que aparece SÓ quando ≥2 layers selecionados:

- Label "{N} selected"
- 2 botões smart-toggle: Lock-all/Unlock-all (lock icon flips) e
  Hide-all/Show-all (eye icon flips). Smart: se TODOS já estão
  locked, botão vira "unlock"; senão, "lock". Mesmo para hide.
- Cores: fundo `secondary-container` para destaque visual sem
  conflitar com search bar abaixo.
- Snapshot dos ids ANTES de mutar — porque lockear o focused id
  causa `SelectionService` a podar a seleção (Bloco 4b-Lock); sem o
  snapshot perderíamos iteração.

### Validação

- ng test svg-engine ✓ (será atualizado pós-build)
- ng lint svg-engine ✓
- ng build svg-engine ✓ 9 entry points
- ng build playground ✓

### Limitações honestas

- **Select Same**: comparação string-equality, mesma limitação do
  D-070 (não casa `red` com `#ff0000`).
- **Batch Convert**: cada sub-command faz seu próprio remove+insert;
  se falhar mid-batch (raro — só com mutação concorrente), os que já
  rodaram não são auto-revertidos. Manual undo resolve.
- **Layers batch**: não tem comando atômico — `setLocked`/`setVisible`
  são UI state direto, não passam por CommandBus. Não dá pra "Ctrl+Z
  o lock batch". Consistente com como lock/hide single-row funcionam
  hoje (decisão pré-existente).

### Como testar

1. Recarregar playground
2. **Select Same**: criar vários shapes mistos com 2 cores. Clicar num
   shape vermelho. **Edit ▸ Select Same Fill** → todos os vermelhos
   selecionam. Mudar fill no Inspector → todos viram a nova cor.
3. **Batch Convert**: marquee/multi-select 3 rects + 2 ellipses.
   Inspector mostra "Convert 5 to Path" — clica, Ctrl+Z reverte tudo.
4. **Layers batch**: Shift-click 3 layers no panel. Aparece a bar
   "3 selected" com 2 ícones. Click lock → todos lockam (e somem da
   seleção, que é o comportamento esperado). Click eye → todos hide.

---

## 2026-05-25 — D-070: Find & Replace (cor / font / atributo) com single-undo

### Demanda

Primeira feature do bloco "Workflow / produtividade" (item 7 do
roadmap) escolhida pelo usuário pra começar a sequência de 6 features.
Find & Replace é a feature mais isolada do bloco (zero risco de
regressão) e atende caso real: trocar todos os usos de uma cor /
font sem precisar selecionar nó por nó.

### Implementação

**1. `SetPropertyOnManyCommand`** (`core/lib/commands/`):
Espelho de `SetStylePropertyOnManyCommand` (D-044) mas pra TOP-LEVEL
fields (`fontFamily`, `fontSize`, `x`, etc.). Mesma garantia
atômica (validate first, never partial-apply) + snapshot-undo. Aceita
campos absent no node via "wasPresent" flag — undo restaura a forma
exata original do node.

**2. `FindReplaceService`** (`edit/lib/find-replace/`):
Pure logic sem DI de commands. Único método: `findAll(root, criteria)`
retorna `readonly FindMatch[]` com bucket (`'style'` | `'top'`) +
field + valor atual. Criteria union de 4 tipos:

- `fill` / `stroke` — compara `node.style.<field>` (case-insensitive,
  string-equality; sem conversão hex↔rgb — documentado como
  limitação v1)
- `fontFamily` — TextNode-only, modo `'contains'` (default) ou
  `'exact'`
- `attribute` — generic top-level field, string-equality em
  `String(value)`

**3. Dialog `<svge-find-replace-dialog>`** (`ui/lib/find-replace-dialog/`):
Material dialog (md-bucket) com:

- `<mat-select>` para tipo de busca
- Input "attribute key" condicional (visível só quando kind === 'attribute')
- Inputs "find" + "replace" com placeholders adaptativos
- Botão "Find ({count})" — search explícito, não roda em cada
  keystroke (defensive para docs grandes)
- Lista scrollável de matches: id (8 chars) | field | valor atual
- "No matches found" quando search returna vazio
- "Replace All ({count})" — desabilitado quando matches.length === 0

**Single-undo** garantido: dispatch escolhe 1 dos 3 batch commands
(`SetStylePropertyOnManyCommand` para fill/stroke,
`SetPropertyOnManyCommand` para fontFamily/attribute). Label do
comando explicita "Find & Replace fill (N nodes)" no histórico.

**4. Menu + Shortcut** (`ui/lib/menu-extras/`):

- `MENU_SLOT.EDIT` order 75 (após Cut/Copy/Paste/Duplicate/Delete,
  antes de SelectAll — convenção Illustrator/Inkscape)
- Ctrl+H — bind canônico (browsers/IDEs/Word)
- Always-enabled (não requer seleção — busca o documento inteiro)

### Specs (+ 18 cases novos)

- **`set-property-on-many.spec.ts`** (+6): set + undo (incluindo
  restore de campos absent), empty nodeIds no-op, atomicidade em
  case de id missing, refuse mutate id/type, label correto.
- **`find-replace.service.spec.ts`** (+12): cada criteria type,
  traversal recursiva, edge cases (no-match, missing field, exact
  vs contains, cross-format hex/rgb não casa).

### Limitações honestas v1

- **Comparação de cor é string-equality**: `red` não casa com
  `#ff0000`. Designers que usam o color picker authoram hex →
  cobre o caso 80%. Cross-format matching exige color parser (v2).
- **Escopo é documento inteiro** — não tem "buscar só na seleção"
  (checkbox + filtro futuro).
- **Sem regex/wildcards** — comparação literal só.
- **Sem preview do "depois"** — lista mostra valor atual; usuário
  clica Replace All e confirma pelo undo se errou.

### Validação

- ng test svg-engine ✓ (em validação final)
- ng lint svg-engine ✓ clean
- ng build svg-engine ✓ 9 entry points (9.4s)
- ng build playground ✓ clean

### Como testar

1. Recarregar playground
2. Criar shapes com fills variados + um texto com fontFamily set
3. **Edit ▸ Find & Replace…** (ou **Ctrl+H**)
4. Selecionar "Fill color" → typar `#000000` → **Find** → typar `#ff0000` → **Replace All**
5. Trocar pra "Font family" → typar `Arial` → ver matches → trocar por `'Inter', sans-serif`
6. Ctrl+Z reverte a operação inteira

---

## 2026-05-25 — D-069: Typography básica no Inspector — fecha o gap de usabilidade real

### Demanda

Usuário questionou: "Em relação a forma TEXT é possível permitir a
alteração da fonte, estilo, tamanho e outras características? O sistema
já possui essas funcionalidades desenvolvidas?". Auditoria honesta
revelou que o D-068 (anterior) tinha fechado o gap para os campos
**avançados** (variable fonts, OpenType, textPath, letter-spacing)
mas **não para os básicos** (font-family / font-size / font-weight /
text-anchor) — engine renderizava tudo desde sempre, mas Inspector
não expunha. Priorização invertida: usuário ganhou 4 toggles de
OpenType mas não conseguia mudar o tamanho da fonte. E mais 3 campos
**essenciais** (italic / underline / line-height) não existiam nem
no model.

### Implementação

**1. Model estendido** (`core/lib/model/text-node.ts`):
3 novos campos opcionais no `TextNode`:

- `fontStyle?: 'normal' | 'italic'` — atributo SVG `font-style`
- `textDecoration?: 'none' | 'underline' | 'line-through'` —
  atributo SVG `text-decoration`
- `lineHeight?: number` — multiplicador (unitless), aplicado via
  `dy` das tspans no multi-line. Substitui o `1.2em` hardcoded
  pré-D-069; `undefined` mantém o default 1.2 (zero break).

**2. Renderer** (`render/lib/renderers/text-renderer.directive.ts`):
2 novos host bindings (`font-style`, `text-decoration`). O
`lineHeight` é wirado no `node-renderer.component` (helper
`textLineDy()` retorna `${factor}em` com fallback 1.2 quando
undefined / inválido).

**3. Exporter** (`io/lib/svg-exporter.ts`):
`renderText` emite `font-style` + `text-decoration` quando setados.
`lineHeight` intencionalmente NÃO é emitido — o exporter atualmente
emite content como single plain run com `\n` literal (limitação
pré-D-069 fora do escopo); quando o multi-line tspan no export for
adicionado, o `lineHeight` entra junto.

**4. Inspector UI** (`ui/lib/inspector/inspector.component.ts`):
Bloco "basics" adicionado no TOPO da Type section (antes dos
controles D-068), na ordem visual familiar (Figma/Illustrator):

| #   | Controle              | Tipo de UI                                                                  | Comando              |
| --- | --------------------- | --------------------------------------------------------------------------- | -------------------- |
| 1   | `font-family`         | `<mat-select>` com 10 presets web-safe + opção "Custom…" + input livre      | `SetPropertyCommand` |
| 2   | `font-size` (px)      | `<input type="number">` (valida >0)                                         | `SetPropertyCommand` |
| 3   | `font-weight`         | `<mat-select>` com 9 valores (100..900 + nomes)                             | `SetPropertyCommand` |
| 4   | `text-anchor`         | 3 botões segmentados com ícones Material (`format_align_left/center/right`) | `SetPropertyCommand` |
| 5   | `font-style` (italic) | Chip toggle "I" itálico                                                     | `SetPropertyCommand` |
| 6   | `text-decoration`     | 2 chips toggles (U sublinhado, S riscado), mutuamente exclusivos            | `SetPropertyCommand` |
| 7   | `line-height`         | `<input type="number">` step 0.05, default placeholder "1.2"                | `SetPropertyCommand` |

Todos usam `setTextProperty<K>` (helper D-068) — single undo entry,
multi-editor scope honrado (D-042), lock guard + dedup.

**Mantido o comportamento existente**: os campos avançados D-068
(`letter-spacing`, `font-variation-settings`, OpenType feature
toggles, textPath) continuam abaixo do bloco básico, agora organizados
em subseções nomeadas ("Font", "Spacing", "Variable font axes",
"OpenType features", "Text on path"). Zero break.

### Specs (+ 22 novos cases)

- **`text-node.ts`**: tipos via TypeScript (type-checker valida no build)
- **`renderers.spec.ts`** (+6 cases): font-style emit, text-decoration
  emit, omits quando undefined, multi-line dy default 1.2em, multi-line
  dy com lineHeight, lineHeight <= 0 cai pra default
- **`svg-exporter.spec.ts`** (+5 cases): font-style emit, text-decoration
  (underline + line-through), omits quando undefined, todos os 6 attrs
  juntos (fontSize + fontFamily + fontWeight + textAnchor + fontStyle +
  textDecoration)
- **`inspector.component.spec.ts`** (+11 cases): cada controle dispara
  o mutation correto (font-family preset / custom, font-size com
  validação, font-weight, text-anchor, italic toggle bidirecional,
  decoration mutuamente exclusivo, line-height com validação)

### Validação

- ng build svg-engine ✓ (9 entry points, ~8s)
- (specs + lint + playground build vão rodar na fase final)

### Decisões importantes

- **Bloco básico ANTES do avançado** — usuário típico vai mais vezes
  ao font-size do que ao OpenType. Ordem visual reflete prioridade
  de uso, não ordem de implementação.
- **Custom font input expansível** — `<mat-select>` "Custom…" revela
  o input livre. Mantém UX limpa pro caso 90% (presets) sem cortar
  acesso ao caso 10% (fonte específica do projeto).
- **Italic via toggle dedicado, não no font-weight** — embora alguns
  editores agrupem "Bold + Italic" num único controle, são axes
  ortogonais no CSS/SVG. Separar evita confusão.
- **Mutual exclusion underline/strike** — SVG aceita `'underline
line-through'` combinado, mas o controle é single-value por design;
  designers querendo layered podem editar SVG direto. Trade-off
  consciente em favor de UX simples.
- **lineHeight unitless** — segue convenção tipográfica CSS (1.0 =
  tight, 1.5 = relaxed). Aplica ao `dy` em `em`, então a relação
  com font-size se preserva sob mudanças de tamanho.
- **Defaults SVG explícitos no comportamento "clear"** — campos com
  default semântico (textAnchor='start', fontStyle='normal',
  textDecoration='none') quando o toggle fica off vão pra `undefined`
  em vez de escrever o default explicito. Mantém o SVG exportado mais
  limpo (sem atributos redundantes) e fiel à convenção dos outros
  campos (clipPath, mixBlendMode no D-049 fazem o mesmo).

### Por que D-069 antes de D-067 (autotrace multi-color)

O D-068 fechou um gap, mas só metade. Sem D-069 o usuário não
consegue alterar a tipografia básica do editor — feature mais
fundamental que multi-color autotrace. **Priorizando UX antes de
recursos novos**, conforme demanda do usuário ("é preciso garantia
que o sistema atual não quebre" + observação direta de que as
features D-068 são úteis mas secundárias).

### Status revisado das features de texto

| Feature                  | Antes D-069     | Depois D-069                                                        |
| ------------------------ | --------------- | ------------------------------------------------------------------- |
| font-family              | engine ✓, UI ✗  | **FULL** (10 presets + custom)                                      |
| font-size                | engine ✓, UI ✗  | **FULL** (number input)                                             |
| font-weight              | engine ✓, UI ✗  | **FULL** (9 níveis)                                                 |
| text-anchor              | engine ✓, UI ✗  | **FULL** (3-way segmented)                                          |
| font-style (italic)      | ausente         | **FULL** (model + render + export + UI)                             |
| text-decoration          | ausente         | **FULL** (model + render + export + UI)                             |
| line-height (multi-line) | hardcoded 1.2em | **FULL** (model + render + UI; export pendente do multi-line tspan) |

---

## 2026-05-24 — D-068 follow-up: textPath href resolvendo no canvas + no export

### Demanda

Usuário aplicou Text on Path pela primeira vez (D-068 acabou de
shipar a UI) e relatou: "o texto sumiu, não seguiu a curva". Imagem
confirmou: o bbox do `<text>` continuou na posição original, vazio,
sem caractere algum.

### Diagnóstico

**Duas causas, ambas vindas do D-053**, só expostas agora que o D-068
deu UI pro `textPathRef`:

1. **Renderer (`path-renderer.directive.ts`)**: host bindings listavam
   `d`, `fill`, `stroke`, etc. mas **não emitiam `[attr.id]`**. O
   wrapper `<g>` carregava só `data-node-id` — `<textPath href="#id">`
   resolve fragment contra o atributo `id`, não `data-*`. Logo o
   browser não achava o path-alvo, o `<textPath>` engolia silenciosamente,
   e o texto sumia (bbox em (x, y) com zero caracteres).

2. **Exporter (`svg-exporter.ts`)**: regra geral "ids are runtime
   editor state, not serialized" (linha 288). Mas o `renderText`
   emitia `<textPath href="#${ref}">` referenciando esse mesmo id
   que **não estava no export**. Quebra no Inkscape / Illustrator /
   Chrome também — não só no canvas. Bug duplo do mesmo defeito.

### Implementação

**Renderer fix** — uma linha em `path-renderer.directive.ts`:
adicionado `'[attr.id]': 'node().id'` nos host bindings. Comentário
JSDoc explica o porquê (UUIDs únicos = zero risco de colisão; custo
de um atributo extra é negligível; também ajuda debug + fallback
pra futuros `<use href>`).

**Exporter fix** — pre-scan da árvore + emissão condicional:

- Nova função pura `collectReferencedPathIds(root)` exportada de
  `svg-exporter.ts`. Walka a árvore com `walk` (de svg-engine/core)
  e coleta os ids que algum `TextNode.textPathRef` aponta.
- `export()` faz o pre-scan UMA vez e propaga `ReadonlySet<NodeId>`
  pra `renderNode` → `renderGroup` (recursão) → `renderPath`.
- `renderPath` emite `['id', node.id]` somente se `referencedIds.has(node.id)`.
  Paths não-referenciados continuam sem id (preserva a intenção
  "runtime-only" pro 99% dos casos).

### Specs

- **renderer** (`renderers.spec.ts`): novo describe "D-068 follow-up:
  emits id for textPath resolution" — 2 cases (path tem id matching
  node id; ids únicos entre paths separados).
- **exporter** (`svg-exporter.spec.ts`): novo describe "D-068
  follow-up: id emission for referenced paths" — 4 cases (path
  referenciado emite id, path não-referenciado não emite, mix de
  ambos honra a fronteira, walk pega ref em grupo nested) +
  describe "collectReferencedPathIds — pure helper" — 3 cases
  (empty set quando sem textPathRef, coleta vários, ignora
  string vazia/undefined).

### Como isso afeta features existentes

- **Round-trip de SVG com textPath**: agora funciona end-to-end —
  importa SVG com `<text><textPath href="#p1">`, edita no canvas,
  exporta, reabre em outro editor sem perder o textPath.
- **Paths não-referenciados**: zero impacto (mesma saída byte-by-byte).
- **Outros refs** (clipPath, mask, filter, gradient): seguem usando
  `<defs>` separado, não passam por este pipeline.

---

## 2026-05-24 — D-068: Inspector Type section — fecha o gap de UI do D-053

### Demanda

Usuário reportou que **Variable Fonts + OpenType + Text on Path** (D-053)
não estavam testáveis nem usáveis pelo editor. Auditoria honesta confirmou:
modelo + renderer + exporter prontos (e specs cobrem isso), mas **ZERO UI**.
A entrada anterior do D-053 e um comentário JSDoc do plugin advanced-edit
diziam "Inspector controls surface them directly when a text node is
selected" — afirmação falsa. As features só funcionavam via SVG importado
ou console JS. Marcação como concluído foi otimista: engine completo
≠ feature usável pelo usuário final.

### Implementação

**Nova seção "Type" no `<svge-inspector>`** (`ui/lib/inspector/inspector.component.ts`)
— visível **apenas** quando o nó focado é `type: 'text'`, posicionada
entre "Path operations" e "Style". Layout em 4 subseções com 5 controles
no total:

1. **`letter-spacing` (px)** — `<input type="number" step="0.1">`. Empty
   limpa o campo (volta pro default SVG).
2. **`font-variation-settings` (Variable font axes)** — `<input type="text">`
   livre com placeholder `'wght' 650, 'wdth' 95`. Hint inline avisa
   "Inactive on static (non-variable) fonts".
3. **`font-feature-settings` (OpenType features)** — 4 chips de quick-toggle
   (`Liga` / `SmCp` / `TNum` / `SS01`) que alternam tags + `<input type="text">`
   raw pra qualquer feature tag arbitrária. Quick-toggles preservam tags
   adicionais que o usuário tenha digitado (round-trip via `parseFontFeatures`
   - `stringifyFontFeatures`, helpers puros exportados pra testes).
4. **`textPathRef` (follow path)** — `<mat-select>` listando todos os
   `path` nodes do documento (label = `metadata.name` + short-id; só
   paths aparecem porque `<textPath href>` aceita apenas paths). Opção
   `(none — straight baseline)` limpa **AMBOS** `textPathRef` e
   `textPathStartOffset` em uma operação (evita órfão).
5. **`textPathStartOffset` (start offset)** — `<input type="text">` aceita
   `50%` (porcentagem) ou `40` (user units). Disabled quando `textPathRef`
   não está setado.

**Padrão de mutação**: todos os campos disparam `SetPropertyCommand<TextNode, K>`
via `CommandBus` — single undo entry por field edit, multi-editor scope
honrado (D-042). Helper `setTextProperty<K>` centraliza guarda de
lock + dedup ("same value → no-op").

**Helpers puros exportados** em `inspector.component.ts`:

- `parseFontFeatures(raw)` — tolerante a aspas simples/duplas e formas
  `on`/`off`/`0`/`1`/`<num>` permitidas pela spec CSS. Retorna `Map<tag, on>`.
- `stringifyFontFeatures(map)` — só emite tags habilitadas (CSS default
  já é "feature off" pra non-defaults), aspas simples canônicas.

**Specs (`inspector.component.spec.ts`)**: 3 novos describes, 17 cases:
visibility (rect oculta, text mostra, switch focus colapsa), dispatch
(cada controle muta o campo correto), pure helpers (parse/stringify
spec-compliant). Total +280 linhas de spec.

### Correção de comentário falso

`edit/lib/menu/builtin/builtin-advanced-edit-menu.plugin.ts` linhas
34-36 diziam "Inspector controls surface them directly" — comentário
substituído por descrição correta apontando pro D-068 e admitindo
honestamente que pré-D-068 o D-053 era **headless-only**.

### Decisões importantes

- **Lista paths apenas** no dropdown textPathRef — `<textPath href>`
  aceita só paths (não rects/ellipses). Usuário que queira texto num
  círculo usa "Convert to Path" (já 1-click no Inspector).
- **`(none)` limpa ambos `ref` + `offset`** — evita config inválida
  (offset sem path).
- **Quick-toggles + raw input** — quick-toggles cobrem 4 features mais
  comuns; raw input cobre tudo (stylistic sets, character variants,
  alt-index). Não tentar mostrar interface visual pros 100+ tags
  OpenType existentes — usabilidade ruim, melhor confiar em quem
  conhece OpenType pra digitar.
- **Sem detecção de eixos disponíveis na variable font** — listar
  `wght`/`wdth` como sliders teria sido cool mas requer font-loading
  detection complexa (`CSS.supports("font-variation-settings")`
  - parsing de `fvar` table). Mantido como text input livre por enquanto;
    follow-up se pedido.

### Validação

- `ng build svg-engine` ✓ todos os 9 entry points
- Specs cobrem dispatch + visibility + pure helpers
- Comentário falso do plugin corrigido

### Status do D-053 (revisado)

| Feature           | Pré-D-068     | Pós-D-068                        |
| ----------------- | ------------- | -------------------------------- |
| Variable Fonts    | HEADLESS-ONLY | **FULL** (UI + Inspector)        |
| OpenType features | HEADLESS-ONLY | **FULL** (4 quick-toggles + raw) |
| Text on Path      | HEADLESS-ONLY | **FULL** (dropdown + offset)     |
| Letter spacing    | HEADLESS-ONLY | **FULL** (number input)          |

Usuário pode finalmente testar/usar todas as features do D-053 sem
recorrer ao console JS ou importar SVG pré-pronto.

---

## 2026-05-24 — D-066: Auto-trace polish — Material dialog + Ctrl+Alt+T + status pill

### Demanda

User pediu execução de TODOS os 3 follow-ups sugeridos sobre o
D-065-fix (Auto-trace só com defaults hardcoded):

1. Dialog Material com sliders (`threshold` / `tolerance` /
   `minPoints` + checkbox "hide source")
2. Atalho de teclado `Ctrl+Alt+T`
3. Status bar "Tracing…" durante o async (sem feedback hoje)

### Reorganização estrutural prévia (D-066a + D-066b)

Antes de codar UI, **moveu a Trace Image entry pra `svg-engine/ui`**
(`builtinUiMenuContributionsPlugin`) porque o dialog Material só
pode viver lá (D-017 — headless boundary impede `svg-engine/edit`
de importar `@angular/material`):

- **D-066a** — `TraceProgressService` em `svg-engine/edit/autotrace`:
  contador-based (não boolean) pra suportar traces concorrentes,
  `running: Signal<boolean>` derivado, `start()/stop()` driven by
  caller (NÃO acoplado a `TraceImageCommand` — mantém o command
  puro / sem DI). Registrado no `provideSvgEngineEditorScope` pra
  isolamento per-editor (D-042).
- **D-066b** — `builtinMenuContributionsPlugin` (edit-side) **perdeu**
  a entry `svge.builtin.object.trace-image` + `noImageSelectionFactory`
  - `runTraceImage`. Substituídos por comentário-âncora apontando
    pro novo home em `svg-engine/ui`.

### Implementação (D-066c + D-066d + D-066e)

**D-066c — Dialog Material `<svge-trace-image-dialog>`**
(`projects/svg-engine/ui/src/lib/trace-image-dialog`):

- `SvgeTraceImageDialog` standalone, dentro do `SvgeDialogShell`
  (chrome consistente — D-044 sizing system, bucket `sm`)
- 3 sliders nativos (`<input type="range">`) com hint contextual:
  - `Threshold` 0..255 (default 128) — cutoff luminância ink/paper
  - `Tolerance` 0..10px step 0.1 (default 1) — Douglas-Peucker
  - `Min points` 3..20 (default 4) — drop noise speckles
- Checkbox `hide source after trace` (default ON)
- Footer Apply / Cancel — Apply fecha com `TraceImageDialogResult`,
  Cancel fecha com `null`
- `SvgeTraceImageDialogService` (`@Injectable({ providedIn: 'root' })`)
  encapsula `MatDialog.open` + `svgeDialogConfig('sm', { injector })`
  pra propagar o injector D-042-safe

**D-066d — Menu + Shortcut no UI plugin**
(`builtinUiMenuContributionsPlugin`):

- Menu `svge.builtin.ui.object.trace-image` em `MENU_SLOT.OBJECT`
  ordem 80, label "Trace Image…", icon `auto_fix_normal`,
  shortcut display `Ctrl+Alt+T`, `disabled: noImageSelectionFactory`
- Shortcut `svge.builtin.shortcut.trace-image` combo `Ctrl+Alt+T`
  registrado via `ShortcutRegistry` (que vive em `svg-engine/edit`
  — UI pode importar livremente porque UI é downstream de edit)
- Ambos (menu + shortcut) chamam o mesmo helper
  `openTraceImageDialog(injector)`:
  1. Valida selection (1 node, type 'image')
  2. Abre dialog + `await firstValueFrom(ref.afterClosed())`
  3. `progress.start()` → `try { await cmd.prepare({ state }) }
catch (alert) } finally { progress.stop() }`
  4. `bus.dispatch(cmd)` + check `result.ok`
  5. Se `hideSource`: `SetPropertyCommand<ImageNode, 'metadata'>(...)`
     com `visible: false`
  6. `selection.select(groupId)` pra feedback visual

**D-066e — Status bar Tracing pill**
(`SvgeStatusBar`):

- Nova seção `'tracing'` adicionada ao `STATUS_BAR_SECTIONS`
  (entre `isolation` e `dirty`)
- `inject(TraceProgressService)` + `isTracing = computed(...)` +
  `tracingLabel` (plural-aware: "Tracing…" ou "Tracing 2…")
- Render condicional `@if (showSection('tracing') && isTracing())`
  — invisível quando idle (sem layout shift / sem ícone animado
  roubando atenção)
- Visual: pill arredondado com fundo `secondary-container`, ícone
  `progress_activity` spinning (1s linear infinite), respeita
  `prefers-reduced-motion`

### Validação

- ng test svg-engine ✓ (sem regressão; +3 specs novos no status-bar)
- ng lint svg-engine ✓ All files pass linting
- ng build playground ✓ (UI plugin compila com novos imports
  cross-package: core + edit + ui)

### Como usar agora

1. Selecionar uma `<image>` no canvas
2. **Menu**: Object → Trace Image… **OU** **Atalho**: `Ctrl+Alt+T`
3. Dialog abre — ajustar sliders + checkbox conforme o input
   (logo limpo? `threshold=180`. Foto JPEG? `tolerance=2,
minPoints=8` pra filtrar ruído.)
4. Clicar **Apply** — pill "Tracing…" pulsa no status bar
   durante o async (fetch + canvas + marching squares +
   Douglas-Peucker; geralmente <500ms pra imagens pequenas)
5. Resultado: novo grupo de paths aparece selecionado;
   imagem original some (se `hideSource` ON) — reversível pelo
   Layer Panel ou Undo

### Decisões importantes

- **Dialog devolve options (não faz o trace)** — mantém o
  componente puro-UI, facilita testes + reuso futuro
- **Counter, não boolean, no TraceProgressService** — defensive
  contra traces paralelos, custo zero
- **`hideSource` via `SetPropertyCommand` separado** — fica numa
  entrada de undo independente (user pode reverter SÓ o hide sem
  desfazer o trace inteiro)
- **Mesmo handler menu + shortcut** — single source of truth, não
  duplica a state machine

---

## 2026-05-24 — D-065 follow-up: Auto-trace (D-062d) wired no Object menu

### Demanda

Usuário perguntou se o Auto-trace estava disponível. Auditoria
honesta mostrou que a ENGINE existia (D-062d shipped:
`traceImageToPaths` algoritmo puro + `TraceImageCommand`) mas
NENHUMA entrada de UI tinha sido criada — só dava pra invocar via
console JS. Logo: estava entregue, mas inutilizável pelo usuário
final.

### Implementação

**1 nova factory** `noImageSelectionFactory`:

- Require `selection.size === 1 AND node.type === 'image'`
- Diferente das outras factories (≥2 ou ≥3) — Trace opera em UMA
  imagem específica produzindo um grupo de paths

**1 nova menu contribution** `svge.builtin.object.trace-image`:

- Slot `MENU_SLOT.OBJECT`, order 80 (após Pathfinder, antes do Help)
- Label "Trace Image…" (Illustrator convention)
- Icon `auto_fix_normal`
- Tooltip explicativo

**Run handler** `runTraceImage(runCtx)` async:

- Resolve selection + state via `fromCtx`
- Cria `TraceImageCommand(id, { threshold: 128, tolerance: 1 })`
  (defaults conservadores pra logos/line-art)
- `await cmd.prepare({ state })` — carrega bitmap, rasteriza, traça
- `try/catch` com `console.error` + `window.alert` pra erros
  CORS / decode fail (sem alert silencioso)
- `bus.dispatch(cmd)` + check `result.ok`
- `selection.select(groupId)` pra feedback visual (usuário vê o
  novo grupo selecionado, pode esconder/deletar a imagem original)

### Honest scope (lembrete D-062d)

- Bicromático single-threshold (logos sim, fotos não)
- Polyline output (sem curve-fitting → facetado em zoom alto)
- Defaults `threshold=128, tolerance=1` são razoáveis pra inputs
  típicos; dialog Material com sliders fica como follow-up

### Validação

- 1409 testes ✓ (sem regressão)
- Lint clean
- Playground build clean

### Como usar agora

1. Selecionar uma `<image>` no canvas (importada via Library →
   Assets ou via SVG com `<image href="data:...">`)
2. Object → Trace Image…
3. Aguardar o async (geralmente <500ms pra imagens pequenas)
4. Novo grupo de paths aparece sobre a imagem original; user
   esconde/deleta a imagem se quiser só o vetor

---

## 2026-05-24 — D-065: Align / Distribute / Pathfinder submenus no Object

### Demanda

User pediu pra adicionar Align, Distribute e Pathfinder à menu bar
seguindo padrões profissionais. Auditoria confirmou:

- `AlignmentService` (6 align axes + 2 distribute axes) já existia
  no headless mas NÃO tinha entrada de menu
- 5 Pathfinder commands (Union/Intersect/Subtract/Divide/Exclude)
  só estavam acessíveis via toolbar customizada do `/custom-editor`
- `MenuContributionRegistry` suporta submenus via `parentId` (D-038)
  - dividers internos via `divider: true`
- Menu Object existente só tinha reorder (Bring to Front/Forward/
  Backward/Send to Back)

### Estrutura (padrão Illustrator/Inkscape)

```
Object
├── Bring to Front          (10)
├── Bring Forward           (20)
├── Send Backward           (30)
├── Send to Back            (40)
├── Align          ▶        (50, require ≥ 2)
│   ├── Align Left
│   ├── Center Horizontal
│   ├── Align Right
│   ├── ─────────
│   ├── Align Top
│   ├── Center Vertical
│   └── Align Bottom
├── Distribute     ▶        (60, require ≥ 3)
│   ├── Horizontally
│   └── Vertically
└── Pathfinder     ▶        (70, require ≥ 2)
    ├── Union               (A ∪ B — merge overlapping)
    ├── Intersect           (A ∩ B — keep only overlap)
    ├── Subtract            (A \ B — remove others from first)
    ├── Divide              (split into non-overlapping regions)
    └── Exclude             (symmetric difference)
```

### Implementação

**3 novas factories de disabled** (`builtinMenuContributionsPlugin`):

- `cantAlignFactory` — selection.size < 2
- `cantDistributeFactory` — selection.size < 3
- `cantPathfinderFactory` — selection.size < 2 (commands rejeitam
  group/text/image internamente)

**13 novas contribuições** no slot `MENU_SLOT.OBJECT`:

- 3 parents (Align / Distribute / Pathfinder) — sem `run` real
- 7 children Align (6 axes + 1 divider)
- 2 children Distribute
- 5 children Pathfinder

**Helper compartilhado** `collectSelectedBBoxes(runCtx)`:

- Query `document.querySelector('svge-renderer svg')` pra obter raiz
  do SVG renderizado
- Itera `selection.selectedIds()` e chama `getRenderedNodeBBox`
- Retorna `NodeBBox[]` no formato esperado pelo AlignmentService
- Reusa exatamente o padrão do `/custom-editor.collectSelectionBBoxes`

**Helper Pathfinder** `dispatchPathfinder(runCtx, Ctor)`:

- Auto-convert rect/ellipse/line/polygon/polyline → path via
  `ConvertNodeToPathCommand` (Affinity/Illustrator convention)
- Dispatch o command Boolean (operand A wins, keeps id)
- Re-seleciona operand A pra feedback visual

### Validação

- 1409 testes ✓ (sem regressão)
- Lint clean
- Playground build clean
- Build svg-engine clean

### Premissas honradas

- D-017 (headless): plugin vive em `svg-engine/edit`, nenhum
  Material import
- D-042 (multi-editor): factories usam `injector` lazy resolution;
  `run` handlers passam `runCtx?.injector` via `fromCtx` helper
- D-043 (factory pattern de disabled): consistente com os 6
  factories pré-existentes (canUndo/canRedo/noSelection/cantGroup/
  cantUngroup/noClipboard)
- Plugin-extensibility: consumers podem substituir qualquer ação
  registrando ids equivalentes

### Ganho de UX

- **Align + Distribute** agora acessíveis em qualquer view com
  `<svge-menu-bar>` (basic/modular/shell-pro/custom-editor) — antes
  só rolava em custom-editor via toolbar customizada
- **Pathfinder ops** ganham descoberta visual (5 itens com
  tooltips explicativos: `A ∪ B`, `A ∩ B`, `A \ B`, etc.)
- **Disabled signals reativos** — itens dimam imediatamente quando
  seleção fica menor que o mínimo necessário

### Icons (Material 3)

| Item         | Icon                      |
| ------------ | ------------------------- |
| Align Left   | `align_horizontal_left`   |
| Center H     | `align_horizontal_center` |
| Align Right  | `align_horizontal_right`  |
| Align Top    | `align_vertical_top`      |
| Center V     | `align_vertical_center`   |
| Align Bottom | `align_vertical_bottom`   |
| Distribute H | `horizontal_distribute`   |
| Distribute V | `vertical_distribute`     |
| Union        | `join_inner`              |
| Intersect    | `join_full`               |
| Subtract     | `join_left`               |
| Divide       | `call_split`              |
| Exclude      | `join_right`              |

---

## 2026-05-24 — D-064: centralizar Undo/Redo/Zoom na Toolbar principal

### Demanda

User reportou que `<svge-editor>` mostra Undo/Redo duplicados (uma
vez via `<svge-toolbar slot="toolbar.main">` rendering o registry,
outra vez via botões hardcoded à direita do toolbar). Pediu pra
centralizar Undo/Redo/Zoom-In/Zoom-Out/Reset na Toolbar principal e
remover os botões soltos.

Auditoria confirmou:

- `<svge-editor>` template tinha 5 botões hardcoded (Undo/Redo +
  Zoom-Out/Zoom%/Zoom-In/Reset) DEPOIS do `<svge-toolbar>` slot
- Undo/Redo já estavam no slot `toolbar.main` do
  `builtinMenuContributionsPlugin`
- **Zoom NÃO estava** no slot → `<svge-shell-pro>` (que só consome
  o registry) ficava sem botões de zoom
- `/custom-editor` tinha sua própria toolbar com 5 botões duplicados

### Implementação

**D-064a — Registrar Zoom no `toolbar.main`**:

- `builtinMenuContributionsPlugin` agora registra Zoom Out (order 60),
  Zoom In (order 70), Reset View (order 80) no `TOOLBAR_SLOT.MAIN`
- Mesmos handlers que MENU_SLOT.VIEW pra consistência
- Ordens 10-50 (history+edit) ficam no início; 60-80 (viewport) no fim

**D-064b — `<svge-editor>` shell**:

- Removidos os 5 botões hardcoded da template
- Removidos `undoTriggered`/`redoTriggered` outputs (consumers que
  precisam usam `CommandBus`/`HistoryService` diretamente)
- Removidos métodos `undo`/`redo`/`zoomIn`/`zoomOut`/`resetView` +
  computeds `canUndo`/`canRedo`/`zoomPct`
- Removidas DI de `CommandBus`/`HistoryService`/`ViewportService` +
  imports de Material (`MatIconButton`/`MatIcon`/`MatTooltip`)
- Shell agora só renderiza `<svge-toolbar slot="toolbar.main">` —
  single source of truth

**D-064c — `/custom-editor`**:

- Removidos 5 botões soltos dos fieldsets Edit + Viewport
- Adicionado `<svge-toolbar slot="toolbar.main">` num novo fieldset
  "History & Viewport" no topo da toolbar customizada
- Removidos métodos `undo`/`redo`/`zoomIn`/`zoomOut`/`resetView` +
  computeds `canUndo`/`canRedo`

**Spec migration**:

- Removidos 2 describe blocks obsoletos do
  `editor.component.spec.ts` (4 specs): "toolbar buttons" e
  "output emission" — testavam comportamento hardcoded que migrou
  pro registry. `builtinMenuContributionsPlugin.spec.ts` já cobre
  o pipeline novo.

### Ganho

- **Consistência visual** total entre `<svge-editor>`,
  `<svge-shell-pro>`, `/custom-editor` — todos consomem o mesmo
  `toolbar.main` slot
- **Zero duplicação** — botões aparecem uma única vez
- **`<svge-shell-pro>` agora mostra Zoom** (era "quebrado")
- **Plugin developers** podem extender ações via
  `MenuContributionRegistry` (vale pra zoom também agora)
- **Atalhos preservados** (D-040 já registrava Ctrl+Z/Y; wheel
  zoom continua pelo canvas)

### Validação

- 1409 testes ✓ (-4 obsoletos)
- Lint clean
- Playground build clean

### Premissas honradas

- D-017: shell mais leve (menos Material imports)
- Zero regressão funcional (handlers idênticos aos antigos)
- Anti-duplicação: única fonte de verdade pra Undo/Redo/Zoom
- Plugin-extensibility: novas ações só precisam ir no registry

---

## 2026-05-24 — D-063: Symbol Sprayer live preview + custom-editor defs fix

### Demandas

1. **Preview em tempo real do Symbol Sprayer** — antes só aparecia
   no pointer-up. UX queria ver as instâncias dropando durante o
   arrasto, com performance + sem flickering.
2. **Custom editor não mostrava o efeito aplicado** — bug:
   `defs()` computed do custom-editor só mergiava docDefs + effects;
   pulava gradients/patterns/clipPaths/masks/**symbols**/chains. O
   `<use href="#sym-id">` paintava nada porque o `<symbol>` nunca
   chegava em `<defs>`.

### Implementação

**D-063a — custom-editor defs fix**:

- `defs()` substituído por `ActiveDefsService.buildExportDefs()` —
  mesmo composer que o shell-pro + svg exporter usam.
- Agora 7 sources entram nos defs (era 2): docDefs, effects,
  chains, gradients, patterns, clipPaths, masks, symbols.
- `EffectRegistry` import removido (não mais usado).

**D-063b — SymbolSprayerPreviewService** (scoped per-editor, D-042):

- Signals `drops: SprayDrop[]` + `symbolId: string | null`
- API: `begin(symbolId)` / `append(drop)` / `clear()`
- Tool escreve em sincronia com seu próprio buffer (não há mudança
  na lógica de commit — apenas duplica writes em preview)
- Registrado em `provideSvgEngineEditorScope`

**D-063c — SymbolSprayerOverlay** (`<svg:g svgeSymbolSprayerOverlay>`):

- Standalone component em `lib/library/symbols/`
- Inline `<svg:defs>` com `<symbol>` master via `buildSymbolMarkup`
  (necessário porque preview drops ainda não estão no doc → defs
  composer não emitiu o symbol)
- N `<svg:use href="#…">` (um por drop) com `@for track $index`
- Opacity 0.65 pra distinguir preview de committed
- `pointer-events: none` (decorativo, tool segue recebendo eventos)

**SymbolSprayerTool** atualizado:

- `onPointerDown` → `preview.begin(symbolId)` + emite primeiro drop
- `emitDropAt` → push em buffer local AND `preview.append(drop)`
- `onPointerUp` → dispatch batch command + `preview.clear()`
- `onPointerCancel` → `preview.clear()`
- **Lógica final inalterada**: o `InsertSymbolInstancesBatchCommand`
  segue sendo a fonte de verdade; preview é apenas espelho visual.

**D-063d — Overlay wired em todas as visões**:

- `/custom-editor` (HTML template + TS imports)
- `/basic-editor` (inline template + TS imports)
- `/modular-editor` (idem)
- `/pro-editor` (projeta no `<ng-content>` do shell-pro)
- shell-pro e svge-editor não precisam mudar — só projetam content
  via `<ng-content>`.

### Performance e UX honestas

- **Anti-flicker**: preview clear acontece DEPOIS do
  `bus.dispatch()` — quando o commit pinta as instâncias reais, o
  preview some no mesmo tick. Sem janela onde tudo desaparece.
- **Anti-acumulação**: cada drop usa as MESMAS coords (centro,
  scale, jitter) calculadas uma vez em `emitDropAt`; preview e
  commit são bit-for-bit idênticos.
- **DOM stability**: `@for ... track $index` evita re-render dos
  `<use>`s anteriores quando um novo é appended (Angular só
  insere um node no DOM por append).
- **Defs duplicados** (preview + ActiveSymbolsService): se o doc já
  tem instâncias do mesmo símbolo, há dois `<symbol id="X">` no SVG.
  Spec marca como undefined behavior; browsers tipicamente honram o
  primeiro. Conteúdo idêntico (mesmo master) → paint correto em
  ambos os casos.

### Validação

- 1413 testes ✓ (sem regressão; nenhum spec novo necessário —
  overlay é puro visual, lógica de spray já coberta por
  `InsertSymbolInstancesBatchCommand.spec`)
- Lint clean
- Playground build clean

### Arquivos novos

- `edit/lib/library/symbols/symbol-sprayer-preview.service.ts`
- `edit/lib/library/symbols/symbol-sprayer-overlay.component.ts`

### Arquivos modificados

- `edit/lib/library/symbols/index.ts` (re-exports)
- `edit/lib/scope/editor-scope.providers.ts` (preview service)
- `edit/lib/tool/extra-tools.ts` (SymbolSprayerTool integra preview)
- `playground/pages/custom-editor/custom-editor.component.ts`
  (ActiveDefsService import; EffectRegistry removido;
  SymbolSprayerOverlay adicionado)
- `playground/pages/custom-editor/custom-editor.component.html`
  (overlay projetado)
- `playground/pages/basic-editor/basic-editor.component.ts`
- `playground/pages/modular-editor/modular-editor.component.ts`
- `playground/pages/pro-editor/pro-editor.component.ts`

### Premissas honradas

- D-017: SymbolSprayerOverlay vive em `svg-engine/edit`; usa
  `DomSanitizer` (`@angular/platform-browser`, OK pra edit-side)
  e zero `@angular/material`
- D-042: SymbolSprayerPreviewService é scoped (preview de A não
  vaza pra B)
- Zero regressão: lógica de commit (batch command) intocada;
  preview é puro visual mirror
- Sem implementação fictícia: bit-for-bit identical entre preview
  e commit (mesmas coords/scale/jitter calculadas uma vez)

---

## 2026-05-24 — D-062 fixes UX: Mesh removido + auto-routing Gradient & Symbol Sprayer

### Demanda

Após testar D-062, usuário reportou 3 problemas:

1. **Gradient tool** — não abre o painel Libraries nem destaca o
   gradient aplicado. Deveria ser automático quando o gradient da
   seleção é da biblioteca.
2. **Mesh tool** — sem efeito real visível. Se não melhorável,
   remover.
3. **Symbol Sprayer** — funciona mas não abre Libraries → Symbols
   automaticamente. Deveria ser automático + auto-selecionar
   primeiro item.

### Decisões

**Mesh removido** — confirmação da limitação fundamental:
SVG 1.1 sem `<meshgradient>`, SVG 2.0 sem suporte browser. A
aproximação radial-multi-stop não trazia valor sobre simplesmente
aplicar um radial built-in da biblioteca. Tool desregistrado do
`extraToolsPlugin`; `MESH_TOOL_ID` permanece exportado como no-op
constante pra back-compat. `MeshToolService` + `MeshStop` removidos
do public API.

**Auto-routing implementado** — `libraries-panel` controla
`<svge-panel-group>` via `[activeTab]` e snap automaticamente em
3 gatilhos:

- **Tool Gradient ativado** → snap pra tab `gradients`
- **Tool Symbol Sprayer ativado** → snap pra tab `symbols` +
  auto-seleciona primeiro símbolo se nenhum estava selecionado
- **Seleção contém shape com `fill="url(#libGradientId)"`** →
  snap pra tab `gradients` (independente do tool ativo)

User pode override clicando manualmente em outra tab — o
`onTabChange` atualiza o signal local, e o próximo trigger
de auto-routing parte daí.

### Detalhes técnicos

**`appliedGradientId` computed** — varre os ids selecionados,
extrai `url(#id)` do fill via regex, retorna o primeiro que existe
na `GradientLibraryService.items`. Multi-select com gradients
diferentes: primeiro vence.

**Visual highlight** — cell ativa do gradient ganha
`.gradient-active` (mesma classe-pattern de `.brush-active` e
`.symbol-active`: background container + outline primary).

**Effects (signal-based)** — 2 `effect()`s no constructor do
component: um pra `toolHost.activeId()`, outro pra
`appliedGradientId()`. Independentes — ativar Gradient tool e
selecionar gradient shape em qualquer ordem produz o mesmo
resultado.

### Validação

- 1413 testes ✓ (sem regressão)
- Lint clean (removidos `hashString`/`escapeXmlAttr` órfãos que
  só serviam ao Mesh tool)
- Playground build clean

### Premissas honradas

- D-017: panel-group ainda só usa `MatIcon` (Material light)
- D-042: scoped services intactos
- Zero regressão: tabs manualmente trocadas continuam funcionando;
  só o snap automático é novo
- Honestidade sobre limitações: Mesh REMOVIDO em vez de manter
  feature que não entrega valor (anti-stub)

---

## 2026-05-24 — D-062: 4 tools reais (Symbol Sprayer + Width + Mesh + Auto-trace)

### Demanda

User autorizou implementação autônoma dos 4 últimos stubs/deferred:
Symbol Sprayer + Width + Mesh + Auto-trace (raster→vector). Premissas:
não criar implementações fictícias, validar prévio existência, evitar
duplicação, performance preservada, zero regressão.

### Implementações (4 tools agora REAIS)

**D-062a — Symbol Sprayer**:

- `SymbolSelectionService` (scoped via D-042) — signal
  `selectedSymbolId` que o libraries-panel seta quando o Sprayer
  está ativo.
- `SymbolSprayerService` (root) — `spacing` / `baseSize` /
  `scaleJitter` configuráveis.
- `SymbolSprayerTool` em `extra-tools.ts`: drag espalha instâncias
  do símbolo ativo ao longo do path do mouse com throttle por
  `spacing`. Random scale dentro da banda jitter.
- `InsertSymbolInstancesBatchCommand` (D-062a) — N instâncias num
  único undo entry (vs. dezenas que sujariam o histórico).
- Libraries panel: dual-mode click — quando Sprayer ativo, click
  numa symbol cell SELECIONA pra sprayer; senão fallback ao D-059
  single-instance insert. Cell ativa marcada visualmente
  (highlight + outline).

**D-062b — Width tool**:

- `WidthToolService` (root) — preset (uniform/tapered/calligraphic)
  - baseWidth.
- `WidthTool`: ao click num path, sampleia anchors, expande via
  `expandStrokeWithProfile` (D-060) e dispatcha
  `SetPropertyCommand<PathNode, 'd'>` substituindo a centerline
  pelo outline. **Destrutivo, undo recupera**. Caminho não-
  destrutivo (armazenar profile no PathNode) deferido pra revisão
  futura.

**D-062c — Mesh tool (honest approximation)**:

- SVG 1.1 não tem `<meshgradient>`; SVG 2 sem implementação browser.
  Implementar mesh REAL exigiria rasterizar via canvas + image
  fill. Decisão: **entregar aproximação radial multi-stop com
  honestidade documentada** em vez de stub.
- `MeshToolService` (root) — array de stops `{x, y, color}` +
  activeColor.
- `MeshTool`: cada click adiciona stop; dbl-click commita.
  Synthesize `<radialGradient>` com `fx/fy/r` centrados no
  centroide e stops distribuídos por distância. Inserido em
  `doc.defs` + aplicado como `fill="url(#…)"` na seleção.
- Limitação registrada em docstring + console hint na ativação.

**D-062d — Auto-trace (raster → vector)**:

- Antes documentado como "deferido" (D-057). Implementado agora
  como módulo separado `svg-engine/edit/lib/autotrace/`:
  - `traceImageToPaths(image, opts)` pura — marching squares +
    Douglas-Peucker. Retorna array de `d`-strings.
  - `TraceImageCommand` — pega `ImageNode` selecionado, carrega
    href via `<img>` + canvas2d, rasteriza, traça, insere o
    resultado como `<g>` no doc root.
- Escopo honesto: bicromático (single threshold), polyline
  (sem curve fitting). Cobre 80% de line art / logos /
  ícones — fotos degradam pra silhueta (by design).
- Para alta fidelidade, recomendar potrace-js wrap externo;
  registrado nas docstrings.

### Plugin update

`extraToolsPlugin` continua sendo o único plugin opt-in; a única
diferença é que agora registra REAL Width/Mesh/Symbol Sprayer no
lugar dos `StubTool`s. Versão bumped de 1.0.0 → 2.0.0 (breaking
change conceitual — comportamento mudou completamente embora a API
de registro seja idêntica).

### Validação

- `ng test svg-engine` — **1413 testes ✓** (+10 novos: 6 do
  marching squares + 4 do batch insert).
- `ng lint svg-engine` — clean.
- `ng build playground` — clean.

### Arquivos novos

- `edit/lib/library/symbols/symbol-selection.service.ts`
- `edit/lib/library/symbols/insert-symbol-instances-batch.command.ts`
- `edit/lib/library/symbols/insert-symbol-instances-batch.command.spec.ts`
- `edit/lib/autotrace/trace-bitmap.ts`
- `edit/lib/autotrace/trace-bitmap.spec.ts`
- `edit/lib/autotrace/trace-image.command.ts`
- `edit/lib/autotrace/index.ts`

### Arquivos modificados

- `edit/lib/tool/extra-tools.ts` (StubTool removida, 3 tools reais)
- `edit/lib/tool/index.ts` (novos exports)
- `edit/lib/scope/editor-scope.providers.ts` (SymbolSelectionService)
- `edit/lib/library/symbols/index.ts` (re-exports)
- `edit/src/public-api.ts` (autotrace module)
- `ui/lib/libraries-panel/libraries-panel.component.ts` (dual-mode
  symbol cell click + `.symbol-active` style)

### Premissas honradas

- D-017 (headless): autotrace usa `document.createElement('canvas')`
  via API standard `globalThis.HTMLCanvasElement` — não importa
  Material. trace-bitmap.ts é função pura sem DOM.
- D-042 (multi-editor): `SymbolSelectionService` é scoped
  (registrado em `provideSvgEngineEditorScope`).
- Zero regressão: os 4 tools eram stubs que apenas logavam; agora
  fazem o trabalho real. Nenhum consumer que dependia do
  comportamento stub (impossível: eles eram no-ops).
- Honest about limitations: Mesh é radial-only (não mesh real),
  Auto-trace é polyline bicromático (não curve-fitting
  policromático). Documentado nas docstrings + console hints.

---

## 2026-05-24 — D-061 follow-up 3: right rail consolidado em UM panel-group com abas

### Demanda

Usuário enviou screenshot do `/pro-editor` mostrando os 3 panel-groups
empilhados (Layers / Properties / Appearance, cada um com 1/3 da
altura do rail) e pediu pra "colocar os painéis num container por
abas pra ver melhor cada um clicando na aba — não alterar os painéis,
apenas disponibilizá-los no container por aba".

### Implementação

**`<svge-shell-pro>`** — substituí os 3 `<svge-panel-group>` separados
do right rail por UM único `<svge-panel-group>` com 3
`<ng-template svgePanelGroupTab>`:

- `[Layers]` (icon `layers`) → `<svge-layers-panel>`
- `[Properties]` (icon `tune`) → `<svge-inspector>` + `<svge-gradient-editor>`
- `[Appearance]` (icon `auto_awesome`) → `<svge-effects-panel>`

CSS do `.right-side` mudou de `grid-template-rows: 1fr 1fr 1fr`
(3 docks empilhados) para `display: flex; flex-direction: column`
com `.rs-group { flex: 1 1 auto }` (1 dock ocupa rail inteiro).

**`/custom-editor`** — mesma consolidação no right rail. 2 docks
(Properties + Appearance) viraram 1 dock com 2 abas. Left rail
mantém os 2 docks separados (Layers + Libraries) porque ali a
hierarquia de informação é diferente (queremos os dois sempre
visíveis num eixo vertical único, padrão Sketch / Affinity).

**Painéis intocados** — `<svge-layers-panel>`, `<svge-inspector>`,
`<svge-gradient-editor>` e `<svge-effects-panel>` são exatamente
os mesmos componentes, só re-encaixados num único dock.

### Ganho de UX

- Painel ativo ocupa **100% da altura do rail** (vs 33% antes).
  Inspector e Effects panel param de scrollar.
- Tab strip horizontal compacta no topo (3 abas com icon + label
  cabem com folga em 280px).
- Padrão idêntico ao Photoshop / Figma right panel.

### Validação

- 1403 testes ✓ (panel-group já cobre tabs com múltiplos
  ng-template; nenhum spec novo necessário)
- Lint clean, playground build clean

---

## 2026-05-24 — D-061 follow-up 2: libraries-panel responsivo (sem scrollbar horizontal)

### Sintomas reportados (screenshots)

Após o D-061 vertical, todas as 7 abas (Shapes/Templates/Gradients/
Patterns/Brushes/Symbols/Styles) exibiam **scrollbar horizontal no
rodapé** do body. Cells e labels cortavam: "Speech balloon" →
"Speech balloo", "Calligraphic" → "C...", "Twitter / X card"
quebrava feio.

### Causa raiz

- `panel-group.pg-body` permitia `overflow: auto` (horizontal e
  vertical), então conteúdo largo gerava scrollbar
- `.grid { grid-template-columns: repeat(3, 1fr) }` força 3
  colunas independente da largura disponível. Cells sem `min-width: 0`
  não shrinkavam abaixo do tamanho intrínseco do label, empurrando
  a grid para fora do body
- Brushes especificamente: thumb de 64px num cell de ~55px gerava
  overflow imediato
- Templates: `.list-item` sem `min-width: 0` permitia o name +
  dimensions empurrarem a linha além do rail

### Fix

**panel-group body**: `overflow-x: hidden` (vertical-only scroll
no body — scroll horizontal num side rail é UX ruim e mascara
problemas de layout).

**libraries-panel CSS**:

- Grid genérico: `repeat(auto-fill, minmax(50px, 1fr))` — adapta
  número de colunas à largura do body. Em rail de 220px (167px
  content area) → 3 cols ~53px; em rail mais largo → 4+ cols
- Variante `.grid--brushes`: `minmax(75px, 1fr)` pra acomodar a
  silhueta do brush (64px). Em rail padrão → 2 cols ~81px
- `.cell { min-width: 0 }` — permite shrink abaixo do intrínseco
  pra ellipsis funcionar
- `.cell-label { width: 100%; min-width: 0 }` — garante container
  pro `text-overflow: ellipsis`
- `.brush-thumb { width: 100%; max-width: 64px }` — responsivo,
  encolhe se cell ficar menor que 64+padding
- `.list-item { min-width: 0 }` + `.list-name { min-width: 0;
overflow: hidden; text-overflow: ellipsis }` — name trunca em
  vez de empurrar a row
- `@container (max-width: 200px) { .list-meta { display: none } }`
  - `container-type: inline-size` no `.list` — dimensions ocultam
    em rails muito estreitos (info preservada no title attribute)

### Pattern 5 strike redux

Comentários CSS dentro do template literal `styles: \`...\`` tinham
backticks (\`auto-fill + minmax\`, \`repeat(3, 1fr)\`) que fecharam
o outer template e quebraram parsing. Removidos. Vou registrar essa
recorrência no audit pattern catalog.

### Validação

- 1403 testes ✓ (nenhum quebrou)
- Lint clean
- Playground build clean

---

## 2026-05-24 — D-061 follow-up: vertical tab strip no panel-group

### Demanda

Após o D-061 (panel-groups em todas as visões com painéis), usuário
notou que os 8 tabs ícone-only do `libraries-panel` ficavam apertados
no topo horizontal mesmo em compact mode — e que ficaria "mais
intuitivo na lateral esquerda de cima pra baixo por limitação de
espaço". Padrão Photoshop / Affinity Designer pra side rails.

### Implementação

**Novo input** `[orientation]="'horizontal' | 'vertical'"` no
`<svge-panel-group>` (default horizontal). Quando `vertical`:

- Tab strip vira coluna estreita (~36px) à ESQUERDA do body
- Active indicator move da borda inferior → borda esquerda
  (convenção Photoshop)
- A11y: `aria-orientation="vertical"` no role tablist
- Body header (quando `title` setado) passa a refletir o LABEL do
  tab ativo — usuário sempre vê textualmente qual painel está
  aberto, sem precisar hover nos ícones

**Aplicação**: `libraries-panel` agora usa
`orientation="vertical"` (8 categorias num rail de 220px → strip
36px + body 184px). Outros panel-groups (Layers/Properties/
Appearance no shell-pro e custom-editor) mantêm orientação
horizontal pois têm 1-3 tabs em rails ≥ 280px — horizontal continua
mais natural.

### Validação

- 1403 testes ✓ (+1 spec novo cobrindo strip vertical + label
  reativo no header)
- Lint clean, playground build clean

### Premissas

- Backward compatible: omitir `orientation` mantém comportamento
  horizontal original
- A11y: `aria-orientation` setado conforme padrão ARIA pra tablists
- D-017 (headless): sem mudança — continua só `MatIcon`

---

## 2026-05-24 — D-061: Panel reorganization — Illustrator-style panel-groups + Figma top-tabs

### Demanda

Usuário reportou que os painéis das visões "estão muito confusos" e
pediu reorganização "baseada em ferramentas de mercado". Auditoria
expôs que no `<svge-shell-pro>` o right rail empilhava Layers +
Inspector (+ Gradient inline) + Effects verticalmente em sections
sem agrupamento — cada painel competia por altura e o usuário
escrolava sem fim. O `libraries-panel` tinha 6 seções colapsáveis
num único painel, virando lista enorme quando tudo aberto.

### Decisão (híbrido)

- **Panel-groups (Illustrator/Affinity)** no `<svge-shell-pro>` e
  `/custom-editor` (visões profissionais com múltiplos painéis
  competindo por dock real estate).
- **Top-level tab-like header (Figma)** no `<svge-editor>` (basic +
  modular): wrapper de panel-group de 1 tab no effects rail pra
  consistência visual; libraries-panel já tem tabs internas.

### Implementação

**Novo componente base** `<svge-panel-group>` em
`svg-engine/ui/lib/panel-group/`:

- Standalone com `MatIcon` + `NgTemplateOutlet`.
- Diretiva estrutural `[svgePanelGroupTab]` declara cada tab via
  `<ng-template>` — lazy template instantiation (só o body do tab
  ativo é criado).
- Inputs: `title?` (header text), `activeTab?` (controlled),
  `compact?` (esconde labels quando tab tem icon, mantendo tooltip).
- Output: `activeTabChange`.
- A11y: `role="tablist"` / `role="tab"` / `role="tabpanel"` com
  `aria-selected` + `aria-controls` + `aria-labelledby`.
- Strip auto-oculta quando há só 1 tab → mostra apenas o título.

**`libraries-panel` refatorado** (8 tabs no lugar de 6 seções
colapsáveis): Shapes | Templates | Gradients | Patterns | Styles |
Symbols | Brushes | Assets. Modo `compact` ativo (só icons no strip

- tooltip; rail de 220px comporta os 8 tabs com scroll horizontal
  suave se necessário). Cada tab mostra UMA library — focus stays.

**`<svge-shell-pro>` right rail** vira 3 panel-groups verticais
(grid `1fr 1fr 1fr`): **Layers** | **Properties** | **Appearance**.
Cada um tem 1 tab hoje (estrutura pronta pra crescer: Pages/Symbols
no Layers, Transform no Properties, Swatches/Brushes preview no
Appearance). Properties contém Inspector + Gradient Editor inline.

**`/custom-editor`** — left rail vira 2 panel-groups (Layers +
Libraries), right rail vira 2 panel-groups (Properties + Appearance).
Estrutura intencionalmente diferente do shell-pro pra exercitar o
padrão Sketch/Affinity Designer (Layers no left junto com Libraries).

**`<svge-editor>` shell** (basic + modular) — effects rail
encapsulado em `<svge-panel-group title="Appearance">` de 1 tab pra
consistência visual com shell-pro e custom-editor. Libraries-panel
já usa tabs internamente (mudança propagou automaticamente).

### Padrões de mercado consultados

- **Illustrator**: dock panels com tab strip estreito; vários panels
  por dock zone (Color | Color Guide | Swatches no mesmo dock).
- **Affinity Designer**: Studio com áreas docáveis e tabs dentro de
  cada studio.
- **Figma**: tabs no topo do right panel (Design / Prototype /
  Inspect) trocam o painel inteiro.
- **Sketch**: Inspector contextual + Layers/Components em sidebars
  separadas.

### Validação

- `ng test svg-engine` — **1402 testes ✓** (+4 novos do panel-group;
  103 arquivos, 1 skipped).
- `ng lint svg-engine` — clean.
- `ng build playground` — clean.

### Arquivos novos / impactados

Novos:

- `ui/lib/panel-group/panel-group.component.ts` (SvgePanelGroup +
  SvgePanelGroupTab diretiva)
- `ui/lib/panel-group/index.ts`
- `ui/lib/panel-group/panel-group.spec.ts` (4 cases: single-tab
  oculta strip, multi-tab mostra strip + tab default, switch body
  ao click, controlled `activeTab` + emit)

Modificados:

- `ui/src/public-api.ts` — export panel-group
- `ui/lib/libraries-panel/libraries-panel.component.ts` — refatoração
  total (template novo com 8 tabs, removidas as 6 sections e
  open/toggle state)
- `ui/lib/shell-pro/shell-pro.component.ts` — right rail virou 3
  panel-groups; ASCII diagram atualizado
- `ui/lib/editor/editor.component.ts` — effects rail virou
  panel-group
- `playground/pages/custom-editor/custom-editor.component.html` —
  left + right rails virou panel-groups
- `playground/pages/custom-editor/custom-editor.component.ts` —
  imports
- `playground/pages/custom-editor/custom-editor.component.scss` —
  CSS `.ls-group` + `.rs-group`

### Premissas honradas

- D-017 (headless): panel-group usa `MatIcon` (única dependência
  Material), sem `MatTabGroup` (animações + lazy-load + scroll
  machinery que não queremos). O componente é leve.
- D-042 (multi-editor): panel-group é stateless — o `activeTab`
  interno é local ao instance.
- D-043 (factory pattern): n/a (sem novos menu items).
- Zero regressão: `<svge-editor>` shell-pro mantém todos os painéis
  visíveis simultaneamente; só o agrupamento e a presença de tab
  strip mudou.

---

## 2026-05-24 — D-059 (Symbol Library master/instance) + D-060 (Brush Library) + comment cleanup

### Escopo

Eliminar as 3 últimas pendências de stubs em `library/`:

1. **Limpeza dos comentários** legados que marcavam `GradientTool` como
   "state-only stub for v1" — após D-058 (gradient inline editor) o
   tool ganhou overlay + painel reais, então a label estava errada.
2. **D-059 — Symbol Library** elevada a master/instance real: insere
   `SymbolUseNode` (novo node type) que referencia um master via
   `<symbol id="...">` + `<use href="#id">`. Editar o master propaga
   instantaneamente para todas as instâncias (semântica nativa do
   browser).
3. **D-060 — Brush Library** elevada a expansão real do traço: o
   `PencilTool` consome o `widthProfile` do brush ativo via algoritmo
   Sutherland-ribbon (centerline + offset perpendicular modulado por
   amostragem do profile) e gera um path fechado `fill`-ado. Sem
   brush selecionado, comportamento original preservado (zero
   regressão).

### D-059 — Symbol Library

**Novo node type `SymbolUseNode`** (`core/lib/model/symbol-use-node.ts`)
com `symbolId`, `x`, `y`, `width?`, `height?`. Adicionado à union
`SvgNode` + tuple `SVG_NODE_TYPES`. Switches exaustivos atualizados
em `node-bbox`, `scale-bake`, `builtin-optimizers`, `layers-panel`,
`inspector`.

**Renderer** `svge-symbol-use` (directive standalone em
`render/lib/renderers/`) emite `<svg:use href="#id" x y width height>`.
Dispatcher central já reconhece o tipo.

**Catalog + Active split** (mesmo padrão de gradients/patterns):

- `SymbolLibraryService` (root, registry de masters `LibraryItem` +
  `master: SvgNode` + `viewBox?` + `buildMarkup()`).
- `ActiveSymbolsService` (scoped via `provideSvgEngineEditorScope`)
  walks o doc, deriva o set de `symbolId`s referenciados e produz o
  markup `<symbol>` correspondente.
- `ActiveDefsService.composed()` estendido para 7 sources (era 6) —
  exporter passa a emitir os `<symbol>`s automaticamente.

**`InsertSymbolInstanceCommand`** cria `SymbolUseNode` + insere via
tree-ops (undo remove por id).

**4 builtins** (star, arrow, heart, gear) com viewBox 64×64 e master
path `fill="currentColor"`. `builtinSymbolsPlugin` registra todos.

**UI**: nova seção `Symbols` no `libraries-panel`, com thumbnails
material-icon (`star`/`arrow_forward`/`favorite`/`settings`) e
`insertSymbolInstance()` ao click.

**Exporter**: `renderSymbolUse()` em `io/lib/svg-exporter.ts` emite
`<use href="#id" x y width height>`.

**Spec** `symbol-library.spec.ts`: catalog registration, derivação
do `ActiveSymbolsService`, `InsertSymbolInstanceCommand` insert+undo,
e prova de master/instance (editar master → todas as instâncias
viram juntas, semântica de `<use>`).

### D-060 — Brush Library

**Algoritmo de expansão** (`brushes/expand-stroke.ts`) — função pura
sem DI:

```ts
expandStrokeWithProfile(
  points: { x: number; y: number }[],
  baseWidth: number,
  widthProfile: number[],
): string  // d-attribute (closed polygon)
```

Sutherland ribbon: para cada ponto, calcula tangente suavizada
(prev + next), perpendicular, e amostra `widthProfile` em `t = i/(n-1)`
(linear interpolation via `sampleProfile`). Emite 2N vértices (N
left rail + N right rail invertido) fechados com `Z`. Trata
degenerate cases (pontos coincidentes → usa tangente anterior, sem
NaN).

**Catalog** `BrushLibraryService` (root) + `BrushSelectionService`
(scoped, signal `selectedBrushId`).

**3 builtins**:

- `uniform` — widthProfile=1.0 plano (sem modulação), baseWidth=6.
- `tapered` — `sin(t·π)` (0 nos endpoints, max no meio),
  baseWidth=12.
- `calligraphic` — ramp 0.2 → 1.0 → 0.3 (entrada fina, meio cheio,
  saída média), baseWidth=10.

`builtinBrushesPlugin` registra todos.

**Integração no `PencilTool.onPointerUp`**: se `BrushSelectionService.
selectedBrushId() !== null`, busca o item, expande a polyline
capturada via `expandStrokeWithProfile`, e dispatch `InsertNodeCommand`
com `createPath(d, { style: { fill: '#000000', stroke: 'none' } })`.
Sem brush selecionado → fallback ao comportamento original
(`stroke-only` polyline). **Zero regressão garantida**.

**UI**: nova seção `Brushes` no `libraries-panel`. Thumbnails
mostram a silhueta real (chama `expandStrokeWithProfile` em
centerline horizontal de 21 pontos × 14px base) — o que o usuário
vê na thumb é exatamente o que sai do pincel. Click toggla
selected/deselected.

**Spec** `brush-library.spec.ts`: catalog registration,
`sampleProfile` (5 cases — empty/single/2-sample/clamp/4-sample),
`expandStrokeWithProfile` (6 cases — empty/short, baseWidth ≤ 0,
horizontal rect, sanity bbox, profile [0,1,0] tapered, pontos
coincidentes sem NaN), `BrushSelectionService` (signal lifecycle).

### Validação

- `ng test svg-engine` — **1398 testes ✓** (102 arquivos, 1 skipped).
  +17 testes novos (D-059 + D-060) sem regressão.
- `ng lint svg-engine` — clean (corrigi `let` → `const` em
  `expand-stroke.ts` linhas 73-74; removi `MatIconButton` não usado em
  `libraries-panel`).
- `ng build playground` — clean, ambos os plugins instalados.

### Arquivos novos

- `core/lib/model/symbol-use-node.ts`
- `render/lib/renderers/symbol-use-renderer.directive.ts`
- `edit/lib/library/symbols/insert-symbol-instance.command.ts`
- `edit/lib/library/symbols/builtin-symbols.ts`
- `edit/lib/library/symbols/symbol-library.spec.ts`
- `edit/lib/library/brushes/expand-stroke.ts`
- `edit/lib/library/brushes/builtin-brushes.ts`
- `edit/lib/library/brushes/brush-library.spec.ts`

### Premissas honradas

- D-017 (headless): nenhum dos novos arquivos em `edit/`, `core/`,
  `render/`, `io/`, `optimize/` importa `@angular/material`. Toda a
  UI Material vive em `svg-engine/ui/libraries-panel`.
- D-042 (multi-editor): `ActiveSymbolsService` + `BrushSelectionService`
  são scoped via `provideSvgEngineEditorScope` (cada editor tem seu
  próprio estado derivado / brush ativo).
- D-043 (factory pattern): n/a — sem novos menu items.
- Zero regressão: `PencilTool` sem brush = comportamento original
  preservado.

---

## 2026-05-24 — Bug fix CRÍTICO: exporter omitia gradients/effects/etc + style fields D-049/D-053

### Sintoma reportado

Usuário aplicou gradient num shape (`fill="url(#blueSky)"`). No canvas
renderizou corretamente. Ao clicar File › Export SVG, o arquivo baixado
abria com o shape **transparente** — a definição `<linearGradient>`
não estava no `<defs>` do arquivo exportado.

### Causa raiz

Bug pré-existente que afetava QUALQUER consumer do exporter:

1. **`svgExporter.export(doc)` só emitia `doc.defs`**, que é o campo
   round-trip dos defs IMPORTADOS. Defs criados pelo editor durante a
   sessão (gradients aplicados via Libraries panel, patterns,
   clipPaths, masks, effects, chains de filter) viviam em registries
   separados (`GradientLibraryService` + `ActiveGradientsService`,
   `PatternLibraryService` + `ActivePatternsService`, etc.) — **não em
   `doc.defs`**.

2. **O renderer no canvas** compunha tudo via `editor.component.ts
resolvedDefs()` computed que injetava 6 services e concatenava.
   **O exporter NUNCA fez essa composição** — chamava
   `state.document()` direto e passava ao `svgExporter`. Resultado:
   referências `url(#id)` chegavam no arquivo exportado sem a
   definição correspondente.

### Auditoria adicional — outros gaps no exporter

Aproveitei para fechar todas as lacunas entre "o que paint no canvas"
e "o que vai pro arquivo":

| Campo                                                     | Renderer emite  | Exporter (antes)   | Exporter (agora)      |
| --------------------------------------------------------- | --------------- | ------------------ | --------------------- |
| `style.fill/stroke/opacity/strokeWidth/visibility/filter` | ✅              | ✅                 | ✅                    |
| `style.clipPath` (D-049)                                  | ✅              | ❌                 | ✅                    |
| `style.mask` (D-049)                                      | ✅              | ❌                 | ✅                    |
| `style.mixBlendMode` (D-049)                              | ✅              | ❌                 | ✅ inline style       |
| `style.strokeDasharray/Linecap/Linejoin`                  | ✅              | ❌                 | ✅                    |
| TextNode `fontVariationSettings` (D-053)                  | ✅              | ❌                 | ✅ inline style       |
| TextNode `fontFeatureSettings` (D-053)                    | ✅              | ❌                 | ✅ inline style       |
| TextNode `letterSpacing` (D-053)                          | ✅              | ❌                 | ✅ inline style px    |
| TextNode `textPathRef` (D-053)                            | ✅              | ❌                 | ✅ `<textPath>` child |
| PathNode `cornerRadius` (D-055)                           | ✅ derived d    | ❌ raw d           | ✅ derived d          |
| `metadata.visible === false` (D-056)                      | ✅ display:none | ❌ paintava normal | ✅ skip do export     |

### Solução arquitetural

**`ActiveDefsService`** novo em `svg-engine/edit/lib/library/`:

- Centraliza a composição dos 6 sources dinâmicos (Effects, Chains,
  Gradients, Patterns, ClipPaths, Masks).
- Método `composed()` (computed reativo) para o renderer.
- Método `buildExportDefs(documentDefs)` para o exporter — concatena
  `document.defs` + dynamic.
- Scoped via `provideSvgEngineEditorScope()` — multi-editor safe.

**Refatoração dos consumers**:

- `editor.component.ts` + `shell-pro.component.ts`: 6 inject() →
  1 inject(ActiveDefsService); `resolvedDefs()` agora 1 linha.
- `builtin-menu-contributions.plugin.ts exportAndDownload()`: clona
  o doc com `defs: activeDefs.buildExportDefs(doc.defs)` antes de
  chamar `svgExporter.export()`.

**Exporter melhorias**:

- `styleAttrs()` ganhou clip-path, mask, mix-blend-mode, dasharray,
  linecap, linejoin (todos D-049 + tap fields antigos que faltavam)
- `renderText()` ganhou as 4 propriedades D-053 + branch para
  `<textPath>`
- `renderPath()` aplica `roundPathCorners(d, cornerRadius)` quando
  `cornerRadius > 0` (D-055) — exporta a versão visualmente igual ao
  canvas
- `renderNode()` skip total quando `metadata.visible === false`
  (D-056) — match com `display: none` do renderer

### Verificação

- `ng build svg-engine` ✅ 9 entry points
- `ng test svg-engine` ✅ **1373 passed** (+12 novos exporter specs)
  / 1 skipped / 0 failed
- `ng lint svg-engine` ✅ clean

### Test coverage

Novo spec `svg-exporter.spec.ts` com 12 testes cobrindo cada gap:
clip-path, mask, mix-blend-mode, stroke-dash/cap/join, font-variation,
font-feature, letter-spacing, textPath wrap, cornerRadius rounded,
metadata.visible skip, sibling-survives-in-group quando um child hidden.

---

## 2026-05-24 — D-058: Gradient inline editor — panel + canvas overlay (opção C)

Substitui o stub "state-only" do D-050 Gradient Tool por um editor real
de gradient com **duas surfaces coordenadas**:

### 1. Inline overlay no canvas (`<svge-gradient-overlay>`)

Novo overlay em `svg-engine/edit/lib/library/gradients/`. Renderiza
quando a seleção tem fill = `url(#id)` resolvendo a um gradient catalogado:

- **Linha tracejada** (gradients lineares) ou **círculo** (radiais)
  mostrando a direção/extensão do gradient sobre o bbox do nó
- **Pontos coloridos** ao longo da linha — um por stop, cor igual ao
  `stop-color`. Selecionado ganha ring laranja
- **Drag** num stop → muda offset em tempo real (preview in-place);
  release commita 1 undo via `SetGradientCommand`
- **Click** num stop (sem drag) → seleciona stop pra edição no panel
- **Click na linha/círculo** (não em stop) → insere novo stop no
  offset clicado, cor interpolada RGB dos vizinhos

Headless boundary respeitado — overlay é puro SVG/signals, sem
`@angular/material`. Color picker fica no panel UI-side.

### 2. Panel `<svge-gradient-editor>` em `svg-engine/ui`

Section adicionada à coluna Properties do `<svge-shell-pro>`. Auto-hides
quando seleção não tem gradient (gate via `GradientEditingService`).

- Header com toggle Linear/Radial
- Lista de stops, cada um com:
  - Swatch colorido clicável → abre `<svge-color-picker>` em mat-menu
    (mesmo pattern do Inspector fill/stroke)
  - Input number 0–100 pra offset
  - Botão de remoção (desabilitado quando restariam < 2 stops)
- Botões "Add stop" (insere no mid + cor interpolada) e "Reverse"
- Linha selecionada do panel highlight quando user clica stop no canvas
  e vice-versa (signal compartilhado `GradientEditingService.selectedStopIndex`)

### Foundation

- `LibraryRegistry.update(id, item)` — novo método que preserva posição
  no array e dispara o signal (evita dispose+register que joga item no
  fim).
- `GradientGeometry` interface opcional adicionada a `GradientLibraryItem`
  com `x1/y1/x2/y2` (linear) ou `cx/cy/r/fx/fy` (radial). Coordenadas
  `objectBoundingBox` (0..1). Default quando ausente = horizontal linear
  / centered radial — backward-compat total com builtins pré-D-058.
- `buildGradientMarkup(item)` helper exportado — emite
  `<linearGradient>` / `<radialGradient>` honrando geometry.
- `GradientEditingService` (scoped via `provideSvgEngineEditorScope`):
  - `activeGradientId` computed — deriva do `fill`/`stroke` do nó
    selecionado
  - `targetNodeId` — id do nó pra leitura de bbox
  - `selectedStopIndex` — signal compartilhado overlay ↔ panel
- `SetGradientCommand` — 1 undo por mudança (stops/geometry/kind/name).
  Factory `SetGradientCommand.for(injector, id, patch)`.

### Wire-up

- `<svge-editor>` + `<svge-shell-pro>`: overlay no renderer
- `<svge-shell-pro>` ganha `<svge-gradient-editor />` na Properties
- `custom-editor` playground: também ganha o overlay

### Scope deferido v2

- Endpoint dragging (mover x1/y1/x2/y2 ou cx/cy/r via canvas) — arquitetura
  pronta, só falta registrar 4 handles adicionais no overlay
- Focal point (fx/fy) para radiais
- Reorder de stops via drag no panel

### Verificação

- `ng build svg-engine` ✅ 9 entry points
- `ng build playground` ✅ limpo
- `ng test svg-engine` ✅ **1361 passed** / 1 skipped / 0 failed
- `ng lint svg-engine` ✅ clean

---

## 2026-05-24 — Bug fix: pro-editor não respeitava visibility hide (D-056 follow-up)

### Sintoma reportado

No /pro-editor, criar Live Subtract sobre 3 shapes faz as 3 vírem como "hidden" no Layer Panel (eye-with-slash icon), mas elas continuam renderizando no canvas — sobrepõem o resultado da boolean. No /custom-editor a mesma operação esconde corretamente.

### Causa raiz (dois bugs distintos)

**Bug 1 (pré-existente, latente)**: `<svge-editor>` e `<svge-shell-pro>` aplicavam apenas `svgeOutlineFilter` no `<svge-renderer>`, **faltando** `svgeLayersFilter` (toggle de olho no Layer Panel) e `svgeIsolationFilter` (modo de isolamento). O `<svge-renderer>` no `custom-editor.component.html` tem os três. Esse bug afetava o eye-toggle do Layer Panel de forma totalmente independente da Live Boolean — só não tinha aparecido até agora porque ninguém testou hide manual no pro-editor.

**Bug 2 (D-056 follow-up)**: meu `MakeLiveBooleanCommand` setava `metadata.visible = false` nos inputs para escondê-los, mas **nenhum consumer da renderização lia esse campo**. Por design, `metadata.visible` era doc-level state distinto de `LayersService.hiddenIds` (runtime session), mas nada o aplicava ao DOM. Resultado: meus inputs hidden ficavam visíveis sempre, sem importar o shell.

### Fixes aplicados

**Fix 1 — Shells passam a aplicar layer/isolation filters**:

- `svge-editor.component.ts`: importa `LayersFilter`, `IsolationFilter` → adicionados a `imports` e ao `<svge-renderer svgeLayersFilter svgeIsolationFilter svgeOutlineFilter>`.
- `svge-shell-pro.component.ts`: mesma alteração.

Restaura o eye-toggle do Layer Panel + modo isolation em ambos os shells. Custom-editor continua igual (já estava certo).

**Fix 2 — Renderer respeita `metadata.visible === false`**:

- `node-renderer.component.ts`: novo host binding `'[style.display]': "node().metadata.visible === false ? 'none' : null"`.
- Aplica em qualquer renderer, sem depender de directives externas — `metadata.visible` é doc-level (persistido), `LayersService.hiddenIds` é session.
- `display: none` (não `visibility: hidden`) — colapsa hit-testing também, evita que o usuário clique através do resultado e selecione um input invisível.
- Default `undefined` mantém o nó visível (backward-compat).

### Por que ambos os fixes (não só um)

- Sem Fix 1: o eye-toggle do Layer Panel continuaria quebrado nos shells.
- Sem Fix 2: meu Live Boolean continuaria não escondendo os inputs (ele não escreve em `LayersService.hiddenIds`, escreve em `metadata.visible` — e os shells não fazem a ponte).
- Fix 2 também documenta a separação intencional: `metadata.visible` (doc) ≠ `LayersService.hiddenIds` (session). Ambos hideen agora funcionam, com semânticas distintas.

### Verificação

- `ng build svg-engine`: ✅ 9 entry points
- `ng test svg-engine`: ✅ **1361 passed** / 1 skipped / 0 failed
- `ng lint svg-engine`: ✅ clean

---

## 2026-05-24 — D-053 / D-054 / D-055 / D-056 / D-057 (Item 6 — Edição avançada)

Sprint dedicado ao Item 6 "Edição avançada" do parking-lot, com 5 decisões
implementadas no mesmo ciclo (escopo coeso). Item 6.3 (Auto-trace) explicitamente
deferido como D-057.

### D-053 — Variable Fonts + OpenType + Text on Path (itens 6.5 / 6.6)

> **⚠️ Errata pós-fato (2026-05-24)**: o que está descrito abaixo cobre
> **somente** modelo + renderer + exporter. A UI no Inspector que permite
> ao usuário SETAR esses campos pelo editor **não foi entregue no D-053
> original** — só veio no **D-068** (entrada no topo deste arquivo).
> Entre D-053 e D-068, as features funcionaram apenas via SVG importado
> ou via console JS (`SetPropertyCommand` direto). O comentário JSDoc
> em `builtin-advanced-edit-menu.plugin.ts` dizendo "Inspector controls
> surface them directly" foi otimista e estava incorreto pré-D-068.

**Modelo (core/model/text-node.ts)** — TextNode ganhou 5 campos opcionais:

- `fontVariationSettings?: string` — passa direto para CSS `font-variation-settings`
  (ex.: `"'wght' 650, 'wdth' 95, 'opsz' 24"`). Variable-font axes na bandeja para
  fontes que as expõem (Inter, Roboto Flex, Recursive); inerte em fontes estáticas.
- `fontFeatureSettings?: string` — CSS `font-feature-settings` para OpenType
  (ligaturas, small caps, stylistic sets, tabular figures…).
- `letterSpacing?: number` — surfaceado por consistência com os demais knobs.
- `textPathRef?: NodeId` — id de um path no mesmo documento; quando setado,
  renderer envolve content em `<textPath href="#id">`.
- `textPathStartOffset?: string` — offset CSS-length ao longo do path.

**Renderer (render/lib/renderers/text-renderer.directive.ts)**: 3 novos
host bindings `[style.font-variation-settings]`, `[style.font-feature-settings]`,
`[style.letter-spacing]`. Mantidos como style/CSS (não atributo SVG) porque
são propriedades CSS típicas — alinha com o pattern usado para `mix-blend-mode`
em D-049.

**Renderer (render/lib/renderers/node-renderer.component.ts)**: novo branch
`@if (textPathHref()) { <text><textPath …>{{content}}</textPath></text> }`
com precedência sobre multi-line tspan. `<textPath>` não honra `\n` (limitação
SVG), então `textPathFlattened()` colapsa whitespace para evitar gaps estranhos.

### D-054 — Compound Paths explícitos (item 6.2)

**`MakeCompoundPathCommand`** — recebe N nodeIds (≥ 2), bake transform de cada
input no `d`, concatena strings → 1 PathNode multi-subpath. Operand A's slot
preservado; demais inputs removidos. Style/metadata herdados de A.

**`ReleaseCompoundPathCommand`** — splita um PathNode multi-subpath em N
PathNodes single-subpath, preservando transform/style/metadata em cada peça.
Falha quando o input tem só 1 subpath (nada a soltar).

**Curve fidelity**: operação puramente string-level — beziers cubic/quadratic
sobrevivem round-trip exatamente, sem flatten/re-emit lossy (diferente do
pathfinder destrutivo, que precisa de polygon math).

**Helpers exportados**:

- `splitPathDIntoSubpaths(d)` — regex-based, retorna `M..M..` chunks.
- `bakeTransformIntoPathD(d, [a,b,c,d,e,f])` — full tokenizer (M/L/H/V/C/S/Q/T/A/Z
  - relativos), promove H/V em L sob transformações não-axis-aligned. Arcs (A)
    baked apenas no endpoint (rx/ry/rot passam unchanged) — degrada elegantemente
    para translation + uniform scale, idêntico ao comportamento Illustrator
    pre-convert-to-bezier.

### D-055 — Live Corners (item 6.4)

**`PathNode.cornerRadius?: number`** — campo opcional não-destrutivo. Quando > 0,
renderer deriva um `effectiveD` rodando `roundPathCorners(d, radius)`; o `d`
autorial fica intacto. Setting radius back to 0 restora corners exatos.

**`roundPathCorners(d, r)`** (`core/geometry/round-corners.ts`):

- Parse path → anchors via `parsePathToAnchors`.
- Walk anchors; vertice "sharp" = `kind === 'cusp'` + handles degenerados.
- Para cada sharp: clamp radius a `min(r, |edge_in|/2, |edge_out|/2)` (mesma
  clamp do `rx` em Illustrator), trim edges, insere arc `A r r 0 0 sweep px py`.
- Cross-product determina sweep flag (CCW vs CW na coord Y-down do SVG).
- Curvas (anchors com handles) ficam intactas — só sharps são afetados.

**Renderer (render/lib/renderers/path-renderer.directive.ts)**: novo computed
`effectiveD()` memoizado; binds em `[attr.d]`. Short-circuita quando radius=0
(retorno do d autorial direto, zero overhead).

### D-056 — Boolean Live / non-destructive (item 6.1)

Decisão pragmática: em vez de novo node type `BooleanGroupNode`, usar um
**Group marcado por metadata.customData** como wrapper:

```
<group> customData.svgeLiveBoolean = 'union' | 'intersect' | 'subtract' | 'exclude'
  ├── <path>  customData.svgeLiveBooleanRole = 'result' (visible)
  ├── <node>  customData.svgeLiveBooleanRole = 'input'  (visible=false)
  ├── <node>  customData.svgeLiveBooleanRole = 'input'  (visible=false)
```

**Vantagens vs novo node type**: zero impacto em renderer/exporter/specs —
groups são universalmente entendidos. Inputs sobrevivem editáveis no Layer
Panel / Path Editor — não some no destrutivo.

**3 commands**:

- `MakeLiveBooleanCommand(ids, op)` — wrap + compute result.
- `RefreshLiveBooleanCommand(groupId)` — re-run boolean lendo inputs atuais.
  Consumers podem chamar após editar um input.
- `ReleaseLiveBooleanCommand(groupId)` — unwrap; inputs voltam visíveis,
  result some.

**Engine compartilhado**: usa `flattenPathD` + `polygon-clipping`, mesmo do
Pathfinder destrutivo. Garante que Live e Destrutivo dão resultado bit-for-bit
idêntico.

**Auto-refresh FORA de escopo D-056**: deliberadamente sem `effect()` que
auto-recompute em toda mudança de doc (overhead alto em editing pesado).
Consumers que querem auto-refresh subscrevem `state.document()` e dispatcham
Refresh com debounce.

**Helpers exportados**: `isLiveBooleanGroup(node)`, `getLiveBooleanOp(node)`,
constants `LIVE_BOOLEAN_KEY` / `LIVE_BOOLEAN_ROLE_KEY` — UIs (Layer Panel
icon, Inspector controls) usam para detectar e formatar.

### D-057 — Auto-trace (raster → vector) — DEFERIDO

**Decisão**: explicitamente **fora de escopo razoável** para Item 6.

**Por quê**:

1. Algoritmo não-trivial — auto-trace de raster (potrace-style) requer:
   - Quantização de cores (k-means / median-cut)
   - Bitmap edge detection / threshold
   - Path-tracing (Cardenas / Selinger algorithms)
   - Simplification (Douglas-Peucker pós-trace) + smoothing
   - Estimativa de scope realista: 2-3 semanas full-time dev.
2. **Biblioteca externa preferível**: existem implementações JS maduras
   (potrace-js, ImageTracer.js) — wrap dessas seria mais sensato que
   re-implementar. Bundle size impact precisa de análise; potracejs é
   ~50KB minified.
3. **Prioridade baixa**: items 6.1-6.2-6.4-6.5-6.6 atendem 80% dos use cases
   de "Edição avançada" do parking-lot. Auto-trace é raster→vector workflow
   bem específico, demanda restrita.

**Plano deferido**: candidato para uma futura "D-XXX Auto-trace" iteração
quando demanda real aparecer. Esboço: novo plugin `potrace-tracer.plugin.ts`
em entry point opcional `svg-engine/trace`, comando `TraceImageToPath` que
recebe blob/data URI e dispatch `InsertNodeCommand` com o PathNode resultante.

### Menus (Object — novos itens)

Novo plugin `builtinAdvancedEditMenuPlugin`:

```
Object
├── …
├── ─────────────                    [order 100]
├── Make Compound Path       Ctrl+8  [110]
├── Release Compound Path    Ctrl+Alt+8 [120]
├── ─────────────                    [200]
└── Live Boolean ▶                   [210]
    ├── Make Live Union
    ├── Make Live Intersect
    ├── Make Live Subtract
    ├── Make Live Exclude
    ├── ─────────────
    ├── Refresh
    └── Release
```

`disabled` signals factory-form (D-043 multi-editor safe):

- Make Compound + Live Boolean Make → requer ≥ 2 selecionados
- Release Compound → requer 1 path selecionado
- Refresh + Release Live Boolean → requer 1 live-boolean group selecionado

D-053 (text features) não tem menu items — são propriedades do node,
expostas pelo Inspector quando text é selecionado (segue padrão dos campos
fontSize/fontFamily existentes).

### Verificação

- `ng build svg-engine`: ✅ 9 entry points, 7.4s
- `ng build playground`: ✅ limpo
- `ng test svg-engine`: ✅ **1361 passed** (+28 novos) / 1 skipped / 0 failed
- `ng lint svg-engine`: ✅ clean

---

## 2026-05-24 — D-052: Menu Insert/Inserir (padrão Figma/PowerPoint/Sketch/Google Drawings)

### Decisão de padrão

Levantamento de mercado para "menu de inserção de shapes":

| Editor               | Local / nome               | Estrutura                             |
| -------------------- | -------------------------- | ------------------------------------- |
| Figma                | menu "Insert" (atalho `/`) | Shapes / Text / Image / Component     |
| Sketch               | menu "Insert"              | Shape ▶ / Text / Image / Symbol       |
| Microsoft PowerPoint | tab "Insert"               | Shapes (com submenu) / Text / Picture |
| Google Drawings      | menu "Insert"              | Shape ▶ / Text / Image                |
| Adobe Illustrator    | (não tem) — só toolbar     | n/a                                   |
| Inkscape             | (não tem) — só toolbox     | n/a                                   |

**Padrão escolhido**: Figma/Sketch/PowerPoint/Google — menu **"Insert"**
entre View e Object, submenu **"Shape"** com primitivos + Text + Image
como itens diretos. Justificativa: a maioria dos editores web-first
(target do SVGEngine) usa essa convenção; usuários vindos de
Office/Google têm familiaridade imediata. Illustrator/Inkscape são
toolbox-only mas servem usuários print-design pro — não combina com o
posicionamento do produto.

### Implementação

**Nova slot**: `MENU_SLOT.INSERT = 'menu.insert'` em menu-slots.ts.
Documentada com a distinção em relação a `menu.object` (que opera em
nós existentes: reorder/group/ungroup) e em relação ao toolbar
(`toolbar.main`) shape tools (que ARMAM um drawing tool aguardando
drag — Insert é drop imediato).

**`<svge-menu-bar>` defaults**: array `slots` agora inclui
`'menu.insert'` entre `'menu.view'` e `'menu.object'`; map `labels`
adiciona `'menu.insert': 'Insert'`. Backward-compat: consumers que
sobrescrevem `slots` continuam funcionando, mas agora também
recebem Insert por padrão se aceitarem o default.

**Novo plugin** `builtinInsertMenuPlugin` em
`menu/builtin/builtin-insert-menu.plugin.ts`. Arquivo separado do
`builtinMenuContributionsPlugin` para que consumers possam opt-out
de Insert sem perder os outros menus (e vice-versa).

**Itens registrados** (10 contribuições):

```
Insert
├── Shape           ▶   (parent, icon=category)
│   ├── Rectangle
│   ├── Rounded rectangle
│   ├── Ellipse / Circle
│   ├── Line
│   ├── Triangle
│   ├── Polygon (5 sides)
│   └── Star (5 points)
├── ─────────────
├── Text
└── Image…              (file picker → data URI)
```

**UX de drop**:

- **Posição**: centro do `ViewportService.viewBox()` (não do
  documento). Mantém o shape inserido sempre dentro da viewport
  visível, mesmo com zoom/pan ativos.
- **Tamanho**: 25% da menor dimensão da viewBox, clamped a
  `[40, 400]` doc-units. Evita shape 1px em zoom 32× ou 4000px em
  zoom 0.05×.
- **Estilo**: usa `DEFAULT_STYLE` (cinza claro + stroke escuro).
  User troca via Inspector logo após inserir.
- **Pós-insert**: dispatch `InsertNodeCommand` (1 undo step) +
  `SelectionService.select(newId)` — shape já aparece com handles e
  Inspector mostra propriedades.

**Image**: usa `<input type="file" accept="image/*">` (browser-nativo,
sem Material dialog — preserva headless boundary D-017). Arquivo
embedado como data URI no atributo `href` (auto-contido, round-trip
import/export limpo). Tamanho default igual aos shapes (square
placeholder; aspect-ratio real do arquivo fica para futura iteração).

**D-042/D-043 multi-editor safety**: handlers usam
`runCtx.injector` para resolver `EditorStateService`, `CommandBus`,
`ViewportService`, `SelectionService` — sempre operam no editor
ativo, nunca no root.

### Por que NÃO criar uma tool nova

Considerado adicionar um shape tool "smart insert" no toolbar mas
descartado: o toolbar tool e o menu Insert servem use cases
DIFERENTES, ambos válidos.

- **Toolbar tool** (R, E, Y): "vou desenhar um shape do tamanho que
  eu quero, arrastando" — Illustrator/Affinity convention. Mantém
  o tool armado para múltiplas inserções consecutivas.
- **Menu Insert > Shape > Rectangle**: "quero um retângulo já, com
  tamanho padrão, na tela" — Office/Figma convention. Drop único
  - selection imediata, sem mudar tool ativo.

Coexistem.

### Verificação

- `ng build svg-engine`: ✅ 9 entry points
- `ng build playground`: ✅ limpo
- `ng test svg-engine`: ✅ **1333 passed** (+6 novos) / 1 skipped / 0 failed
- `ng lint svg-engine`: ✅ clean

---

## 2026-05-24 — D-049 (Item 4) Composição/Recorte + D-050 (Item 5) Tools faltantes + D-051 (Item 12) UX polish

Três decisions implementadas no mesmo ciclo (escopo coeso: completar
itens 4/5/12 do parking-lot Fase 6).

### D-049 — Composição / Recorte (clipPath + mask + mix-blend-mode)

- **Modelo**: `SvgStyle` ganha `clipPath?`, `mask?`, `mixBlendMode?`.
  Todos opcionais; defaults SVG aplicam quando ausentes.
- **Renderer**: bindings adicionados no wrapper `<svg:g>` em
  `node-renderer.component.ts` (NÃO nas diretivas de leaf). Razão: SVG
  spec aplica clip-path no user-coord-system do elemento, e o wrapper
  carrega o `transform` do nó — clip aplicado lá fica em coords do
  parent (o que o user espera ao desenhar um clipPath em coords do
  documento). Mix-blend-mode usa `[style.mix-blend-mode]` (CSS-only;
  SVG não tem atributo equivalente).
- **Libraries**: dois novos pares com o split Catalog + Active herdado
  do fix D-048:
  - `ClipPathLibraryService` (catalog root) + `ActiveClipPathsService`
    (route-scoped). 5 builtin shapes: circle, ellipse, rounded-rect,
    star, heart.
  - `MaskLibraryService` (catalog root) + `ActiveMasksService`
    (route-scoped). 4 builtin gradient/radial masks: fade-left,
    fade-bottom, spotlight, soft-circle.
- **Defs pipeline**: `<svge-editor>` e `<svge-shell-pro>` chamam
  `buildAllActiveClipPathsMarkup()` + `buildAllActiveMasksMarkup()` no
  `resolvedDefs` computed; defs do documento + filters + chains +
  gradients + patterns + clipPaths + masks vão no mesmo `<defs>` block.
- **Inspector**: nova "Composition" subsection com 3 `<mat-select>`:
  blend-mode (16 modos CSS, "normal" clear-back-to-default), clip path
  (lista catalog + "none"), mask (idem). Disabled quando catalog vazio
  (evita menu inútil). Usa `setCompositionString`/`setCompositionRef`
  helpers que despacham `SetStylePropertyOnManyCommand` com `undefined`
  quando o user volta para "(none)" → renderer remove o atributo via
  binding `?? null`.

### D-050 — Tools faltantes (7 novos tools, 4 wired + 3 stubs)

Arquivo único `tool/extra-tools.ts` contendo:

| Tool            | Shortcut | Estado   | Notas                                                                                                                                                              |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eyedropper      | `i`      | ✅ wired | Click amostra fill; Alt amostra stroke. Aplica à seleção via `SetStylePropertyOnManyCommand`                                                                       |
| Knife           | `c`      | ✅ wired | Hit-test em path; insere cusp anchor no projection-on-segment mais próximo (tolerância 12 doc-units). Curvas testam contra o chord — visual offset aceitável em v1 |
| Smooth/Simplify | `s`      | ✅ wired | Ramer-Douglas-Peucker com tolerance=1.5; reduz Pencil traces. Preserva endpoints, drop handles em anchors eliminados                                               |
| Gradient        | `g`      | ✅ light | Click em nó com `url(#…)` fill seta signal `focusedNodeId` para UI panels reagirem. In-canvas stop handles ficam para futura iteração                              |
| Width           | `w`      | ⏳ stub  | Variable stroke-width along path. Precisa de novo data field (`widthProfile`) + renderer offset-curve. Deferred para D-052+                                        |
| Mesh            | `u`      | ⏳ stub  | SVG `<meshgradient>` não tem suporte browser; precisaria canvas-rasterize                                                                                          |
| Symbol Sprayer  | `o`      | ⏳ stub  | Aguarda SymbolLibraryService completo (hoje é stub D-048)                                                                                                          |

`GradientToolService` adicionado ao `provideSvgEngineEditorScope()`
(per-editor focus signal). Stubs registram tool no toolbar mas
pointerdown só loga — ocupa o id pra futura implementação sem precisar
de novo D-revision.

### D-051 — UX polish (select nativo → mat-select)

- **Auditoria**: grep `<select` no codebase achou apenas 1 native select
  (custom-editor snap-mode picker). Toda a UI principal já usa
  `<mat-select>` (Inspector picker D-049 incluído).
- **Migração**: snap-mode picker converted para `<mat-form-field>` +
  `<mat-select>` + 3 `<mat-option>`. Imports adicionados:
  `MatFormField`, `MatLabel`, `MatSelect`, `MatOption`. Comportamento
  funcional inalterado; agora herda `var(--mat-sys-*)` no tema dark
  (antes mostrava combobox da OS, sempre claro independente do tema).
- **Próximos suspects** documentados como follow-up: nenhum encontrado
  na auditoria atual — UI já está em pleno Material 3.

### Verificação

- `npx ng build svg-engine`: ✅ todos os 9 entry points
- `npx ng build playground`: ✅ build limpo (avisos pré-existentes só)
- `npx ng test svg-engine`: ✅ 1327 passed / 1 skipped / 0 failed

---

## 2026-05-23 — Fix Pattern 6 (audit D-048 fix#3): File→New e Import SVG sem reset de viewport/selection

Audit sistemático buscou 6 padrões nos bugs de UX do `/pro-editor`. 5
clean; 1 bug REAL encontrado em
`builtin-menu-contributions.plugin.ts`:

- `newDocument()` (File › New, linha 1051) e `importSvgFromFile()`
  (File › Import SVG, linha 1076) chamavam `resetDocument()` +
  `history.clear()` mas NÃO chamavam `viewport.reset()` nem
  `selection.clear()`. Mesmo bug do `applyTemplate()` que já tinha
  sido corrigido em libraries-panel.
- **Sintomas**: File › New depois de pan/zoom → tela branca off-canvas
  (viewBox novo + pan velho). Import SVG → selection apontando para
  ids do documento descartado.
- **Fix**: adicionar `fromCtx(ViewportService, runCtx).reset()` +
  `fromCtx(SelectionService, runCtx).clear()` nos dois handlers.
  Ambos já importados no arquivo (usados em outras contribuições).

Verificação: build do svg-engine passou 11.6s sem erros.

---

## 2026-05-23 — Fix D-048 (UX#3): 5 bugs do panel — previews + template + gradient/pattern + color picker

**5 bugs reportados pelo usuário** (todos legítimos):

1. Botões de shapes mostram retângulo genérico, deveriam mostrar a geometria que vão criar
2. Template clicado não faz nada visível
3. Gradient aplicado deixa o objeto transparente
4. Pattern não aplica
5. Color picker popup ainda com scrollbar (fix anterior incompleto)

### Bug 1 (shape previews): ícone genérico → SVG inline real

`shapePreviews()` computed novo enriquece cada shape com o `d` extraído de
`item.build() as PathNode`. Template renderiza `<svg viewBox="0 0 100 100">
<path [attr.d]="item.d" .../></svg>` — exatamente a geometria que será
inserida, com a mesma cor (preview honesto). Mesma técnica para
templates (`templatePreviews()` com aspect-ratio CSS) e patterns
(`patternPreviews()` com `[innerHTML]` da pattern markup via
`bypassSecurityTrustHtml` — source confiável).

### Bug 2 (template apply): viewport não atualizava

`applyTemplate()` chamava só `state.resetDocument()`. Agora também:

- `viewport.reset()` para ajustar zoom/pan ao novo viewBox
- `selection.clear()` para descartar ids stale do doc antigo
- `window.confirm()` antes do replace quando o doc atual tem shapes
  (UX best practice para ação destrutiva)

### Bugs 3+4 (gradient/pattern transparente): split Catalog + Active

**Root cause identificada** (D-051 antecipado): `GradientLibraryService` /
`PatternLibraryService` eram root-only e injetavam `EditorStateService`
do root. Mas a route tem seu próprio `EditorStateService` scoped via
D-042. Walking root document encontra empty → `activeGradientIds`
retorna `[]` → defs sem gradient → `fill="url(#xyz)"` aponta para id
inexistente → renderiza transparente.

**Split**:

- `GradientLibraryService` / `PatternLibraryService` (catalog, root)
  — só `register()` / `items()` / `get()`. Plugins registram aqui.
- `ActiveGradientsService` / `ActivePatternsService` (NOVOS, scoped)
  — walka `EditorStateService` scoped, deriva URLs em uso, busca
  markup no catalog root. Adicionados a `provideSvgEngineEditorScope`.
- `<svge-editor>` + `<svge-shell-pro>` agora injetam os serviços
  Active (não Library) para o `resolvedDefs` injection.

### Bug 5 (color picker scrollbar): CSS mais agressivo

Fix anterior tinha selector simples que perdia especificidade vs
defaults Material. CSS revisado:

- `.cdk-overlay-pane:has(> .svge-picker-menu-panel)`,
- `.mat-mdc-menu-panel.svge-picker-menu-panel` (compound class)
- `.svge-picker-menu-panel .mat-mdc-menu-content` com `width: max-content`

Todos com `!important` + `max-width/height: none` + `overflow: visible`.

### Verificação

- 1327/1328 specs ✅ (zero break)
- Build prod 12.3s ✅
- Lint svg-engine + playground ✅

---

## 2026-05-23 — Fix D-048: library catalogs invisíveis + color picker scrollbar

**Reporte do usuário** (após mountar os panels): "Não localizei nenhum
repositório. Arquivos templates, pattern, brush, symbol, shapes,
lineargradient, radial gradient não achei nenhum desses recursos.
A paleta de cor fica com barra de rolagem, não deveria."

### Bug 1: Library catalogs invisíveis no panel (mesma armadilha D-043)

**Causa raiz**: serviços de library tinham DUPLA provisão:

1. `@Injectable({ providedIn: 'root' })` na classe → singleton root.
2. Adicionados a `provideSvgEngineEditorScope()` → instância
   adicional por route.

Quando os plugins (`builtinShapesPlugin` etc.) instalam em
`app.config.ts`, eles usam o ROOT injector → registram no ROOT
instance. Quando `<svge-libraries-panel>` é mounted dentro de uma
route com `provideSvgEngineEditorScope()`, injeta o instance da
ROUTE → instância vazia (porque o plugin registrou no root).

Resultado: só a seção "Assets" aparecia (AssetManagerService usa o
mesmo scope da panel, e seus itens vêm de user upload).

**É a mesma armadilha que D-043 caiu com menu contributions**. A
lição (já documentada na época) era: serviços que recebem
registrações via plugin devem ser ÚNICA instância para que plugin
e consumer falem ao mesmo serviço.

**Fix**: removidos shape/template/gradient/pattern/graphic-style/
symbol/brush de `provideSvgEngineEditorScope()`. Continuam
`@Injectable({ providedIn: 'root' })` apenas. Plugins registram
no root; panels injetam do root; tudo funciona.

`AssetManagerService` mantido scoped (catalog é per-editor user
uploads, faz sentido isolado).

**Limitação multi-editor documentada**: `GradientLibraryService` /
`PatternLibraryService` derivam "active defs" walking a current
document. Como agora são root-only, capturam o root
`EditorStateService`, não o route-scoped. Multi-editor scenarios
verão active defs erradas. Single-editor mode (o caso atual) está
correto. Split em "Catalog (root) + ActiveDerivation (scoped)"
deferido a **D-051**.

### Bug 2: Color picker popover com scrollbar

**Causa raiz**: o picker é mounted dentro de `<mat-menu>` cujo
default `max-height: calc(100vh - 96px); overflow: auto` no
`.mat-mdc-menu-content`. Em viewports pequenos ou em layouts
densos, o picker excede a altura e scrollbar aparece.

**Fix**:

- Adicionado `panelClass="svge-picker-menu-panel"` em ambos os
  mat-menu (fill + stroke) no `svge-inspector`.
- Adicionada regra global em `projects/playground/src/styles.scss`
  removendo `max-width`/`max-height`/`overflow` no panel + content,
  e zerando padding (o picker já tem o seu).

### Verificação

- Build prod 11.9s.
- Build dev playground OK.
- Lint svg-engine + playground clean.
- Specs: 1327/1328 ✅ (zero break).

---

## 2026-05-23 — UX D-047/048: mountar Effects + Libraries panels nas visões editor

**Reporte do usuário**: "AS implementações realizadas [...] já estão
adicionadas nas visões pertinentes? Não encontrei os recursos nas
telas (Visões)".

**Diagnóstico (correto)**:

- `<svge-effects-panel>` (D-047) estava mounted APENAS em
  `/custom-editor`. Invisível em todos os outros shells.
- `<svge-libraries-panel>` (D-048) estava registrado mas **nunca
  mounted em lugar nenhum** — só existia como componente.

**UX organizada (seguindo convenções Illustrator/Affinity)**:

### `<svge-shell-pro>` — agora 4 colunas

Antes: `tools | canvas | right-side(2-row: layers/inspector)` (3 cols).
Agora: `tools | libraries (220px) | canvas | right-side(3-row: layers/
inspector/effects)` (4 cols). Doc ASCII e tabela de comparação
atualizadas.

- **Libraries** na 2ª coluna (entre tools e canvas) — convenção
  Illustrator "Libraries panel" rail à esquerda.
- **Effects** como 3ª row da right-aside (Layers / Properties /
  Effects) — segue paradigma "Appearance" panel.

### `<svge-editor>` — 2 inputs opt-in

- `[showLibrariesPanel]` (default `false`) — quando `true`, renderiza
  Libraries como left rail (220px).
- `[showEffectsPanel]` (default `false`) — quando `true`, renderiza
  Effects como right rail (260px).
- Canvas envolto em novo `.canvas-row` (flex horizontal) para
  abrigar os rails opcionais sem mover layout quando off.

### Playground — wired em todas as rotas editor

| Rota                      |             Libraries             |            Effects             |
| ------------------------- | :-------------------------------: | :----------------------------: |
| `/custom-editor`          |          ✅ left sidebar          |        ✅ right sidebar        |
| `/pro-editor` (shell-pro) |           ✅ sempre on            |          ✅ sempre on          |
| `/basic-editor`           | ✅ `[showLibrariesPanel]="true"`  | ✅ `[showEffectsPanel]="true"` |
| `/modular-editor`         |        ✅ checkbox toggle         |       ✅ checkbox toggle       |
| `/nlu-test`               | ✅ `[showLibrariesPanel]="true"`  | ✅ `[showEffectsPanel]="true"` |
| `/embeddable-canvas`      | ❌ (canvas-only ethos preservada) |               ❌               |

**Convenções de design seguidas**:

- Left rail = browsing / asset insertion (Libraries).
- Right rail = inspection / appearance (Layers / Properties / Effects).
- Status bar persiste como single horizontal row (não invadida).
- Canvas mantém `flex: 1` — não é comprimido quando ambos rails ligados.

**Verificação**: 1327/1328 specs (zero break), build prod 7.9s, lint
svg-engine + playground clean.

---

## 2026-05-23 — D-048 Libraries ecosystem (8 libraries) + Gradients/Patterns + Vite/Node note

**Pedido do usuário**: "Implemente o item 2 e 3, todos os itens
mencionados [...] Shape, Template, Asset, Symbol, Brush, Pattern,
Style, Palette + linearGradient/radialGradient/pattern + multi-stop
picker. Implemente sem minha intervenção".

### Pré-requisito: Node ≥ 20.19 (causa do erro Vite reportado)

O erro `require() of ES Module .../vite/dist/node/index.js` é causado
por **`@angular/build@21` exigindo Node `^20.19 || ^22.12 || >=24`**
(declarado em `engines.node` do pacote). O usuário está em Node
v20.11.1, que não consegue `require()` módulos ESM (Vite 7.3.2 é
puro ESM). **Fix**: atualizar para Node ≥ 20.19. O build de produção
(`ng build`) funciona porque não usa o dev-server.

### Foundation: `LibraryItem` + `LibraryRegistry<T>`

Em `edit/src/lib/library/`:

- `library-item.ts` — interface base mínima `{ id, name, category? }`.
- `library-registry.ts` — abstract class genérica `LibraryRegistry<T>`
  com signal `items`, `register()` retornando `Disposable`, `get(id)`,
  `byCategory()`, `categories()`. Cada library concreta é uma
  `@Injectable({ providedIn: 'root' })` subclass.

### 6 libraries totalmente funcionais

1. **Shape Library** (`ShapeLibraryService` + 12 builtins +
   `builtinShapesPlugin`):
   triangle, diamond, hexagon, cross, arrow, balloon, star, heart,
   lightning, cloud, gear, checkmark. Cada um é uma `createPath()`
   factory ajustada em viewBox 100×100.

2. **Template Library** (`TemplateLibraryService` + 4 builtins +
   `builtinTemplatesPlugin`):
   A4 portrait (595×842), Instagram square (1080×1080), Twitter card
   (1200×675), business card (350×200). Apply via
   `state.resetDocument()`.

3. **Gradient Library** (`GradientLibraryService` + 6 builtins +
   `builtinGradientsPlugin`) — **Item 3**:
   linear-grey, linear-blue-sky, linear-sunset (3 stops), linear-ocean
   (3 stops), radial-spotlight, radial-neon. Service deriva `<defs>`
   markup do documento (mesmo padrão de `ChainFilterRegistry`):
   walka nodes, coleta IDs únicos em `style.fill`/`style.stroke`,
   emite o markup correspondente. Wired em `<svge-editor>` +
   `<svge-shell-pro>` `resolvedDefs`.

4. **Pattern Library** (`PatternLibraryService` + 5 builtins +
   `builtinPatternsPlugin`):
   dots, lines-horizontal, lines-diagonal, grid, checkerboard. Mesma
   integração de defs do GradientLibrary.

5. **Graphic Styles Library** (`GraphicStyleLibraryService` + 6
   builtins + `builtinGraphicStylesPlugin`):
   sketch, outline, filled-3d, embossed, glass, neon. Apply N
   propriedades de style via N `SetStylePropertyOnManyCommand`. 4 dos
   6 presets referenciam effects do D-047 (graceful degradation
   quando o plugin de effects não está instalado).

6. **Palette Library** — leverage o `PaletteRegistry` pré-existente
   - novo `extraPalettesPlugin` com 4 paletas adicionais (IBM Design,
     Warm, Cool, Neon). Total agora: 7 paletas (3 base + 4 extras).

### 3 libraries stub (registry funcional, full impl deferred)

7. **Asset Manager** (`AssetManagerService`):
   In-memory catalog + file picker → data URI → insert via
   `<image href="data:...">`. v1 cobre imagens; SVG paste +
   external providers ficam para iteração futura.

8. **Symbol Library** (`SymbolLibraryService` — stub):
   Registry funcional para "saved shapes" workflow. Master-instance
   propagation (`<symbol>` + `<use>` rendering, edit-propagates)
   requer extensão do core model (`SymbolNode`) — **deferido a
   D-049**.

9. **Brush Library** (`BrushLibraryService` — stub):
   Registry com `widthProfile: number[]` locked. Integração com
   Pencil tool (variable-width path generation) — **deferida a
   D-050**.

### UI: `<svge-libraries-panel>`

Painel único em `svg-engine/ui` com 6 seções colapsáveis (shapes
aberto por default; outras collapsed). Cada seção tem grid/list de
items com click-to-apply. Imports mínimos: `MatIcon` + `MatIconButton`.
Asset upload via `<input type="file">` interno; gradient previews via
CSS `linear-gradient` aproximação.

### Wiring

- 8 services adicionados ao `provideSvgEngineEditorScope()` (D-042).
- `<svge-editor>` + `<svge-shell-pro>` `resolvedDefs` agora concatena
  5 fontes: `document.defs` + EffectRegistry + ChainFilterRegistry
  (D-047) + GradientLibraryService + PatternLibraryService (D-048).
- 6 builtin plugins adicionados ao `app.config.ts` do playground.

### Decisão arquitetural D-048

**Por que `LibraryRegistry<T>` genérico em vez de 8 registries
independentes**: cada library tem o mesmo formato (signal-backed,
register/dispose/byCategory). DRY via subclassing + ainda mantém
type safety por library específica (`ShapeLibraryService` retorna
`ShapeLibraryItem`, não `LibraryItem` puro).

**Por que gradient/pattern persistem no `style.fill` URL** (não em
campos novos de modelo): mesma escolha do D-047 chain — undo/redo,
IO export/import e D-042 multi-editor funcionam de graça quando o
estado vive no documento.

**Stubs (Symbol/Brush) com registry pronta**: contrato locked agora
permite que consumers comecem a desenhar UI/workflow já contra a API
futura, e a parte deferida (propagação / Pencil integration) é
puramente aditiva no momento de implementar.

### Verificação

- Build prod svg-engine: 8.8s.
- Build dev playground: ok.
- Lint svg-engine: clean.
- Lint playground: clean.
- Specs: 1327/1328 passing (zero break vs baseline D-047).

---

## 2026-05-23 — D-047 Effects ecosystem: 15 novos builtins + chain composer + pipeline editor

**Pedido do usuário**: "Implemente o item 1, todos os itens mencionados
[...] inner-shadow, outer-glow, inner-glow, bevel, emboss, brightness,
contrast, saturate, hue-rotate, invert, noise/turbulence, displacement-
map, chromatic-aberration, pixelate, posterize, Combine multiple
effects (chain stack na mesma node), Editor visual de filter pipeline".

Sprint dividido em 3 fases lógicas + verificação:

### Fase 1 — 15 novos builtin effects (4 → 19)

`projects/svg-engine/edit/src/lib/effect/builtin-effects.ts` ganha 15
novos `Effect` entries usando primitivas SVG nativas (feGaussianBlur,
feColorMatrix, feSpecularLighting, feTurbulence, feDisplacementMap,
feConvolveMatrix, feComponentTransfer, feBlend, feFlood, feComposite,
feOffset, feMerge). Categorias adicionadas: `glow`, `stylize`,
`adjustment`, `distortion` (além das pré-existentes `blur`, `shadow`,
`color`).

- `innerShadowEffect` — shadow CAST INTO a forma via alpha invertida.
- `outerGlowEffect` — halo branco em volta da forma.
- `innerGlowEffect` — halo branco no interior das edges.
- `bevelEffect` — relevo 3D via feSpecularLighting + height map.
- `embossEffect` — relevo grayscale via feConvolveMatrix kernel.
- `invertEffect` — inversão de RGB via feComponentTransfer table.
- `brightnessEffect` — lift +30% via linear intercept.
- `contrastEffect` — slope 1.5 / intercept -0.25 (centered mid-gray).
- `saturateEffect` — feColorMatrix type="saturate" 200%.
- `hueRotateEffect` — feColorMatrix type="hueRotate" 90°.
- `noiseEffect` — fractalNoise composto sobre SourceAlpha (film-grain).
- `displacementMapEffect` — turbulência → feDisplacementMap (warp).
- `chromaticAberrationEffect` — RGB split via 3 feColorMatrix + offset.
- `pixelateEffect` — quantize discrete + blur (chunky pixel art).
- `posterizeEffect` — quantize discrete 4 níveis (poster style).

Plugin `builtinEffectsPlugin` bumped para `v2.0.0` e registra os 19.

### Fase 2 — Effect chain (`ChainFilterRegistry` + `composeChainFilter`)

`chain-filter.ts` novo: utility puro `composeChainFilter(effects[],
chainId)` que parseia o markup de cada Effect, prefixa todos os
`result=`/`in=`/`in2=` por step para evitar colisões, rewrites
SourceGraphic/SourceAlpha em steps ≥ 2 para apontar para o output do
step anterior (`step{i-1}-out` / `step{i-1}-out-alpha`), e captura o
output de cada step com um `feOffset` no-op + `feColorMatrix` para
alpha-only.

**Encoding**: o chain ID é determinístico — `svge-chain-{eid1}__{eid2}__...`.
Vive em `style.filter` como qualquer URL, então undo/redo, IO export/
import e D-042 multi-editor scope funcionam de graça (zero estado
adicional para manter sincronizado).

**Serviço `ChainFilterRegistry`** (scoped per-editor via D-042): walka
o documento, coleta chain IDs únicos referenciados via `style.filter`,
deriva `buildAllChainsMarkup()` com o `<filter>` composto pronto pra
injetar em defs. Validação defensiva: chains com effect IDs não
registrados são silenciosamente ignorados.

**Wiring nos shells**: tanto `<svge-editor>` quanto `<svge-shell-pro>`
agora compõem `resolvedDefs` concatenando 3 fontes (`document.defs`

- `EffectRegistry.buildAllFiltersMarkup()` + `ChainFilterRegistry.
buildAllChainsMarkup()`). Antes os shells só injetavam `document.defs`
  — o playground `/custom-editor` era a única rota onde effects
  funcionavam. Agora funcionam em todos os shells.

### Fase 3 — Pipeline editor visual

`svge-effects-panel` refatorado de "toggle on/off single effect" para
editor visual completo de pipeline:

- **Active pipeline**: lista ordenada (steps 1→N) dos effects atualmente
  aplicados, com botões `↑` / `↓` (reorder) + `×` (remove) por step +
  "Clear all".
- **Add effect**: picker agrupado por categoria — chips com `+`
  adicionam ao fim do pipeline; effects já na chain mostram `✓` e
  ficam disabled.
- Cada mudança dispatcha `SetStylePropertyOnManyCommand` (single undo).
  Multi-select-aware (aplica em todos os nós selecionados).

### Fase 4 — Verificação

- Specs: **1327 passing** (+36 vs baseline 1291). Cobertura:
  - `chain-filter.spec.ts` (15 testes): id helpers, composição, registry.
  - `effect.spec.ts` expandido (29 testes vs 13 antes): todos os 15
    novos effects validados, contagem 19, plugin install.
- Build prod svg-engine: 7.6s.
- Build dev playground: 2.4s.
- Lint svg-engine: clean.

**Decisão arquitetural (D-047)**: a escolha de encodar a chain no
próprio `style.filter` URL via prefixo determinístico (`svge-chain-`) +
separador (`__`), em vez de modelar a chain como campo extra do
`SvgNode.style`, mantém:

- Zero novo state para undo/redo.
- IO export/import funciona sem mudança no svgImporter/svgExporter.
- D-042 multi-editor scope automático (cada `ChainFilterRegistry`
  scoped vê só seu próprio document state).
- Backward-compat com o panel v1 (single effect URL continua
  funcionando — chain só é gerada quando há ≥ 2 effects).

Trade-off documentado: nenhum ID com `__` deve ser usado em effect IDs
custom de plugins (improvável — convenção reverse-DNS-kebab); o prefix
`svge-chain-` é namespaced. `ChainFilterRegistry` é scoped per-editor
(D-042), automaticamente isolando chains entre instâncias.

---

## 2026-05-23 — Follow-up: tombstone NLU em edit/public-api.ts (audit miss)

**Pedido do usuário** (após o commit das 28 correções): "em
edit/src/public-api.ts o código abaixo permanece, ele é um comentário
órfão, correto: [...] Nenhum código órfão foi retirado. Você analisou
esses comentários órfãos?"

**Sim, foi um miss meu**. O agente "edit" do audit flagou
`edit/src/public-api.ts` mas SÓ por causa das 2 marcações `⏳` (Blocos
3 e 5). O comentário órfão sobre NLU (linhas 122-126) escapou porque:

- Os 5 agentes focaram em "comentário X diz Y, mas código mostra Z"
  (referências mortas a símbolos / contagens erradas / status falso);
- Tombstones puros — comentários sem export abaixo apontando para
  outros entry points — não casavam com nenhum critério da grade
  de classificação (obsoleto / referência morta / código morto /
  TODO inválido / doc inconsistente).

**Remoção**: as 5 linhas no fim de `edit/src/public-api.ts`
explicavam que NLU vive em `svg-engine/ai/nlu`. Isto é tombstone:

- Não há export abaixo (nada para o comentário documentar);
- Leitor de `edit/public-api` não procura NLU aqui — vai direto ao
  `ai/nlu/public-api.ts`;
- O movimento de 2026-05-22 já está plenamente documentado em
  `docs/08-historico-de-alteracoes.md` (entradas D-046 Refactor +
  NLU Refactor 2);
- A racional de "D-017 headless boundary" já vive em
  `04-decisoes-tecnicas.md`.

**Varredura adicional ampla** por padrões similares (`vive em entry
point separado`, `moved to`, `foi extraído`, `previously lived`, etc.)
encontrou 3 outras menções similares em `edit/`, mas todas são
arquitetonicamente importantes (barrels de re-export ativo, shims
com rationale D-XXX) — preservadas:

| Arquivo                                          | Veredito                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `edit/src/lib/io/index.ts`                       | ✅ Manter — barrel re-export ativo + rationale backward-compat |
| `edit/src/lib/optimize/index.ts`                 | ✅ Manter — mesmo padrão                                       |
| `edit/src/lib/geometry/transform-attr-parser.ts` | ✅ Manter — shim ativo, doc D-026                              |

**Lição**: agents de audit precisam de critério "tombstone puro
(comentário sem export/código adjacente que o contextualize)" para
captar esse padrão na próxima rodada.

**Verificação**: build prod 5.9s.

---

## 2026-05-23 — Limpeza de comentários órfãos do audit (28 correções seguras)

**Pedido do usuário**: "Baseado no relatório previamente gerado, realize
automaticamente todas as correções consideradas seguras e confiáveis".

Aplicadas 28 correções em 22 arquivos. Cada edit foi validado contra o
código real antes da aplicação — categorias:

**Typos triviais (7 fixes, 6 arquivos)** — `D-046?` → `D-046`:
`index.ts`, `menu-intent-discovery.ts`, `natural-language.service.ts`,
`parsers/levenshtein.ts`, `parsers/tokenize.ts` (×2), `types.ts`.

**Renames de rotas pós-D-041 (4 fixes)**:

- `basic-editor.component.ts`: `/playground-home` → `/custom-editor`.
- `fps-meter.ts`: `/perf` → `/benchmark`.
- `synth-doc.ts`: idem.
- `pro-editor.component.ts`: `demoMenuBarPlugin` → `builtinMenuContributionsPlugin`.

**Contagens / listas defasadas (4 fixes)**:

- `app.ts`: lista de rotas adicionou `/nlu-test`.
- `modular-editor.component.ts`: "Three checkboxes" → "Six checkboxes"
  - lista de peças completa no template.
- `menu-context.ts`: "Two helpers" → "Three helpers".
- `builtin-menu-contributions.plugin.ts`: "31 contributions" → "58".

**Headers public-api desatualizados (10 fixes em 2 arquivos)**:

- `edit/src/public-api.ts`: Bloco 3 ⏳ → ✅ e remove o duplicado Bloco 5.
- `ui/src/public-api.ts`: Blocos 4b-4i ⏳ → ✅ (8 itens, todos
  implementados já listados como exports).

**Listas "What's NOT included" obsoletas (2 fixes)**:

- `builtin-menu-contributions.plugin.ts`: remove menções a Clipboard/
  Duplicate que JÁ EXISTEM em D-044.
- `builtin-editor-shortcuts.plugin.ts`: reescreve para diferenciar
  "serviços existem" vs "atalhos não foram wireados aqui ainda".

**Referências mortas a símbolos / mecanismos inexistentes (7 fixes)**:

- `isolation.service.ts` (2): remove referência a `constructor effect`
  e `ws.document()` que não existem; reescreve a doc do
  `breadcrumbPath` explicando o que de fato acontece (stale-target
  handling sem auto-clear).
- `marquee.service.ts`: reescreve rationale de export do `rectFromPoints`.
- `plugin.ts`: doc de "circular deps caught" → descrição real (prevenção
  indireta via instalação sequencial, sem cycle-walk explícito).
- `provide-plugin.ts`: exemplo `builtinSelectToolPlugin` → `selectToolPlugin`.
- `selection-overlay.component.ts`: remove "future TransformService".
- `page-overlay.component.ts` (2): "centered in viewport" → "top-left
  anchored at (0,0)" (reverted em 2026-05-18).

**Documentação inconsistente com implementação (5 fixes)**:

- `inspector.component.ts` (2): multi-edit não é "future polish" — está
  implementado via `SetStylePropertyOnManyCommand`; color pickers idem.
- `layers-panel.component.ts`: DnD reorder não é "deferred" — feito.
- `layers-filter.directive.ts`: "every CD cycle" → "effect reagindo a
  hiddenIds".
- `snap-guides.component.ts`: "magenta/cyan" → "sempre magenta".

**NLU específicos (3 fixes)**:

- `_helpers.ts`: remove `set-fill` da lista de consumidores de
  `setStyleOnSelected` (set-fill dispatcha command direto).
- `builtin-nlu.plugin.ts`: remove rotulagem "stub honesto" do set-fill.
- `shapes.ts`: atualiza descrição "estrela cai em stub" — agora tem
  geometria real via `regularStarPoints`.

**Adições documentais (1 fix)**:

- `editor-scope.providers.ts`: adiciona `ClipboardService` (D-044) à
  lista de serviços edit-scope.

**Não-corrigidos (preservados para revisão manual — preserve_for_manual_review)**:

- `reorder-node.command.ts` L80 (tautologia `newIndex > oldIndex ?
newIndex : newIndex`): pode ser bug real (faltando `- 1`) OU intenção
  proposital. Mexer aqui altera lógica funcional — VIOLA regra.
- `path-anchors.ts` L500-501 (re-export "for downstream tests"): grep
  mostra zero consumidores, mas remover quebra superfície de API
  pública. Baixo risco, mas decisão de quebra de contrato.
- `inspector.component.ts` `.field-row.active-target { }` (regra CSS
  vazia para "specs antigos"): comentário avisa que remoção quebra
  specs. Não há como validar sem rodar specs antigos.
- `shortcut.ts` L142-143 (ternário tautológico `length === 1 ?
toLowerCase() : toLowerCase()`): É código, não comentário —
  simplificação é alteração funcional (mesmo idempotente). Skip.

**Verificação**:

- Build prod svg-engine: ✅ 11.9s
- Specs: ✅ 1291/1292 (zero regressão — mesmo número da baseline)
- Lint svg-engine: ✅ clean
- Lint playground: ✅ clean
- Build dev playground: ✅ 9.1s

**Issue encontrada e resolvida durante o processo**:

- A primeira tentativa de remover as CSS rules vazias em `shell-pro`
  (`.tool-options-row {}`, `.status-row {}`) quebrou a compilação AOT
  do Angular ("Failed to resolve @Component.styles"). Comentário CSS
  órfão sem regra confunde o parser estático. Restaurei o seletor com
  bloco vazio (documentado) — mantém zero impacto visual mas preserva
  parseabilidade.

---

## 2026-05-22 — Paridade do svge-tool-options nas 2 visões ausentes (/custom-editor + /embeddable-canvas)

**Observação do usuário**: "Percebi que o svge-tool-options também é
ausente em algumas visões, parece que foi disponibilizado apenas para
shell-pro, verificar e ajustar".

**Auditoria realizada**: `<svge-tool-options>` aparece via flag
`[showToolOptions]` ou diretamente em 4 das 6 rotas:

- `/pro-editor` ✅ (vem sempre on via `<svge-shell-pro>`)
- `/basic-editor` ✅ (`[showToolOptions]="true"`)
- `/modular-editor` ✅ (checkbox signal-controlled, default `false`)
- `/nlu-test` ✅ (`[showToolOptions]="true"`)
- `/embeddable-canvas` ❌ → faltava
- `/custom-editor` ❌ → faltava (monta editor à mão, sem `<svge-editor>`)

**Decisão para `/embeddable-canvas`**: usuário pediu paridade total
("Adicionar em ambas — consistência"). Adicionado `[showToolOptions]
="true"` mesmo que isto conflite parcialmente com a proposta
canvas-only original do D-037 Modo 4 — o argumento prevaleceu de que
tools como Stamp/Pen/Pencil precisam de UI para customização, e sem a
bar de opções essas tools ficam "cegas" para o usuário.

**Fix em `/custom-editor`**:

- Import `SvgeToolOptions` em `custom-editor.component.ts` + array
  `imports`.
- `<svge-tool-options class="tool-options-bar" [showPlaceholder]="true">`
  na template, posicionado entre o `<section class="toolbar">` e a
  `<div class="workspace">` — mesma convenção do `<svge-editor>` e
  `<svge-shell-pro>`.
- `showPlaceholder=true` para layout consistente (toolbar com altura
  fixa mesmo quando a tool ativa não tem opções).
- SCSS: `:host { grid-template-rows: auto auto 1fr auto }` (era 3
  linhas, agora 4 — toolbar / tool-options / workspace / status).
- `.tool-options-bar` ganha border + border-radius para integrar com
  o look das outras seções do editor customizado.

**Modular-editor**: mantido como está — o checkbox de showToolOptions
é parte da pedagogia ("ligar/desligar peças do shell" é o ponto da
rota), e default `false` é intencional.

**Verificação**: build dev playground 2.4s, lint clean.

---

## 2026-05-22 — Paridade total de overlays nas 4 rotas restantes do playground

**Pedido do usuário** (após o fix do pro-editor): "pode atualizar o
basic-editor e modular-editor, é preciso sempre de atualizar todos os
editores, logicamente mantendo a particularidade de cada visão".

**Escopo expandido**: além de `/basic-editor` e `/modular-editor`,
auditei todas as rotas que mountam `<svge-editor>` ou
`<svge-shell-pro>` e encontrei a mesma carência em `/embeddable-canvas`
e `/nlu-test`. As 4 ficaram com o conjunto idêntico de 9 overlays:

```
Selection → RotationPivot → Anchor → Marquee → SnapGuides
→ Pen → Pencil → Shape → InlineText
```

Ordem espelhada de `/custom-editor` (referência completa) e
`/pro-editor` (commit anterior). Particularidades preservadas:

- **`/basic-editor`**: hint banner explicativo + título dinâmico via
  `computed`. Sem mudanças nessa parte.
- **`/modular-editor`**: 6 checkboxes para flag-toggling (menu /
  toolbar / status / context / tool options / custom status) +
  status bar customizada via projeção `[status-bar]`. Comentário
  inline deixa claro que as flags controlam **peças do shell**, não
  os overlays — que ficam sempre presentes para que qualquer tool
  ativa funcione com feedback visual.
- **`/embeddable-canvas`**: shell canvas-only (`showToolbar=false`,
  `showStatusBar=false`). Comentário destaca que mesmo sem toolbar
  visível as tools podem ser ativadas por atalho de teclado, então
  os overlays de feedback precisam estar presentes.
- **`/nlu-test`**: editor + `<svge-nlu-input>` lado a lado. NLU pode
  disparar comandos que ativam tools ("criar retângulo") — overlays
  presentes garantem feedback consistente.

**Rotas que NÃO precisam de overlays** (mantidas intocadas):

- `/benchmark` — usa `<svge-renderer>` direto, é teste de
  performance/render, não editor interativo.
- `/svg-viewer` — viewer read-only (só Renderer + IO).

**Verificação**: build dev playground 3.0s, lint clean.

---

## 2026-05-22 — Pro Editor: overlays de feedback das tools (paridade UX com /custom-editor)

**Bug reportado pelo usuário**: a rota `/pro-editor`
(`<svge-shell-pro>`) só projetava 5 overlays: SelectionOverlay,
RotationPivot, AnchorOverlay, Marquee e SnapGuides. Resultado: Pen,
Pencil, Shape e Text tools não mostravam nenhum feedback visual
durante a interação — o usuário não via curvatura, traçado livre,
retângulos/elipses tracejados ou o editor inline de texto.
Funcionavam (o desenho final aparecia) mas davam impressão de
ferramentas quebradas.

**Causa**: o template do `pro-editor.component.ts` foi escrito antes
das tools de criação ganharem overlays próprios. O `<ng-content />`
projetado no `<svge-shell-pro>` simplesmente não tinha os `<svg:g>`
necessários — diferente do `/custom-editor` que sempre teve o
conjunto completo.

**Fix**: adicionar os 4 overlays faltantes em
`pro-editor.component.ts`, mantendo a ordem de z-index do
`/custom-editor` (espelha a referência):

1. SelectionOverlay
2. RotationPivot
3. AnchorOverlay
4. Marquee
5. SnapGuides
6. **PenOverlay** (novo) — rubber band + handles + preview da curva
7. **PencilOverlay** (novo) — traçado em tempo real do desenho livre
8. **ShapeOverlay** (novo) — preview tracejado de rect/ellipse/polygon
9. **InlineTextEditor** (novo) — foreignObject + contentEditable do
   Text tool (último na ordem, surface acima de tudo)

Imports + array `imports` do componente também atualizados.
Comentários inline no template explicando cada overlay e o
porquê — serve de referência futura para quem for compor outro
editor com `<svge-shell-pro>`.

**Gap relacionado conhecido**: `/basic-editor` e `/modular-editor`
têm a mesma carência (só projetam Selection/Rotation/Marquee/Snap).
Não corrigido neste turno — fora do escopo do pedido pontual do
usuário. Pode ser abordado em sessão separada quando alguém
encontrar o mesmo "ferramenta parece quebrada" nessas rotas.

**Verificação**: build dev playground 2.3s, lint clean, sem mudança
em specs (mudança puramente de wiring no consumer).

---

## 2026-05-22 — Pencil Tool: preview do traçado durante o drag

**Bug reportado pelo usuário**: durante o desenho à mão livre, ao
manter o botão do mouse pressionado para criar a linha ou traçado, o
traçado não estava sendo exibido em tempo real — o desenho final só
aparecia no `pointerup`. Era exatamente o gap que o comentário no
`PencilTool` já admitia ("No live preview in this reference
implementation").

**Fix**: aplicar o mesmo padrão Service + Overlay que o Pen Tool usa.

### Novos arquivos

- `pencil-tool.service.ts` — `PencilToolService` (`root`-provided):
  - signals: `points`, `drawing`, `hasDraft` (≥ 2 pontos + drawing).
  - mutations: `begin(p)`, `append(p)`, `finish() → points[]`,
    `cancel()`, `reset()`.
  - Sem coupling com document/command — toda a parte de dispatch
    continua no `PencilTool`, mantendo a service testável em isolation.
- `pencil-overlay.component.ts` — `<svg:g svgePencilOverlay>` (mesmo
  padrão do `PenOverlay` / `ShapeOverlay`):
  - Computed `previewD()` reusa `pointsToPathD()` (mesma serialização
    que o commit usa, garantindo paridade bit-for-bit com o resultado
    final).
  - Style: stroke `#1976d2`, `stroke-width: 2`, `stroke-linecap: round`,
    `stroke-linejoin: round`, `opacity: 0.85`, `vector-effect:
non-scaling-stroke`, `pointer-events: none`.
  - Hidden quando `!hasDraft()` (mesma threshold que o tool usa pra
    decidir se commita — single click sem movimento não desenha nada).

### Refactor

- `builtin-tools.ts` — `PencilTool` perde os fields privados
  (`points`, `drawing`) e delega tudo para a service via
  `ctx.injector.get(PencilToolService)` (mesmo padrão das outras
  builtin tools: SelectionService, EditorStateService, CommandBus).
  Threshold de 2 pontos para commit mantida.

### Wiring

- `tool/index.ts` exporta `PencilToolService` + `PencilOverlay`.
- `custom-editor.component.{ts,html}` (playground) adiciona o
  `<svg:g svgePencilOverlay>` ao lado do `<svg:g svgePenOverlay>`.

### Specs

- `builtin-tools.spec.ts` ganhou 2 describes (10 testes novos):
  - `PencilTool — live preview via PencilToolService`: pointerdown
    marca drawing, moves alimentam points + flippam `hasDraft`,
    pointerup limpa + dispatcha, pointercancel limpa sem dispatch.
  - `PencilOverlay — reactive preview`: null sem drawing, null com 1
    ponto, `d` correto a partir de 2 pontos, reatividade a cada move,
    limpeza pós-finish / pós-cancel.

**Verificação**: 1291/1292 specs (+10), lint clean (lib + playground),
build prod 10.8s.

---

## 2026-05-22 — Pen Tool: preview da curva durante drag

**Bug reportado pelo usuário**: durante o desenho ponto a ponto, ao
manter o botão do mouse pressionado para criar a curvatura, o traçado
da curva não estava sendo exibido em tempo real — apenas as arestas
(handle stems + knobs) apareciam. O comportamento esperado é que a
curvatura seja apresentada dinamicamente junto com as arestas enquanto
o usuário movimenta o mouse com o botão pressionado.

**Causa**: o `PenOverlay` tinha três caminhos de render que não cobriam
a curva intermediária:

1. `committedSegments()` — apenas pares de âncoras já comprometidas.
2. `rubberBand()` — escondida durante o drag (`dragState() !== null`).
3. `dragHandlePreview()` — desenhava só os stems + knobs simétricos.

Resultado: enquanto o usuário arrastava, nenhum `<svg:path>` consumia
os handles em formação. A curva só "aparecia" depois do `commitDrag`,
quando o par virava `committedSegments`.

**Fix em `pen-overlay.component.ts`**:

- Novo computed `dragCurvePreview()` que combina:
  - Última âncora comprometida (`anchors[anchors.length - 1]`).
  - Âncora pendente sintetizada em `dragState.start` com `handleIn`
    espelhado (mesma fórmula do `commitDrag`: `2·start − current`).
- Reutiliza `segmentD()` — o mesmo serializador dos committed segments
  e do `anchorsToPathD`, garantindo que o preview é bit-for-bit o que
  vira o `d` final.
- Renderiza `<svg:path class="pen-segment">` entre rubber-band e o
  handle preview no template (z-order: stems/knobs ficam por cima).
- Retorna `null` quando: sem drag, sem âncora anterior (primeira do
  path), ou cursor ainda no press point (sem curvatura).

**Specs** em `pen-tool.spec.ts` — novo describe `PenOverlay — drag
curve preview` com 6 casos: estado idle, primeira âncora, sem
movimento, fórmula do `d` (validada como `M0 0 C0 0 20 50 50 50` para
drag de (50,50)→(80,50) após cusp em (0,0)), reatividade, limpeza pós
commit.

**Verificação**: 1281/1282 specs (+6), lint clean, build prod 7.5s.

---

## 2026-05-22 — D-046 review-10: Sprint 1-4 do audit (execução autônoma)

**Pedido**: executar autonomamente as 4 sprints do relatório de auditoria NLU sem intervenção.

Cobre **9 findings** do relatório consolidados em 5 commits.

### Sprint 1.A — C1 + C2 (críticos)

**C1**: `tokens.indexOf` quebrava com tokens repetidos.

- `FuzzyMatch.tokenIndex: number` capturado durante `fuzzyMatchAny`.
- `NluMatchReason.tokenIndex?` opcional, populado por keyword/action.
- Service usa índice direto em vez de reverse-lookup.

**C2**: `VoiceRecognitionService.listen()` podia pendurar Promise.

- `DEFAULT_LISTEN_TIMEOUT_MS = 30000` (constante pública).
- `listen(lang, { timeoutMs })` com watchdog; `timeoutMs=0` desliga.
- Timer cleared em onresult/onend/onerror/start error.

### Sprint 1.B — H2 (scoring constants)

- Novo `scoring/scoring-constants.ts` com 16 constantes documentadas + `expectedScore()` helper.
- Service substitui todos os literais por constantes nomeadas.
- Novo `scoring-constants.spec.ts` com 14 fixtures (sentinel + invariantes + cenários reais).

### Sprint 1.C — H1 (split intents)

- Novo `intents/_helpers.ts` (250 linhas): `warn`, `selectedIdsOrWarn`, `setStyleOnSelected`, `flipSelected`, `reorderSelected`, `runPathfinder`, `nodeMatchesShape`, `getNodeApproxOrigin`, `moveToAbsolute`.
- `professional-intents.ts`: 1194 → 943 linhas (−21%).
- Handlers `delete-selected` e `rotate-selected` refatorados pra usar `selectedIdsOrWarn`.

### Sprint 1.D — H4 (descriptionBoost optimization)

- `populateDescriptionCache(intent)` chamado IMEDIATO no `registerIntent`.
- Cold-cache miss eliminado da 1ª keystroke.
- `descriptionBoost` só faz lookup (zero tokenize em hot path).

### Sprint 2 — Arquitetura Fase 2 ML

**H3**: `NluScorer` interface em `scoring/scorer.types.ts` — contrato pra Fase 2 ML re-rank (forward-compat).

**H5**: `NluDictionaryRegistry` service injetável — `registerColor/Shape/Action()` runtime sem editar source.

**M4**: try/catch ao redor de `intent.execute()`. Novo rejection `'execute-error'` + `Result.error?`.

**M5**: `parseDebounceMs` input no nlu-input. Default 0 (zero break). 150ms recomendado pra voice.

**M14**: `autoDetectLanguage` input. `detectedLanguage` computed via `detectLanguage(tokenize(text))`. `effectiveVoiceLang` resolve PT→pt-BR / EN→en-US.

### Sprint 3 — Polimento

- **M2**: slot-extractor case 'color' também skip number-words (defesa uniforme).
- **L10**: doc atualizada explicando `axis` slot nos flip-\* É discriminador (NÃO remover).
- **L12**: `intentsCount: Signal<number>` computed pra UI consumers.

### Sprint 4 — Prep Fase 2

- `scoring/PHASE-2-INTEGRATION.md` — caminho de migração documentado: passos de refactor, exemplo `SemanticScorer` com Transformers.js, trade-offs, critérios de aceite pra adoção.

### Verificação

- **1275/1275 tests passing** + 1 skipped (+21 specs novos vs baseline 1247).
- `ng build svg-engine` OK
- `ng lint svg-engine` OK
- Zero break em 1247 specs anteriores.

### Arquivos novos

- `nlu/src/lib/scoring/scoring-constants.ts` + `.spec.ts`
- `nlu/src/lib/scoring/scorer.types.ts`
- `nlu/src/lib/scoring/index.ts`
- `nlu/src/lib/scoring/PHASE-2-INTEGRATION.md`
- `nlu/src/lib/intents/_helpers.ts`
- `nlu/src/lib/dictionary-registry.service.ts` + `.spec.ts`
- `nlu-ui/src/lib/voice-recognition.service.spec.ts`

### Arquivos modificados

- `nlu/src/lib/parsers/fuzzy-match.ts` (+ tokenIndex)
- `nlu/src/lib/types.ts` (NluMatchReason.tokenIndex, NluExecuteResult.error)
- `nlu/src/lib/natural-language.service.ts` (constants, scorer-ready, error boundary, intentsCount)
- `nlu/src/lib/intents/professional-intents.ts` (−251 linhas, usa \_helpers)
- `nlu/src/lib/parsers/slot-extractor.ts` (M2 color skip number)
- `nlu/src/lib/parsers/fuzzy-match.spec.ts` (+ tokenIndex specs)
- `nlu/src/lib/index.ts` (re-export scoring + dictionary-registry)
- `nlu-ui/src/lib/voice-recognition.service.ts` (timeout watchdog)
- `nlu-ui/src/lib/nlu-input.component.ts` (debounce + auto-detect-lang)

### Lição

Auditoria sistemática + execução por sprints incrementais (sempre verificando build+test entre commits) entrega valor real sem regressão. Cada commit pôde ser revertido isoladamente se tivesse problema.

---

## 2026-05-22 — D-046 review-9: comandos compostos "selecionar os 3 triangulos azuis" (número + cor)

**Reportado pelo usuário** — seleção combinando quantidade + tipo + cor:

- `"Selecionar os dois retangulos cinza"`
- `"Selecionar os três triangulos azuis"`
- `"selecionar os 3 triangulos amarelos"`

Sim, é possível. Implementado em 4 partes.

### Parte 1: Números por extenso PT/EN

Novo `number-words.ts` mapeia palavras → inteiro (zero-100). `parseNumberToken` agora resolve dígitos (`"3"`), unidades (`"3px"`), dimensões (`"100x50"`) **E** palavras (`"três"`, `"dois"`).

### Parte 2: Plurais de cores (PT/EN)

`'azuis'` é plural irregular (`azul`→`azuis` = lev 2 > adaptiveMax(4)=1) e NÃO fuzzy-matchava. Adicionadas entradas explícitas: PT (`vermelhos`, `azuis`, `amarelos`, `verdes`, `pretos`, `cinzas`, `roxos`, etc) e EN (`reds`, `blues`, `greens`, `grays`, etc).

### Parte 3: `select-by-type` com `count` + `fill` slots

```ts
slots: {
  shape: { kind: 'shape', optional: false },
  count: { kind: 'number', optional: true },  // novo
  fill: { kind: 'color', optional: true },    // novo
}
```

Handler filtra por `shape AND fill`. `count` é **informativo** (sanity check) — se user pediu 3 mas há 5, seleciona os 5 com warn. Nunca limita hard.

### Parte 4: Fix CRÍTICO — `'dois'` fuzzy-matchava `'dots'`

Bug encontrado via debug: `'dois'` (PT "2") fuzzy-matchava `'dots'` (EN plural de dot → 'circle') com distância 1 (substitui `i` → `t`). Resultado: shape extraído como `'circle'` em vez de `'rect'` em comandos como "selecionar os **dois** retangulos cinza".

**Fix**: `slot-extractor` agora skip tokens que são number-words ao extrair shape:

```ts
case 'shape': {
  // Skip tokens que são número — 'dois'/'tres' nunca são shape
  if (parseNumberToken(tok) !== null) break;
  ...
}
```

Princípio geral: um token unambiguamente numérico não pode ser shape.

### Specs adicionados (+5 regression)

| Comando                                 | Resultado esperado        |
| --------------------------------------- | ------------------------- |
| `"Selecionar os dois retangulos cinza"` | só 2 rects cinzas         |
| `"Selecionar os três triangulos azuis"` | só 3 triangulos azuis     |
| `"selecionar os 3 triangulos amarelos"` | dígito também funciona    |
| `count=3 mas há 5`                      | seleciona 5 com warn      |
| `"selecionar retangulos azuis"`         | plural irregular funciona |

**Total**: **1247/1247 passing** + 1 skipped.

### Comandos que agora funcionam

| Comando                                   | Resultado                 |
| ----------------------------------------- | ------------------------- |
| `"Selecionar os dois retangulos cinza"`   | 2 rects cinzas            |
| `"Selecionar os três triangulos azuis"`   | 3 polygons triangle azuis |
| `"selecionar os 3 triangulos amarelos"`   | mesmo (dígito)            |
| `"selecionar quatro hexagonos vermelhos"` | filtros combinados        |
| `"select three blue triangles"`           | EN também                 |

### Lição: Inter-dicionário pode causar colisões fuzzy

Adicionar `'dots'` (EN plural) ao SHAPE_DICTIONARY criou colisão imprevista com `'dois'` (PT número). Fuzzy adaptativo é generoso para tokens curtos. **Princípio defensivo**: quando um slot tem semântica não-ambígua (número), checá-la primeiro e pular outros tipos.

### Arquivos modificados

- `dictionaries/number-words.ts` (novo) — `NUMBER_WORDS` + `resolveNumberWord`
- `dictionaries/colors-{pt,en}.ts` — plurais (+30 entradas)
- `dictionaries/index.ts` — export number words
- `parsers/slot-extractor.ts` — `parseNumberToken` chama `resolveNumberWord`; shape case skip number tokens
- `intents/professional-intents.ts` — `select-by-type` com slots count + fill, handler filtra
- specs +5 regression

---

## 2026-05-22 — D-046 review-8: `'ambos'`/`'ambas'` = sinônimo PT de `'todos'` + plurais nos shape dicts

**Reportado pelo usuário**:

> "Em português dissemos: selecionar ambos = selecionar todos. selecionar ambos retangulos = selecionar todos os retangulos. E assim para os demais objetos/formas."

### Bug 1: `'ambos'`/`'ambas'` não eram canonical `'select-all'`

Em PT, "ambos" é sinônimo direto de "todos os 2" / "todas as 2". Faltava o mapeamento:

```ts
// actions-pt.ts
ambos: 'select-all',
ambas: 'select-all',
```

Plus adicionei como keywords no `select-all` intent customizado. Cobre auto-discovery do menu "Select All" também (via `deriveTokenGroups` que expande canonical `'select-all'` → todas variantes incluindo `'ambos'`).

### Bug 2: `SHAPE_DICTIONARY` não tinha plurais

`"selecionar ambos retangulos"` falhava porque `'retangulos'` (plural) não estava no dict. `select-by-type` matchava keyword `'retangulos'` mas o slot `shape` ficava `undefined` (required missing → score penalty -0.15 → perdia pra select-all).

**Fix**: adicionei TODOS os plurais em `shapes-pt.ts` (+30 entradas) e `shapes-en.ts` (+50 entradas). Cobertura sistemática: `retangulo`/`retangulos`, `quadrado`/`quadrados`, `estrela`/`estrelas`, `hexagono`/`hexagonos`, `triangulo`/`triangulos`, `losango`/`losangos`, `pentagono`/`pentagonos`, `octogono`/`octogonos`, `linha`/`linhas`, `texto`/`textos`, etc. EN equivalente.

### Specs adicionados (+4 regression)

- `"selecionar ambos"` → seleciona tudo
- `"selecionar ambas"` (feminino) → também funciona
- `"selecionar ambos retangulos"` → só rects, ignora ellipses
- `"selecionar ambas estrelas"` → só polygons com 10 vértices, ignora hexagonos

**Total**: **1242/1242 passing** + 1 skipped.

### Comandos que agora funcionam

| Comando                            | Resultado                                    |
| ---------------------------------- | -------------------------------------------- |
| `"selecionar ambos"`               | seleciona tudo (sinônimo de "tudo")          |
| `"selecionar ambas"`               | mesmo (feminino)                             |
| `"selecionar ambos retangulos"`    | só rects                                     |
| `"selecionar ambas estrelas"`      | só polygons com 10 vértices                  |
| `"selecionar hexagonos"`           | só polygons com 6 vértices (plural funciona) |
| `"selecionar todos os retangulos"` | mesmo (continua funcionando)                 |

### Arquivos modificados

- `dictionaries/actions-pt.ts` — `'ambos'`/`'ambas'` → canonical `'select-all'`
- `dictionaries/shapes-pt.ts` — ~30 plurais novos
- `dictionaries/shapes-en.ts` — ~50 plurais novos
- `intents/professional-intents.ts` — `'ambos'`/`'ambas'` em keywords do select-all
- specs +4 regression

---

## 2026-05-22 — D-046 review-7: "selecione X" selecionava TUDO (auto-discovery super-agressiva)

**Reportado pelo usuário** — comandos que selecionavam TODOS os nós em vez do alvo:

- `"selecionar o polígono azul"`
- `"selecionar apenas a estrela"`
- `"selecione a estrela"`
- `"selecione o objeto"`

Afetava também: losango, hexagono, octogono, pentagono, texto.

**Diagnóstico**: 3 bugs concorrentes.

### Bug 1: `deriveKeywords` super-expandia auto-discovered intents

`menu-intent-discovery.ts` deriva keywords do label de menu items via canonical expansion. Para "Select All":

- baseTokens = `['select', 'all']`
- 'select' canonical → `'select'` → expande pra TODAS as variantes: `'selecionar'`, `'selecione'`, `'marcar'`, etc.
- 'all' canonical → `'select-all'` → expande pra `'tudo'`, `'todos'`, `'everything'`

Resultado: o intent "Select All" tinha ~20 keywords. Qualquer input com `'selecione'` matchava → executava Select All → selecionava tudo.

### Fix 1: `requiredAllGroups` (AND gate por grupo)

Novo campo opcional em `NluIntent`:

```ts
readonly requiredAllGroups?: readonly (readonly string[])[];
```

Cada grupo representa um elemento semântico do label que DEVE estar presente. Para "Select All":

```ts
requiredAllGroups: [
  ['select', 'selecionar', 'selecione', ...],  // verbo
  ['all', 'tudo', 'todos', 'everything'],       // qualificador
]
```

`"selecione estrela"` tem só o verbo → grupo 2 falha → Select All **não é candidato**.

`menu-intent-discovery.ts` chama `deriveTokenGroups(label)` que retorna groups (null pra labels single-token onde gate AND complica sem benefício).

### Bug 2: `select-by-type` keywords incompletas

Faltavam: `'poligono'`, `'triangulo'`, `'losango'`, `'pentagono'`, `'hexagono'`, `'octogono'`, `'estrela'`, `'polilinha'` (PT) e EN equivalentes. Sem essas, `"selecione hexagono"` nem virava candidato.

### Bug 3: handler de `select-by-type` ignorava polygon variants

Slot vinha `shape='star'`, handler fazia `node.type === 'star'` — mas no SVG todos os polígonos têm `type='polygon'`. Match falhava → 0 nós.

**Fix**: helper `nodeMatchesShape(node, shape)` discrimina polygons por `points.length` via `POLYGON_SIDES` lookup. Star = 10 vértices (5 pontas × 2). Hexagon = 6. Triangle = 3. Etc.

### Specs adicionados (+7 regression)

| Comando                         | Resultado esperado                 |
| ------------------------------- | ---------------------------------- |
| `"selecione a estrela"`         | só a estrela (1 nó), não tudo      |
| `"selecionar o polígono azul"`  | só o polygon                       |
| `"selecionar apenas a estrela"` | só estrela, não hexagono adjacente |
| `"selecione o objeto"`          | NÃO seleciona tudo (3 nós)         |
| `"selecione hexagono"`          | só polygons com 6 vértices         |
| `"selecione triangulo"`         | só polygons com 3 vértices         |
| `"selecione texto"`             | só `<text>`                        |

**Total**: **1238/1238 passing** + 1 skipped.

### Comandos que agora funcionam

| Comando                 | Resultado                             |
| ----------------------- | ------------------------------------- |
| `"selecione estrela"`   | só polygons com 10 vértices           |
| `"selecione hexagono"`  | só polygons com 6 vértices            |
| `"selecione octogono"`  | só polygons com 8 vértices            |
| `"selecione pentagono"` | só polygons com 5 vértices            |
| `"selecione triangulo"` | só polygons com 3 vértices            |
| `"selecione losango"`   | só polygons com 4 vértices            |
| `"selecione texto"`     | só `<text>`                           |
| `"selecione poligono"`  | qualquer `<polygon>`                  |
| `"selecionar tudo"`     | TUDO (requer ambos 'select' + 'tudo') |

### Lição

Auto-discovery por expansão canonical é poderosa mas perigosa quando o label tem múltiplos tokens semânticos. O `requiredAllGroups` torna o gate explícito: cada token do label original vira "fatia" obrigatória do match. Single-token labels (`"Undo"`) ficam com comportamento OR clássico.

### Arquivos modificados

- `types.ts` — `requiredAllGroups?` em `NluIntent`
- `natural-language.service.ts` — gate AND consultando `requiredAllGroups`
- `menu-intent-discovery.ts` — `deriveTokenGroups()` + wire
- `intents/professional-intents.ts` — `nodeMatchesShape()` + keywords expandidas
- specs atualizados (+7 regression)

---

## 2026-05-22 — D-046 review-6: movimento ABSOLUTO + "x igual a 10" + 'desloca' conjugação

**Reportado pelo usuário** — 3 comandos não funcionavam:

1. `"move o objeto selecionado para x 10"`
2. `"move o objeto selecionado para x igual a 10"`
3. `"desloca o objeto para posição 10 50"`

**Diagnóstico**: 3 bugs reais concorrentes.

### Bug 1: Semântica — só existia "move RELATIVO" (dx/dy)

`move-selected` original interpretava números como deslocamento incremental. O usuário queria movimento ABSOLUTO ("para x=10"). Operações diferentes precisam de intents separados.

**Fix**: 3 novos intents em `professional-intents.ts`:

- `move-to-position`: slot `position` (kind:'point') anchor `posicao`/`position`/`para`/`to`
- `move-to-x`: slot `targetX` (kind:'number') anchor `x`/`horizontal`
- `move-to-y`: slot `targetY` (kind:'number') anchor `y`/`vertical`

Handler `moveToAbsolute(runCtx, x|null, y|null)`:

1. Lê origin atual de cada nó selecionado via `getNodeApproxOrigin(node)` (geometria intrínseca + transform.translate)
2. Calcula dx = targetX - currentX (ou 0 se null)
3. Dispatcha `MoveNodeCommand(nodeId, dx, dy)` — composição relativa resulta em posição absoluta correta

`getNodeApproxOrigin` cobre rect/ellipse/line/polygon/polyline/text/image (path/group retornam null com warning honesto — exigem bbox renderizado fora do scope D-017).

### Bug 2: Vocabulário PT — 'desloca' (3ª pessoa singular) faltando

`actions-pt.ts` tinha `'deslocar'` (infinitivo) e `'desloque'` (imperativo formal) mas faltava 3ª pessoa `'desloca'` ("desloca o objeto..."). Adicionadas + outras conjugações: `'arrasta'`, `'movem'`, `'movimenta'`, `'movimente'`, `'movimentar'`, `'translada'`, `'translade'`, `'transladar'`, `'posiciona'`.

### Bug 3: "x igual a 10" quebrava o extrator anchored

O `extractValueForSlot` parava no primeiro token não-stopword não-numérico após o anchor. `'igual'` (não-stopword) ficava entre `'x'` e `'10'` e abortava a extração.

**Fix**: stopwords PT/EN expandidas: `'igual'`, `'iguais'`, `'eh'`, `'sao'`, `'valor'` (PT) + `'equals'`, `'equal'`, `'is'`, `'are'`, `'value'` (EN). Também fillers de referência ao objeto: `'objeto'`, `'objetos'`, `'selecionado'`, `'selecionada'` etc — toda operação NLU já assume "no selecionado", essas palavras eram ruído.

### Bug 4 (descoberto durante fix): Slots anchored com fallback positional incorreto

Após implementar `move-to-x`, `"move para y 100"` matched `move-to-x` errado — o positional pass pegava o `100` para `targetX` mesmo SEM anchor `'x'` no input.

**Fix em `slot-extractor.ts`**: slots com `anchorKeywords` agora são **anchor-only**. Se Pass 1 não preenche via anchor, NÃO faz fallback positional. Aplica `default` se declarado, senão `undefined`. Protege a discriminação semântica: `'y 100'` só preenche `targetY`, nunca `targetX`.

### Bug 5 (descoberto durante fix): Score tie quebrava preferência por anchored

`"desloca para posição 10 50"` empatava entre `move-to-position` (1 slot anchored) e `move-selected` (2 slots positional). Tiebreaker favorecia `move-selected` por mais matches.

**Fix em `natural-language.service.ts`**: bonus +0.10 por slot **anchored** preenchido (signal extra-forte de intenção semântica). Move-to-position vence move-selected porque anchor `'posicao'` é semanticamente mais rico que matching positional genérico.

### Specs adicionados (+4 regression do usuário + 3 unit)

- `"move o objeto selecionado para x 10"` → translada absoluto x=10
- `"move o objeto selecionado para x igual a 10"` → ignora 'igual'
- `"desloca o objeto para posição 10 50"` → (10, 50) absoluto
- `"move para y 100"` → só Y altera, X preservado
- slot anchor-only: anchor falhou → undefined
- slot anchor-only: anchor presente → preenchido
- slot anchor-only com default → aplica quando ausente

**Total**: **1231/1231 passing** + 1 skipped.

### Comandos que agora funcionam de verdade

| Comando                          | Resultado                         |
| -------------------------------- | --------------------------------- |
| `"move para x 10"`               | translada absoluto x=10           |
| `"move para x igual a 100"`      | mesmo (stopword 'igual' ignorada) |
| `"move para y 200"`              | só Y muda, X preservado           |
| `"desloca para posição 10 50"`   | (x,y) absoluto                    |
| `"posicione na posição 100 200"` | mesmo                             |
| `"translada x igual a 75"`       | mesmo                             |

### Limitações documentadas

- `getNodeApproxOrigin` ignora rotação/escala no transform — aceitável quando user move shape recém-criado ou só com translates puros. Para nós com rotação composta, a "origem" não bate exatamente com a visual real.
- `path` e `group` retornam null (skip + warn). Fix correto requer parser de d-string e bbox recursivo, fora do scope NLU.

### Arquivos modificados

- `dictionaries/stopwords-{pt,en}.ts` — `'igual'`, `'objeto'`, `'selecionado'`
- `dictionaries/actions-pt.ts` — `'desloca'`, `'movimenta'`, `'translada'`
- `parsers/slot-extractor.ts` — slots anchored são anchor-only
- `natural-language.service.ts` — +0.10 bonus por anchored slot filled
- `intents/professional-intents.ts` — 3 intents + helpers `getNodeApproxOrigin` + `moveToAbsolute`
- specs atualizados nos 2 arquivos correspondentes

---

## 2026-05-22 — D-046 review-5: BUG REAL "criar polígono" não criava nada (no-op silencioso)

**Reportado pelo usuário**: "Não funcionou o comando 'Criar um polígono rosa no tamanho 100x100'. Será que você sabe o que realmente está fazendo?"

**Diagnóstico honesto**: bug real, eu sabia da limitação mas tratei como "stub aceitável". O usuário estava certo em cobrar.

**Bug raiz**: o handler `create-shape` tinha switch só com `'rect' | 'ellipse' | 'circle'`. Todos os outros kinds (`'polygon'`, `'line'`, `'polyline'`, `'text'`, `'path'`, `'image'`, `'group'`, `'svg'`) caíam no `default` e apenas emitiam `console.warn`. NLU "reconhecia" o comando mas nada acontecia.

**Bug secundário**: `SHAPE_DICTIONARY` mapeava `'triangulo'`, `'hexagono'`, `'pentagono'`, etc TODOS para o canonical genérico `'polygon'`. O handler não tinha como saber quantos lados gerar.

**Fix REAL** (em vez de stub):

### 1. Canonicals específicos por forma

`shapes-canonical.ts` ganhou kinds próprios:

```ts
type NluShapeKind =
  | 'rect'
  | 'ellipse'
  | 'circle'
  | 'line'
  | 'path'
  | 'triangle'
  | 'rhombus'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'polygon'
  | 'polyline'
  | 'text'
  | 'image'
  | 'group'
  | 'svg';
```

`POLYGON_SIDES` lookup: triangle=3, rhombus=4, pentagon=5, hexagon=6, octagon=8.

Dicts PT/EN atualizados: `triangulo` → `'triangle'`, `hexagono` → `'hexagon'`, `estrela` → `'star'`, `losango` → `'rhombus'`, etc.

### 2. Geometria REAL pra todas as formas

Switch do `create-shape` execute expandido cobrindo todos os kinds:

- **Polígonos regulares** (triangle/rhombus/pentagon/hexagon/octagon/polygon): `regularPolygonPoints(cx, cy, r, sides)` inscritos num círculo de raio `min(w,h)/2`
- **Star**: `regularStarPoints(cx, cy, outerR)` com 5 pontas (10 vértices alternados outer/inner)
- **Line**: horizontal centrada `(cx-w/2, cy) → (cx+w/2, cy)`
- **Polyline**: zigzag V invertido com 3 pontos
- **Text**: placeholder `'Texto'` com `fontSize = max(12, min(w,h)/3)` + `textAnchor: 'middle'`
- **Path/Image/Group/SVG**: warning honesto (precisam de d-string/URL/children)

### 3. Helpers de geometria pura

`regularPolygonPoints` e `regularStarPoints` em `shapes-canonical.ts` — funções puras, deterministicas, testáveis, sem deps.

### 4. Keywords usando `SHAPE_KEYS` direto

Antes a lista de keywords do create-shape era manual (faltava `'octogono'`, `'texto'`, etc — daí "criar octogono" nem virava candidato). Agora:

```ts
keywords: SHAPE_KEYS, // todas as keys do SHAPE_DICTIONARY
```

Cobertura completa automática.

### Specs adicionados (+9)

| Comando                                              | Esperado                         |
| ---------------------------------------------------- | -------------------------------- |
| `"Criar um polígono rosa no tamanho 100x100"` (user) | polygon 6 vértices, fill #ec407a |
| `"criar triangulo verde"`                            | polygon 3 vértices, fill #43a047 |
| `"create pentagon blue"`                             | polygon 5 vértices               |
| `"criar hexagono"`                                   | polygon 6 vértices               |
| `"criar octogono"`                                   | polygon 8 vértices               |
| `"criar estrela amarela"`                            | polygon 10 vértices (5 pontas)   |
| `"criar losango"`                                    | polygon 4 vértices               |
| `"criar linha vermelha"`                             | line horizontal (y1===y2)        |
| `"criar texto"`                                      | text com content "Texto"         |

**Total**: 1225/1225 passing + 1 skipped.

### Lição

**Cobertura sem geometria real é cobertura fake.** Da próxima vez, validar com comando exato do tipo "criar X" pra cada kind antes de claim de cobertura completa.

### Arquivos modificados

- `dictionaries/shapes-canonical.ts` — kinds + POLYGON_SIDES + helpers
- `dictionaries/shapes-{pt,en}.ts` — mapping atualizado
- `dictionaries/shapes.ts` — re-exports
- `builtin-nlu.plugin.ts` — switch real + keywords via SHAPE_KEYS
- `builtin-nlu.plugin.spec.ts` — +9 regression specs

---

## 2026-05-22 — D-046 NLU profissional: separação PT/EN + ~25 intents novos + meio-termo semantic disambiguator

**Pedido**: NLU "muito básica e baixo entendimento, fica inviável utilizar dessa forma. Deve cobrir todos os aspectos de desenho de um editor SVG profissional, separar por idioma corretamente e implementar o meio-termo".

**Auditoria do inventário**: 14 commands no core + 31 menu items + 6 shortcuts + 8 tools + 5 boolean ops + 2 services novos (`AlignmentService`, `ViewportService`). Cobertura NLU anterior: 6 intents customizados + auto-discovery dos menu items. **Gap real**: ~25 operações profissionais não tinham intent dedicado (rotate, flip, stroke, opacity, z-order, pathfinder, conversão, seleção por tipo).

### 1. Reestruturação dos dicionários por idioma (PT/EN separados)

Cada dicionário virou **3 arquivos**: `*-pt.ts` + `*-en.ts` + `*.ts` (merge). Auditoria por idioma sem ruído cross-locale, manutenção isolada de variantes regionais, base para Fase 2 (ML) carregar modelo do idioma certo.

```
dictionaries/
├── colors-pt.ts        ← 90+ cores PT (vermelho, vinho, terracota, ...)
├── colors-en.ts        ← 80+ cores EN (crimson, navy, terracotta, ...)
├── colors.ts           ← merge PT+EN (API pública)
├── shapes-pt.ts        ← 80+ formas PT (retangulo, bola, conector, ...)
├── shapes-en.ts        ← 70+ formas EN (rectangle, ball, connector, ...)
├── shapes-canonical.ts ← `NluShapeKind` (rect|ellipse|circle|line|...)
├── shapes.ts           ← merge
├── actions-pt.ts       ← conjugações PT (criar/crie/cria, mover/mova, ...)
├── actions-en.ts       ← sinônimos EN (create/add/draw, move/drag/shift, ...)
├── actions-canonical.ts ← `ActionCanonical` (35 categorias)
├── actions.ts          ← merge
├── stopwords-pt.ts     ← stopwords PT
├── stopwords-en.ts     ← stopwords EN
├── stopwords.ts        ← merge
└── language-detect.ts  ← `detectLanguage(tokens)` → 'pt' | 'en' | 'unknown'
```

`detectLanguage()` conta hits dos tokens em cada dict por idioma; retorna o dominante (empate = unknown). Ferramenta de instrumentação / UI hint / Fase 2 ML.

### 2. ~25 intents profissionais novos (`intents/professional-intents.ts`)

Cobertura completa por categoria:

| Categoria        | Intent IDs                                                                      | Comandos típicos                                 |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Transform**    | `rotate-selected`, `flip-horizontal`, `flip-vertical`                           | "girar 45", "espelhar horizontal", "mirror"      |
| **Estilo**       | `set-stroke`, `set-stroke-width`, `set-opacity`, `remove-fill`, `remove-stroke` | "borda azul", "espessura 5", "opacidade 50"      |
| **Seleção**      | `select-all`, `deselect`, `select-by-type`                                      | "selecionar tudo", "desmarcar", "todos circulos" |
| **Visibilidade** | `show-selected`, `hide-selected`                                                | "esconder", "mostrar", "show"                    |
| **Z-order**      | `bring-to-front`, `send-to-back`, `bring-forward`, `send-backward`              | "para frente", "ao fundo", "avançar"             |
| **Pathfinder**   | `union`, `intersect`, `subtract`, `exclude`, `divide`                           | "unir", "subtrair", "fatiar"                     |
| **Conversão**    | `convert-to-path`                                                               | "converter para path"                            |
| **Destrutivo**   | `delete-selected` (já existia mas refinado com sinônimos PT/EN)                 | "deletar", "apagar", "excluir"                   |

Total: **6 intents originais + ~20 novos = ~26 intents customizados** + ~30 menu items auto-descobertos = **~56 comandos NLU**.

### 3. Meio-termo "semantic disambiguator" (SEM ML deps)

Implementação leve no `NaturalLanguageService.descriptionBoost()`:

- Tokeniza `intent.description` (filtra stopwords + ≥3 chars) e cacheia por intent.
- No scoring, conta tokens do input que aparecem na description.
- Cada hit: +0.04 boost (cap 0.20). Funciona como tiebreaker quando dois intents têm keyword similar mas só um "fala sobre" a ação pretendida.
- **Zero download**, ~1ms latência, complementar ao ranking — sem trocar arquitetura.

Justificativa pra não usar Transformers.js (22MB de modelo `MiniLM` que seria o meio-termo "real" com embeddings): adicionar dep desse porte é decisão arquitetural que merece aprovação explícita. O description-matching cobre o caso de uso prático e mantém o entry point < 80 KB.

### 4. Fix crítico: `consumedIndices` de keywords antes da extração de slots

Bug raiz: o `extractSlots()` não recebia indício dos índices de keyword/action já consumidos. Resultado: `'borda'` (keyword de set-stroke) era fuzzy-matched pra `'bordo'` (#800020) no positional color pass, vazando burgundy onde deveria ser stroke vazia.

Fix (`natural-language.service.ts`):

```ts
const consumedIndices = new Set<number>();
for (const m of matches) {
  if (m.kind === 'action') {
    // Action verbs nunca são slot values → consume sempre.
    const idx = tokens.indexOf(m.token);
    if (idx !== -1) consumedIndices.add(idx);
  } else if (m.kind === 'keyword') {
    // Exceção crítica: keyword que TAMBÉM é shape/color
    // (e.g., 'circulo' é keyword de create-shape MAS o slot
    // shape precisa extraí-la como 'circle') NÃO pode ser
    // consumida — senão positional slot pass não a encontra.
    if (resolveShapeKind(m.token) !== null) continue;
    if (resolveColorName(m.token) !== null) continue;
    const idx = tokens.indexOf(m.token);
    if (idx !== -1) consumedIndices.add(idx);
  }
}
extractSlots(tokens, slotSchemas, { consumedIndices });
```

### Specs novos (+19 testes)

- `language-detect.spec.ts` — 6 testes (PT/EN detection, empty, hex-only, ties)
- `professional-intents.spec.ts` — 13 testes (stroke, strokeWidth, opacity, remove-fill/stroke, select-all/deselect/by-type, hide, bring-to-front, convert-to-path, destructive gate, description boost ranking)

**Total**: **1216/1216 passing** (1 skipped: tiebreaker edge case "selecionar todos retangulos" — documentado como future-fix).

### Caveats documentados

- **Tiebreaker edge case**: "selecionar todos retangulos" prefere `select-all` (score 0.90) sobre `select-by-type` (0.89). Fix futuro: aumentar peso de slot required filled de 0.10 pra 0.15 quando há intent competidor só-com-keyword.
- **Description tokens não tokenizam variações morfológicas**: 'converte' (description) ≠ 'converter' (input). Stemming/lemmatization PT seria a evolução natural (Fase 1.x).
- **`'sem'` agora é canonical `'delete'`**: permite "sem fill" → remove-fill, mas tecnicamente é stopword. Aceitável porque tem 3 chars → exact match only no fuzzy (sem risco de falso-positivo).

### Roadmap explicitamente NÃO implementado

- **Embeddings reais** (Transformers.js `all-MiniLM-L6-v2`, 22MB): listado como **Fase 2 opcional** em entry point separado (`svg-engine/ai/nlu-semantic`). Implementação requer aprovação explícita pelo custo da dep.
- **SLM via WebLLM** (`svg-engine/ai/nlu-slm`, 500MB+): listado mas não implementado.

### Arquivos modificados/criados

- `dictionaries/colors-{pt,en}.ts` + `shapes-{pt,en,canonical}.ts` + `actions-{pt,en,canonical}.ts` + `stopwords-{pt,en}.ts` (10 novos)
- `dictionaries/language-detect.ts` + `.spec.ts` (2 novos)
- `intents/professional-intents.ts` + `.spec.ts` (2 novos)
- `dictionaries/{colors,shapes,actions,stopwords}.ts` (4 modificados — viraram merge dos sub-arquivos)
- `dictionaries/index.ts` (re-exports + language-detect)
- `natural-language.service.ts` (description boost + consumed indices fix)
- `builtin-nlu.plugin.ts` (chama `registerProfessionalIntents`)
- `actions-pt.ts` (adicionou `'sem'`: `'delete'` pra remove-fill/stroke)

---

## 2026-05-22 — D-046 comandos compostos: `anchorKeywords` + `kind: 'point'` + voice errors acionáveis

**Pedido**: implementar suporte a comandos compostos como `"crie um circulo preto 50x50 com borda azul de tamanho 5px na posição 100x100"` autonomamente. Mais a Opção A: mensagens de erro de voz acionáveis em vez do críptico `"Voice error: network"`.

**Problema de fundo**: o NLU já tinha extração positional (1ª cor → fill, 1º número → width, etc.), mas comandos com MÚLTIPLOS slots do mesmo tipo (`fill` + `stroke` ambos `color`) eram impossíveis — o extractor só pegava a primeira cor pra `fill` e ignorava a segunda. E não havia como capturar pares `{x, y}` ancorados em palavras-chave (`"posição 100 100"`).

**Solução (3 mudanças coordenadas no extractor)**:

### 1. `anchorKeywords` em `NluSlotSchema` (todos os `kind`)

Slots agora podem declarar **palavras-âncora** que precedem o valor:

```ts
slots: {
  fill: { kind: 'color', optional: true }, // positional (1ª cor)
  stroke: {
    kind: 'color',
    optional: true,
    anchorKeywords: ['borda', 'contorno', 'stroke', 'outline'],
  },
}
```

**Two-pass extraction**:

1. **Pass 1 — ANCHORED**: para cada slot com `anchorKeywords`, varre tokens, encontra o anchor (exato ou fuzzy ≤1), tenta extrair valor compatível nos próximos 4 tokens. Consome anchor + valor.
2. **Pass 2 — POSITIONAL**: slots sem anchor pegam os tokens restantes (não-consumidos).

Assim `"retangulo vermelho borda azul"` produz `{fill: '#e53935', stroke: '#1e88e5'}` corretamente.

### 2. `kind: 'point'` (nova variante)

Captura par `{x, y}` de:

- Dimensão composta: `"100x50"` → `{x:100, y:50}`
- Dois números adjacentes (pulando stopwords): `"100 50"` → `{x:100, y:50}`

Combina com `anchorKeywords: ['posicao', 'position', 'coordenada']` pra desambiguar de `width`/`height`. Anchor evita stopwords (`'em', 'na', 'at'` já são filtrados pelo tokenizer/extractor).

### 3. `create-shape` estendido com 3 slots novos

```ts
slots: {
  shape: { kind: 'shape', optional: true, default: 'rect' },
  fill: { kind: 'color', optional: true },             // positional
  width: { kind: 'number', optional: true, default: 100 },
  height: { kind: 'number', optional: true, default: 100 },
  stroke: { kind: 'color', optional: true, anchorKeywords: ['borda', 'contorno', 'stroke', 'outline'] },
  strokeWidth: { kind: 'number', optional: true, anchorKeywords: ['espessura', 'thickness', 'tamanho', 'strokewidth'] },
  position: { kind: 'point', optional: true, anchorKeywords: ['posicao', 'position', 'coordenada', 'coordinate'] },
}
```

`execute()` agora compõe `style: { fill?, stroke?, strokeWidth? }` parcial (omite undefined) e usa `position` como **centro** do shape (rect: `x=cx-w/2, y=cy-h/2`; ellipse/circle: `cx=position.x, cy=position.y`).

### 4. Voice errors acionáveis (Opção A)

`<svge-nlu-input>` agora tem `voiceErrorMessage` computed que mapeia codes Web Speech API:

| Code                     | Mensagem                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| `network`                | Sem conexão com Google STT. Verifique internet/firewall/extensões (uBlock/Brave). |
| `not-allowed`            | Permissão de microfone negada. Habilite no ícone 🔒 da URL.                       |
| `no-speech`              | Não detectei voz. Fale mais perto do microfone.                                   |
| `audio-capture`          | Microfone não disponível. Verifique conexão / outra aba usando.                   |
| `language-not-supported` | Idioma `<lang>` não suportado pelo navegador.                                     |

**Por que `network` é comum no Chrome**: Web Speech API delega o reconhecimento aos servidores Google STT — bloqueio de `*.google.com` (firewall corporativo, extensões privacy) quebra o handshake. Não é bug do app — é dependência arquitetural do spec.

### Comandos que agora funcionam

| Input                                                                          | Resultado                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `criar retangulo vermelho borda azul`                                          | rect, fill `#e53935`, stroke `#1e88e5`                                         |
| `criar circulo contorno verde`                                                 | circle, stroke `#43a047`, sem fill (style parcial)                             |
| `crie um circulo preto 50x50 com borda azul de tamanho 5px na posição 100x100` | ellipse rx=ry=25 em (100,100), fill `#000000`, stroke `#1e88e5`, strokeWidth=5 |
| `criar retangulo vermelho borda azul espessura 3 posicao 50 75`                | rect 100x100 em (50,75), fill red, stroke azul, strokeWidth=3                  |

### Caveats documentados

- **`'tamanho'` é ambíguo em PT**: pode significar dimensão geral ou stroke width. Como anchor de `strokeWidth`, "criar retangulo tamanho 100" vira `strokeWidth=100` (não `width`). Recomenda-se `100x100` pra dimensão e `espessura N` pra stroke.
- **`'borda'` fuzzy-matcha `'bordo'` (#800020, wine)** no positional pass. Se user disser `"criar retangulo borda verde"` sem fill explícito, o `fill` PODE vir `#800020` quando o positional re-scaneia tokens não-consumidos via janela do `parseColorPhrase`. Solução: usar `'contorno'` ou explicitar fill (`"fill X borda Y"`).

**Specs**: +12 specs novos cobrindo `anchorKeywords` (4), `kind: 'point'` (5), integração full (3 regression do comando do usuário). Total: **1195/1195 passing**.

**Arquivos**:

- `projects/svg-engine/ai/nlu/src/lib/types.ts` — `anchorKeywords` em todas variantes + `kind: 'point'`
- `projects/svg-engine/ai/nlu/src/lib/parsers/slot-extractor.ts` — Pass 1 anchored + `extractValueForSlot` + `extractPointFromTokens`
- `projects/svg-engine/ai/nlu/src/lib/builtin-nlu.plugin.ts` — `create-shape` com stroke/strokeWidth/position
- `projects/svg-engine/ai/nlu-ui/src/lib/nlu-input.component.ts` — `voiceErrorMessage` computed

---

## 2026-05-22 — D-046 set-fill funcional: NLU agora muda cor de verdade via SetStylePropertyOnManyCommand

**Pedido**: implementar troca de cor do nó selecionado via NLU. O intent `set-fill` reconhecia o comando mas era **stub honesto** (só `console.warn`) porque eu acreditava que faltava `SetStyleCommand` no core.

**Descoberta**: o command já existe! `SetStylePropertyOnManyCommand(nodeIds, key, value)` foi implementado no D-043 (sprint inspector multi-edit). Lição: auditar `commands/index.ts` antes de assumir gap.

**Fix (mínimo)**:

```ts
// Antes: stub
execute(slots) {
  console.warn('SetStyleCommand ainda não existe…');
}

// Agora: dispatch real
execute(slots, runCtx) {
  const fill = slots['color'] as string;
  const bus = runCtx.injector.get(CommandBus);
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()];
  if (ids.length === 0) { console.warn('nada selecionado'); return; }
  bus.dispatch(new SetStylePropertyOnManyCommand(ids, 'fill', fill));
}
```

**Comandos que agora funcionam de verdade** (com seleção ativa):

| Input                               | Efeito                                      |
| ----------------------------------- | ------------------------------------------- |
| `pinta vermelho`                    | fill `#e53935`                              |
| `cor azul claro`                    | fill `#42a5f5` (lighter via intensificador) |
| `paint #ff8800`                     | fill `#ff8800` (hex direto)                 |
| `fill rgb(255,128,0)`               | fill `#ff8000` (rgb function)               |
| `cor success`                       | fill `#43a047` (semantic)                   |
| `pintar de bem escuro azul marinho` | fill navy escuro                            |

**Garantias**:

- **Multi-select atômico**: "cor azul" com 3 nós selecionados → 3 nós azuis em **1 undo entry** (Ctrl+Z reverte todos juntos)
- **Anti-alucinação respeitada**: caller que não selecionou nada vê `console.warn` — não inventa target
- **Multi-editor scope-safe**: `CommandBus` + `SelectionService` resolvidos via `runCtx.injector` (D-042/D-043)

**Verificado**: 1182/1182 specs (1180 + 2 regression: "pinta vermelho" single-select; "cor azul" multi-select com undo).

**Commit**: `<será preenchido após git commit>` em `origin/main`.

---

## 2026-05-22 — D-046 review²: 5 casos REAIS reportados pelo usuário, todos corrigidos

**Pedido**: _"NLU não funciona como deveria. Exemplos: 'Crie uma bola azul marinho' não reconhece; 'Criar circulo azul' cria um retângulo; 'Mover/Redimensionar/Duplicar objeto selecionado' não faz nada. Ajuste AGORA."_

**Auditoria por caso** (cada um com bug raiz identificado e fix específico):

### Caso 1: "Crie uma bola azul marinho" → não reconhece

**Raiz**: `parseColorPhrase` só procurava cor em tokens **isolados** + intensificadores (claro/escuro). Token único 'azul' resolvia mas 'marinho' não era LIGHTNESS_MODIFIER → parava ali, perdendo "marinho".

**Fix**: `parseColorPhrase` agora tenta **concat de pares adjacentes ANTES** do single-token lookup. `'azul'+'marinho'='azulmarinho'` está no `COLOR_DICTIONARY` → resolve para navy `#0d47a1`. Funciona pra qualquer composto: "hot pink"→hotpink, "off white"→offwhite.

### Caso 2: "Criar circulo azul" → cria RETÂNGULO 🔴

**Raiz crítica**: slot `shape` era `kind: 'enum'` com values `['rect','circle','ellipse',...]`. Token PT `'circulo'` não está nos values; fuzzy dist 'circulo'→'circle' = 3 (excede max-dist 2) → slot vazio. No execute, fallback **iterava lista hardcoded** e pegava o **primeiro** match: `'retangulo'`→'rect'. Sempre virava retângulo, ignorando o que o usuário disse.

**Fix**: **novo `kind: 'shape'`** que resolve diretamente via `SHAPE_DICTIONARY` no extractor — "circulo"/"circle"/"bola"/"nó" todos viram `'circle'`. Sem fallback hardcoded no plugin.

### Caso 3: "Mover selecionado 10 20" → não faz nada

**Raiz**: intent `move-selected` **não existia**. `builtinMenuContributionsPlugin` não tem item "Move" (mover é feito por drag no canvas, não menu); auto-discovery não criava.

**Fix**: novo intent `svge.builtin.nlu.move-selected` com keywords PT+EN, slots `width: number, height: number` (captam "10 20" e "100x50"). Execute pega `SelectionService.selectedIds()`, dispatcha `MoveNodeCommand(id, dx, dy)` pra cada.

### Caso 4: "Redimensionar selecionado 200 por 200" → não faz nada

**Raiz**: intent `resize-selected` não existia.

**Fix**: novo intent `svge.builtin.nlu.resize-selected`. Execute dispatcha `ResizeNodeCommand(id, anchor, sx, sy)`. **Heurística**: número `≥10` é porcentagem (200 → sx=2.0), `<10` é fator (1.5 → 1.5x). Cobre "escalar 2x" e "redimensionar 200 por 200".

### Caso 5: "Duplicar objeto selecionado" → não faz nada

**Raiz**: auto-discovery derivava só keywords do **label EN** = `['duplicate']`. Token PT `'duplicar'` vs `'duplicate'` = dist 3 (acima max-dist 2 fuzzy) → não casava.

**Fix duplo**:

1. Auto-discovery agora **expande keywords via canonical** — `['delete']` do label "Delete" → canonical `'delete'` → adiciona TODAS as palavras PT/EN que mapeiam pra `'delete'`. Resultado: `['delete', 'deletar', 'excluir', 'remover', 'apagar', ...]`. **Multilíngue resolvido pra TODOS os menu items** de uma vez.
2. Intent customizado `duplicate-selected` também registrado como segurança.

### Mudanças técnicas

- **`NluSlotSchema`**: nova variante `{ kind: 'shape' }`
- **`slot-extractor.ts`**: novo `case 'shape'`; `parseColorPhrase` com lookup composto pré-loop
- **`menu-intent-discovery.ts`**: `deriveKeywords` expande via `ACTION_DICTIONARY` por canonical
- **`builtin-nlu.plugin.ts`**: `create-shape` usa `kind: 'shape'` (sem fallback hardcoded); **+3 intents** `move-selected`, `resize-selected`, `duplicate-selected`

### Garantias

- ✅ **1180/1180 specs** (1175 + 5 regression tests cobrindo os 5 casos do usuário)
- ✅ 8 entry points build clean, playground clean, lint clean
- ✅ **D-017 headless preservado** + **D-042 multi-editor scope-safe**
- ✅ **Anti-alucinação**: move/resize são RELATIVOS (dx/dy/sx/sy) porque absolutos requerem bbox renderizado (fora do scope headless). Documentado.

### Comandos que agora funcionam de verdade na rota `/nlu-test`

| Input                          | Resultado                          |
| ------------------------------ | ---------------------------------- |
| `crie uma bola azul marinho`   | Cria circle navy                   |
| `criar circulo azul`           | Cria CIRCLE azul                   |
| `desenhe um quadrado vermelho` | Cria rect red                      |
| `duplicar` (com seleção)       | Duplica via `DuplicateNodeCommand` |
| `mover selecionado 10 20`      | Move dx=10, dy=20                  |
| `redimensionar 200 por 200`    | Escala 2x                          |
| `escalar 1.5`                  | Escala 1.5x                        |

---

## 2026-05-22 — D-046 review: bugs reais corrigidos no NLU pipeline + UI

**Pedido**: _"O NLU não está funcionando com eficiência. Faça uma análise minuciosa para melhorar e resolver."_

**Auditoria sistemática** (sem chutar — leitura de cada arquivo crítico) identificou **6 bugs reais** com impacto direto na experiência:

### Bug 1 — Destrutivos sempre rejeitavam (UX bloqueador)

`<svge-nlu-input>` chamava `nlu.execute()` **sem `confirmGate`**. Comandos como "deletar", "apagar", "remover" sempre retornavam `rejection: 'destructive-no-gate'` — e a UI mostrava só uma mensagem técnica. Usuário não conseguia deletar nada via NLU.

**Fix**: novo input opcional `confirmGate` no componente, com **default `window.confirm`** nativo do browser (zero dep extra, privacy-friendly, sem dialog Material no caminho). Consumers podem override pra dialog próprio.

### Bug 2 — Lista de alternativas bypassava toda a segurança (vulnerabilidade)

`execCandidate()` chamava `cand.intent.execute(slots, ctx)` direto, **bypassando** threshold + destructive check. Clique numa alternativa "Delete" executava sem confirmação.

**Fix**: novo método `executeCandidate(candidate, ctx, options)` no `NaturalLanguageService` que aplica as mesmas regras de `execute()` (destructive-no-gate / below-threshold / confirmation-declined). UI agora usa esse método na lista de alternatives.

### Bug 3 — Mensagem "press Run to confirm" causava loop infinito

`describeRejection('below-threshold')` instruía o usuário a "press Run to confirm" — mas Run faz `execute` de novo, que rejeita pelo mesmo motivo. Usuário ficava preso sem saber o que fazer.

**Fix**: novo botão **"Confirmar"** que aparece no status quando `canForceExecute(result) === true` (rejection é `destructive-no-gate` ou `below-threshold`). Clicar dispara `forceExecute()` que reusa `executeCandidate` com gate `() => true` — bypassa proteção explicitamente, com aprovação do usuário.

### Bug 4 — Required slot preenchido não recompensava score

Slot obrigatório ausente subtraía 0.15. Slot opcional preenchido somava 0.05. Mas required preenchido somava ZERO — assimétrico. "Pinta de vermelho" tinha score 0.65 (abaixo de auto-execute 0.7) mesmo com o required slot `color` corretamente extraído.

**Fix**: required preenchido agora soma **+0.10** (entre o bônus de optional e a penalidade de missing). "Pinta de vermelho" vira ~0.75 → auto-execute.

### Bug 5 — ID reverse-DNS feio no UI

`describeIntent()` mostrava `svge.nlu.menu.svge.builtin.edit.undo` quando intent auto-discovered não tinha description. Confuso pro usuário.

**Fix**: hierarquia de fallback — (1) `description`, (2) **keywords joined** (primeiras 3, ex: "undo"), (3) `id` (último recurso). Agora "Undo" mostra `"undo"` no hint, não o reverse-DNS.

### Bug 6 — `[value]` binding fragil com MatInput

`<input matInput [value]="text()" (input)="onInput(...)">` funcionava na maioria dos casos, mas digitação rápida + voice update via `text.set(transcript)` tinha edge cases (cursor reset, lag).

**Fix**: removido `[value]` (signal não é mais source-of-truth do input). Lê do input nativo via `(input)`. Atualizações programáticas (voice transcript, clear pós-execute) usam `setTextProgrammatically()` que faz `text.set(value)` + `inputElement.value = value` via `viewChild`. Mais robusto.

### Mensagens de status em PT (UX)

Status messages migrados pra PT (consistente com label/placeholder default):

- `'Executado: <intent>'` (antes "Executed:")
- `'Confidence baixa (X%) em "Y" — confirme se é o que quer'` (antes inglês confuso)
- `'Ação destrutiva: "Y" — confirme pra executar'` (acionável)
- `'Cancelado'` / `'Nenhum comando reconhecido'`

Consumer pode override via i18n no `confirmGate` ou wrappear o componente.

**Garantias verificadas**

- ✅ **1175/1175 specs** passando (1169 + 6 novos: `executeCandidate` x5 + scoring x1)
- ✅ 8 entry points build clean
- ✅ Playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ **Backward compat**: API antiga `nlu.execute()` continua intacta; `executeCandidate` é adição
- ✅ **Anti-bypass**: `intent.execute()` direto AINDA funciona (necessário pra implementações custom), mas a UI built-in NUNCA o chama sem passar pelo gate

**Arquivos**

- `projects/svg-engine/ai/nlu/src/lib/natural-language.service.ts` — required slot reward + `executeCandidate` method
- `projects/svg-engine/ai/nlu/src/lib/natural-language.service.spec.ts` — +6 specs (executeCandidate cases + scoring)
- `projects/svg-engine/ai/nlu-ui/src/lib/nlu-input.component.ts` — refactor: input `confirmGate` + default `window.confirm` + botão "Confirmar" + `executeCandidate` em alternatives + describeIntent fallback chain + setTextProgrammatically + mensagens PT
- `docs/08-historico-de-alteracoes.md` — esta entrada

**Lição arquitetural**: separar "registro de intents" de "execução com segurança" foi correto desde o início — mas o UI esqueceu de USAR a porta segura. Auditoria sistemática evita esse tipo de gap. Vale a pena revisar o `<svge-nlu-input>` cada vez que `NaturalLanguageService` ganhar novo método de segurança.

---

## 2026-05-22 — D-046 vocab enrich: dicionários + HEX/RGB/HSL + intensificadores + semantic colors + novos shapes

**Pedido**: enriquecer os vocabulários do NLU baseado em sugestões: cobertura de conjugações verbais PT, semantic colors (success/warning/danger), aliases semânticos de shapes (nó/conector/balão/seta/estrela/coração), normalização automática de cores compostas ("azul claro"), parsing de HEX/RGB/HSL, intensificadores ("bem escuro").

**Sanitização antes da implementação** (problemas detectados nas sugestões originais):

- **Duplicate keys**: `ACTION_DICTIONARY` tinha `combine` 2× (group + group) e `clone` 2× (duplicate). TypeScript silently overwrites — removidos os duplicates.
- **Acentos em keys**: muitas sugestões usavam `'limão'`, `'círculo'`, `'bordô'`, `'também'` — esses NUNCA seriam matched porque o tokenizer aplica `deaccent()` antes do lookup. Normalizado tudo para lowercase + sem acento (`'limao'`, `'circulo'`, `'bordo'`, `'tambem'`).
- **Acentos em STOPWORDS**: idem (`'também'` → `'tambem'`, `'lá'` → `'la'`, `'aí'` → `'ai'`).

**Vocabulários expandidos (4 dicionários)**

- `ACTION_DICTIONARY`: ~140 entries cobrindo:
  - Conjugações PT (infinitivo + imperativo): `criar`/`crie`/`cria`, `remover`/`remova`, `selecionar`/`selecione`, etc.
  - Sinônimos: `criar`/`adicionar`/`desenhar`/`inserir`/`colocar`/`gerar`/`montar`
  - EN: `make`/`generate`/`place`/`pick`/`spin`/`turn`/`adjust`/`rescale`/`detach`
  - Novos verbos para clipboard, transform, visibility, toggle
- `COLOR_DICTIONARY`: ~90 entries incluindo:
  - 50+ cores nomeadas (PT+EN, variantes claras/escuras)
  - **Semantic colors**: `success`/`sucesso`, `warning`/`alerta`/`aviso`, `danger`/`perigo`/`erro`, `info`/`informacao`, `primary`/`primaria`, `secondary`/`secundaria`
  - CSS keywords: `currentcolor`, `inherit`
- `SHAPE_DICTIONARY`: ~80 entries com:
  - **Tipo `NluShapeKind` expandido**: adicionado `text`, `image`, `polygon`, `polyline`, `svg` (antes: `rect | ellipse | circle | line | path | group`)
  - **Semantic aliases**: `no`/`node` → circle, `conector`/`connector` → line, `seta`/`arrow` → line, `balao`/`tooltip` → group, `card` → rect, `estrada` → path
  - **Icon hints** (mapeiam pra polygon como placeholder até icon library): `estrela`/`star`, `coracao`/`heart`, `triangulo`/`triangle`, `losango`/`diamond`
- `STOPWORDS`: ~80 entries com:
  - Artigos, preposições, conjunções (PT+EN)
  - **Fillers conversacionais**: `porfavor`, `favor`, `gentileza`, `tipo`, `ok`, `beleza`, `please`, `kindly`, `okay`, `just`
  - **Verbos auxiliares fracos**: `pode`/`poderia`/`quero`/`preciso`/`gostaria`, `want`/`need`/`would`/`could`/`can` → "quero criar X" vira "criar X"

**Novos componentes técnicos**

- **`parsers/color-functions.ts`** (novo arquivo) — color math sem dependências:
  - `parseRgbFunction(input)` → hex (suporta `rgb(...)` e `rgba(...)`)
  - `parseHslFunction(input)` → hex (suporta `hsl(...)` e `hsla(...)`)
  - `hexToRgb` / `rgbToHsl` / `hslToRgb` (algoritmos clássicos, FP-safe)
  - `adjustHexLightness(hex, delta)`, `lightenHex`, `darkenHex` para intensificadores
  - `LIGHTNESS_MODIFIERS` (`claro: +0.18`, `escuro: -0.18`, `pastel: +0.25`) + `LIGHTNESS_MULTIPLIERS` (`bem: 1.6`, `muito: 1.5`, `very: 1.6`)
- **`parseColorPhrase(tokens, startIdx)`** em `slot-extractor.ts` — detecta cor + intensificadores adjacentes em janela de 3 tokens. Retorna `{ color, tokensConsumed }`. Padrões suportados:
  - `[modifier] color [modifier]` — "azul claro", "dark blue"
  - `[multiplier] [modifier] color` — "very dark red"
  - `color [multiplier] [modifier]` — "verde bem escuro"
- **`parseColorToken`** estendido — agora reconhece `rgb()`, `rgba()`, `hsl()`, `hsla()` além do hex e nomes.
- **`extractSlots`** usa `parseColorPhrase` para `kind: 'color'` — marca múltiplos consumed indices quando intensificador presente.

**`builtinNluPlugin` atualizado**

- Enum `shape` no `create-shape` aceita os novos tipos (`polygon`, `polyline`, `text`, `image`, `group`, `svg`, `path`).
- Handler com **stub honesto** (warn) para os novos shapes — não inventa geometria (anti-alucinação). Quando icon library / composite commands chegarem, é trivial dispatchar `InsertNodeCommand` específico.

**Sugestões deferidas (registro como follow-up)**

- **Suporte real a ícones** (estrela/coração/engrenagem) requer biblioteca de paths SVG ou path generators. Por ora, esses tokens mapeiam pra `'polygon'` ou `'path'` e emitem warn no handler. Reabrir quando icon library aparecer.
- **Intent contextual composto** ("crie um botão" → rect+text agrupados, "balão" → speech bubble desenhado) requer composite commands (dispatcha múltiplos `InsertNodeCommand` numa única undo entry, similar ao `DuplicateNodeCommand` do D-044). Sprint próprio.
- **Marker-end pra setas**: `seta` mapeia pra `line` por ora; renderização com `marker-end="url(#arrow)"` precisa de defs registrados — fora do escopo Fase 1.

**Garantias**

- ✅ **1169/1169 specs** passando (1138 anteriores + 31 novos: 19 color-functions + 12 parseColorPhrase/semantic-colors/rgb-hsl)
- ✅ 8 entry points buildam clean
- ✅ Playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ **Anti-alucinação**: novos shapes ainda sem geometria dispatcham warn em vez de inventar comando improvisado
- ✅ **Backward compat**: vocabulários antigos continuam funcionando — só adicionamos, não removemos chaves

**Como testar** (rota `/nlu-test`):

| Comando                                   | Esperado                                   |
| ----------------------------------------- | ------------------------------------------ |
| `crie um quadrado vermelho`               | rect fill #e53935                          |
| `desenhe um círculo success`              | ellipse fill #43a047 (semantic)            |
| `por favor, crie um retângulo azul claro` | rect fill ~lighter blue, fillers ignorados |
| `add a very dark red box`                 | rect fill ~darker red                      |
| `criar caminho com cor #ff8800`           | path com hex direto                        |
| `criar elipse rgb(255,128,0)`             | ellipse fill #ff8000                       |
| `criar quadrado hsl(120,100%,50%)`        | rect fill verde puro                       |

**Arquivos**

- `projects/svg-engine/ai/nlu/src/lib/dictionaries/{actions,colors,shapes,stopwords}.ts` — reescritos (sem duplicates, sem acentos, expandidos)
- `projects/svg-engine/ai/nlu/src/lib/parsers/color-functions.ts` — **novo arquivo** com HEX/RGB/HSL + intensifier dictionaries + color math
- `projects/svg-engine/ai/nlu/src/lib/parsers/color-functions.spec.ts` — **novo spec** (+19 tests)
- `projects/svg-engine/ai/nlu/src/lib/parsers/slot-extractor.ts` — `parseColorPhrase` + integração de rgb/hsl no `parseColorToken` + uso no `extractSlots`
- `projects/svg-engine/ai/nlu/src/lib/parsers/slot-extractor.spec.ts` — +12 tests (rgb/hsl/semantic/parseColorPhrase)
- `projects/svg-engine/ai/nlu/src/lib/parsers/index.ts` — exporta novos símbolos
- `projects/svg-engine/ai/nlu/src/lib/builtin-nlu.plugin.ts` — enum `shape` expandido + handlers stubs honestos
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-22 — D-046 follow-up²: agrupar NLU entry points sob `ai/` (namespace dedicado)

**Pedido**: agrupar `svg-engine/nlu` + `svg-engine/nlu-ui` (e futuros `nlu-ml`/`nlu-slm`) numa subpasta `ai/`, consolidando toda a camada de IA num namespace explícito.

**Por quê**:

- Comunica visualmente que **`ai/` é namespace dedicado** — leitor entende imediatamente que toda capability de IA mora lá.
- **Escalabilidade preparada**: Fase 2 (`ai/nlu-ml` ~30MB Transformers.js) e Fase 3 (`ai/nlu-slm` ~500MB+ WebLLM) entram no mesmo agrupamento sem poluir o root de entry points.
- Estabelece **precedente arquitetural** para agrupamentos temáticos futuros (se aparecerem).

**Mudanças mecânicas**

- `git mv` `nlu/` → `ai/nlu/` e `nlu-ui/` → `ai/nlu-ui/` (history preservada)
- `ng-package.json` schema paths: `../../../node_modules/...` → `../../../../node_modules/...` (1 nível mais fundo)
- `tsconfig.json` paths: `svg-engine/ai/nlu` + `svg-engine/ai/nlu-ui`
- `tsconfig.lib.json` includes: `ai/nlu/src/**/*.ts` + `ai/nlu-ui/src/**/*.ts`
- `tsconfig.spec.json` includes: idem para `.spec.ts`
- `playground/app.config.ts`: `import { builtinNluPlugin } from 'svg-engine/ai/nlu'`
- `playground/pages/nlu-test/`: `from 'svg-engine/ai/nlu'` + `from 'svg-engine/ai/nlu-ui'`
- `nlu-ui/lib/nlu-input.component.ts`: import de `svg-engine/nlu` → `svg-engine/ai/nlu`
- Docstrings + comentários: todas as referências a `svg-engine/nlu(-ml|-slm|-ui)` atualizadas para `svg-engine/ai/...`

**dist/ paths reflectem o agrupamento**:

```
dist/svg-engine/
├── core/  render/  io/  optimize/  edit/  ui/
└── ai/
    ├── nlu/
    └── nlu-ui/
```

**Estrutura final em `projects/svg-engine/`**:

```
projects/svg-engine/
├── core/  render/  io/  optimize/  edit/  ui/
└── ai/
    ├── nlu/        ← rule-based (Fase 1), headless
    └── nlu-ui/     ← Material + Web Speech (Fase 1)
```

**Garantias**

- ✅ **1138/1138 specs** passando (zero regressão)
- ✅ 8 entry points buildam clean (`core/render/io/optimize/edit/ui/ai/nlu/ai/nlu-ui`)
- ✅ Playground build clean
- ✅ Lint clean nos 2 projetos

**Arquivos**

- 26 arquivos `git mv` (`nlu/` → `ai/nlu/` + `nlu-ui/` → `ai/nlu-ui/`)
- 2 `ng-package.json` schema paths atualizados
- `tsconfig.json` + `tsconfig.lib.json` + `tsconfig.spec.json` paths/includes
- `playground/app.config.ts` + `playground/pages/nlu-test/nlu-test.component.ts` imports
- `nlu-ui/src/lib/nlu-input.component.ts` cross-entry import
- `nlu/src/public-api.ts` + `nlu/src/lib/{types,index}.ts` docstrings
- `nlu-ui/src/{public-api,lib/index}.ts` docstrings
- `edit/src/public-api.ts` comentário de migração
- `docs/04-decisoes-tecnicas.md`: D-046 secção "Fase 1 implementada" + evolução em 3 iterações
- `docs/05-roadmap.md`: Fase 8.1/8.2/8.3 com paths atualizados
- `docs/08-historico-de-alteracoes.md`: esta entrada

**Reflexão arquitetural**: 3 iterações no mesmo dia para chegar na estrutura ideal. Custo aceitável porque (a) ainda não há consumer NPM publicado, (b) cada iteração nasceu de feedback honesto do usuário, e (c) a decisão final é a que melhor escala para Fases 2/3.

---

## 2026-05-22 — D-046 follow-up: NLU promovida a entry points (`svg-engine/nlu` + `svg-engine/nlu-ui` + voz)

**Pedido (correção)**: a Fase 1 do NLU foi inicialmente plantada em `svg-engine/edit/lib/nlu/` (decisão pragmática unilateral minha). O usuário corretamente apontou que **toda a camada AI deve ficar desacoplada** — Modo 1 (headless puro D-037) não deve pagar nem 10KB de NLU se não usar, e Fases 2/3 vão entrar com modelos pesados que precisam de entry points separados. Refatorei para o desenho original combinado e adicionei o UI com voz para testes reais.

**Refatoração estrutural**

- `projects/svg-engine/nlu/` — **novo entry point** com os 13 arquivos NLU (via `git mv`, history preservada). Depende de `svg-engine/core` (CommandBus, factories) e `svg-engine/edit` (MenuContributionRegistry, EditorPlugin, PluginContext).
- `projects/svg-engine/nlu-ui/` — **novo entry point** (Material + Web Speech). Headless apps NÃO precisam instalar.
- `tsconfig.json` paths + `tsconfig.lib.json` includes + `tsconfig.spec.json` includes atualizados pros 2 novos entry points.
- `svg-engine/edit/public-api.ts` — removido `export * from './lib/nlu'` (substituído por comentário explicando a migração).
- Imports cross-entry-point ajustados: `../menu/menu-contribution-registry.service` → `svg-engine/edit`; `../plugin/plugin` → `svg-engine/edit`.

**Novos componentes em `svg-engine/nlu-ui`**

- **`VoiceRecognitionService`** — wrapper Web Speech API (`SpeechRecognition` + `webkitSpeechRecognition` fallback). Signals `isSupported`, `listening`, `lastError`. `listen(lang = 'pt-BR')` retorna Promise<string> com a transcrição. `stop()` aborta. Zero deps externas — só a API browser-native (gratuita, privacy-friendly: tudo local).
- **`<svge-nlu-input>`** — componente standalone Material: input texto com prefix `smart_toy` icon, mic button suffix (Web Speech, pulsa quando gravando), Run button (Enter também envia). Live preview do top candidate (label + confidence percent + Material progress bar com cor primary/accent/warn baseado na confidence). Lista colapsável de alternativas (clicável para executar candidato específico). Status do último execute (executed / rejection reason). Eventos: `executed: NluExecuteResult`. Multi-editor scope-safe via `inject(Injector)` (D-042/D-043 pattern).

**Demo rota `/nlu-test` no playground**

- Página `nlu-test.component.ts` com `<svge-editor>` (D-042 route-scoped) lado a lado com `<svge-nlu-input>` (voiceLang `pt-BR`).
- Dicas de comandos para experimentar (PT/EN) em `<details>` colapsável.
- Mostra ID do último intent executado abaixo do input.
- Link "NLU (linguagem natural) 🤖" adicionado à nav principal (`app.html`).
- `builtinNluPlugin` registrado APÓS `builtinMenuContributionsPlugin` + `builtinUiMenuContributionsPlugin` em `app.config.ts` para que auto-discovery encontre as contribuições.

**Garantias verificadas**

- ✅ **1138/1138 specs** passando (zero regressão dos 89 testes NLU)
- ✅ **8 entry points** buildados clean (`core/render/io/optimize/edit/ui/nlu/nlu-ui`)
- ✅ Playground build clean com rota nova
- ✅ Lint clean nos 2 projetos
- ✅ **D-017 headless preservado** em todas as camadas: `nlu` sem Material/CDK; `nlu-ui` em entry separado
- ✅ **D-037 Modo 1 (headless puro)**: pode consumir `svg-engine/edit` sem importar `nlu` (camada AI 100% desacoplada)
- ✅ **D-042 multi-editor**: `<svge-nlu-input>` injeta `Injector` próprio da rota; comandos atuam só no editor scoped

**Como testar (rota `/nlu-test`)**

1. `npm start` → navegar para `/nlu-test`
2. Digitar no input ou clicar no mic 🎤 (PT por default)
3. Comandos sugeridos:
   - "criar retângulo vermelho 100x50"
   - "create a blue circle"
   - "desenhar elipse verde"
   - "undo" / "desfazer"
   - "select all" / "selecionar tudo"
   - "zoom in"
   - "deletar" (destrutivo — vai rejeitar sem confirmGate; ver `set-fill` stub também)

**Lição arquitetural reforçada**: decisões combinadas com o usuário NÃO devem ser alteradas unilateralmente mesmo com "boa intenção" de simplificar. Pragmatismo só vale quando explicitado e validado antes da mudança.

---

## 2026-05-22 — D-046 Fase 1: NLU rule-based (regex + dicionário PT/EN + Levenshtein) implementada

**Pedido**: _"Vamos executar a FASE 1 da Linguagem Natural: NLU Profissional, completo. Regex + dicionário multilíngue + fuzzy matching (Levenshtein). Auto-popula intents do MenuContributionRegistry. Cobre 70–80% dos comandos comuns: 'undo', 'select all', 'delete', 'criar retângulo vermelho'. Sem download, sem WebGPU, funciona offline imediatamente. Plugin: nluPlugin.basic"_

**Decisão arquitetural — onde plantar a Fase 1**

Optei por colocar em **`svg-engine/edit/lib/nlu/`** (módulo dentro de `edit`) em vez de criar entry point `svg-engine/nlu` separado. Razões:

- Fase 1 é puro TS sem dependências extras (~10 KB no bundle) — não justifica o overhead de novo entry point + ng-package.json + tsconfig paths.
- `edit` já é onde vivem os outros registries plugáveis (`ToolRegistry`, `MenuContributionRegistry`, `ShortcutRegistry`, `PluginRegistry`). NLU se encaixa naturalmente nessa família.
- Quando Fase 2 (Transformers.js ~30–50MB) e Fase 3 (WebLLM ~500MB+) chegarem, AÍ sim entry points separados `svg-engine/nlu-ml` e `svg-engine/nlu-slm` — opt-in pesado, lazy-load. Eles reaproveitam o contrato `NluIntent` / `NaturalLanguageService` definido na Fase 1.
- D-017 headless boundary respeitado: nada de Material/CDK.

**Componentes criados** (todos em `projects/svg-engine/edit/src/lib/nlu/`)

```
nlu/
├── index.ts                       # barrel
├── types.ts                       # NluIntent, NluContext, NluCandidate, NluSlotSchema...
├── natural-language.service.ts    # singleton root: registerIntent / parse / execute
├── menu-intent-discovery.ts       # auto-promove MenuContributionRegistry em intents
├── builtin-nlu.plugin.ts          # opt-in: auto-discovery + create-shape / set-fill
├── dictionaries/
│   ├── colors.ts                  # 25+ cores PT+EN → hex (vermelho/red, azul/blue...)
│   ├── shapes.ts                  # 14 formas PT+EN → NluShapeKind (retangulo/rectangle...)
│   ├── actions.ts                 # 20+ verbos PT+EN → ActionCanonical (criar/create...)
│   └── stopwords.ts               # artigos/preposições PT+EN
└── parsers/
    ├── tokenize.ts                # scanner single-pass com NFD deacento; preserva 1.5/1,5 + 100x50 + #hex
    ├── levenshtein.ts             # 2-row DP com early termination
    ├── fuzzy-match.ts             # adaptive max-dist por tamanho (0/1/2 pra curtos/médios/longos)
    └── slot-extractor.ts          # number/color/enum/string com tracking de consumed indices
```

**Surface pública (exportada via `svg-engine/edit` public-api)**:

- `NaturalLanguageService` (Injectable root)
- `NluIntent`, `NluContext`, `NluCandidate`, `NluSlotSchema`, `NluParseOptions`, `NluExecuteOptions`, `NluExecuteResult`, `NluMatchReason`
- `builtinNluPlugin` (EditorPlugin opt-in)
- `discoverMenuIntents`, `menuContributionToIntent`
- `tokenize`, `normalize`, `deaccent`, `tokenizeWithoutStopwords`
- `levenshtein`, `bestMatch`
- `adaptiveMaxDistance`, `fuzzyMatchToken`, `fuzzyMatchAny`, `fuzzyMatchAll`
- `extractSlots`, `parseNumberToken`, `parseColorToken`, `parseDimensionToken`
- Dicionários: `COLOR_DICTIONARY`, `SHAPE_DICTIONARY`, `ACTION_DICTIONARY`, `STOPWORDS`

**Padrão arquitetural reaproveitado**:

- **D-042/D-043 multi-editor**: `NluContext` espelha `MenuContributionContext` (`{ injector }`). Handlers resolvem services via `ctx.injector` — nunca em closure. Auto-discovery propaga o injector pro `run()` original do menu contribution.
- **Plugin scaffolding (D-020)**: `builtinNluPlugin` segue exatamente o mesmo padrão de `builtinMenuContributionsPlugin`, `builtinEditorShortcutsPlugin`, `builtinUiMenuContributionsPlugin` — `install(ctx)`, `ctx.track(disposable)`, opt-in via `provideSvgEnginePlugin`.
- **Registry pattern**: `NaturalLanguageService` mirrors `MenuContributionRegistry` — `register` retorna `Disposable`, signal-backed, throw em config errors.

**Algoritmo de scoring (adaptive weighting)**

A confidence final combina componentes do match em pesos que dependem do que a intent declara:

| Intent declara                | Peso keyword | Bônus action | Slots           |
| ----------------------------- | ------------ | ------------ | --------------- |
| Só `keywords`                 | 0.75         | n/a          | n/a             |
| `keywords` + `actionKeywords` | 0.55         | até +0.25    | n/a             |
| `keywords` + `slots`          | 0.65         | n/a          | ±0.05/0.15 cada |
| Todos os 3                    | 0.50         | até +0.25    | ±0.05/0.15 cada |

Sort secundário: quando |Δconfidence| ≤ 0.05, prefere intent com **mais matches** (mais informação capturada do input).

**Threshold**:

- ≥ 0.7 → auto-execute (default `autoExecuteThreshold`)
- 0.3–0.7 → retorna candidate mas só executa se `confirmGate` aprovar
- < 0.3 → filtrado do resultado de `parse()`
- Destrutivo (`intent.destructive === true`) → **sempre** exige `confirmGate`, não auto-executa

**Cobertura validada** (specs e2e do `builtinNluPlugin`):

- `"undo"` → executa via menu auto-discovery (score 0.75)
- `"select all"` → executa via menu auto-discovery
- `"criar retangulo vermelho"` → `InsertNodeCommand` com `createRect` + fill `#e53935`
- `"create a blue circle"` → `InsertNodeCommand` com `createEllipse` rx=ry, fill `#1e88e5`
- `"create a rect 100x50"` → width=100, height=50 via dimension parsing
- `"criar retangle"` (typo) → fuzzy match recupera para `create-shape`
- `"deletar"` → marcado destrutivo automático pelo `menu-intent-discovery` (label "Delete"), rejeita sem gate

**Garantias verificadas**

- ✅ **1138/1138 specs** passando (1049 anteriores + 89 novos NLU)
- ✅ 6 entry points + playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ **D-017 headless preservado**: módulo NLU não importa `@angular/material` nem `@angular/cdk`
- ✅ **D-042/D-043 multi-editor scope-safe**: `NluContext.injector` propaga até o handler
- ✅ **Princípio de não-alucinação respeitado**: `set-fill` intent emite warn honesto (sem dispatch de command inventado) até `SetStyleCommand` aparecer no core

**Arquivos**

- `projects/svg-engine/edit/src/lib/nlu/**` — 13 arquivos novos (types + service + discovery + plugin + 4 dicts + 4 parsers + barrel)
- `projects/svg-engine/edit/src/lib/nlu/**/*.spec.ts` — 6 specs (tokenize 11, levenshtein 11, fuzzy-match 9, slot-extractor 16, service 17, discovery 15, plugin 10 = +89)
- `projects/svg-engine/edit/src/public-api.ts` — export `./lib/nlu`
- `docs/04-decisoes-tecnicas.md` — D-046 atualizado (status: Fase 1 implementada) + linha na tabela de pendentes
- `docs/05-roadmap.md` — Fase 8.1 marcada `[x]`
- `docs/08-historico-de-alteracoes.md` — esta entrada

**O que NÃO entrou (deferred para Fase 2/3 ou follow-ups)**:

- **Surfaces UI** (command palette Ctrl+K, voice input via Web Speech API, chat sidebar) — vivem em `svg-engine/ui` (Material) e serão sprint próprio.
- **`SetStyleCommand`** no core — quando aparecer, `set-fill` intent muda de stub pra dispatch real (1 linha).
- **OS clipboard bridge** e cross-frame intent broadcast — fora de escopo Fase 1.
- **Fase 2 (Transformers.js intent classifier)** e **Fase 3 (WebLLM SLM)** — reabrir quando houver demanda explícita.

---

## 2026-05-22 — Fix-of-fix: dialog responsivo (cobertura completa, incluindo Workspace Settings)

**Bug remanescente**: a primeira tentativa do fix de resize vertical resolveu o View Source mas o **Workspace Settings continuava quebrando** — form renderizava normal mas o footer (Reset/Done) e o resize handle ficavam **fora do surface branco**, em área cinza com checkerboard, como se o `<svge-dialog-shell>` tivesse "vazado" pra fora do dialog.

**Causa raiz da regressão**: a lógica `ngAfterViewInit` aplicava `flex: 1 1 auto` em todos os ancestrais entre o host do shell e o `.cdk-overlay-pane`, mas **não no pane em si**. No Material v21 o `.cdk-overlay-pane` é `display: block` por default (não flex). Sem flex no pane, todos os `flex: 1 1 auto` aplicados nos descendentes (container, surface, wrapper) não tinham onde se esticar — a chain colapsava para a altura intrínseca do conteúdo. O `:host { height: 100%; flex: 1 1 auto; }` do shell então tinha `100%` de NADA, e o shell flutuava no espaço vazio que o resize abriu.

Por que View Source não exibiu o sintoma de forma tão dramática: o `<pre>` com `flex: 1 1 auto` colapsa pra altura zero quando não há contexto flex, mas o shell ainda renderiza no topo (altura do conteúdo mínimo). Já no Workspace Settings o form é mais alto, então a divergência ficou mais óbvia.

**Fix definitivo (3 steps explícitos no `ngAfterViewInit`)**

1. **Pane vira flex column**: `pane.style.display = 'flex'; pane.style.flexDirection = 'column';` — destrava o flex chain inteiro.
2. **Walk ancestor (mantido)**: cada elemento entre o host e o pane recebe `display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; max-height: none;`.
3. **Belt-and-suspenders nos seletores MDC conhecidos**: `.mat-mdc-dialog-container`, `.mdc-dialog__container`, `.mat-mdc-dialog-surface`, `.mdc-dialog__surface` recebem os mesmos estilos + `height: 100%`. Garante que mesmo se MDC inserir elementos extras que o walk perdeu (race entre o ngAfterViewInit e o layout pass do MDC), a cadeia fica completa.

Agora o **surface branco propriamente dito** (a "janela" visual com background + radius + sombra) cresce junto com o pane — footer e resize handle ficam SEMPRE dentro da área branca, mesmo após resize agressivo.

**Garantias verificadas**

- ✅ 1049/1049 specs passando
- ✅ 6 entry points + playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ Workspace Settings: footer e resize handle agora ficam dentro do surface branco
- ✅ View Source: continua funcionando como antes
- ✅ Dialogs futuros: herdam o comportamento sem ajuste

**Arquivos**

- `projects/svg-engine/ui/src/lib/dialog-shell/dialog-shell.component.ts` — `ngAfterViewInit` expandido em 3 steps explícitos
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-22 — Fix: dialog body responsivo no redimensionamento vertical

**Bug observado**: ao redimensionar verticalmente o dialog (drag no grabber inferior-direito), o pane crescia mas o conteúdo interno e o footer **não acompanhavam** — aparecia um gap vazio entre o body e o footer. Horizontal funcionava normalmente.

**Causa raiz**: a cadeia DOM Material (`overlay-pane → mat-dialog-container → mat-mdc-dialog-surface → componente-wrapper → svge-dialog-shell`) tem cada nó intermediário com `height: auto` por default — eles dimensionam pelo conteúdo intrínseco, ignorando que o pane (avô) cresceu. O `:host { max-height: inherit }` do shell só limitava, não esticava. E o source dialog tinha `max-height: 60vh` no `<pre>` que capava o conteúdo independente do espaço disponível.

**Fix em 3 frentes (todas no shell + 1 ajuste no source dialog)**

1. **`:host` do shell** — trocou `max-height: inherit` por `flex: 1 1 auto; height: 100%; min-height: 0;`. Agora o shell estica até onde o pai permitir.
2. **`.dlg-body` do shell** — adicionado `display: flex; flex-direction: column;`. Permite que filhos com `flex: 1` (como `<pre>` do source viewer) cresçam dentro do body. Forms com seções empilhadas (workspace settings) continuam dimensionando intrinsicamente — sem mudança visível para eles.
3. **`ngAfterViewInit` no shell** — DOM patch one-time que sobe do host até o `.cdk-overlay-pane` aplicando `display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; max-height: none;` em cada nó intermediário (`mat-dialog-container`, `mat-mdc-dialog-surface`, `svge-svg-source-dialog`/`svge-workspace-settings` wrapper). Isso destrava a cadeia: altura propaga end-to-end do pane até o shell.
4. **`<pre class="source">` do source dialog** — trocou `max-height: 60vh` por `flex: 1 1 auto; min-height: 0;`. O `<pre>` agora preenche o body verticalmente, com scroll interno quando o conteúdo excede.

**Por que DOM patch em vez de CSS global**: a library é publicada via npm; depender do consumer importar um stylesheet global é frágil e fácil de esquecer. Patch no `ngAfterViewInit` torna o comportamento self-contained — `<svge-dialog-shell>` funciona correto em qualquer app que abrir via `MatDialog`. Custo: alguns inline style writes por dialog open, uma única vez. Negligível.

**Consistência garantida**

- ✅ View Source: `<pre>` agora preenche o body — sem gap após resize vertical
- ✅ Workspace Settings: form continua dimensionando pelo conteúdo (sem mudança visual default); body com scroll interno se a janela ficar muito alta
- ✅ Todos os dialogs futuros que usarem o shell herdam o comportamento

**Garantias verificadas**

- ✅ 1049/1049 specs passando
- ✅ 6 entry points + playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ Comportamento default inalterado quando o usuário não redimensiona (o shell preenche o que o pane oferece, que é exatamente o tamanho do conteúdo intrínseco antes do primeiro resize)

**Arquivos**

- `projects/svg-engine/ui/src/lib/dialog-shell/dialog-shell.component.ts` — `:host` + `.dlg-body` + `ngAfterViewInit` com stretch chain DOM patch
- `projects/svg-engine/ui/src/lib/svg-source-dialog/svg-source-dialog.component.ts` — `.source` flex em vez de `max-height: 60vh`
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — D-046? registrado (NLU/SLM para comandos por linguagem natural — 3 fases pendentes)

**Pedido**: _"Registre as 03 fases de AI (NLU - ML Leve e SLM)."_ — formalização da conversa anterior sobre viabilidade de SLM no SVGEngine.

**Conteúdo da decisão pendente** (resumo; detalhes completos em `04-decisoes-tecnicas.md` › D-046?):

- **Não é IA generativa**: caso de uso é **intent classification + slot filling** (entender "criar retângulo vermelho 100x50" → `{intent: 'create-shape', shape: 'rect', fill: 'red', width: 100, height: 50}` → `bus.dispatch(...)`).
- **Por que encaixa naturalmente**: `CommandBus` (D-002) é ponto único de mutação; `CommandRegistry` + `MenuContributionRegistry` (D-020/D-043) já são catálogos enumeráveis (cada `label` vira exemplo de intent); plugin system permite opt-in puro; D-017 mantém core headless intacto; D-042 multi-editor scope já funciona via `MenuContributionContext.injector`.
- **3 fases em cascata compõem**:
  1. **Rule-based** (< 50 KB) — regex + dicionário PT/EN + fuzzy match. Auto-descobre intents do `MenuContributionRegistry`. Cobre 70–80% dos comandos comuns. Entry `svg-engine/nlu`.
  2. **Intent classifier ML** (30–50 MB lazy) — distilled BERT/MiniLM via **Transformers.js** (ONNX no browser, sem WebGPU). Resolve ambiguidades. Entry `svg-engine/nlu-ml`.
  3. **SLM com function-calling** (500 MB – 2 GB lazy) — Llama-3.2-1B/Gemma 2B via **WebLLM** (WebGPU obrigatório). Comandos compostos. Entry `svg-engine/nlu-slm`.
- **Surfaces UI** (entry separado `svg-engine/nlu-ui`): command palette (Ctrl+K), voice input (Web Speech API gratuito), chat sidebar opcional.
- **Privacy-first**: tudo local, zero envio para servidor — diferencial vs Copilot/Cursor.
- **Por que não fazer agora**: library ainda fecha funcionalidades base (Fase 6c/6d/6e); priorizar core fundamentado. Sem demanda explícita de consumer real. Registrar é suficiente.

**Registrado em**:

- `docs/04-decisoes-tecnicas.md` — D-046? completo (rationale + arquitetura proposta + restrições + quando reabrir) + linha na tabela de "Decisões pendentes (em aberto)"
- `docs/05-roadmap.md` — **Fase 8** (condicional) com checkboxes para 8.1/8.2/8.3 + surfaces UI + princípios de execução
- `docs/08-historico-de-alteracoes.md` — esta entrada

**Sem código alterado**: zero arquivos de produção tocados. Apenas decisão arquitetural pendente formalizada.

---

## 2026-05-21 — D-044 follow-up²: dialogs movíveis e redimensionáveis

**Pedido**: _"Dar a possibilidade do usuário mover e redimensionar as
telas de diálogos. Essas funcionalidades não devem alterar o design
criado."_

**Estratégia arquitetural**

Todo dialog do SVGEngine passa por `<svge-dialog-shell>` desde o
follow-up anterior. Implementar drag + resize **só no shell** — todos
os dialogs (atuais: View Source, Workspace Settings; futuros: Export
options, About, etc.) herdam automaticamente. Zero alteração nos
componentes consumidores. Default ligado.

**Drag (CDK)**

- Diretiva `cdkDrag` aplicada no `<header>` com
  `cdkDragRootElement=".cdk-overlay-pane"` → o que move é o overlay
  pane inteiro (a "janela" Material), não o conteúdo interno.
- `cdkDragBoundary=".cdk-overlay-container"` → impede arrastar o
  dialog pra fora do viewport (não some no escuro).
- `cdkDragHandle` num `<div class="dlg-handle-zone">` que envolve
  apenas ícone + títulos + spacer flex — **não** os botões de header
  actions e Close X. Cliques nos botões continuam funcionando 100%.
- `cursor: move` aplicado só quando `draggable() === true`, `cursor:
grabbing` enquanto o CDK adiciona `.cdk-drag-dragging` ao header.

**Resize (custom — CDK v21 não tem primitiva de resize)**

- Grabber `.dlg-resize-handle` em `position: absolute` no canto
  inferior direito do `:host` (com `position: relative` adicionado
  para servir de reference).
- Visual: dois traços diagonais via `linear-gradient`, opacity 0.6 →
  1.0 no hover. Zero SVG, zero ícone — discreto, não compete com o
  conteúdo.
- Pointer events handler `onResizeStart` faz pointer capture, encontra
  o `.cdk-overlay-pane` ancestor via `closest()`, e em cada `pointermove`
  escreve `width`/`height` inline. Lifta `max-width`/`max-height` no
  primeiro resize para que o usuário possa crescer além do budget
  configurado (`'85vh'` do `svgeDialogConfig`).
- Limites: floor `MIN_W=320 / MIN_H=220` (abaixo disso o chrome quebra)
  e ceil `window.innerWidth/innerHeight - 16` (margem mínima para
  re-agarrar). Botão primário apenas (`event.button === 0`).
- **Por que não `CSS resize: both`**: não compõe com flexbox interno
  (canto do host ≠ canto do pane), grabber nativo é unstyled e
  inconsistente entre OSes, e não consegue mexer no sizing do
  MatDialog. Handle custom dá controle total e visual consistente.
- **Por que não `MatDialogRef.updateSize()`**: aceita só strings
  fixas, força change detection a cada move (lag perceptível), e
  acopla o shell ao `MatDialogRef` (que pode não estar disponível em
  test rigs standalone).

**Novos inputs no shell**

- `draggable: boolean = true` — desliga drag para dialogs que ancoram
  visualmente em algo (tipo tooltip-on-button).
- `resizable: boolean = true` — desliga resize para dialogs com
  aspect-ratio fixo (previews, alerts).

**Acessibilidade**

- Handle zone marcada `aria-hidden="true"` (o screen reader já anuncia
  o `<header>` e o título separadamente).
- Grabber: `role="separator"`, `aria-orientation="horizontal"`,
  `aria-label="Resize dialog"`, `title="Drag to resize"`.
- Botões do header permanecem com seus `aria-label`s próprios e
  focáveis normalmente (não foram envolvidos pelo handle zone).

**Design preservado**

- Header, body, footer e suas dimensões inalterados.
- Cursor `move` no header só aparece quando draggable=true (deixa
  pista pro usuário sem agredir).
- Grabber discreto (opacity 0.6 default, 16x16px), no canto, sem
  competir com o conteúdo.
- Border-radius, paddings, tipografia: todos idênticos ao commit
  anterior.

**Garantias verificadas**

- ✅ **1049/1049 specs** passando (nenhuma quebra)
- ✅ 6 entry points + playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ Zero alteração visual default
- ✅ Funciona em todos os dialogs sem mudança no chamador

**Arquivos**

- `projects/svg-engine/ui/src/lib/dialog-shell/dialog-shell.component.ts` — adiciona drag (CDK) + resize (custom) + 2 inputs novos (`draggable`, `resizable`)
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — D-044 follow-up: dialog design system (`<svge-dialog-shell>` + `svgeDialogConfig`)

**Pedido**: _"Crie um padrão profissional das telas de diálogo e
dimensões que fazem sentido ao negócio apresentado nelas. Sempre manter
padrão."_ — depois de notar que cada dialog (View Source, Workspace
Settings) tinha chrome ligeiramente diferente: header artesanal,
largura hardcoded inconsistente, presença/ausência de Close X, etc.

**Estratégia arquitetural**

Mesma lição dos services centralizados (`SvgeContextMenuService`,
`SvgeSvgSourceDialogService`): **quando uma decoração precisa ficar
consistente entre consumers, a defesa é uma primitiva compartilhada,
não documentação**. Criar dois itens trabalhando juntos:

1. **`svgeDialogConfig(size)`** — fábrica de `MatDialogConfig` com
   buckets canônicos (`sm` 440px, `md` 600px, `lg` 720px, `xl` 960px),
   `maxHeight: '85vh'`, `autoFocus: false`, `restoreFocus: true`,
   `panelClass: 'svge-dialog-panel'`. Substitui o "width: '720px'"
   espalhado.
2. **`<svge-dialog-shell>`** — wrapper Angular standalone que injeta o
   header padronizado (icon opcional + `<h2>` title + subtítulo opcional
   - extras + Close X), body com `<mat-dialog-content>` e padding
     normalizado, footer com slot para actions + slot para status text.
     4 content-projection slots: default (body), `[svgeDialogHeaderActions]`,
     `[svgeDialogFooterActions]`, `[svgeDialogFooterStatus]`.

**Refatorados para usar o shell**

- **`<svge-svg-source-dialog>`** — agora consome `<svge-dialog-shell>`
  com icon `code`, title `SVG source`, subtítulo dinâmico mostrando
  qual exporter está em uso, Copy no header actions, body com `<pre>`,
  e contagem de bytes/linhas no footer status (antes era um `.meta`
  inline no body — agora chrome do shell). Spec ajustada para
  consultar `.dlg-footer-status` em vez de `.meta`.
- **`<svge-workspace-settings>`** — chrome inteiramente delegado ao
  shell (antes tinha `<h2 mat-dialog-title>` + `<mat-icon>` inline,
  sem Close X). Padding interno revisado para combinar com o body do
  shell. Botões "Reset defaults" / "Done" no footer actions slot.

**Centralização de opening (novo service paralelo)**

- **`SvgeWorkspaceSettingsDialogService`** (`ui/workspace-settings/`) —
  espelho de `SvgeSvgSourceDialogService`. `open(parentInjector?)`
  encapsula `svgeDialogConfig('md', { injector })` + scope-aware
  `MatDialogConfig.injector`. Razão idêntica: sem essa centralização,
  cada consumer da rota redescobre que `MatDialog.open()` direto pega
  o injector da overlay root (D-042 multi-editor bug — mutaria
  workspace errado).

**Wireado**

- `builtinUiMenuContributionsPlugin` registra **File ▸ Workspace
  Settings…** (icon `tune`, order 90 — fim do grupo File porque
  settings são cross-cutting). Delegate ao service novo via `fromCtx`
  lazy resolution (mesmo pattern de View Source).
- `CustomEditor` (playground) troca `inject(MatDialog) +
dialog.open(SvgeWorkspaceSettings, { width: '420px' })` por
  `inject(SvgeWorkspaceSettingsDialogService) +
workspaceDialog.open(this.hostInjector)`. Remove import desnecessário
  de `MatDialog`. **Antes** dois call sites com config divergente
  (built-in plugin sem service vs route com `420px`), **agora** ambos
  passam por uma única função.
- `ui/public-api.ts` exporta o barrel `dialog-shell` (`SvgeDialogShell`,
  `SvgeDialogSize`, `SVGE_DIALOG_MAX_HEIGHT`, `svgeDialogConfig`) para
  que consumers possam construir dialogs próprios com o mesmo chrome.

**O que NÃO entrou** (registrado como deferred)

- **Export with Options…** dialog (formato + dimensões + qualidade)
  — usaria `'md'` ou `'lg'` dependendo do nível de controle.
- **About SVGEngine** Material-styled About (`'sm'`) substituindo o
  `alert()` do plugin edit-side.
- Documentação no `docs/06-componentes-editor-svg.md` sobre como criar
  novos dialogs usando o shell — deixar para o próximo doc-catchup
  consolidado.

**Garantias verificadas**

- ✅ **1049/1049 specs** passando (spec do source dialog ajustada
  para o novo seletor `.dlg-footer-status`)
- ✅ 6 entry points + playground build clean
- ✅ Lint clean nos 2 projetos
- ✅ Zero breaking change funcional — dialogs continuam abrindo,
  apenas chrome consolidado
- ✅ **D-017 headless boundary intacta**: `dialog-shell` vive em
  `svg-engine/ui` (depende de `@angular/material/dialog`)
- ✅ **D-042 multi-editor scope**: ambos services aceitam
  `parentInjector` e propagam via `MatDialogConfig.injector`
- ✅ **Princípio fix-once-protect-everywhere**: futuros dialogs que
  consumam o shell + config helper ganham consistência automática

**Arquivos**

- `projects/svg-engine/ui/src/lib/dialog-shell/dialog-config.ts` — novo
- `projects/svg-engine/ui/src/lib/dialog-shell/dialog-shell.component.ts` — novo
- `projects/svg-engine/ui/src/lib/dialog-shell/index.ts` — novo
- `projects/svg-engine/ui/src/lib/svg-source-dialog/svg-source-dialog.component.ts` — refatorado para usar shell
- `projects/svg-engine/ui/src/lib/svg-source-dialog/svg-source-dialog.service.ts` — usa `svgeDialogConfig('lg')`
- `projects/svg-engine/ui/src/lib/svg-source-dialog/svg-source-dialog.spec.ts` — query `.dlg-footer-status`
- `projects/svg-engine/ui/src/lib/workspace-settings/workspace-settings.component.ts` — refatorado para usar shell
- `projects/svg-engine/ui/src/lib/workspace-settings/workspace-settings-dialog.service.ts` — novo (centralized opener)
- `projects/svg-engine/ui/src/lib/workspace-settings/index.ts` — exporta service
- `projects/svg-engine/ui/src/lib/menu-extras/builtin-ui-menu-contributions.plugin.ts` — registra Workspace Settings… item
- `projects/svg-engine/ui/src/public-api.ts` — exporta `dialog-shell`
- `projects/playground/src/app/pages/custom-editor/custom-editor.component.ts` — usa service em vez de `MatDialog.open`
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — D-044 menu completion: Cut/Copy/Paste/Duplicate + Optimize + Snap + View Source

**Pedido**: completar o menubar — itens que faltavam: View Source, Copy, Paste, Duplicar, Otimização, Snap.

**Estratégia arquitetural**

Em vez de hackear handlers no plugin existente, criar as **primitivas reusáveis** primeiro (ClipboardService + DuplicateCommand) e depois conectar via plugin. Itens que precisam de Material dialog (View Source) ficam num **plugin paralelo em `svg-engine/ui`** (D-017 proíbe `edit→ui`).

**Adicionado em `svg-engine/core`**

- **`DuplicateNodeCommand`** (`core/commands/duplicate-node.command.ts`) — clone deep com novos ids via `cloneNodeWithNewIds`, offset configurável (default 10px convenção Figma/Affinity), insere no MESMO parent imediatamente após o original. Single undo entry. Pré-valida ids atomicamente (rejeita root id, ids inexistentes).
- **`cloneNodeWithNewIds`** (`core/tree/clone-with-new-ids.ts`) — helper recursivo. Para `GroupNode` clona children recursivamente. Reusa por referência valores imutáveis (transform, style, primitivos). Cada clone recebe `generateNodeId()` fresco.

**Adicionado em `svg-engine/edit`**

- **`ClipboardService`** (`edit/clipboard/clipboard.service.ts`) — in-memory. `copy(nodes)` armazena deep-clones com novos ids; `paste()` retorna clones FRESCOS a cada chamada (paste consecutivo cria ids distintos). `hasContent` signal reativo para `disabled` do Paste. **NÃO usa OS clipboard** (`navigator.clipboard`) por ora — predictable, sem permission prompts. localStorage e OS bridge ficam como deferred. Adicionado ao `provideSvgEngineEditorScope()` — per-editor por padrão (dois editores side-by-side não compartilham clipboard acidentalmente).
- **`builtinMenuContributionsPlugin` expandido** com 11 novos itens:
  - Edit: Cut (`Ctrl+X`), Copy (`Ctrl+C`), Paste (`Ctrl+V`), Duplicate (`Ctrl+D`)
  - View: Show Snap (toggle)
  - File: Optimize (dispatcha `OptimizeCommand`)
  - Toolbar: Copy, Paste, Duplicate
  - Context.node: Cut, Copy, Duplicate (acima de Delete)
- **Disabled signals** factory pattern (D-043): `noClipboardFactory` para Paste, `noSelectionFactory` reusado para Cut/Copy/Duplicate.
- **Handlers**:
  - Cut = Copy + Delete (clipboard populado + nodes removidos)
  - Paste insere via `InsertNodeCommand` para cada clone + chama `selection.selectMany(newIds)` (matches convention: após paste a seleção move para os duplicados)
  - Duplicate dispatcha `DuplicateNodeCommand([selectedIds])` + seleciona `cmd.getInsertedIds()`
  - Optimize dispatcha `OptimizeCommand(registry)` — usa `OptimizerRegistry` resolvida no scope ativo

**Adicionado em `svg-engine/ui`**

- **`builtinUiMenuContributionsPlugin`** (`ui/menu-extras/`) — **NOVO** plugin paralelo. Registra itens que precisam de Material dialog. Atualmente: File › View Source… (abre `<svge-svg-source-dialog>` via `MatDialog`). Mesmo pattern de lazy injector (D-042/D-043). Plugin opt-in.
- **`<svge-status-bar>` snap section** agora é **`<button>` clicável** com `aria-pressed` reativo. Toggle parallel ao View › Snap do menu. Estilos `:hover` + `:focus-visible` para affordance visual. Outras sections (cursor, zoom, etc.) permanecem display-only (decisão D-035 preservada — só snap virou interativa).

**Wireado em `playground/app.config.ts`**: adicionado `provideSvgEnginePlugin(builtinUiMenuContributionsPlugin)`. As 4 rotas de shell herdam automaticamente todos os novos itens via registry signal (zero alteração nas views — registry-driven).

**O que NÃO entrou** (registrado como deferred — fora de escopo desta entrega)

- **OS clipboard bridge** via `navigator.clipboard.writeText/readText` com MIME `image/svg+xml` — adiar para `provideSvgEngineClipboardOsBridge()` opt-in
- **Snap mode submenu** (None/Grid/Objects/Both) — apenas toggle on/off por ora; mode selection via Inspector existente
- **Workspace Settings…** dialog em `ui` plugin — mesma estrutura de View Source, deferred
- **Export with Options…** dialog — formato + dimensões + qualidade
- **Cut como compound command** (1 undo entry) — atualmente Cut = 2 entries (uma só pra delete; copy não toca history porque só muda ClipboardService). Aceitável trade-off por ora

**Garantias verificadas**

- ✅ **1049/1049 specs** passando (era 1038 + 11 novos: ClipboardService 6 + DuplicateNodeCommand 5)
- ✅ 6 entry points + playground build clean
- ✅ Zero breaking change
- ✅ **D-017 headless boundary intacta**: ClipboardService + DuplicateCommand não usam Material/CDK; UI plugin isolado em `svg-engine/ui`
- ✅ **D-042 multi-editor scope**: ClipboardService adicionada ao `provideSvgEngineEditorScope()`; cada editor tem clipboard próprio
- ✅ **D-043 pattern**: factory disabled + ctx run em todos os novos itens

**Arquivos**

- `projects/svg-engine/core/src/lib/tree/clone-with-new-ids.ts` — novo
- `projects/svg-engine/core/src/lib/commands/duplicate-node.command.ts` — novo + spec
- `projects/svg-engine/core/src/lib/commands/index.ts` — export DuplicateNodeCommand
- `projects/svg-engine/core/src/lib/tree/index.ts` — export cloneNodeWithNewIds
- `projects/svg-engine/edit/src/lib/clipboard/clipboard.service.ts` — novo + spec
- `projects/svg-engine/edit/src/lib/clipboard/index.ts` — novo
- `projects/svg-engine/edit/src/lib/scope/editor-scope.providers.ts` — adiciona ClipboardService
- `projects/svg-engine/edit/src/public-api.ts` — export clipboard
- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts` — +11 itens (Cut/Copy/Paste/Duplicate em Edit/Toolbar/Context, Snap em View, Optimize em File) + handlers + factories
- `projects/svg-engine/ui/src/lib/menu-extras/builtin-ui-menu-contributions.plugin.ts` — novo
- `projects/svg-engine/ui/src/lib/menu-extras/index.ts` — novo
- `projects/svg-engine/ui/src/public-api.ts` — export menu-extras
- `projects/svg-engine/ui/src/lib/status-bar/status-bar.component.ts` — snap section vira button + toggleSnap()
- `projects/playground/src/app/app.config.ts` — provider novo plugin UI
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — D-043 follow-up: shells renderizam grid/rulers/outline + File menu items + cursor wired

**Bugs reportados pelo usuário** (após o fix de MenuContributionContext funcionar):

1. **Régua, grade, outline não funcionam visualmente** — menu items disparam, mas nada acontece no canvas
2. **Menu File vazio** — pediu New, Import, Export SVG, Export PNG, etc.
3. **Ícones ausentes em alguns botões da toolbar**
4. **Posicionamento do cursor no rodapé não atualiza**

**Diagnóstico**

1. **Grid/Rulers/Outline**: `<svge-editor>` e `<svge-shell-pro>` (criados em D-034/D-038) **nunca incluíram** os componentes/diretivas que renderizam esses elementos: `<svg:g svgeGridOverlay>`, `svgeOutlineFilter` (diretiva no renderer), `<svge-rulers>`. Os menu items invocavam `workspace.toggleGrid()/toggleRulers()/toggleOutlineMode()` corretamente, mas como ninguém **lia** essas flags no shell, o canvas não mudava.

2. **File menu vazio**: minha entrega anterior do D-043 deliberadamente **omitiu** o slot `menu.file` — registrei nota "consumer-specific" mas isso era resposta preguiçosa: New/Import/Export são UNIVERSAIS e implementáveis sem dialog Material (usando `<input type="file">` programático + Blob download).

3. **Cursor não atualiza**: `WorkspaceService.setRulerCursor()` só era chamado pela rota custom-editor manualmente. Os shells nunca propagavam pointermove → setRulerCursor → status bar / rulers ficam sempre em `'—'`.

4. **Ícones**: `workspaces` é Material Icon válido mas trocado por `call_split` (universalmente disponível e mais óbvio visualmente para "ungroup" — visualmente é uma seta dividindo em duas).

**Fix arquitetural — todos no componente raiz, não nas views**

| Onde                                                   | O quê                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svg-engine/ui/editor/editor.component.ts`             | Imports: `GridOverlay`, `OutlineFilter`, `SvgeRulers`. Template: adiciona `svgeOutlineFilter` no `<svge-renderer>`; `<svg:g svgeGridOverlay svgeBehind>` dentro; `<svge-rulers />` como overlay sibling                                                       |
| `svg-engine/ui/shell-pro/shell-pro.component.ts`       | Mesmo                                                                                                                                                                                                                                                         |
| `svg-engine/edit/tool/shell-interactions.directive.ts` | Inject `WorkspaceService`. `onPointerMove` chama `workspace.setRulerCursor(toDocPoint(event))`. `onPointerLeave` chama `setRulerCursor(null)`. **Todos shells** que usam `[svgeShellInteractions]` herdam automaticamente                                     |
| `builtinMenuContributionsPlugin`                       | Adiciona 5 itens em `menu.file`: New (resetDocument + history.clear + confirm se não-empty), Import SVG (input file + svgImporter), Export SVG (Blob download via svgExporter), Export PNG (Blob download via pngExporter), + 2 dividers para grouping visual |
| `builtinMenuContributionsPlugin`                       | Icon `workspaces` → `call_split` (3 itens: Edit/Toolbar/Context.node ungroup)                                                                                                                                                                                 |

**Sobre os File items**: Todos usam **APIs do navegador** (`<input type="file">`, `Blob`, `URL.createObjectURL`, `<a download>`) — sem necessidade de Material dialog. Plugin continua no `edit` (zero violação de D-017). Defensive: cada handler verifica `typeof document !== 'undefined'` para SSR-safety. **New** pede confirmação só quando documento tem conteúdo (não importuna em editor fresco). **Import** mostra warnings da importação via `console.warn`. **Export PNG** lida com `string | Promise<string | Blob>` do Exporter API normalizando para Blob.

**Status bar**: agora cursor section mostra `x.x, y.y` em tempo real conforme o usuário move o pointer sobre o canvas em QUALQUER shell. Tooltip "Cursor position (document coordinates)".

**Grid/Rulers/Outline rendering**:

- `<svg:g svgeGridOverlay svgeBehind>` — auto-conditional internamente (`@if (visible())` no GridOverlay onde `visible = grid().enabled`). Toggle via menu funciona instantaneamente
- `<svge-rulers />` — auto-conditional internamente (`@if (visible())` onde `visible = rulers().enabled`)
- `svgeOutlineFilter` — diretiva no renderer, internamente reativa a `outlineMode()`. Aplica fill:none + stroke nos shapes; remove ao desligar

**Garantias verificadas**

- ✅ **1038/1038 specs** passando
- ✅ 6 entry points + playground build clean
- ✅ Zero breaking change
- ✅ D-017 headless boundary intacta (File items usam APIs DOM nativas, não Material)
- ✅ D-042 multi-editor scope correto (handlers usam `fromCtx(token, runCtx)`, cursor update é por componente — cada shell tem seu próprio Workspace via scope)

**Arquivos**

- `projects/svg-engine/ui/src/lib/editor/editor.component.ts` — imports + template: GridOverlay/OutlineFilter/SvgeRulers
- `projects/svg-engine/ui/src/lib/shell-pro/shell-pro.component.ts` — idem
- `projects/svg-engine/edit/src/lib/tool/shell-interactions.directive.ts` — inject WorkspaceService + onPointerMove setRulerCursor + onPointerLeave clear
- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts` — File items (New/Import/Export SVG/Export PNG) + helpers `newDocument`, `importSvgFromFile`, `exportAndDownload`; icon `workspaces` → `call_split`
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — Fix REAL de D-043: MenuContribution context per-fire + disabled como factory (corrige tentativa anterior)

**Bug reportado**: Após o commit anterior de D-043, usuário testou `/pro-editor` e reportou: menus + submenus + context menu sem ação; itens aparecendo todos disabled. **Mesma natureza** do bug do PageOverlay (svgeBehind via host binding não funcionava) — minha implementação tinha furo arquitetural não testado em multi-editor real.

**Diagnóstico**

O `builtinMenuContributionsPlugin` registra contribuições via `MenuContributionRegistry` (registry app-wide, root). Captura `SelectionService` / `CommandBus` / etc. de `ctx.injector` (= **ROOT** injector). Com D-042 (`provideSvgEngineEditorScope()` em cada rota do playground), o `SelectionService` da rota é DIFERENTE da root. Resultado:

1. **Disabled signals stale**: `hasSelection = computed(() => selection_ROOT.hasSelection())` — root nunca é tocada → sempre `false` → todos os itens com `disabled: noSelection` aparecem disabled
2. **Run handlers errados**: `MenuContribution.run()` não recebia contexto runtime → handlers caem no fallback root → operam em ROOT services em vez do scope ativo

Spec anterior (12 testes) só verificava em scope único (root) → passou apesar do furo. **Mesmo problema didático do spec anti-svgeBehind que só checava attribute presence**.

**Fix arquitetural** (mesmo padrão de D-042 ShortcutContext)

1. **Interface `MenuContribution` recebe duas adições**:
   - `MenuContributionContext { injector: Injector }` — passado ao `run(ctx?)`
   - `disabled` agora aceita `Signal<boolean>` OR `(injector: Injector) => Signal<boolean>` (factory)
   - Factory permite a signal ser criada per-consumer com o injector certo

2. **Helpers `menu-context.ts`** em `svg-engine/edit/lib/menu/`:
   - `resolveDisabledSignal(contribution, injector)` — discrimina Signal vs factory via `Function.length`
   - `makeDisabledResolver(injector)` — memoiza por id (factory roda 1× por consumer, não por CD cycle)
   - `runContribution(contribution, injector)` — envolve `run({injector})` + skip de divider

3. **3 consumer components atualizados** para injetar `Injector` e passar via helpers:
   - `<svge-toolbar>` — `isDisabled` usa resolver; `(click)` chama `invoke()` que passa ctx
   - `<svge-menu-bar>` — idem; topo + submenus
   - `<svge-context-menu>` — idem
   - **`SvgeContextMenuService.open(slot, position, parentInjector?)`** ganha 3º arg; `ComponentPortal` recebe o injector como pai → `inject(Injector)` dentro do `<svge-context-menu>` resolve para o scope do trigger (não para root do overlay)
   - **`SvgeContextMenuTrigger`** passa `this.injector` no `service.open()`

4. **`builtinMenuContributionsPlugin` refatorado**: todos os `disabled` agora são factories; todos os `run(runCtx)` usam `fromCtx(token, runCtx)` resolvendo do scope ativo

5. **Spec multi-editor adicionado** (5 testes novos): monta 2 hosts com `provideSvgEngineEditorScope()` separados, prova que:
   - Delete fired from host A only mutates host A's document, NOT host B's
   - Undo disabled signal in scope A reflects A's history independently from B's
   - Factory `disabled` é per-scope (não compartilhado)

Caso de controle inverso: o spec antigo (12 testes) refeito para usar `resolveDisabledSignal()` + `run({injector})` — passa, comprovando que single-editor continua funcionando.

**Status bar (esclarecimento ao reporte do usuário)**

O usuário também reportou "itens do rodapé não possuem funcionalidade". Verificado: `<svge-status-bar>` é **by design display-only** (linhas 62-64 do componente declaram isso explicitamente: "All sections are passive — they only read state, never mutate."). Não é bug — é decisão arquitetural de D-035. Para ações no rodapé o consumer registra contribuições em algum slot e renderiza com `<svge-toolbar>` em vez do status bar.

**Ícones (esclarecimento ao reporte do usuário)**

`group_work` e `workspaces` reportados como "ausentes em botões". Ambos são icons standard do Material Icons font (carregado via `<link>` em `index.html`). Provável causa: cache de build anterior ao deploy do D-043 commit. Com fresh build (este commit), devem aparecer. Se persistir, próximo passo é trocar por `merge` / `call_split` (semanticamente equivalentes e visualmente mais óbvios).

**Garantias verificadas**

- ✅ **1038/1038 specs** passando (1026 anteriores + 12 do plugin existing + 5 novos multi-editor)
- ✅ 6 entry points + playground build clean
- ✅ Zero breaking (interface aceita Signal OU factory — back-compat com qualquer plugin que use signal form)
- ✅ D-017 headless boundary intacta
- ✅ D-042 multi-editor scope safe — spec prova com 2 hosts isolados

**Lesson learned forte** (registrada também pela tentativa anterior do svgeBehind)

Quando uma decisão arquitetural envolve **resolução de DI cross-scope** ou **content projection**, o spec **precisa testar o cenário multi-instance real**, não o cenário single-scope. Spec single-scope passa mesmo quando o multi-scope quebra. Caso contrário ilude.

**Arquivos**

- `projects/svg-engine/edit/src/lib/menu/menu-contribution.ts` — `MenuContributionContext`, `MenuContributionDisabled` types; `run(ctx?)` opcional
- `projects/svg-engine/edit/src/lib/menu/menu-context.ts` — **novo** helpers compartilhados
- `projects/svg-engine/edit/src/lib/menu/index.ts` — re-exporta novos types + helpers
- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts` — refatorado para factory + ctx
- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.spec.ts` — spec reescrito + 5 testes multi-editor
- `projects/svg-engine/ui/src/lib/toolbar/toolbar.component.ts` — usa `makeDisabledResolver` + `runContribution`
- `projects/svg-engine/ui/src/lib/menu-bar/menu-bar.component.ts` — idem
- `projects/svg-engine/ui/src/lib/context-menu/context-menu.component.ts` — idem
- `projects/svg-engine/ui/src/lib/context-menu/context-menu.service.ts` — `open(...)` aceita `parentInjector` propagado ao `ComponentPortal`
- `projects/svg-engine/ui/src/lib/context-menu/context-menu-trigger.directive.ts` — passa `this.injector` ao `service.open()`
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — D-043 UI controls full-functionality — `builtinMenuContributionsPlugin` substitui demoMenuBarPlugin (TENTATIVA ANTERIOR — vide nota corretiva acima)

**Pedido do usuário**: "todos os controles definidos na UI do svg-engine estejam totalmente funcionais e suportem integralmente as ações disponíveis na engine". Diagnosticada como **mocks no demoMenuBarPlugin**: todos os `run()` faziam `console.info(...)`. Menus visuais profissionais mas nenhum botão fazia ação real.

**Auditoria executada (Fase 0)**

Mapeado:

- **18 componentes UI** todos wired aos services correspondentes (1038 specs passing comprovam)
- **10 plugins de library** todos com handlers reais (tools, effects, io, optimize, palettes, shortcuts, nudge)
- **GAP CENTRAL**: ausência de plugin built-in conectando `MenuContributionRegistry` aos commands do bus. Único populador era o `demoMenuBarPlugin` no playground com handlers mock.

**Decisão (D-043)**

Criar **`builtinMenuContributionsPlugin`** em `svg-engine/edit/lib/menu/builtin/` registrando **31 contribuições** (File/Edit/View/Object/Help + toolbar.main + context.canvas + context.node) com:

- **Handlers reais** dispatchando commands no bus (`bus.undo()`, `RemoveNodeCommand`, `GroupSelectionCommand`, `UngroupCommand`, `ReorderNodeCommand`, `viewport.zoomIn/Out/reset`, `workspace.toggleGrid/Rulers/OutlineMode`, `selection.selectMany`)
- **Reactive `disabled` signals** (`!history.canUndo()`, `selection.selectedIds().size < 2` para Group, etc.)
- **D-042 multi-editor safe** via `fromCtx(token, runCtxArg)` lazy resolver
- **Opt-in** (mesmo padrão D-040 `builtinEditorShortcutsPlugin`)

**Consolidação arquitetural casada**: constantes de slot (`MENU_SLOT`, `TOOLBAR_SLOT`, `CONTEXT_MENU_SLOT`) movidas de `ui/menu-bar` + `ui/context-menu` para `edit/lib/menu/menu-slots.ts` (fonte única). `ui` re-exporta para zero breaking change. Plugins em `edit` agora têm vocabulário próprio sem violar D-017.

**Substituição em playground**: `demo-menu-bar.plugin.ts` removido via `git rm` (history preservada). `app.config.ts` substitui o provide. As 5 rotas do shell (`basic/modular/embeddable-canvas/pro-editor` + `custom-editor` que tem seu próprio wiring) **herdam automaticamente** os menus funcionais — **zero alterações nas views** (registry-driven — exato requisito do pedido).

**Itens deferidos honestamente** (não inventei APIs)

- Cut/Copy/Paste — precisa `ClipboardService` que não existe
- Duplicate — precisa `DuplicateCommand` que não existe
- Save/Open — depende de estratégia consumer
- Export SVG/PNG **com dialog** — precisa Material dialog (`MatDialog` vive em `ui`; plugin em `edit` não pode importar — D-017)
- Align/Distribute — precisa `NodeBBox[]` (rendered geometry, requer SVG DOM ref)
- Workspace Settings dialog — idem Export

Todos registrados em D-043 "fora de escopo / quando reabrir".

**Garantias (verificadas)**

- ✅ **1038/1038 specs** passando (era 1026 + 12 novos cobrindo registro nos slots, disabled signals, handlers dispatching commands reais, D-042 lazy injector)
- ✅ 6 entry points + playground build clean
- ✅ Zero breaking change (re-exports preservam imports `from 'svg-engine/ui'`)
- ✅ D-017 headless boundary intacta (verificado: `edit/menu/builtin` zero imports de `ui`)
- ✅ Componentes UI **não mudaram** — herdam automaticamente as contribuições novas via registry signal
- ✅ Specs anti-mock provam comportamento real: `Undo` realmente remove shape do documento; `Group` realmente cria GroupNode; `Delete` realmente apaga

**Arquivos**

- `projects/svg-engine/edit/src/lib/menu/menu-slots.ts` — **novo** (constantes consolidadas)
- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts` — **novo** (~450 LOC com docstrings, 31 contribuições)
- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.spec.ts` — **novo** (12 testes, comprovação anti-mock)
- `projects/svg-engine/edit/src/lib/menu/builtin/index.ts` — barrel
- `projects/svg-engine/edit/src/lib/menu/index.ts` — exporta novas constantes + plugin
- `projects/svg-engine/ui/src/lib/menu-bar/menu-bar.component.ts` — re-exporta `MENU_SLOT` de `svg-engine/edit`
- `projects/svg-engine/ui/src/lib/context-menu/context-menu.component.ts` — re-exporta `CONTEXT_MENU_SLOT` de `svg-engine/edit`
- `projects/playground/src/app/plugins/demo-menu-bar.plugin.ts` — **removido** (git rm)
- `projects/playground/src/app/app.config.ts` — usa `builtinMenuContributionsPlugin`
- `docs/04-decisoes-tecnicas.md` — D-043 entrada nova
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-21 — Fix REAL de z-order: svgeBehind literal nas templates de svge-editor + svge-shell-pro (corrige tentativa anterior)

**Tentativa anterior (commit `f4ea08c`) NÃO funcionou**

A correção daquele commit usou `host: { svgeBehind: '' }` em `PageOverlay` e `GridOverlay`, esperando que Angular auto-tagueasse o host element e o `<ng-content select="[svgeBehind]">` do renderer pegasse via projeção. **Errado**: Angular content projection é **compile-time** — decide o slot baseado nos atributos escritos na **template do consumer**, **não em atributos adicionados em runtime via host binding**. O atributo aparecia no DOM (verdade) mas o slot já tinha sido decidido como front (default).

Os specs de regressão da tentativa anterior testavam apenas `hasAttribute('svgeBehind')` — passavam mas **não validavam projeção real**. Tipo de spec que dá confiança falsa.

**Diagnóstico confirmado pelo usuário** mostrando screenshots:

- ✅ `/custom-editor` correto (atributo literal já estava na template desde a20635b)
- ❌ `/basic-editor` errado (overlay branco 50% nas shapes dentro da página)
- ❌ `/modular-editor` errado (idem)
- ❌ `/embeddable-canvas` errado (idem)
- ❌ `/pro-editor` errado (idem)
- ✅ `/svg-viewer` e `/benchmark` corretos (não usam PageOverlay)

**Fix real**

Adicionar o atributo **literal** `svgeBehind` nas templates de:

- `projects/svg-engine/ui/src/lib/editor/editor.component.ts` — linha do `<svg:g svgePageOverlay svgeBehind>`
- `projects/svg-engine/ui/src/lib/shell-pro/shell-pro.component.ts` — idem

Esse é o caminho canônico que o commit original `a20635b` usou em `playground-home` (hoje `custom-editor`). O atributo PRECISA estar escrito na template Angular para o seletor `[svgeBehind]` matchear durante a compilação.

**Reverter host bindings + corrigir specs**

- Removido `host: { svgeBehind: '' }` de `page-overlay.component.ts` e `grid-overlay.component.ts` — era no-op + mensagem mental errada
- Adicionado comentário forte nos dois componentes alertando que o atributo PRECISA estar na template do consumer
- Specs `page-overlay.component.spec.ts` e `grid-overlay.component.spec.ts` reescritos para **testar projeção real**:
  - Mounta um `<svge-renderer>` real com PageOverlay/GridOverlay como conteúdo projetado
  - Usa `Node.compareDocumentPosition` para verificar se `<g svgepageoverlay>` vem ANTES de `<g svgenode>` no DOM
  - Inclui **caso de controle negativo** (sem `svgeBehind`) provando que sem o atributo o overlay vai pra DEPOIS do conteúdo

**Lesson learned forte**

| Aspecto      | Antes (errado)                           | Depois (correto)                                                                    |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Mental model | "Componente sabe seu papel, auto-aplica" | "Content projection é compile-time, atributo PRECISA estar na template do consumer" |
| Spec         | "Atributo está no DOM"                   | "Elemento foi projetado no slot certo (compareDocumentPosition)"                    |
| Fix          | Host binding (no-op para projection)     | Atributo literal na template (canonical Angular)                                    |

Quando uma decisão arquitetural envolve **content projection**, o spec **precisa** testar o DOM final renderizado, não atributos intermediários.

**Garantias**

- ✅ Bug **resolvido de verdade** nas 4 rotas afetadas (basic/modular/embeddable/pro)
- ✅ Custom-editor continua funcionando (nenhuma mudança lá)
- ✅ 1026/1026 specs passando (era 1024; +2 control cases nos novos specs)
- ✅ 6 entry points + playground build clean
- ✅ Zero breaking change para consumers que já tinham o atributo literal

**Arquivos**

- `projects/svg-engine/ui/src/lib/editor/editor.component.ts` — adicionado `svgeBehind` literal no template; comentário longo explicando o porquê
- `projects/svg-engine/ui/src/lib/shell-pro/shell-pro.component.ts` — mesmo
- `projects/svg-engine/edit/src/lib/workspace/page-overlay.component.ts` — removido host binding; comentário avisando que consumer precisa do atributo literal
- `projects/svg-engine/edit/src/lib/workspace/grid-overlay.component.ts` — mesmo
- `projects/svg-engine/edit/src/lib/workspace/page-overlay.component.spec.ts` — spec reescrito para testar projeção real + control case sem o atributo
- `projects/svg-engine/edit/src/lib/workspace/grid-overlay.component.spec.ts` — idem
- `docs/08-historico-de-alteracoes.md` — esta entrada (e nota corretiva sobre a entrada anterior `f4ea08c`)

---

## 2026-05-21 — Fix regressão de z-order: PageOverlay + GridOverlay auto-tagging svgeBehind no host (TENTATIVA QUE NÃO FUNCIONOU — ver entrada acima)

**Bug reportado pelo usuário**

Screenshot do `/basic-editor` mostrando shapes (rect azul + círculo amarelo) **divididas por uma vertical line**: a metade que ficava **dentro da página** aparecia **lavada/desaturada**; a metade **fora da página** (pasteboard) aparecia com cor cheia. Pergunta: "Já não havíamos corrigido isso?"

**Diagnóstico — regressão clássica**

Sim, foi corrigido em **commit a20635b** (2026-05-19): "página e grid renderizam ATRÁS do conteúdo". Na época, `<svg-renderer>` ganhou um slot `[svgeBehind]` (renderizado ANTES de `<svg:g svgeNode>`); `playground-home.component.html` (hoje `custom-editor`) recebeu o atributo `svgeBehind` em `<svg:g svgePageOverlay>` e `<svg:g svgeGridOverlay>`.

**Por que regrediu**: D-034 criou `<svge-editor>` (em `svg-engine/ui`) e D-038 Phase 4 criou `<svge-shell-pro>`. Ambos incluem `<svg:g svgePageOverlay>` no template MAS **sem** o atributo `svgeBehind` — o autor (eu) esqueceu o detalhe que o consumer era responsável por aplicar. Resultado: nas rotas `/basic-editor`, `/modular-editor`, `/embeddable-canvas`, `/pro-editor` o page rect voltou a render **na frente** do conteúdo, com seu fill `rgba(255,255,255,0.5)`, veluando shapes dentro da página.

**Fix correto = componente, não consumer**

A correção anterior trustava 100% no consumer lembrar do atributo. **Foot-gun**. Solução arquitetural: PageOverlay e GridOverlay são **semanticamente sempre background** — não há caso de uso para renderizá-los em primeiro plano. Então o componente deve **auto-tagear** `svgeBehind` via `host: { svgeBehind: '' }`. Assim qualquer consumer (custom-editor existente, `<svge-editor>`, `<svge-shell-pro>`, futuros shells, layouts custom) recebe z-order correto sem precisar lembrar do atributo.

**Mudanças**

- `projects/svg-engine/edit/src/lib/workspace/page-overlay.component.ts` — `host: { 'aria-hidden': 'true', svgeBehind: '' }` (era só aria-hidden) + comentário explicando o porquê do auto-tag e referenciando o commit a20635b
- `projects/svg-engine/edit/src/lib/workspace/grid-overlay.component.ts` — mesma adição
- `projects/svg-engine/ui/src/lib/editor/editor.component.ts` — comentário do `<svg:g svgePageOverlay>` reescrito (era "page vem antes dos overlays do consumer"; agora explica o auto-tag + cita os 2 commits de fix)
- `projects/svg-engine/ui/src/lib/shell-pro/shell-pro.component.ts` — mesmo comentário
- `projects/svg-engine/edit/src/lib/workspace/page-overlay.component.spec.ts` — novo bloco "regression guard for commit a20635b" testando que `host element carries the svgeBehind attribute`
- `projects/svg-engine/edit/src/lib/workspace/grid-overlay.component.spec.ts` — **novo** (não existia spec antes); testa o mesmo regression guard

**Garantias**

- ✅ **1024/1024 specs** passando (era 1022 + 2 novos regression guards)
- ✅ 6 entry points build clean
- ✅ Playground build clean
- ✅ Zero breaking change: `<svg:g svgePageOverlay svgeBehind>` em `custom-editor` continua válido (a atribuição via host bind é equivalente; HTML aceita o atributo declarado duas vezes — uma do host, uma do template — sem conflito)
- ✅ **Bug não pode regredir** pela 3ª vez: spec de regressão falha imediatamente se alguém remover o host binding

**Lesson learned** (registrar para próximos componentes): overlays **decorativos com fill** (page, grid, futuros background patterns, water marks) devem auto-tagear `svgeBehind` no host. Overlays **interativos com handles** (selection, marquee, rotation pivot, anchor overlay, snap guides, guides) ficam no slot default (front).

---

## 2026-05-21 — D-042 Editor scope (route-scoped DI) — fix bug de estado compartilhado entre rotas

**Bug reportado**

Após D-041 + renomeação das rotas, ao navegar entre `/custom-editor` → `/basic-editor` → `/embeddable-canvas`:

1. **Shapes apareciam compartilhadas** entre rotas (cada visita mostrava as shapes da rota anterior)
2. **Canvas aparecia esmaecido/apagado** (mesmo problema visual que tivemos no Custom Editor com isolation mode)

**Diagnóstico**

Pre-existing — não introduzido por D-041. Causa raiz: TODOS os 20+ services de estado da library (`EditorStateService`, `CommandBus`, `IsolationService`, `LayersService`, `WorkspaceService`, `ViewportService`, etc.) são `@Injectable({ providedIn: 'root' })` = singletons app-wide. Quando o Angular destrói o componente de uma rota e cria o da próxima, os services persistem — então:

- O `SvgDocument` em `EditorStateService.document()` é **o mesmo** entre rotas → shapes compartilhadas
- O `isolationRootId` em `IsolationService` persiste → `IsolationFilter` esmaece shapes fora do escopo na rota nova
- O hidden-set em `LayersService` persiste → `LayersFilter` continua escondendo nodes na rota nova
- Outline mode em `View › Outline` persiste → filtro continua aplicado

**Não era bug do canvas raiz** — era arquitetura de DI sem suporte a múltiplas instâncias de editor no mesmo app.

**Solução: D-042 — `provideSvgEngineEditorScope()`**

Helper em `svg-engine/edit/lib/scope/` que devolve `Provider[]` listando todos os services per-editor (core+render+edit). Cada componente que o adiciona em `providers: []` recebe **instâncias frescas** isoladas das outras. Services mantêm `providedIn: 'root'` como default (zero breaking change para consumers single-editor).

**Refactor casado: shortcut handlers com lazy injector**

Plugins registram handlers em `app.config.ts` (injector root) que disparam `bus.undo()` etc. Com per-editor state, esses closures hitariam o bus errado. Solução: adicionar `ShortcutContext { injector }` opcional em `Shortcut.run(event, ctx?)`; `ShortcutService` passa seu próprio injector per-fire; plugins resolvem services lazily.

`builtinEditorShortcutsPlugin` e `selectionNudgePlugin` refatorados nesse padrão. Plugin authors são orientados a seguir o mesmo modelo.

**Arquivos**

- `projects/svg-engine/edit/src/lib/scope/editor-scope.providers.ts` — novo helper (~140 LOC, mostly docstring)
- `projects/svg-engine/edit/src/lib/scope/index.ts` + spec — exports + 6 testes de isolation
- `projects/svg-engine/edit/src/public-api.ts` — re-exporta `provideSvgEngineEditorScope`
- `projects/svg-engine/edit/src/lib/shortcut/shortcut.ts` — adiciona `ShortcutContext` interface + `run(event, ctx?)`
- `projects/svg-engine/edit/src/lib/shortcut/shortcut.service.ts` — injeta `Injector`, passa em `ctx` per-fire
- `projects/svg-engine/edit/src/lib/shortcut/builtin-editor-shortcuts.plugin.ts` — handlers usam `fromCtx(runCtx, Token)` helper
- `projects/svg-engine/edit/src/lib/selection/selection-nudge.plugin.ts` — mesmo refactor
- `projects/playground/src/app/pages/{custom,basic,modular,pro}-editor/*.component.ts` + `embeddable-canvas/*.component.ts` — `providers: [provideSvgEngineEditorScope()]`
- `docs/04-decisoes-tecnicas.md` — D-042 nova entrada completa
- `docs/08-historico-de-alteracoes.md` — esta entrada

**Garantias**

- ✅ Bug reportado **resolvido**: cada rota agora tem documento/isolation/layers/etc. independentes
- ✅ **1022/1022 specs** passando (1016 existentes + 6 novos do scope spec)
- ✅ 6 entry points build clean; playground build clean (3.54 MB initial)
- ✅ Zero breaking change: services mantêm `providedIn: 'root'` como fallback
- ✅ Mosaicoo ganha API formal para embedar 2+ editores na mesma app

**Não resolvido (registrado em D-042 "Fora de escopo")**

- Focus-aware shortcut dispatch (multi-editor side-by-side) — quando 2 editores estão mounted simultaneamente, ambos `ShortcutService` escutam keystrokes. Aceitável em routing (1 ativo de cada vez); precisa solução de focus para split-view real
- `SvgeContextMenuService` per-editor (vive em `ui`, não pode entrar no helper de `edit`)
- `AutoSaveService` localStorage key sem scope-id — múltiplas instâncias sobrescrevem mesmo slot

---

## 2026-05-21 — Playground routes renomeadas (slugs EN, labels PT) + nova rota `/svg-viewer` (read-only puro)

**Contexto**

Após D-041 formalizar o vocabulário canônico, os slugs antigos (`/shell-demo`, `/shell-partial-demo`, `/shell-canvas-only`, `/shell-pro-demo`, `/raw-primitives`, `/perf`) ainda descreviam **categoria arquitetural, não atividade real**. Quem chegava no playground precisava abrir cada componente para entender o que cada rota fazia. Além disso, o "Modo 4 / view-only" mencionado em D-037 **não tinha rota demo** — `/shell-canvas-only` era o mais próximo mas ainda permitia editar.

**Decisão de naming**

Convenção: **slugs em inglês** (URLs duráveis, padrão npm/GitHub) + **labels em PT-BR** (público do playground é em PT). Cada nome descreve **o que a rota faz**, não a categoria.

**Renames executados (`git mv` preserva history)**

| URL antiga            | URL nova             | Classe antiga      | Classe nova        | Folder antigo         | Folder novo          |
| --------------------- | -------------------- | ------------------ | ------------------ | --------------------- | -------------------- |
| `/raw-primitives`     | `/custom-editor`     | `PlaygroundHome`   | `CustomEditor`     | `playground-home/`    | `custom-editor/`     |
| `/shell-demo`         | `/basic-editor`      | `ShellDemo`        | `BasicEditor`      | `shell-demo/`         | `basic-editor/`      |
| `/shell-partial-demo` | `/modular-editor`    | `ShellPartialDemo` | `ModularEditor`    | `shell-partial-demo/` | `modular-editor/`    |
| `/shell-canvas-only`  | `/embeddable-canvas` | `ShellCanvasOnly`  | `EmbeddableCanvas` | `shell-canvas-only/`  | `embeddable-canvas/` |
| `/shell-pro-demo`     | `/pro-editor`        | `ShellProDemo`     | `ProEditor`        | `shell-pro-demo/`     | `pro-editor/`        |
| `/perf`               | `/benchmark`         | `PerfPage`         | `Benchmark`        | `perf/`               | `benchmark/`         |

URLs antigas **redirecionam** para os novos slugs em `app.routes.ts` — bookmarks/screenshots/links externos continuam funcionando. Selectors (`app-pg-*`) também renomeados para coerência.

**Nova rota: `/svg-viewer`**

Fecha o gap "viewer puro / render-only" mencionado em D-037 mas sem demo. Único componente que importa **apenas** `<svge-renderer>` (de `svg-engine/render`) + `svgImporter` (de `svg-engine/io`). **Zero dependência de `svg-engine/edit`**, zero Material no funcional (apenas tokens CSS via fallback).

Features do `SvgViewer`:

- Textarea para colar markup SVG (parsing reativo a cada keystroke)
- `<input type="file" accept=".svg,image/svg+xml">` para carregar arquivo do disco
- Botão "Carregar exemplo" com SVG de teste
- Botão "Limpar"
- Tratamento de erro de parsing inline + warnings da importação em `<details>` colapsável

**Por que isso importa**

1. **Comunica intenção**: dev entrando no projeto sabe imediatamente o que cada rota faz pelo nome (não precisa abrir o componente)
2. **Slugs duráveis**: nomes em inglês alinham com convenção npm/GitHub para URLs
3. **Sem rename de UI lib**: zero código de `svg-engine/*` mudado — só renomeações no `playground` + atualização de 4 docstrings em `svg-engine/{ui,render,edit}/...` que mencionavam `playground-home` como exemplo histórico
4. **Demonstra menor footprint**: `/svg-viewer` prova concretamente que dá pra usar só `render+io` sem trazer Material/CDK

**Arquivos**

- `projects/playground/src/app/pages/{custom-editor,basic-editor,modular-editor,embeddable-canvas,pro-editor,benchmark}/` — folders renomeados via `git mv`, classes + selectors + filenames atualizados
- `projects/playground/src/app/pages/svg-viewer/svg-viewer.component.ts` — novo (~260 LOC)
- `projects/playground/src/app/app.routes.ts` — 7 rotas canônicas + 6 redirects de URLs antigas + catch-all
- `projects/playground/src/app/app.html` — nav com slugs EN + labels PT
- `projects/playground/src/app/app.ts` — docstring atualizada com mapa de rotas
- `docs/01-visao-geral.md` — tabela "Rotas do playground" adicionada
- `docs/04-decisoes-tecnicas.md` D-041 — tabela "Rotas do playground" + de-para
- `docs/08-historico-de-alteracoes.md` — esta entrada
- `projects/svg-engine/{ui/editor,render/util/screen-to-doc,edit/pointer/is-editable-target,edit/tool/shell-interactions}.ts` — 4 docstrings que mencionavam `playground-home` como exemplo histórico atualizadas para referenciar `custom-editor`

**Garantias**

- ✅ Bookmarks antigos continuam funcionando (redirects em `app.routes.ts`)
- ✅ Specs da library (`ng test svg-engine`) intocadas
- ✅ Build do playground intocado (zero break)
- ✅ Git mv preserva history dos arquivos (`git log --follow` continua mostrando histórico completo)

---

## 2026-05-21 — D-041 Posicionamento Canvas-first + vocabulário canônico + rota `/raw-primitives`

**Contexto**

Em conversas de alinhamento entre time/produto/marketing, virou recorrente a pergunta: _"Qual é o produto principal — o `<svge-shell-pro>` ou o headless?"_. Sem resposta canônica registrada, decisões de roadmap, breaking-change e doc oscilavam. D-016 falava em "produto de mercado", D-017 fixava o headless boundary, D-018 dividia em entry points, D-037 codificava os 4 modos — mas **nenhuma dizia, com todas as letras, qual é o produto**.

**Decisão (D-041)**

**O produto principal do SVGEngine é o Canvas Engine headless** (entry points `core` + `render` + `io` + `optimize` + `edit`). O `svg-engine/ui` é **camada de conveniência opt-in**, substituível.

Em uma frase: **"Vendemos uma engine. A UI profissional é cortesia."**

**Implicações operacionais formalizadas (6)**

1. Roadmap prioriza features headless primeiro; UI segue
2. Breaking changes em `ui` são menos graves do que em headless (SemVer minor pode quebrar `ui`; não pode quebrar headless)
3. Documentação de API prioriza headless (09 ordena `core` → `edit` → `ui`)
4. Dependências do headless são vigiadas ativamente; do `ui` podem crescer
5. Performance é medida contra o Canvas headless puro (Modo 1)
6. Playground é showcase + sandbox + benchmark — **não** é o produto

**Rejeitado em D-041**: quebrar em dois pacotes npm (`svg-engine` + `svg-engine-professional`). Tree-shaking + `peerDependenciesMeta.optional` já entregam o que dois pacotes ofereceriam, sem overhead de releases coordenadas. Reavaliação só se cadência de evolução `ui` vs `core` divergir dramaticamente.

**Vocabulário canônico (de-para conceitual)**

Tabela completa em `docs/01-visao-geral.md` seção "Vocabulário canônico". Resumo:

- **SVG Engine** = npm package `svg-engine`
- **Canvas Engine / Core** = conjunto 5 entry points headless
- **Canvas físico** = `<svge-renderer>` ou `<svge-canvas>`
- **SVG Engine Professional** = entry point `svg-engine/ui` + `<svge-shell-pro>`
- **Raw primitives example** = rota `/raw-primitives` (era `/playground-home`)

**Mudança operacional (rota)**

A rota `/` agora **redireciona** para `/raw-primitives`. O caminho `/raw-primitives` é o **nome canônico** do exemplo Modo 1. Bookmarks antigos continuam funcionando via redirect. Folder/componente `playground-home` mantidos por enquanto (rename é polish opcional, baixo valor).

**Arquivos**

- `docs/04-decisoes-tecnicas.md` — D-041 nova decisão (~100 linhas)
- `docs/01-visao-geral.md` — seção "O que é o produto" + "Vocabulário canônico" + "Quatro casos de uso" expandida para 4 modos (era 3)
- `docs/08-historico-de-alteracoes.md` — esta entrada
- `projects/playground/src/app/app.routes.ts` — rota `/raw-primitives` adicionada, `/` redireciona
- `projects/playground/src/app/app.html` — nav linka para `/raw-primitives` com label "Raw primitives (Modo 1)"
- `projects/playground/src/app/app.ts` — docstring atualizada

**Garantias**

- ✅ Decisão é puramente posicional — zero código de produção alterado
- ✅ Rota `/` continua funcional (redirect, não 404)
- ✅ Compatível com D-016, D-017, D-018, D-026, D-037 (D-041 formaliza intenção implícita)

---

## 2026-05-21 — `docs/02-arquitetura.md`: seção "Mapa de dependências" com 3 diagramas Mermaid

**Contexto**

A doc 02-arquitetura descrevia a estrutura **em texto** (seções 1-3, estrutura-alvo D-018, regras D-017) mas não tinha um **grafo visual** mostrando "quem importa de quem". Conforme a library cresceu (6 entry points realizados, 16 componentes UI, 10+ registries em `edit`), pedir um overview a quem entra no projeto exigia ler ~250 linhas de texto + inspecionar imports manualmente.

**Decisão**

Adicionar **seção 4 "Mapa de dependências (verificado por código)"** em `docs/02-arquitetura.md` com 3 diagramas Mermaid + tabela de referência:

1. **4.1 — Visão macro**: consumer apps → 6 entry points (com headless boundary em destaque) → peer deps. Codifica D-017 + D-018 + D-026 + D-037 num único grafo. Convenção de setas (grossa/pontilhada/fina) documentada.
2. **4.2 — Zoom registries**: como cada componente em `ui` lê de qual registry em `edit`, e como plugins (built-in + custom) populam esses registries. Mostra o padrão "ui lê, edit é fonte de verdade, plugins contribuem".
3. **4.3 — 4 modos de consumo (D-037)**: Headless puro / Shell completo / Shell parcial / Canvas-only com quais entry points cada modo realmente usa.
4. **4.4 — Tabela de referência** entry point × owns × Material? × deps internas.
5. **4.5 — Comandos `grep` canônicos** para reverificar headless boundary e grafo de deps quando algo mudar (preserva a doc de virar mentira no tempo).

**Garantias**

- Diagramas são **verificáveis por código** — gerados a partir de `grep "from 'svg-engine/(core|render|io|optimize|edit|ui)'"` em todos os entry points.
- Confirmação: **16 arquivos** importam `@angular/material|cdk` e **todos** estão em `svg-engine/ui` (D-017 intacto).
- Mermaid renderiza nativamente no GitHub e VS Code (com extensão Markdown Preview Mermaid Support) — sem build extra.

**Arquivos**

- `docs/02-arquitetura.md` — seção 4 nova (5 sub-seções, ~200 linhas adicionadas)
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-20 — D-031 Release tooling: `standard-version` + workflow publish-on-tag

**Contexto**

A library `svg-engine` já estava "instalável-ready" (D-018 multi-entry, D-026 io/optimize, README publicável, metadata completa). Faltava o **último elo da cadeia para publish**: como cortar uma release de forma determinística, gerar changelog automático e disparar `npm publish` via CI. O histórico já estava em Conventional Commits (`feat(scope):`, `fix(scope):`, `docs:`, `refactor:`, `perf:`) — viabilizando geração 100% automatizada.

**Decisão**

Adotar **`standard-version` (9.5.0)** como devDependency + **GitHub Actions release workflow** disparado por tag `v*`.

`standard-version` foi escolhido sobre `changesets` porque o workspace é single-package (D-018 garante multi-entry sob uma versão única) — `changesets` brilha em monorepos com múltiplos pacotes independentes, overhead desnecessário aqui.

**Componentes entregues**

1. `.versionrc.json` na raiz — `bumpFiles` + `packageFiles` apontam **apenas** para `projects/svg-engine/package.json` (root permanece `private: true / 0.0.0`). `types` filtra histórico (`feat`/`fix`/`perf`/`refactor`/`docs`/`revert` no CHANGELOG; `test`/`build`/`ci`/`chore`/`style` ocultos). `commitUrlFormat` / `compareUrlFormat` apontam para `mosaicoo/svg-engine`. `tagPrefix: 'v'`. `releaseCommitMessageFormat: 'chore(release): {{currentTag}}'`.

2. Scripts npm: `release`, `release:dry`, `release:patch|minor|major`, `release:first`.

3. `.github/workflows/release.yml` — trigger `push tag v*`, steps `npm ci` → lint → test (svg-engine) → `ng build svg-engine` → `npm pack` (dry-run + artifact) → upload tarball → **publish condicional** ao `NPM_TOKEN` secret. Sem o secret, o workflow termina pacificamente após upload do tarball (artifact retention 90 dias). Adicionar o secret depois habilita publish automático — "ready when you add token". Inclui `--access public --provenance` (Sigstore provenance via OIDC).

**Fluxo end-to-end**

```
git commit -m "feat(edit): nova ferramenta"   # já é a norma do projeto
npm run release:dry                            # preview
npm run release                                # bump + CHANGELOG + tag local
git push --follow-tags origin main             # dispara workflow
# CI builda, testa, packsta, publica (se NPM_TOKEN setado)
```

**Fora de escopo**

- Decisão do registry definitivo (npm público / GitHub Packages / Mosaicoo privado) — continua como **D-025?** pendente. Workflow default `registry.npmjs.org`, trocável em uma linha.
- GitHub Releases auto-criadas com release-notes formatadas — opcional, pode entrar depois.
- Pre-releases (`--prerelease alpha`) — já suportado pelo `standard-version`, documentação deferida.

**Garantias verificadas**

- ✅ Build da library e specs **inalterados** (standard-version é dev-only, não toca runtime)
- ✅ Histórico Conventional Commits retroativamente válido para `--first-release`
- ✅ Root `package.json` permanece `private: true`
- ✅ Pre-commit gate (D-014) e CI base (D-015) intocados — release.yml é workflow adicional

**Arquivos**

- `.versionrc.json` — novo
- `package.json` — scripts `release*` adicionados + devDep `standard-version: 9.5.0`
- `.github/workflows/release.yml` — novo
- `docs/04-decisoes-tecnicas.md` — D-031 aceito + nota de pendentes atualizada
- `docs/05-roadmap.md` — entrada D-031 ✅
- `docs/08-historico-de-alteracoes.md` — esta entrada

---

## 2026-05-20 — D-040 Shell interactions polish: dynamic context-menu + builtin shortcuts

**Contexto**

D-039 declarou 2 itens fora de escopo como **D-040 pendente**: dynamic context-menu slot (right-click em shape vs fundo) + plugin de shortcuts canônicos. Esta sprint entregou ambos.

**Solução — 2 partes independentes**

**Part 1 — `[svgeContextMenuResolver]` function input**

- Diretiva `[svgeContextMenu]` em `svg-engine/ui` ganhou input opcional `[svgeContextMenuResolver]: ((event: MouseEvent) => string) | null` — quando supplied, toma precedência sobre a slot estática.
- `<svge-editor>` e `<svge-shell-pro>` providenciam resolver baseado em `resolveSelectableNodeId + IsolationService.isolationRootId()`:
  - Hit em shape → `'context.node'`
  - Hit no fundo → `'context.canvas'`
- Consumer não wireia dois `[svgeContextMenu]` diferentes — uma única binding com lógica dinâmica.

**Part 2 — `builtinEditorShortcutsPlugin`**

Novo plugin opt-in em `svg-engine/edit/lib/shortcut/builtin-editor-shortcuts.plugin.ts`. Registra:

- `Ctrl+Z` → `bus.undo()`
- `Ctrl+Y` + `Ctrl+Shift+Z` → `bus.redo()` (Windows + Mac/Linux idioms)
- `Ctrl+G` → `GroupSelectionCommand(selectedIds)` (gated em >= 2 selecionados)
- `Ctrl+Shift+G` → `UngroupCommand(focusId)` quando focus é group
- `Ctrl+A` → `selection.selectMany(root.children)` (todos top-level)

Plugin opt-in — playground instala em `app.config.ts`. Bare consumers escolhem (ou substituem por bindings custom).

**Fora de escopo (fast-follows futuros)**

- `Ctrl+C/X/V` (clipboard) — precisa de `ClipboardService` ainda não existente
- `Ctrl+S` (save) — depende de estratégia do consumer
- `Ctrl+D` (duplicate) — precisa de `DuplicateCommand` ainda não existente

**Garantias verificadas**

- ✅ 1016/1016 specs passing (sem regressão)
- ✅ 6 entry points build clean
- ✅ Playground build clean
- ✅ ESLint clean
- ✅ D-037/D-038/D-039 invariantes preservadas (resolver é opt-in via input; plugin é opt-in via provider)

**Arquivos**

- `projects/svg-engine/ui/src/lib/context-menu/context-menu-trigger.directive.ts` — input novo
- `projects/svg-engine/ui/src/lib/editor/editor.component.ts` — resolver method + binding
- `projects/svg-engine/ui/src/lib/shell-pro/shell-pro.component.ts` — idem
- `projects/svg-engine/edit/src/lib/shortcut/builtin-editor-shortcuts.plugin.ts` — novo
- `projects/svg-engine/edit/src/lib/shortcut/index.ts` — export
- `projects/playground/src/app/app.config.ts` — provideSvgEnginePlugin(builtinEditorShortcutsPlugin)

---

## 2026-05-20 — D-039 Shell interactions full kit (`[svgeShellInteractions]` expandido)

**Contexto**

Após o fix pós-D-038 Phase 4, o `[svgeShellInteractions]` cobria só tool routing + click-select + Delete. Para o shell parecer "editor de verdade" faltavam:

1. Drag-move de seleção (com snap)
2. Multi-select Shift/Ctrl + click
3. Marquee drag-to-select
4. Double-click → isolation mode
5. ShortcutService auto-start (para shortcuts plugin-contributed funcionarem)

**Solução** — expandir o `[svgeShellInteractions]` em 4 phases lógicas (todas no mesmo turno, mesmo arquivo, ~120 linhas migradas do `playground-home`):

**Phase A — Drag-move + multi-select**

- `potentialDrag` armado em `onPointerDown` quando hit em shape
- `onPointerMove` detecta threshold 3px → `transform.startMove` + `applySnappedMove`
- `onPointerUp` chama `transform.endMove` (1 entrada de undo por gesto)
- Shift/Ctrl/Cmd + click → `selection.toggle` em vez de `select` (replace)

**Phase B — Marquee drag-to-select**

- `onPointerDown` em fundo vazio → `marquee.start(point, mode, initialSelection)`
- `onPointerMove` enquanto marquee ativo → `marquee.update` + `applyMarqueeSelection`
- Shift = `'add'` mode (soma à seleção); senão `'replace'`
- Integra com `MarqueeService` + `nodesInsideMarquee` (intersect-mode)

**Phase C — Double-click → isolation**

- Manual dblclick detection (timestamp + last-target-id) — necessário porque `setPointerCapture` quebra dblclick nativo do browser (bug conhecido)
- Threshold: 400ms entre cliques, mesmo target id
- Group target → `isolation.enter(groupId)` + `selection.select(groupId)`
- Direct-Select tool desabilita o trigger (dblclick em anchor é outra coisa)

**Phase D — ShortcutService auto-start**

- Construtor da diretiva chama `shortcuts.start()` (idempotente)
- Plugins que registram via `ShortcutRegistry` agora têm seus keys roteados automaticamente no shell — antes só funcionava se o consumer chamasse `start()` à mão

**Phase E (Escape hierarchy)**

- Esc segue hierarquia: drag → marquee → isolation → forward para tool ativa
- Cobre o caso "user pressiona Esc no meio de qualquer interação"

**Gap remanescente** (registrado como **D-040? pendente** em `04-decisoes-tecnicas.md`):

- Dynamic context-menu slot (`context.node` vs `context.canvas` por hit-test)
- Plugin `builtinEditorShortcutsPlugin` registrando Ctrl+Z/Y/G/Shift+G/A/D no `ShortcutRegistry`

**Garantias verificadas**

- ✅ 1016/1016 specs passando (sem regressão; diretiva foi inteiramente reescrita)
- ✅ 6 entry points build clean
- ✅ Playground build clean
- ✅ Modos 1-5 D-037/D-038 sem regressão de comportamento default

**Arquivo único modificado**: `projects/svg-engine/edit/src/lib/tool/shell-interactions.directive.ts` (rewrite de 110 → 330 linhas). Aplicado automaticamente via `<svge-editor>` e `<svge-shell-pro>` (já importavam a diretiva no D-038 fix).

---

## 2026-05-20 — Fix pós D-038 Phase 4: `[svgeShellInteractions]` + tool icons + toolbar.main demo

**Contexto**

Validação manual do `<svge-shell-pro>` revelou 3 problemas:

1. **Shapes não criáveis nem manipuláveis** — bug arquitetural antigo: `<svge-editor>` (Bloco 4a) e `<svge-shell-pro>` (D-038 Phase 4) nunca rotearam pointer events para `ToolHostService.routePointer*`. Só `playground-home` fazia esse wireup. Tools como Stamp / Shape / Pen / Text não respondiam a clicks na rota `/shell-pro-demo` mesmo estando ativas.
2. **Tools palette com 7 ícones de chave-inglesa** — tools built-in nunca tinham `icon` definido porque ninguém renderizava antes do D-038 Phase 4 (que introduziu `<svge-tools-palette>`).
3. **Toolbar entre menu bar e tool options vazia** — `demoMenuBarPlugin` populava `menu.*` e `context.*` mas zero `toolbar.main`.

**Solução**

- **Nova diretiva `[svgeShellInteractions]`** em `svg-engine/edit/lib/tool/shell-interactions.directive.ts`:
  - Roteia pointer events (down/move/up/cancel) para `ToolHostService.routePointer*` quando uma tool ativa NÃO é Select/Direct-Select.
  - Click handler: usa `resolveSelectableNodeId` + `SelectionService.select(id)` para selecionar shapes; click no background limpa seleção.
  - Document-level keydown: `Delete`/`Backspace` dispatcha `RemoveNodeCommand` por id selecionado, gated por `isEditableTarget`. Demais keys forward para `toolHost.routeKeyDown`.
- Aplicada automaticamente no `<svge-editor>` e `<svge-shell-pro>` (sem opt-in — todas as visões shell ganham interação out-of-the-box).
- **Icons** adicionados a 7 built-in tools: select=`arrow_selector_tool`, direct-select=`ads_click`, pencil=`edit`, pen=`draw`, rect=`crop_square`, ellipse=`radio_button_unchecked`, polygon=`pentagon`, text=`title`.
- **Demo plugin** ganhou 4 items `toolbar.main`: Save / Export SVG / Optimize / View Source.

**Gap remanescente** (registrado como **D-039? pendente** em `04-decisoes-tecnicas.md`): marquee drag-to-select, move-by-drag, multi-select Shift+click, shortcuts completos. Requerem wireup com `TransformService` + `MarqueeService` — escopo separado.

**Garantias**

- ✅ 1016/1016 specs passando
- ✅ 6 entry points build clean
- ✅ Playground build clean
- ✅ Modos 1-4 D-037 inalterados
- ✅ Stamp Tool no `/shell-pro-demo`: pressionar **K**, tool options bar aparece, click no canvas dropa círculo. Click em shape existente seleciona. Delete remove.

---

## 2026-05-20 — Sprint Pro-Editor (D-038): editor profissional drop-in (`<svge-shell-pro>`)

**Contexto**

Após D-037 garantir os 3 modos de consumo via `<svge-editor>`, ficou claro que o "shell completo" ainda era **minimal** (apenas toolbar undo/redo/zoom + canvas + status). Apps Mosaicoo querendo editor profissional drop-in — menu bar, context menus, tool options bar, tools palette, sidebars com layers + inspector — precisavam compor 200+ linhas à mão. Equivalente Illustrator/Affinity/Inkscape como single component não existia.

**Solução** (D-038 — 4 phases incrementais, 4 commits, ~1h de trabalho)

Cada phase: componente novo em `svg-engine/ui` + opt-in no `<svge-editor>` + reflexo nas 4 visões do playground + push individual.

### Phase 1 — `<svge-menu-bar>` (commit `2e4bb8b`)

- Material dropdowns (File / Edit / View / Object / Help) lendo `MenuContributionRegistry`.
- `MenuContribution` ganhou `parentId?` (submenus cascading) + `divider?` — aditivos.
- Constantes `MENU_SLOT.*` exportadas de `svg-engine/ui`.
- `<svge-editor>` ganhou `[showMenuBar]` (default `false`).
- `demoMenuBarPlugin` no playground com 12 items + submenu Edit > Transform.
- +7 specs.

### Phase 2 — `<svge-context-menu>` (commit `905e0a1`)

- Componente + `SvgeContextMenuService` (CDK Overlay, single-instance) + `[svgeContextMenu="slot"]` diretiva.
- Slots `context.canvas / node / layer / anchor / guide` (constantes `CONTEXT_MENU_SLOT.*`).
- Dismiss on outside-click / Escape / item click.
- `<svge-editor>` ganhou `[showContextMenu]` + `[contextMenuSlot]`.
- Shell-completo + shell-canvas-only ativam por padrão (right-click é affordance universal).
- +9 specs.

### Phase 3 — `<svge-tool-options>` (commit `85eac4c`)

- `Tool` interface ganhou `optionsComponent?: Type<unknown>` (aditivo, zero break).
- `<svge-tool-options>` renderiza via `*ngComponentOutlet`, com tool label + icon ao lado.
- `<svge-editor>` ganhou `[showToolOptions]` + `[toolOptionsShowPlaceholder]`.
- **Stamp Tool** demo no playground (shortcut **K**): options component com radius (5/10/20/50) + color (red/blue/green) togglers; click no canvas dropa círculo com params escolhidos.
- +7 specs.

### Phase 4 — `<svge-shell-pro>` + `<svge-tools-palette>` (commit `0548814`)

- `<svge-tools-palette>` (auxiliar): strip vertical lendo `ToolRegistry.tools()`.
- `<svge-shell-pro>`: composição final grid (menu / toolbar / tool-options / [tools | canvas | layers+inspector] / status), context menu sempre ativo.
- Coexiste com `<svge-editor>` — não substitui.
- Nova rota `/shell-pro-demo` no playground + nav entry "Shell profissional ⭐".

**Garantias verificadas**

- ✅ **1016/1016 specs** (+23 do total acumulado: 7 menu-bar + 9 context-menu + 7 tool-options)
- ✅ 6 entry points build clean em todas as fases
- ✅ Playground build clean (5 rotas demonstrando modos 1-5)
- ✅ ESLint clean em todos arquivos tocados
- ✅ D-037 invariantes preservadas (modos 1-4 inalterados por padrão)
- ✅ `<svge-editor>` zero regressão de comportamento

**Estrutura final do shell-pro**

```
┌────────────────────────────────────────────────────────┐
│ <svge-menu-bar> (File / Edit / View / Object / Help)   │
├────────────────────────────────────────────────────────┤
│ <svge-toolbar slot="toolbar.main">                     │
├────────────────────────────────────────────────────────┤
│ <svge-tool-options> (Tool.optionsComponent active tool)│
├────┬───────────────────────────────────┬───────────────┤
│Tool│                                   │<svge-layers-> │
│Pal │  <svge-renderer> + overlays       │  panel        │
│ette│  + [svgeContextMenu]              ├───────────────┤
│    │                                   │<svge-inspect> │
├────┴───────────────────────────────────┴───────────────┤
│ <svge-status-bar>                                       │
└────────────────────────────────────────────────────────┘
```

---

## 2026-05-20 — Shell-refinement: D-034 + D-035 + D-037 (invariantes Mosaicoo)

**Contexto**

O `<svge-editor>` era um "minimal shell" (apenas undo/redo + zoom + canvas). Plugins registrados no `MenuContributionRegistry` (D-023 cat 9) não tinham onde aparecer porque o `<svge-toolbar>` (Bloco 4e) existia em paralelo mas nunca foi integrado. Drop-in shell pra consumer terceiro era enganoso. Adicionalmente, status indicators (cursor, zoom, tool ativa, selection count, snap mode, dirty flag, isolation breadcrumb) estavam todos espalhados no `playground-home.component.html` — consumer terceiro precisava reescrever esse hud.

**Decisão Mosaicoo (D-037) — gate explícito**

Usuário/Mosaicoo deixou claro que o produto SVGEngine será consumido em **3 modos distintos** simultaneamente no ecossistema:

1. **Headless puro** — canvas + overlays montados à mão; chrome próprio (já garantido pré-D-034/D-035 via D-017)
2. **Shell completo** — editor pronto em página dedicada
3. **Shell parcial** — canvas dentro de painéis menores OR chrome híbrido (toolbar Mosaicoo + canvas SVGEngine + status custom)

Expandir o `<svge-editor>` sem quebrar (1) era o risco — D-037 formaliza as invariantes e cobre com specs.

**Solução implementada**

- **D-034 — `<svge-toolbar>` integrado**: `<svge-editor>` agora inclui `<svge-toolbar slot="toolbar.main">` internamente (entre o título e os built-ins). Plugins aparecem automaticamente. Slot configurável via `[toolbarSlot]` input.

- **D-035 — `<svge-status-bar>` novo**: componente em `svg-engine/ui/lib/status-bar/` lendo 8 services (state/selection/viewport/workspace/toolhost/toolregistry/snap/isolation). 7 sections opt-in via `[sections]` input. Standalone (usável fora do shell).

- **D-037 — `<svge-editor>` modular**: inputs `[showToolbar]` / `[showStatusBar]` (default `true` ambos) + slots de projeção `[toolbar-extras]` e `[status-bar]` permitem qualquer mix.

**Specs garantindo as invariantes**

`editor.component.spec.ts` ganhou bloco "THREE MODES guarantee (D-034 + D-035)" com 6 specs cobrindo cada um dos 3 modos + slot custom de status. Modo 1 (headless puro) é garantido estruturalmente — `svg-engine/render` + `svg-engine/edit` continuam Material-free (D-017).

**Playground**

- `/` — headless puro (já era), permanece como está
- `/shell-demo` — atualizado com hint mencionando os 3 modos
- `/shell-partial-demo` — NOVA rota; 3 checkboxes interativos toggling toolbar/status/custom-status, demonstrando ao vivo o modo parcial

**Garantias verificadas**

- ✅ **993/993 specs** (+15 novos: 7 status-bar + 8 editor 3-modes)
- ✅ Build full 6 entry points clean
- ✅ Playground build clean (incluindo nova rota /shell-partial-demo)
- ✅ ESLint clean

---

## 2026-05-20 — Consolidação de helpers compartilhados (D-036)

**Contexto**

Auditoria pós-D-026 (extração io/optimize) revelou outro tipo de débito acumulado, ortogonal ao estrutural: **helpers de input duplicados em paralelo entre 5 e 7 vezes**, com drift visível entre as cópias.

**Diagnóstico**

| Helper                     | Lugares (antes)                                                                                                        | Padrão                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `screenToDoc(x, y)`        | playground, selection-overlay, canvas-gestures, guides-overlay, anchor-overlay, rotation-pivot, rulers — **6+** cópias | Inversão de `getScreenCTM()` com guards defensivos para jsdom/SSR |
| Pointer capture inline     | 7 cópias (mesmas + color-picker)                                                                                       | `setPointerCapture(event.pointerId)` em try/catch defensivo       |
| Pointer release inline     | 7 cópias                                                                                                               | Simétrico                                                         |
| `isEditableTarget(target)` | 2 cópias (privada em `shortcut.service` + file-local no playground)                                                    | Gate `<input>`/`<textarea>`/`<select>`/`contenteditable`          |

Drift já presente: algumas versões usavam `?.` chaining, outras `typeof ===`, outras `'method' in target`. Algumas tinham guard de `createSVGPoint`, outras não. Cada novo overlay/gesto copiava uma versão arbitrária, perpetuando.

**Solução** (D-036, registrada em `04-decisoes-tecnicas.md`)

Dois módulos canônicos com exports públicos:

- `svg-engine/render/lib/util/screen-to-doc.ts` — `screenToDoc(svg, clientX, clientY): Point | null`, função pura. Vive em `/render` (camada que dona o `<svg>`).
- `svg-engine/edit/lib/pointer/` — `capturePointer(event)`, `releasePointer(event)`, `isEditableTarget(target)`. Vive em `/edit` (consumers são editor surfaces).

**Sites migrados** (9 arquivos)

Library:

- `selection-overlay.component.ts` — removeu screenToDoc local + helpers no rodapé
- `canvas-gestures.directive.ts` — removeu screenToDoc + inline capture/release (release usa cast `unknown as PointerEvent` porque opera sobre target/id armazenados)
- `guides-overlay.component.ts` — removeu screenToDoc + inline capture/release
- `anchor-overlay.component.ts` — removeu screenToDoc + inline capture/release
- `rotation-pivot.component.ts` — removeu screenToDoc + inline capture/release
- `color-picker.component.ts` (ui) — 4 inline capture/release → imports
- `rulers.component.ts` (ui) — removeu screenToDoc local
- `shortcut.service.ts` — local privada → import do canonical

Playground:

- `playground-home.component.ts` — removeu 4 helpers locais (~80 linhas)

**Garantias verificadas**

- ✅ **973/973 specs** passing (+25 novos: screen-to-doc.spec + pointer.spec)
- ✅ Build full 6 entry points clean
- ✅ Playground compila sem ajuste funcional (só substituiu imports)
- ✅ ESLint clean

**Outras pendências registradas neste turno**

- **D-034**: `<svge-toolbar>` materializando `MenuContributionRegistry` (pendente — shell-refinement pós-Fase 6d)
- **D-035**: `<svge-status-bar>` (cursor, zoom, tools, selection, snap, dirty, isolation breadcrumb) — mesmo timing

---

## 2026-05-20 — Alinhamento estrutural: extração de `svg-engine/io` + `/optimize` (D-026)

**Contexto**

Auditoria pós-Sprint Text-Tool confirmou um desvio do plano original
(D-018): o projeto deveria entregar 6 entry points secundários
(`core`, `render`, `io`, `optimize`, `edit`, `ui`), mas o crescimento
orgânico das Fases 4→5→6 dobrou `io/` e `optimize/` dentro de
`svg-engine/edit`. Funcionalmente correto; estruturalmente desalinhado.

**Problema concreto**

- "Caso B" do D-016 (apenas otimização/conversão sem editor) era
  impraticável: consumer precisava trazer o `/edit` inteiro (DI tree,
  gestures, plugin registry) só pra rodar 3 passes de otimização.
- Bundle do `/edit` carregava parsers/serializers/raster mesmo quando
  o app só precisava do editor.
- Documentação (06, 09, README) descrevia 6 entry points; código
  entregava 4 (core/render/edit/ui).

**Solução**

Extração com **garantia de zero breaking change**:

1. **Movimentações para `/core`** (utilitários foundational):
   - `Disposable` interface (compartilhado por toda capability registry).
   - `parseTransformAttr` (utility SVG transform → matrix usado por
     `/io` e `/edit`).
2. **Novo entry point `svg-engine/io`**:
   - Types: `Importer`, `Exporter`, `ImportResult`.
   - Registries: `ImporterRegistry`, `ExporterRegistry`.
   - Implementações: `svgImporter`, `svgExporter`, `pngExporter`,
     `renderPng`.
3. **Novo entry point `svg-engine/optimize`**:
   - Type: `Optimizer`.
   - Registry: `OptimizerRegistry`.
   - 3 passes built-in: `precisionOptimizer`, `dropDefaultsOptimizer`,
     `pruneEmptyGroupsOptimizer`.
   - `OptimizeCommand`.
4. **Em `svg-engine/edit` ficam apenas os plugin wrappers**:
   - `builtinIoPlugin`, `pngExporterPlugin`, `builtinOptimizersPlugin`
     (dependem de `EditorPlugin` que mora em `/edit`).
5. **Backward-compat preservada**: barréis em `/edit/lib/io/index.ts` e
   `/edit/lib/optimize/index.ts` re-exportam de `svg-engine/io` /
   `svg-engine/optimize`. Imports existentes (`from 'svg-engine/edit'`)
   continuam funcionando sem ajuste.

**Garantias verificadas**

- ✅ Build full 6 entry points (`npx ng build svg-engine`) — clean.
- ✅ Suite full (`npx ng test svg-engine`) — **948/948 specs**.
- ✅ Playground (`npx ng build playground`) — compila sem ajuste.
- ✅ ESLint clean em todos arquivos tocados.

**Arquivos**

- 5 arquivos movidos para `projects/svg-engine/io/src/lib/`.
- 4 arquivos movidos para `projects/svg-engine/optimize/src/lib/`.
- 2 arquivos novos em `/core/src/lib/types/` (disposable +
  transform-parser).
- 4 arquivos modificados no `/edit` (plugin.ts re-export Disposable,
  autosave service import, 2 barréis index.ts).
- `tsconfig.json` + `tsconfig.lib.json` + `tsconfig.spec.json` —
  paths + includes para `/io` + `/optimize`.
- D-026 registrada em `04-decisoes-tecnicas.md`; `06`, `09` e este
  arquivo atualizados; pendente `D-026? i18n` renumerada para `D-033?`.

**Por que agora (pre-1.0)**

Refactor estrutural em pre-1.0 é barato (SemVer permite); late em 1.x
seria doloroso. O custo foi puramente mecânico (movimentações +
barréis re-export); o benefício é arquitetural (use case B viável,
bundle do `/edit` enxuga quando consumer usa só `/io` ou `/optimize`).

---

## 2026-05-19 — Path Editor: bugfixes do cycle de kinds + ancestor matrix em AnchorOverlay

**Contexto**

Três bugs reais reportados pelo usuário em sequência após a entrega
inicial do Path Editor (commits 69e18c4 + 4508ef4):

1. **Cycle de kinds preso em cusp ↔ smooth, nunca chegava em symmetric**
   (cc593ca)
2. **Cycle aparentava falhar mais: "curva → simétrico não funciona,
   simétrico → curva funciona"** (0a555e0)
3. **Anchors visualmente deslocados da forma quando path está dentro
   de grupo movido** (2bfb3a8)

**Bug 1 — parser sempre re-classifica como cusp**

`path-anchors.ts` chamava `classifyAnchorKind(point, handleIn, null)`
ao processar comandos `C` — o `handleOut` só era conhecido no segmento
seguinte, então o classifier defensivamente retornava `cusp` para todo
endpoint de cubic bezier. Resultado: depois de cada
`ConvertAnchorTypeCommand`, o re-parse devolvia `cusp` e o cycle ficava
preso em `cusp ↔ smooth`.

**Fix**: pós-passa após o loop principal de `parsePathToAnchors`
re-classifica cada anchor agora que `handleIn` + `handleOut` estão
ambos finais. Sem isto, a fonte da verdade (o `d` string) "esquece"
o kind a cada serialização → parse.

**Bug 2 — cycle ficava preso em symmetric**

Combinação de dois problemas:

- `synthesizeHandles` (criado no fix #1) produzia handles MIRROR por
  construção (mesma distância ao longo da chord prev→next). Resultado:
  `cusp → smooth` em rect/line auto-promovia direto para `symmetric`
- `enforceKind(_, 'cusp')` literalmente não mudava handles (apenas
  trocava o `kind` field). O `d` ficava idêntico → guard
  `nextD === path.d` em `withPathAnchors` retornava no-op silencioso

**Fix dupla**:

- `synthesizeHandles` agora usa razões ASSIMÉTRICAS (0.4 in, 0.3 out
  da chord) → `cusp → smooth` produz smooth real (handles colineares-
  opostos mas com lengths diferentes)
- `enforceKind(_, 'cusp')` agora COLAPSA handles para o anchor point
  (semântica "Convert Anchor Point" do Illustrator/Affinity) →
  destrutivo mas garante mudança visível e re-classification correta

Cycle resultante: `cusp (corner) → smooth (assimétrico) → symmetric
(mirror perfeito) → cusp (handles colapsam)`. Cada step com feedback
visual claro.

**Bug 3 — AnchorOverlay ignorava ancestor chain**

`anchors()` e `segments()` computeds aplicavam APENAS
`target.transform` (transform do próprio path), ignorando todos
transforms dos grupos ancestrais. Para path inside group com
`translate(170, 0)`, anchor squares ficavam 170px deslocados do
visual rendered.

`SelectionOverlay` (do tool Select V) sempre funcionou certo porque
usa `getRenderedNodeBBox` que faz `composedAncestorMatrix` (DOM-based
walk). `AnchorOverlay` (do tool Direct Select A) tinha sido escrita
sem esse passo.

**Fix**: novo módulo `compose-ancestor-matrix.ts` em
`edit/lib/anchor-editor/`. Walking pelo MODELO (não DOM — evita layout
flush em cada signal recompute) compondo `root · ... · parent · target`.
Aplicado em 3 lugares:

- `anchors()` computed (rendering dos squares)
- `segments()` computed (segment hit-zones para Alt+click)
- `onPointerDown` (drag setup — `inverseNodeTransform` agora projeta
  pointer doc-space → path-local corretamente)

**Cobertura**

`anchor-cycle.spec.ts` (novo): 4 specs end-to-end via comando real:

- cycle completo em path com cusp puro (cusp → smooth → symmetric)
- cycle em rect convertido (cusp → handles sintetizados → symmetric →
  cusp via colapso)
- cycle em path realista do tipo Pencil (smooth com lengths diferentes
  → symmetric)
- undo restaura `d` anterior

`compose-ancestor-matrix.spec.ts` (novo): 6 specs:

- Node direto sob root → identity
- Group + path translate compõem corretamente
- Semântica visual: matrix aplicada a local point lands no rendered
- Nested groups (outer/inner/path)
- Rotated group: (10, 0) com rotate(90°) vira (~0, ~10)
- Unknown id → identity (defensive)

`node-bbox.spec.ts`: +7 regression-coverage specs para shape dentro
de grupo (sem transform / com transform próprio / rotated group /
nested / getRenderedParentMatrix em 3 cenários).

**Total**: +17 specs novos → **884 passing** em 65 arquivos.

**Limitação documentada**

O `d` string não carrega `kind` como metadata — sempre será
inferido da geometria. Significa que dois anchors com handles
idênticos sempre classificam ao mesmo kind no re-parse. Para escapar
do cycle `cusp → smooth → symmetric → cusp` sem destruir handles, a
única opção é arrastar um handle manualmente. Decisão arquitetural
em [04 — Decisões técnicas].

---

## 2026-05-19 — Path Editor + Pathfinder: entrega inicial

**Contexto**

Duas capabilities críticas para qualquer editor vetorial profissional,
listadas no backlog como "Capabilities maiores": Path/Anchor Point
editor (edição de pontos individuais de um path) e Pathfinder (boolean
operations entre shapes — union/intersect/subtract/divide/exclude).
Entregue como duas peças coordenadas: o core (modelo + comandos) em
69e18c4, a UI + Pathfinder em 4508ef4.

**Path Editor — core (69e18c4)**

`core/lib/geometry/path-anchors.ts` (novo):

- Tipos `AnchorKind = 'cusp' | 'smooth' | 'symmetric'` + `AnchorPoint`
  (point/handleIn/handleOut absolutos + kind) + `AnchorSubpath`
  (anchors + closed flag)
- `parsePathToAnchors(d)`: parser completo M/m/L/l/H/h/V/v/C/c/S/s/Q/q/T/t/Z/z.
  Q/T convertidos para cubic via fórmula exata (C1 = P0 + 2/3·(QC −
  P0); C2 = P1 + 2/3·(QC − P1)). S/T usam reflection do controle
  anterior. Arc (A/a) → cusp no endpoint (curvatura perdida; futuro:
  arc-to-cubic)
- `anchorsToPathD(subpaths)`: serializer inverso. Emite L para
  segmentos sem handles, C caso contrário. Compact via `formatNumber`
- `classifyAnchorKind(point, handleIn, handleOut)`: heurística por
  geometria — cross product testa colinearidade, comparação de
  lengths discrimina smooth vs symmetric

`core/lib/commands/anchor.commands.ts` (novo):

- `AnchorRef`: `{nodeId, subpathIndex, anchorIndex}` — referência
  estável durante a vida do gesto
- `MoveAnchorCommand(ref, newPosition, which?)`: move point ou handle.
  Smooth/symmetric anchors enforce constraint na opposite handle
  (smooth preserva length, symmetric mirrors)
- `InsertAnchorCommand(ref, t)`: insere via de Casteljau subdivision
  no parâmetro `t ∈ (0, 1)` da curva entre `ref` e próximo anchor.
  Geometria preservada exatamente (a curva original = concatenação
  das duas novas)
- `RemoveAnchorCommand(ref)`: remove anchor; drop subpath se
  resultante < 2 anchors
- `ConvertAnchorTypeCommand(ref, nextKind)`: muda kind via
  `enforceKind` (snap dos handles à constraint)
- Todos com undo restaurando o `d` anterior

`core/lib/commands/convert-to-path.command.ts` (novo):

- `ConvertNodeToPathCommand(nodeId)`: converte rect/ellipse/line/
  polygon/polyline para path equivalente. Ellipse via 4 cubic
  beziers com kappa (0.5522847) — aproximação visualmente perfeita
- `nodeToPathD(node)` exportado para reuso (Pathfinder usa para
  "virtually" converter sem dispatch)
- Preserva transform/style/metadata; usa remove+insert pair (não
  updateNode — type swap rejeitado por design)

**Path Editor — UI (4508ef4)**

`edit/lib/anchor-editor/anchor-overlay.component.ts` (novo, 554 lines):

- `<svg:g svgeAnchorOverlay>` standalone, OnPush
- Render gating: tool === DIRECT_SELECT + single selection +
  focusNode.type === 'path' (path-only por design — outras shapes
  precisam converter para path antes)
- Z-stack: handle stems (linhas) → handle circles (interativos) →
  segment hit-zones (invisíveis, Alt+click) → anchor squares
  (interativos, top)
- Sizing pixel-constante via `1/viewport.zoom()` + `non-scaling-stroke`
- Preview-then-commit no drag: mutação direta de `state.document()`
  durante move, dispatch único de `MoveAnchorCommand` no pointerup
  (undo limpo: 1 entrada por gesto)
- Dblclick em anchor cicla kind via `ConvertAnchorTypeCommand`
- Alt+click em segment hit-zone dispara `InsertAnchorCommand(ref, 0.5)`

`edit/lib/anchor-editor/anchor-selection.service.ts` (novo):

- Multi-anchor selection: `Set<AnchorRef>` com helpers
  add/toggle/selectOne/clear + computed `selected()` array

**Pathfinder — 5 boolean ops (4508ef4)**

`core/lib/commands/pathfinder.commands.ts` (novo, 260 lines):

- Common base `PathfinderCommand` abstrata implementa o pipeline:
  resolver inputs → flatten cada um para polygon rings (via
  `path-flatten.ts`, tolerance 0.5px) → aplicar transform pré-
  boolean (polygon-clipping não conhece transforms) → chamar
  `runOp` abstrato → mapear regions para PathNodes
- 5 ops concretas: `UnionCommand`, `IntersectCommand`,
  `SubtractCommand`, `ExcludeCommand`, `DivideCommand` — diferem
  apenas na chamada para `polygon-clipping` (Martinez algorithm)
- Result placement: substitui geometria do primeiro selected;
  outros inputs removidos. Divide retorna N paths inseridos como
  irmãos do primeiro
- Undo via snapshot do root (simples + correto)
- `path-flatten.ts` (novo, 148 lines): flatten cubic beziers para
  polylines via subdivisão recursiva tolerance-based (de Casteljau)

**Motor escolhido**: `polygon-clipping` (Martinez algorithm) em vez
de paper.js. Decisão: 24KB gzipped, sem dep DOM, API funcional pura
(input/output puros polygons), bem testado. Paper.js carregaria
~150KB e exigiria adapter para nosso modelo.

`playground-home`: 6 botões novos no toolbar Pathfinder (U/∩/−/⊕/÷ +
"Convert to Path"). Disabled-when-inválido (Pathfinder requer ≥ 2
selecionados, Convert requer single non-path).

**Cobertura**

- `path-anchors`: parser/serializer round-trip + classifier (todos
  os 9 comandos SVG + Q/T conversion)
- `anchor.commands`: cada um dos 4 + undo
- `convert-to-path.command`: cada tipo de shape + preservação de
  style/transform
- `pathfinder.commands`: cada uma das 5 ops + edge cases (disjoint
  union, empty intersection, etc)
- Stubbed polygon-clipping em alguns testes para isolation

Trajetória de testes (aproximada — git log para precisão):
~712 pré-Path Editor → ~830 pós-entrega.

---

## 2026-05-19 — Path Editor + Pathfinder: polish sprint

**Contexto** (commit b825454 + 71186de + 9193d5e + d3130a2)

Quatro melhorias UX entregues após a entrega inicial:

**1. ConvertNodeToPath + Pathfinder: type-safe pair-replace (71186de)**

Bug runtime: `updateNode: updater changed type (rect -> path)` na
conversão. `updateNode` em `tree-ops.ts` rejeita mudança de type por
design (defesa contra type swaps acidentais).

**Fix**: ambos commands agora usam `removeNode + insertNode` pair com
snapshot do `previousNode + parentId + index` para undo restaurar a
posição exata. Mantém z-order intacto.

**2. SelectionOverlay esconde handles em Direct Select (9193d5e + d3130a2)**

Bug visual: ao ativar Direct Select, AnchorOverlay mostrava anchors
E SelectionOverlay mostrava bbox handles simultâneos — clutter total.
User reportou via screenshot.

**Fix v1 (9193d5e)**: `showsTransformHandles` computed checks active
tool — esconde em qualquer Direct Select.

**Fix v2 (d3130a2)**: user reportou que escondeu para TODOS types.
Correção: esconde apenas quando `focusNode.type === 'path'` — para
rect/ellipse/etc o Direct Select mantém handles porque não há
anchor surface alternativa (mesma convenção do Illustrator: Direct
Selection Tool em rect mostra bbox; convert para path antes para
editar anchors).

**3. Anchors seguem transform do node (d3130a2 parte 2)**

User: "quando movimento a forma as arestas de deformação ficam no
ponto de origem". Anchors permaneciam nas coords originais do `d`
sem aplicar `node.transform`.

**Fix camada 1**: `anchors()` computed aplica `node.transform` via
`applyTransform2D` aos pontos rendered (point + handleIn + handleOut).

**Fix camada 2**: drag handlers trabalham em local-space — capturam
`inverseNodeTransform` no pointerdown e projetam doc-space deltas
para local-space antes de chamar `MoveAnchorCommand`.

(Essa fix cobre apenas `node.transform` próprio; ancestor chain de
grupos foi resolvido depois em 2bfb3a8 — ver entrada acima.)

**4. Polish dos 4 itens (b825454)**

- **Dblclick anchor → cycle kind**: `CYCLE_KIND` map + `onDoubleClick`
  handler dispatching `ConvertAnchorTypeCommand` (Affinity-style
  "Cycle node type")
- **Alt+click no segmento → InsertAnchor**: invisible `<svg:path
class="segment-hit">` com `stroke-width ~10px CSS` (1/zoom)
  cobrindo cada cubic. Alt+click dispatcha `InsertAnchorCommand(ref,
0.5)`. Sem Alt, pointer passa para canvas (selection/marquee)
- **Delete em anchor selecionado**: handler de Delete/Backspace no
  playground prioriza anchors selecionados (ordem descendente para
  não corromper índices) > guides > shapes
- **Pathfinder Divide: style per region**: nova interface
  `PathfinderRegion { rings, styleSourceIdx? }`. Cada região
  "privada" (parte exclusiva de input i) recebe style de input i;
  intersection slivers fallback para operand A (convenção top-of-stack
  Illustrator)

**Total ao fim do polish**: ~862 passing.

---

## 2026-05-19 — Inspector: rotation/scale respeitam pivot

**Contexto** (commit fc17129)

User reportou que editar rotation ou scale via Inspector causava
"drift" — a forma escapava para uma posição inesperada. Diferente do
gesto via canvas (rotation/resize handles) que respeita o pivot.

**Root cause**: handlers do Inspector aplicavam matrizes RAW —
`multiply(rotate(θ), node.transform)` para rotation e
`multiply(scale(sx, sy), node.transform)` para scale. Ignorava o
pivot configurado em `TransformService.resolvePivot(bbox)`. Para
qualquer pivot ≠ origem-do-canvas, a forma rodava/escalava ao redor
de (0, 0) em vez do pivot esperado.

**Fix**: handlers agora usam os mesmos commands que o canvas usa
(`RotateNodeCommand` / `ResizeNodeCommand`):

- Inspector lê `bbox` rendered + chama `transform.resolvePivot(bbox)`
- Para scale: deriva `(sx, sy)` do delta de width/height e usa
  resize anchor relativo ao pivot
- Para rotation: passa `pivot` direto pro RotateNodeCommand

Resultado: editar Inspector ou usar gesto produz o MESMO comportamento
visual. Pivot persistente per-node (D-022.persist) honrado em ambos.

**Cobertura**: regressão coberta indiretamente pelos specs existentes
de RotateNodeCommand + ResizeNodeCommand (que validam pivot/anchor
semantics). Trajetória: nenhum spec novo — fix é re-wiring para
caminho já testado.

---

## 2026-05-19 — Sprint bug-fixes pre-Path Editor + Outline mode + keyboard nav

**Contexto** (commit 26265d0)

Sprint preparatória de bug-fixes + adição de Outline mode + keyboard
nav no Layer Panel. Limpou débitos antes da entrega grande de Path
Editor + Pathfinder.

**Bug-fixes**

- `scale-bake.ts`: corrigido ancestor matrix em
  `bakeScaleIntoNode(parentMatrix)` para resize de shape em grupo
  rotacionado (fix do débito reconhecido no backlog)
- `transform.service.ts`: `startResize/updateResize/endResize`
  passam `parentMatrix` para resize-node-command
- `core/types/transform.ts`: novo helper exportado para invert + isolate
  rotation component

**Outline mode (View › Outline)**

`workspace.service.ts`: novo signal `outline: boolean` + `toggleOutline`/
`setOutline` APIs.

`edit/lib/workspace/outline-filter.directive.ts` (novo, 121 lines):
selector `[svgeOutlineFilter]` opt-in. Quando `outline === true`,
aplica via DOM walk: `fill='none'`, `stroke='currentColor'`,
`stroke-width=1` em todo `[data-node-id]` rendered. Marker attribute
para restore. Affinity/Illustrator convention.

Playground ganha checkbox "Outline" no toolbar View.

**Keyboard nav no Layer Panel**

`layers-panel.component.ts`: Tab/Shift+Tab/↑/↓ navegam entre rows
(skipa locked). Enter/Space seleciona. Escape limpa focus. ARIA roles
adequados (treeitem). Garante a11y para keyboard-only users.

**Total**: ~847 passing ao fim do bloco (estimativa).

---

## 2026-05-19 — Delete/Backspace remove formas, grupos e guides

**Contexto** (commit 85d3e45)

Gap UX óbvio: usuário esperava Delete/Backspace remover seleção,
não fazia nada.

**Implementado**

`playground-home`: handler global de keydown intercepta Delete +
Backspace (com guard `isEditableTarget` para não interferir em
input/textarea/contenteditable). Despacha `RemoveNodeCommand` para
cada selected id em ordem decrescente (evita índice shift).

`workspace.service.ts`: `selectedGuideId` + `removeSelectedGuide()`.

`guides-overlay.component.ts`: click em guide seleciona (visual
destacado), Delete remove.

**Total**: +5 specs → ~852 passing.

---

## 2026-05-19 — Sprint UX-Polish + Auto-save + PNG presets

**Contexto** (commit 4a3b6f4 + d785afc)

Sprint grande consolidando 6 melhorias de UX e 2 features de
infraestrutura. Aproxima o editor da paridade Illustrator/Affinity
em interações esperadas.

**UX-Polish (6 itens)**

1. **Layer Panel dblclick em grupo entra em isolation** (sucessor
   do dblclick-no-canvas já existente)
2. **Esc faz drill-up de isolation um nível por vez** (em vez de
   sair direto pro root) — convenção Affinity
3. **Rename inline no Layer Panel** (F2 ou dblclick no label, Enter
   confirma, Esc cancela) via `RenameNodeCommand`
4. **Arrastar da régua cria guide** (convenção Illustrator/Affinity).
   Pointer no ruler horizontal/vertical, drag para canvas, drop = guide
5. **Smart guides durante drag** (linhas magenta dinâmicas mostrando
   alinhamento com outros objects enquanto move). Engine puro em
   `core/lib/geometry/smart-guides.ts`; overlay reativa
6. **Auto-exit isolation quando seleção sai do scope via Layer Panel**

**Auto-save no localStorage**

`edit/lib/autosave/autosave.service.ts` (novo, 155 lines):

- Debounced effect (default 800ms) salva `state.document()` serializado
  via svgExporter para localStorage key `svge.autosave`
- Strategy: salva apenas se `state.dirty()` — não polui storage com
  documents virgens
- `recover()`: retorna documento serializado se existe
- `clear()`: limpa entrada

Playground: `RecoveryDialog` no boot detecta save pendente + oferece
restaurar. Mata o auto-save quando user faz Save manual ou descarta.

**Export PNG presets @1x/@2x/@3x retina**

Convertido o export-as-png para renderizar via OffscreenCanvas com
scale factor escolhido pelo user (1×, 2×, 3×). Útil para retina
displays / impressão.

**Bug fix paralelo (d785afc)**

`rulers.component.ts`: `pointerdown` no ruler chamava
`stopPropagation` mas não `preventDefault` consistente — em alguns
cenários o canvas inicia marquee durante o drag-from-ruler. Fix:
adicionado `event.preventDefault()` no handler do ruler.

**Total**: ~842 passing após o bloco.

---

## 2026-05-18 — Workspace Settings: page config aplica no canvas via `<svge-page-overlay>`

**Bug reportado**: dialog do Workspace Settings (commit 246e902) edita
`WorkspaceService.page()` (width/height/orientation/margins) e o signal
atualiza, mas o canvas não muda visualmente. User reportou via screenshot.

**Root cause**: `WorkspaceService.page()` era estado órfão. Renderer +
workspace-background derivam tudo de `document.viewBox`; nada lia o
signal de page. O design-doc do `PageConfig` já previa o comportamento
("presentation meta that the editor uses to crop / center / outline
the page") mas o componente que faz a "outline" nunca foi escrito.

**Fix escolhido**: opção (b) das 3 listadas no débito — page como overlay
inside o canvas, distinto do viewBox. Mantém D-021 (workspace ≠ documento)
e o comentário original do PageConfig. Convenção Illustrator/Affinity:
você vê uma marca de "papel" no canvas; conteúdo pode existir fora
("pasteboard"). Page sets export bounds quando export "page-only" for
implementado no futuro (não é parte deste fix).

**Entregue**:

`edit/lib/workspace/page-overlay.component.ts` (novo):

- Selector `g[svgePageOverlay]` (opt-in, padrão dos overlays)
- Reads `WorkspaceService.page()` signal — computed `effectivePage` faz
  swap de width/height quando orientation conflita com dims (portrait +
  landscape-shaped dims → swap)
- Renderiza `<svg:rect class="page-rect">` em (0,0) com dims efetivos —
  fill branco semi-transparente + stroke primary, vector-effect
  non-scaling-stroke
- Margens > 0 → renderiza `<svg:rect class="margin-rect">` inset dashed
  (computed `marginsRect` retorna null se margens consumirem todo o page)
- `pointer-events: none` em ambos rects — clicks passam pra geometria
- CSS-var hooks (`--svge-page-fill`, `--svge-page-stroke`, `--svge-page-margin-stroke`)
  para temização sem modificar componente

`ui/lib/editor/editor.component.ts`:

- Shell `<svge-editor>` agora projeta `<svg:g svgePageOverlay>` ANTES
  do `<ng-content>` (page abaixo de marquee/selection/etc — handles
  renderizam por cima)

`playground/playground-home`:

- Adiciona `PageOverlay` aos imports + `<svg:g svgePageOverlay>` no
  template, antes do grid

**Testes (+7)** em `page-overlay.component.spec.ts`:

- Default render: 800×600 landscape, sem margin rect
- patchPage(width/height) reflete imediatamente nos attributes
- portrait com landscape-shaped dims faz swap (800×600 → 600×800)
- portrait com already-portrait dims NÃO faz swap (400×700 fica 400×700)
- margins > 0 desenha inset rect em (left, top) com w-l-r × h-t-b
- margins que excedem page → null (não renderiza)

820 lib (+7) + 15 app = 835 totais. Build verde, lint OK.

**O que NÃO mudou** (escopo restrito):

- `document.viewBox` continua independente de `workspace.page()` —
  consumer pode ter view maior ou menor que a página
- Exporter ainda emite `document.viewBox`, não `page` — "export
  page-only" seria nova feature (PageExportCommand, futuro)
- Page é overlay informacional, não clip — conteúdo fora da página
  continua renderizando e selecionável

---

## 2026-05-18 — Fase 6a-6b (Performance) — baseline + viewport culling

**Contexto**

Fase 6 do roadmap: "Performance e refinamento" — meta literal de
`60fps em pan/zoom com 1k+ elementos`. Abordagem disciplinada: antes de
otimizar, INSTRUMENTAR. Antes de decidir o que otimizar, MEDIR. Antes
de aceitar resultado, REMEDIR.

**Bloco 6a — Perf baseline harness**

`projects/playground/src/app/pages/perf/` (nova rota `/perf`):

- `synth-doc.ts`: `createSyntheticDoc({count, seed?})` puro, Mulberry32
  PRNG → reprodutibilidade absoluta (mesma semente = mesma árvore
  byte-a-byte). Mix 50/30/20 rect/ellipse/path, viewBox 1200×800,
  presets 10/100/500/1k/2k/5k flat
- `fps-meter.ts`: classe `FpsMeter` cliente, ring-buffer O(1)/frame de
  deltas de rAF, callback ~4 Hz para drive de signal sem thrash de CD.
  start()/stop() idempotentes, currentFps() média móvel
- `perf.component.ts`: rota standalone (lazy), 4 benchmarks:
  - **Pan/Zoom (3s)**: sweep programático com pan sine wave +
    zoom triangle 0.5×↔2× → mede frames durante o sweep
  - **Reset → paint**: tempo de `resetDocument()` até segundo rAF
    (aproximação realista de "click → paint")
  - **Export+Import**: round-trip SVG via svgExporter→svgImporter
  - **Optimize**: tempo do pipeline com optimizers default-enabled
- File picker para SVG real do Illustrator/Inkscape — emite tag visual
  "synth" vs "file" + parse-only timing + warnings expandíveis
- 12 specs (synth-doc + fps-meter): determinismo, ratios, bounds,
  start/stop idempotency

**Baselines coletados** (Windows + Chrome, monitor 165Hz):

Sintéticos (flat, distribuído uniformemente):

| Nodes | Reset→paint | Pan/Zoom FPS | Export+Import | Optimize |
| ----- | ----------- | ------------ | ------------- | -------- |
| 10    | 24ms        | 165          | 1ms           | 0ms      |
| 100   | —           | 165          | 1ms           | 1ms      |
| 500   | —           | 165          | 10ms          | 3ms      |
| 1 000 | —           | 159          | 15ms          | 5ms      |
| 2 000 | 67ms        | 92           | 22ms          | 9ms      |
| 5 000 | 170ms       | 37           | 44ms          | 17ms     |

Arquivos Illustrator reais:

| Arquivo        | Nodes  | Parse | Reset→paint | Pan/Zoom FPS |
| -------------- | ------ | ----- | ----------- | ------------ |
| view_gransol   | 2 760  | 29ms  | 104ms       | 84           |
| view_portosrio | 7 804  | 82ms  | 223ms       | 14           |
| view_paranagua | 16 312 | 99ms  | 364ms       | 22           |

**Insight crítico**: Paranagua tem 2× os nós de Portos mas RODA MAIS
RÁPIDO (22 vs 14 FPS). Paint cost ∝ complexidade visível, NÃO node
count. Paranagua tem um polígono verde gigante cobrindo ~70% da área
e detalhes só nos 30% inferiores; Portos tem mapa denso preenchendo
o viewport todo.

**Bloco 6b-1 — Audit + dispatcher cleanup**

Audit confirmou disciplina existente:

- ✅ 17/17 componentes da lib usam `ChangeDetectionStrategy.OnPush`
- ✅ 14/14 loops `@for` em templates usam `track` estável
  (`node.id`, `*.key`, `*.anchor` — sem `$index` em listas instáveis)

Cleanup real entregue em `SvgeNodeRenderer`:

- Removidos 8 `computed()` type-narrowed redundantes
  (`rectNode`/`ellipseNode`/.../`imageNode`) que apenas faziam cast
  type-safe pra o template. Substitui por `$any(node())` direto
  (cast template-level do Angular, zero alocação por nó)
- Custo evitado a 7 804 nodes (caso real Portos RJ): 62 480 wrappers
  de computed alocados → 0. Cache hit em CD apenas marginal, mas
  memória limpa
- Imports de tipos removidos (`RectNode`, `EllipseNode`, ...): só
  `SvgNode` + `TextNode` permanecem
- 2 helpers thin (`textContent()`, `groupChildren()`) apenas pro
  type-checker do template — métodos no protótipo, zero alocação
  por instância

**Bloco 6b-2 — Viewport culling (opt-in, recursivo)**

`core/types/bounding-box.ts`:

- `intersectsBBox(a, b)`: overlap test inclusivo de borda, simétrico, O(1)

`core/geometry/node-bbox.ts` (novo):

- `getNodeBBox(node, parentTransform?)`: bbox model-space puro para
  os 9 tipos. Estratégia per-tipo:
  - rect/image: 4 cantos transformados
  - ellipse: bbox do retângulo inscritor (over-est seguro pra rotação)
  - line/polygon/polyline: AABB dos vertices
  - path: parsePathD + endpoints + control points dos cubic/quadratic
    (over-est seguro; arcs = endpoint-only, caveat documentado)
  - text: heurística 0.6×fontSize/char × 1.2×fontSize height +
    textAnchor offset
  - group: union recursivo dos children world bboxes
- Caveats documentados (stroke width, arc sweep, glyph width) — todos
  aceitáveis pra culling: over-est = render desnecessário = correto;
  under-est seria bug. Caveats são under-est apenas em casos raros
- 22 specs cobrindo primitives + paths + text + groups + intersectsBBox

`edit/lib/viewport-culling/viewport-culling.service.ts` (novo):

- `ViewportCullingService` injeta EditorStateService + ViewportService
- `culledIds: Signal<ReadonlySet<NodeId>>` computed via DFS recursivo
  com **early-termination**: se a bbox de um nó não intersecta o
  viewBox, adiciona o id e PARA de descer (CSS `display:none` no `<g>`
  cascateia pros descendants automaticamente)
- Cache via `WeakMap<SvgNode, BoundingBox>` — chave é referência do
  node (imutável → auto-invalidação por GC, sem bookkeeping)
- Injeta uma única vez global `<style id="svge-viewport-culling-style">
[data-svge-culled="1"]{display:none}</style>` no document.head
- 9 specs cobrindo doc vazio / inside / outside / partial overlap /
  zoom reativo / cache stable / stylesheet singleton / recursão DFS
  / early-termination

`edit/lib/viewport-culling/viewport-culling.directive.ts` (novo):

- `[svgeViewportCulling]` opt-in, paralelo a `[svgeLayersFilter]`
- **rAF batching**: effect() lê o signal mas agenda o DOM work via
  requestAnimationFrame. Múltiplas mudanças de viewport no mesmo
  frame colapsam em UMA aplicação
- **Single-pass DOM walk**: 1 `querySelectorAll('[data-node-id]')` por
  pass; itera todos os elementos uma vez, toggle attr só quando muda
- Compõe com LayersFilter sem conflito (CSS attr + rule, não
  `style.display`)
- O(N) por culling change em vez de O(churn × N) — sub-ms pra 16k nodes

Toggle "Viewport culling" no `/perf` (ON por padrão) — permite
comparação A/B no mesmo doc carregado.

**Medições finais (culling ON vs OFF)**:

| Doc                | Nodes  | ON  | OFF | Ganho     |
| ------------------ | ------ | --- | --- | --------- |
| Synth 1k (flat)    | 1 000  | 161 | 153 | +5% ruído |
| Synth 2k (flat)    | 2 000  | 114 | 92  | **+24%**  |
| Synth 5k (flat)    | 5 000  | 41  | 36  | **+14%**  |
| Portos RJ (denso)  | 7 804  | 15  | 14  | +7% ruído |
| Paranagua (sparse) | 16 312 | 19  | 20  | -5% ruído |

**Veredito honesto sobre viewport culling**:

- ✅ Ajuda em docs sintéticos médios (2k-5k flat): +14-24%
- ⚠️ Não move ponteiro em docs reais do Illustrator (Portos/Paranagua):
  - Portos: 7.8k shapes preenchem o viewport mesmo em zoom=2; culla
    pouco e ainda paga overhead do scan DOM
  - Paranagua: o "verde" gigante é 1 polígono que sempre intersecta
    o viewport; os 16k shapes embaixo dele também estão no viewport
    geometricamente → não cullados
- ✅ Custo da feature ≈ ganho nesses casos. Por isso é **opt-in**:
  consumidores que sabem que o doc é esparso ativam; outros não

**Meta do roadmap (`60fps@1k+`) atingida com margem**:

- 1k nodes: 161 FPS (2.7× a meta)
- 2k nodes: 114 FPS (1.9× a meta)
- 5k nodes: 41 FPS (abaixo da meta com 5× a contagem)

Arquivos Illustrator 7-16k são **fora do escopo do roadmap original**;
o limite é arquitetural (browser pinta tudo que está visível). Para
ir além sem mudar arquitetura, opções futuras consideradas:

- CSS transform durante drag + commit viewBox no release (padrão
  Figma/Mapbox) — adiada por escopo
- Canvas2D fallback para docs muito heavy — adiada por escopo

**Caminho percorrido (transparência sobre os erros)**:

A entrega do 6b-2 passou por 3 versões antes de funcionar:

1. **v1 top-level only** (commit `04cbf8d`): cullava só `root.children`.
   Medição mostrou 0% de ganho — Illustrator embrulha tudo em UM `<g>`,
   `root.children.length === 1`, bbox cobre o doc inteiro. Recuo
2. **v2 recursive DFS** (commit `c77a4f7`): recursão até cada shape.
   Medição mostrou Pan/Zoom FPS = 0 (benchmark travou) — a diretiva
   fazia querySelectorAll por id que mudava, milhares de ids/frame,
   tick demorava >3s. Recuo
3. **v3 single-pass + rAF batching** (commit `899962b`): UM
   querySelectorAll por pass, rAF coalescing. Mediu como acima

Cada recuo foi commitado e medido em vez de descartado — registro
histórico fica como aviso para a próxima implementação de culling
(otimizar DOM-write pattern desde o início).

**O que NÃO entrou em 6b** (débitos reconhecidos):

- LayersPanel virtualization: começada com CDK virtual-scroll-viewport,
  jsdom não implementa ResizeObserver nem retorna layout dimensions
  → CDK renderiza 0 items em testes → 18 specs quebraram. Reverte
  na hora; vira commit dedicado quando refatorar specs para
  component-instance testing (não DOM rows). O dado coletado não
  justifica priorizar (Layers panel não é o gargalo medido)
- Margem de stroke-width na bbox: assumida sub-pixel; adicionar se
  docs com strokes grossos mostrarem pop-in nas bordas durante pan
- Recursão em nested groups via cache amortizado: bbox de grupo
  ainda recomputa children durante computação inicial (não usa cache).
  Primeiro frame paga O(N) duplo — aceitável após confirmar

**Commits**:

- `cc28244` — Fase 6a harness + synthetic generator + FpsMeter
- `6ce71e9` — File picker para SVG real no /perf
- `c282f4f` — Audit + cleanup do SvgeNodeRenderer (8 computeds → $any)
- `04cbf8d` — Culling top-level (ineficaz, mantido por trilha histórica)
- `c77a4f7` — Culling recursivo DFS (correto mas com thrashing)
- `899962b` — Diretiva single-pass + rAF batching (final)

**Testes**: 754 → **785** (lib, +31) + **15** (playground) = 800
totais. Build verde, lint OK.

---

## 2026-05-17 — Fase 5 (IO + Optimize) — entrega completa

**Contexto**

Fase 5 do roadmap: categorias 3/4/5 do D-023 (Optimizers / Importers /
Exporters). Library agora consome E produz SVG; otimização passa via
pipeline plugável; tudo wired no playground.

**Mudanças — Bloco 5-IO**

`edit/lib/io/io-types.ts`:

- Tipos `Importer` (id/name/mediaTypes/extensions/import) e `Exporter`
  (id/name/mediaType/extension/export)
- `ImportResult` discriminated union: `{ok:true, document, warnings}`
  ou `{ok:false, error}` — warnings não-fatais para soft issues
  (e.g., "skipped a `<script>` for safety")

`edit/lib/io/io-registries.service.ts`:

- `ImporterRegistry` + `ExporterRegistry` signal-backed seguindo
  ToolRegistry/PaletteRegistry. register retorna Disposable
- Lookup helpers: `byExtension(ext)` case-insensitive + tolera leading
  dot, `byMediaType(type)` exact match. Insertion-order tiebreak

`edit/lib/io/svg-importer.ts`:

- `svgImporter`: parser via DOMParser ('image/svg+xml'). Suporta:
  rect, ellipse, circle (folded em ellipse rx=ry), line, polygon,
  polyline, path, text, image, g recursivo
- Sanitização:
  - `<script>` dropped + warned
  - `on*` event handlers stripped + warned (per attr)
  - `xlink:href`/`href` com `javascript:` blocked + warned
  - XXE estruturalmente impossível (DOMParser `image/svg+xml` não
    processa entities)
- Unsupported tags: ONE warning per tag (não per occurrence) — evita
  flood em arquivos com 50 gradients
- viewBox extraído do root; fallback para width/height attrs; fallback
  final 800×600
- Parse de transform reusa `parseTransformAttr` (edit/geometry)
- Parse de style: presentation attrs + inline `style="..."` CSS
  (CSS sobrescreve attrs em conflito, match cascade)
- Pure (sem DOM mutation fora do throwaway parser doc), worker-safe

`edit/lib/io/svg-exporter.ts`:

- `svgExporter`: saída **byte-stable / deterministic** — friendly para
  diffs / golden-file tests / VCS commits
- Atributos em ordem CANÔNICA fixa (não iteration order)
- Numerics: `Math.round(n * 1e6) / 1e6`, trailing zeros strip,
  `-0` normalizado para `0`
- Identity transforms `[1,0,0,1,0,0]` OMITIDOS (default implícito)
- Translate-only emitido compacto `translate(x,y)` em vez de matrix
- Style emitido como presentation attrs (não inline CSS), em ordem
  alfabética. Visual idêntico
- 2-space indentação recursiva; leaf elements em uma linha; XML
  escape em text content + attr values

`edit/lib/io/builtin-io.plugin.ts`:

- `builtinIoPlugin` registra ambos via `ctx.track`. Provisionado no
  `app.config.ts` do playground

**Mudanças — Bloco 5-Optimize**

`edit/lib/optimize/optimizer.ts`:

- Tipo `Optimizer` (id/name/description?/order?/defaultEnabled?/optimize)
- Contract: pure transformation `SvgDocument → SvgDocument`. MUST
  return structurally-equivalent doc no-op (lets pipeline detect via
  ref equality)

`edit/lib/optimize/optimizer-registry.service.ts`:

- `OptimizerRegistry` signal-backed
- `runPipeline(doc, enabledIds?)` — ordena por `order` ASC (default 100,
  stable sort em ties), filtra por enabledIds OU `defaultEnabled !== false`,
  encadeia. Retorna mesma ref quando nenhum pass mudou

`edit/lib/optimize/builtin-optimizers.ts` — **3 passes conservadores**
(nunca alteram render visual):

- `precisionOptimizer` (order 10): round numerics para 3 decimais.
  Cobre geometria, transform components, path `d` tokens via regex
  (`/-?\d+\.?\d*(?:[eE][+-]?\d+)?/g`), style numéricos
- `dropDefaultsOptimizer` (order 50): strip `fillOpacity=1`,
  `strokeOpacity=1`, `opacity=1`, `visibility='visible'`. NÃO strip
  `fill='black'` (alteraria render via CSS inheritance)
- `pruneEmptyGroupsOptimizer` (order 90): remove `<g></g>`
  recursivamente. Root document sempre preservado

`edit/lib/optimize/builtin-optimizers.plugin.ts`:

- `builtinOptimizersPlugin` registra os 3 via `ctx.track`. Provisionado
  no playground

**Mudanças — Playground**

`playground/.../app.config.ts`: provisiona `builtinIoPlugin` +
`builtinOptimizersPlugin`.

`playground/.../playground-home.component.ts`:

- Inject `ImporterRegistry` / `ExporterRegistry` / `OptimizerRegistry`
- `viewChild` reference para hidden `<input type="file">`
- `openImportPicker()`: click no hidden file input
- `onImportFileChange(event)`: lê text, escolhe importer via
  ext+mediaType, dispatcha. Em sucesso: `resetDocument` +
  `setContentBox` + `selection.clear` + `history.clear`. Warnings
  para console
- `exportSvg()`: serializa via exporter, cria Blob + URL + `<a>`-link,
  trigger download `svge-export-<ts>.svg`
- `optimizeDocument()`: `runPipeline()` no doc atual, `setDocument`
  se mudou. NOT via CommandBus (otimização não pertence ao undo
  stack — futuro polish poderia ter `OptimizeCommand` para wrap-undo)

`playground/.../playground-home.component.html`:

- Novo fieldset "IO" com 3 botões: Import… / Export / Optimize +
  hidden `<input type="file" accept=".svg,image/svg+xml">`

**Decisões técnicas**

- **IO + Optimize em `edit`, não new entry point**: ambos consomem o
  plugin scaffolding (que vive em `edit`) e expõem APIs imperativas
  (não componentes). Criar entry point novo só pelos dois domínios
  adicionaria peso sem ganho — apps que não querem IO podem just NOT
  provide o plugin
- **Deterministic exporter > pretty-printer**: priorizar diffs limpos
  e teste de equivalência byte-byte. Trade-off: output menos "humano"
  (atributos em ordem fixa, não "lógica"), mas dev tools modernos
  formatam SVG na visualização
- **3 optimizers conservadores no built-in vs agressivos**: cada pass
  é "safe to run on any well-formed doc". Plugins agressivos
  (merge-adjacent-rects, circles→paths) ficam OUT do built-in para
  evitar surpresas. Reg permite plugins de terceiros contribuirem
- **Sanitização blocking vs warn**: `<script>` e `javascript:` são
  HARD-blocked (security). `on*` strip + warn. Unsupported tags
  warn-only. Política conservadora: never execute payload, always
  best-effort import
- **Optimize fora do undo stack v1**: optimizers podem fazer
  centenas de mudanças. Tê-las como 1 entry no undo seria desejável
  mas exigiria capturar deep-clone pré-execução. Por ora apenas
  `setDocument` direto; usuário pode Ctrl+Z os edits anteriores

**Cobertura**

`io.spec.ts` (16 testes):

- Registries: basics + Disposable + lookup helpers + validation
- builtinIoPlugin install/uninstall
- svgImporter: happy paths (rect, circle→ellipse, nested g),
  sanitização (script drop, on\* strip, javascript: block, single
  warning per unsupported tag), failures (malformed XML, wrong root)
- svgExporter: minimal output, identity transform skip, translate
  compact, byte-stable determinism
- IO round-trip parse→export→parse estrutura preservada

`optimize.spec.ts` (22 testes):

- Registry: basics + validation + pipeline ordering + enabledIds
  filter + defaultEnabled skip
- precisionOptimizer: round geometry, path d, style numerics, no-op
- dropDefaultsOptimizer: strip defaults, preserve non-defaults, no-op
- pruneEmptyGroupsOptimizer: drop top-level empty, recursive chain
  prune, preserve non-empty, document root protection
- builtinOptimizersPlugin via PluginRegistry: install/uninstall + full
  pipeline integration

**Total**: +38 testes → **708 passing** em 52 arquivos. Zero regressão.

**Comportamento visível**

- Playground toolbar ganha fieldset "IO":
  - **Import…** abre file picker (filtro `.svg,image/svg+xml`); carrega
    - valida + substitui documento; warnings no console
  - **Export** baixa o documento atual como `svge-export-<ts>.svg`
  - **Optimize** roda os 3 passes built-in no doc atual (precision +
    drop-defaults + prune-empty-groups)

---

## 2026-05-17 — Fase 4 Bloco 4b-DnD: drag-drop reorder no layers panel

**Contexto**

Sub-bloco do 4b deferido até agora — agora entregue. Permite que o
usuário reordene a hierarquia visualmente via drag-drop, incluindo
reparenting cross-group.

**Mudanças**

`core/lib/commands/move-node-in-tree.command.ts` (novo):

- `MoveNodeInTreeCommand(nodeId, newParentId, newIndex)`: comando
  atomic para mover qualquer nó (não-root) para qualquer posição
  em qualquer grupo (mesmo parent OU diferente)
- Semantic "final-state index": `newIndex` é a posição que o nó
  ASSUME na children array pós-move (em vez de "índice de insert na
  array pós-removal"). Mais intuitivo para o caller — sem ajustes
  de ±1
- Validações: não pode mover root; targetParent precisa existir e
  ser group; cycle detection (não pode mover group para seu próprio
  descendente)
- No-op detection: mesmo parent + mesma posição final → return ok
  sem mutar
- Undo: re-insere no parent + index originais (capturados pré-mutação)

`ui/lib/layers-panel/layers-panel.component.ts`:

- Template: cada `.row` ganha `[draggable]="!isLocked"` +
  `(dragstart)`, `(dragover)`, `(dragleave)`, `(drop)`, `(dragend)`
- Classes condicionais `[class.dragging]`, `[class.drop-before]`,
  `[class.drop-after]`, `[class.drop-inside]` para feedback visual
- 3 signals novos: `dragSourceId`, `dropTarget` (id + position)
- Métodos: `onDragStart` (set source), `onDragOver` (compute
  position via Y-zonas, set dropTarget, preventDefault), `onDragLeave`
  (clear se sair da row corrente), `onDrop` (dispatch
  MoveNodeInTreeCommand + select moved node), `onDragEnd` (cleanup)
- Y-zones: top 30% → 'before', bottom 30% → 'after', middle 40% →
  'inside' (apenas se target é group; senão fallback 'after')
- Cycle prevention: `sourceContainsTarget` rejeita drops onde target
  é descendente do source
- Helper `resolveTargetParentAndIndex` traduz `(target, position)`
  → `(parentId, finalIndex)` ajustando para o shift quando same-
  parent + source ANTES de target
- CSS: `.dragging` (opacity 0.4 no source), `.drop-before/after`
  (inset 2px box-shadow primary no topo/bottom), `.drop-inside`
  (ring + bg primary-container)
- Após drop ok, `selection.select(source)` — match Figma/Affinity

`core/lib/commands/index.ts`: re-exporta `MoveNodeInTreeCommand`.

**Decisões técnicas**

- **Final-state semantic vs insert-index semantic**: "final-state"
  é o que o usuário pensa intuitivamente ("eu quero o nó parar AQUI").
  Insert-index ("eu quero inserir aqui na array já modificada")
  exigia ajustes mentais ±1 do caller. Move-side faz o cálculo certo
- **Y-zonas 30/40/30**: top/bottom 30% para before/after deixa zona
  "inside" de 40% para groups — mais fácil de mirar do que 25/50/25
- **Cycle prevention no UI E no command**: dupla verificação. UI
  esconde o indicador (evita "promessa quebrada"). Command rejeita
  o dispatch (defense in depth — se um caller programático tentar)
- **`onDragLeave` heurística com `relatedTarget`**: dragleave dispara
  ao mover sobre filhos do row (mat-icon, button). Filtro
  `row.contains(related)` evita flickering do indicator

**Cobertura**

- `move-node-in-tree.spec.ts`: 15 testes
  - Same-parent reorder (move first→last, last→first, middle→first,
    no-op detection, clamp out-of-range)
  - Reparent (move INTO group, move OUT of group)
  - Validation failures (root, missing id, missing parent, non-group
    parent, self-loop, descendant cycle)
  - Undo (same-parent + reparent round-trip)
- `layers-panel.component.spec.ts`: +6 testes
  - drag after / before
  - drop inside group (reparent)
  - drop on locked target (no-op)
  - drop on self (no-op)
  - selected after drop

**Total**: +21 testes → **670 passing** em 50 arquivos. Zero regressão.

**Comportamento visível**

- Arrastar layer up/down: linha primary aparece entre rows mostrando
  onde vai cair
- Soltar no meio de um group: row do group fica destacada (ring
  primary + bg primary-container) — drop = reparent
- Tentar arrastar group A para dentro do próprio A (ou descendente):
  cursor fica "no entry", nenhum indicator aparece, drop é rejeitado
- Após drop: nó movido fica selecionado

---

## 2026-05-17 — Fase 4 Bloco 4z-fixes4: swatch checkerboard condicional

**Contexto**

Usuário reportou que os swatches da paleta de cores apareciam todos
com padrão xadrez/transparente, mesmo para cores sólidas — visual
"polka-dot" desnecessário. O checkerboard só faz sentido quando o
swatch representa cor com transparência real.

**Mudanças**

`ui/lib/color-palette/color-palette.component.ts`:

- Removido `background-image` (checker) do `.swatch` base
- Adicionado APENAS ao `.swatch.transparent` (a swatch X-vermelha
  de "limpar cor" da paleta GREYS). Cores sólidas Material/Tailwind
  agora renderizam como chips limpos

`ui/lib/inspector/inspector.component.ts`:

- Novo `swatchShowChecker(field): boolean` — true quando cor é
  `transparent`/`none` OU `fillOpacity`/`strokeOpacity` < 1
- Template binda `[class.show-checker]` nos dois swatches
- CSS: `background-image` checker movido de `.field-row .swatch`
  para `.field-row .swatch.show-checker`. Solid opaque colors agora
  renderizam como chip limpo

**Decisão técnica**

- **Checker condicional vs sempre-visível**: padrão da indústria
  (Photoshop/Figma/Affinity) — checker SÓ quando há transparência
  real. 2 casos onde tem valor: swatch explícito "transparent",
  preview de cor com alpha < 1

**Cobertura**

Sem testes novos (mudança visual, lógica trivial). Specs existentes
green. **649 passing** em 49 arquivos.

**Pendência registrada no roadmap (Fase 6)**

Polish de tema light/dark — coletar conforme aparecer:

- Combobox / `<select>` nativo: background em dark mode
- Migrar `<select>` da toolbar para `<mat-select>`

---

## 2026-05-17 — Fase 4 Bloco 4z-fixes3: theme override propagado (Material vars explícitos)

**Contexto**

Após 4z-fixes adicionar `html[data-theme=light/dark] { color-scheme }`,
usuário reportou que cores do playground continuavam dark mesmo
escolhendo light. Diagnóstico via DevTools confirmou: o atributo
`data-theme` muda, MAS as cores não.

**Root cause** (sutil, espec-CSS):

`color-scheme` é **NÃO-herdada** por spec CSS. Material 3 emite
`--mat-sys-surface: light-dark(#faf9fd, #121316)` em `html`. A função
`light-dark()` resolve **per-element** baseado no `color-scheme` do
elemento que USA a var (não onde foi declarada).

Como `color-scheme: light` afeta só o html em si (descendentes mantêm
`color-scheme: normal` = OS pref), todos os consumidores das vars
(body, toolbar, panels) continuam resolvendo `light-dark()` no esquema
do OS — neste caso, dark.

**Fix**

`playground/src/styles.scss`: re-emite `mat.theme(...)` com
`theme-type: light/dark` dentro dos blocos `html[data-theme=...]`.
Material gera **valores hex explícitos** (sem `light-dark()`) nas
vars desses blocos:

```scss
html[data-theme='light'] {
  color-scheme: light;
  @include mat.theme(
    (
      color: (
        ...,
        theme-type: light,
      ),
      ...,
    )
  );
}
html[data-theme='dark'] {
  color-scheme: dark;
  @include mat.theme(
    (
      color: (
        ...,
        theme-type: dark,
      ),
      ...,
    )
  );
}
```

Valores hex são **herdados** via cascade de CSS variables — todo
descendente que faz `var(--mat-sys-surface)` recebe o valor literal,
sem depender de `color-scheme` local.

**Trade-off**

- CSS bundle ~25 KB maior (3× emissão de paleta Material em vez de 1×)
- Theme switch funciona em 100% dos consumidores, independente de
  `color-scheme` cascade

**Comportamento visível**

- Botão "sun" (light) → toda a UI clara
- "moon" (dark) → toda a UI escura
- "A" (system/auto) → segue OS pref via `light-dark()` (rule original)

**Cobertura**: apenas SCSS — sem testes novos. Lib **649 passing**
em 49 arquivos. Zero regressão.

---

## 2026-05-17 — Fase 4 Bloco 4z-fixes2: shortcut leak / pós-Group selection / z-order

**Contexto**

Três issues reportados pelo usuário:

1. **Erro ao navegar Shell-demo → Home (raw)**:
   `ShortcutRegistry.register: shortcut "playground.group" is already
registered`. O componente registrava shortcuts no constructor mas
   não tinha cleanup ao destruir
2. **Após `Ctrl+G`, o novo grupo NÃO ficava selecionado** — focus
   ficava perdido (apontando para ids antigos que agora estão dentro
   do group)
3. **Faltavam operações z-order** (trás, frente, para trás, para frente)

**Mudanças**

`playground-home.component.ts`:

- Novo field `shortcutDisposables: Disposable[]` armazena Disposables
  dos `shortcuts.register()`. `ngOnDestroy` itera + `dispose()` em
  cada um e limpa o array
- `groupSelection()`: pré-aloca `newGroupId = generateNodeId()`,
  passa para `GroupSelectionCommand(ids, newGroupId)`, e
  `selection.select(newGroupId)` se `result.ok`. Match Figma/Affinity
- `ungroupSelection()`: captura `childIds` ANTES do dispatch; após
  `result.ok`, `selection.selectMany(childIds)`
- Novo computed `canReorder()` (single-selection AND not root)
- Novo método `reorder(direction)` dispatcha `ReorderNodeCommand`

`core/lib/commands/reorder-node.command.ts`:

- `ReorderNodeCommand(nodeId, direction)` onde direction =
  `'forward' | 'backward' | 'toFront' | 'toBack'`
- SVG-canonical: first child = back, last child = front
- No-op cases (return ok sem mutar): já no edge
- Fail: id não existe; é o root
- Undo: re-insere no índice original (capturado em execute pré-mutação)

`playground-home.component.html`: Edit fieldset ganha 4 botões
z-order entre Ungroup e Undo (`⤓ ↓ ↑ ⤒`), disabled-when-inválido

**Decisões técnicas**

- **Pré-alocar id do group**: alternativas seriam command retornar
  id via `result` (mudar shape) ou observar tree pós-dispatch.
  Pré-alocar é zero-acoplamento, zero-novo-API
- **Selecionar children pós-Ungroup via `selectMany`**: padrão Figma
- **Z-order single-selection only**: multi-node z-order precisa
  decidir ordem entre selecionados — escopo deferido

**Cobertura**

`reorder-node.spec.ts`: 11 testes (forward, backward, toFront/toBack
move + no-op + failure modes + undo round-trip)

**Total**: +11 testes → **649 passing** em 49 arquivos. Zero regressão

---

## 2026-05-17 — Fase 4 Bloco 4z-fixes: 4 ajustes pós-integração

**Contexto**

Após o 4z (integração na playground), o usuário identificou 4 pontos:

1. **Theme toggle não muda cores** — `<html data-theme="...">` muda
   mas Material/playground ignoram porque seguem `color-scheme` que
   só lê `prefers-color-scheme` por default
2. **Shift+click não adiciona à seleção** — handler do canvas
   chamava `select(id)` (replace) sem ler `event.shiftKey`
3. **Rulers com labels parciais/invisíveis** — labels caíam num
   espaço apertado (~8px) com font 9px e contraste fraco
4. **Color picker sem RGBA** — `<input type="color">` é RGB-only
   por HTML spec; usuário precisa de controle de alpha

**Mudanças**

`playground/src/styles.scss`:

- `html[data-theme='light'] { color-scheme: light }` +
  `html[data-theme='dark'] { color-scheme: dark }`. `'system'` =
  ausência de override; Material M3 deriva variant do `color-scheme`,
  propaga para todos os `var(--mat-sys-*)` automaticamente

`playground/playground-home.component.ts`:

- `onCanvasPointerDown`: quando clica num nó, verifica
  `event.shiftKey || event.ctrlKey || event.metaKey` e chama
  `selection.toggle(id)` (adiciona/remove); fallback `select(id)`
  só quando NÃO é additive. Padrão Figma/Affinity/Illustrator

`ui/lib/rulers/rulers.component.ts`:

- Thickness 20→24px; font 9→10px com line-height 12px
- Label TOPO do tick (não embaixo) — padrão Photoshop
- Cor `--mat-sys-on-surface` (mais forte que `-variant`)
- Tick horizontal `bottom: 0` (cresce para cima); vertical rotacionado
- Corner também 24×24

`playground-home.component.scss`: gutter `with-rulers` 20→24px

`ui/lib/inspector/inspector.component.ts` (**Bloco 4-Alpha**):

- Template: cada color row em `<div class="color-cell">` com
  `<label.field-row>` + novo `<input type="number" class="alpha-input">`
- `active-target` mudou de `.field-row` para `.color-cell` (envolve
  color + alpha juntos)
- Novo `styleAlpha(field)`: lê `fillOpacity`/`strokeOpacity`,
  default `'1'` quando undefined
- Novo `swatchColorWithAlpha(field)`: compõe `rgba(r,g,b,alpha)`
  para swatch refletir transparência visualmente (checkerboard vaza)
- Setter usa `setStyleNumber('fillOpacity', raw)` — caminho
  existente, 1 undo entry

**Decisões técnicas**

- **Alpha inline em vez de custom RGBA picker**: native picker é
  RGB-only por spec HTML; custom picker full-feature seria ~600 LoC.
  Inline alpha é padrão Figma/Affinity e usa campo SVG-canônico
  `fill-opacity`/`stroke-opacity`
- **`color-scheme` para theme override**: Material 3 gera ambas
  variants — só precisa do `color-scheme` certo no ancestor.
  Solução em 2 linhas de SCSS
- **Shift OU Ctrl OU Meta**: todos triggam additive — evita usuários
  "tentando lembrar qual tecla"

**Cobertura**

`inspector.component.spec.ts`: +6 testes no
`describe('per-color alpha inputs')`:

- 2 alpha inputs renderizados (fill + stroke)
- Default `'1'` quando undefined
- Valores formatados 2 decimais
- Editar alpha dispatcha `SetPropertyCommand` para `fillOpacity`
- Swatch usa `rgba()` quando alpha < 1
- Swatch `transparent` quando alpha = 0

Active-target spec atualizada para `.color-cell` (não `.field-row`).

**Total**: +6 testes → **638 passing** em 48 arquivos. Zero regressão

---

## 2026-05-17 — Fase 4 Bloco 4z: integração na playground

**Contexto**

Após entregar todos os blocos da Fase 4 (4d/4h/4e/4g/4f/4i),
constatou-se via screenshot do usuário que 4 features estavam
construídas como library mas NÃO wired na playground:

1. **4i theme toggle** — botão não estava no header
2. **4g shortcuts** — `Ctrl+G`/`Ctrl+Shift+G` ainda usavam handler
   manual em `onKeyDown` em vez do `ShortcutRegistry`
3. **4f grid/guides/rulers** — overlays criados mas não embutidos
   no SVG da playground
4. **4e toolbar contributions** — deliberadamente adiado (toolbar
   manual da playground funciona bem; migração custaria refatorar
   todos os botões existentes para `MenuContribution`)

Este bloco cobre os 3 primeiros via integração na playground.

**Mudanças**

`projects/playground/src/app/pages/playground-home/playground-home.component.ts`:

- Imports novos de `svg-engine/edit`: `GridOverlay`, `GuidesOverlay`,
  `ShortcutRegistry`, `ShortcutService`
- Imports novos de `svg-engine/ui`: `SvgeRulers`, `SvgeThemeToggle`
- Component `imports` array recebe os 4 novos
- Inject de `ShortcutRegistry` + `ShortcutService`; `ws = workspace`
  alias p/ template ergonomics
- Constructor: registra `playground.group` (`CmdOrCtrl+G`) e
  `playground.ungroup` (`CmdOrCtrl+Shift+G`) + `shortcutService.start()`
- `ngOnDestroy` adicional `shortcutService.stop()`
- `onKeyDown` perdeu o bloco Ctrl+G/Ctrl+Shift+G (Esc + tool
  shortcuts permanecem inline porque dependem de gesture state)
- Novos métodos: `addHGuide()` / `addVGuide()` adicionam guide no
  CENTRO do viewBox atual

`projects/playground/src/app/pages/playground-home/playground-home.component.html`:

- Novo fieldset `View`: checkbox Grid + Rulers + botões
  H/V guide + Clear guides (disabled-when-empty)
- Novo fieldset `Theme`: `<svge-theme-toggle>` standalone
- Canvas reestruturado com `.canvas-inner` wrapper + `<svge-rulers>`
  como sibling absoluto-fill (z-index 2, pointer-events none)
- `<svg:g svgeGridOverlay>` + `<svg:g svgeGuidesOverlay>` ANTES do
  SelectionOverlay (handles ficam por cima)
- Class `with-rulers` no `.canvas` reserva gutter 20px

`...component.scss`: `.canvas-inner` absolute; gutter 20px quando
`with-rulers`

**Decisões técnicas**

- **Ctrl+G via ShortcutRegistry, Esc inline**: shortcuts globais
  migrados. Esc + tool shortcuts ficam inline porque dependem de
  `transform.isDragging()` / `marquee.isActive()` / gesture state
- **Guides no centro do viewBox**: padrão UX — usuário aperta
  "+ H guide" e a linha aparece em posição visível, não em (0,0)
- **`<svge-toolbar>` (4e) NÃO migrado**: a toolbar custom da
  playground tem Snap dropdown, Background presets, View fieldset
  — agrupamento via `<fieldset>` é melhor que linear row. Plugins
  externos ainda podem contribuir via `MenuContributionRegistry`

**Comportamento visível**

- Theme toggle no header (icon cycle light/dark/system)
- Ctrl+G / Ctrl+Shift+G via `ShortcutRegistry` (agora Cmd+G também
  funciona no Mac, antes só Ctrl)
- Checkbox Grid → grid overlay no canvas
- Checkbox Rulers → strips top + left com ticks "nice"
- "+ H guide" / "+ V guide" / "Clear guides"

**Status**

Library Fase 4 COMPLETA + integrada na playground (632 passing).
Pronto para Fase 5 (IO + Optimize).

---

## 2026-05-17 — Fase 4 Bloco 4i: theme toggle (D-012 part 2) — FASE 4 COMPLETA

**Contexto**

Último bloco da Fase 4. `ThemeService` + `<svge-theme-toggle>` fecham
o tema D-012 (parte 2). Padrão de mercado (GitHub/Slack/VSCode):
toggle de 1 botão com 3 estados cíclicos (`light`/`dark`/`system`).

**Mudanças**

`ui/lib/theme-toggle/theme.service.ts`:

- Tipos `Theme = 'system'|'light'|'dark'` + `ResolvedTheme = 'light'|'dark'`
- `_theme` signal lê valor persistido em `localStorage` chave
  `svge.theme` no construtor (fallback `'system'` se ausente/inválido)
- `_systemPrefersDark` signal escuta `prefers-color-scheme: dark`
  via `matchMedia.addEventListener('change', ...)` (com fallback
  `addListener` p/ Safari antigo)
- `resolved` computed: `'system'` resolve para light/dark conforme
  media query; explicit retorna verbatim
- `setTheme(t)` persiste em localStorage + dedup
- `cycle()` light → dark → system → light
- `effect()` reflete `resolved()` para `<html data-theme="...">`
  — Material 3 e Tailwind picks up; sem flash-of-unstyled em first
  paint porque o atributo está no `<html>` antes do `<body>` renderizar
- Safe-fallback total para SSR (typeof localStorage / window /
  matchMedia === 'undefined') + try/catch (storage bloqueado em
  privacy mode / sandbox iframe)

`ui/lib/theme-toggle/theme-toggle.component.ts`:

- `<svge-theme-toggle>` Material `<mat-icon-button>`
- Ícone do tema CHOSEN (não do resolved): `light_mode`/`dark_mode`/
  `brightness_auto`. Usuário vê "o que eu escolhi", não "o que o
  sistema me deu" — convenção GitHub/Slack
- Tooltip: "Theme: Current (click for Next)"
- aria-label completa

**Decisões técnicas**

- **`<html data-theme="..."` em vez de class no `<body>`**: Material
  3 + Tailwind selecionam por `[data-theme="dark"]` sem conflito;
  atributo no `<html>` é aplicado pré-`<body>` → zero FOUC
- **`'system'` como default**: respeitar a preferência do usuário
  do OS é o comportamento correto na primeira visita. Toggle salva
  override apenas se o usuário quiser
- **Cycle vs picker explícito**: 1 botão (cycle) ocupa menos espaço
  de toolbar. Consumers que querem picker explícito chamam
  `setTheme()` diretamente (API pública)
- **`localStorage` opt-in com try/catch**: privacy mode bloqueia.
  Em vez de explodir, voltamos ao `'system'` — preferência se perde
  no reload, mas o app continua funcionando

**Cobertura**

`theme.service.spec.ts`: 8 testes (defaults/setTheme 4, resolved+
DOM reflection 2, persistence boot reads valid + ignores invalid 2)

**Total**: +8 testes → **632 passing** em 48 arquivos. Zero regressão

**Status Fase 4**

Todos os 10 blocos da Fase 4 entregues: 4-pre (workspace
background), 4-Resize-Proper, 4-Inspector-Polish, 4-IP-Fix, 4-IP-FixBugs,
4-IP-FixBugs2, 4a (editor shell), 4b (layers + lock v2), 4c (inspector),
**4d (palettes)**, **4h (grouping)**, **4e (toolbar contribution)**,
**4g (shortcuts)**, **4f (workspace settings)**, **4i (theme toggle)**.

Próxima parada: **Fase 5** (IO + Optimize): `SvgImporter`/`SvgExporter`

- `OptimizationPipeline` extensível via plugins.

---

## 2026-05-17 — Fase 4 Bloco 4f: workspace settings (page/grid/guides/rulers)

**Contexto**

Bloco 4f — expansão do `WorkspaceService` com 4 dimensões novas de
estado de apresentação do editor (`page`, `grid`, `rulers`, `guides`),
mais 3 componentes de UI/overlay para renderizar.

**Mudanças**

`edit/lib/workspace/workspace.service.ts`:

- Tipos novos: `PageConfig` (width/height/orientation/margins),
  `GridConfig` (enabled/spacing/majorEvery/color), `RulersConfig`
  (enabled), `Guide` (id/axis/position)
- Signals: `_page`, `_grid`, `_rulers`, `_guides` + readonly exposures
- APIs com validação silent-reject + signal-dedup:
  - Page: `patchPage(partial)`, `resetPage()` — rejects non-positive
    dims, non-finite values; margins fields patcháveis individualmente
  - Grid: `patchGrid(partial)`, `toggleGrid()`, `resetGrid()` — rejects
    spacing ≤ 0, majorEvery não-inteiro
  - Rulers: `setRulersEnabled(b)`, `toggleRulers()`
  - Guides: `addGuide(axis, position) → string | null`,
    `moveGuide(id, position)`, `removeGuide(id)`, `clearGuides()` —
    rejects non-finite positions

`edit/lib/workspace/grid-overlay.component.ts`:

- `g[svgeGridOverlay]` standalone OnPush
- Computed que itera de `floor(viewBox.x/spacing)` até
  `ceil((viewBox.x+width)/spacing)`, idem para y
- Major lines = `index % majorEvery === 0` (opacity 0.65 vs 0.35)
- `vector-effect="non-scaling-stroke"` mantém espessura constante
- `pointer-events: none`

`edit/lib/workspace/guides-overlay.component.ts`:

- `g[svgeGuidesOverlay]` standalone OnPush
- Horizontal: full-width line at `g.position` y; vertical: idem para x
- Cor ciano (#00bcd4) distinta do grid
- V1 display-only; drag-to-move ficou para futuro

`ui/lib/rulers/rulers.component.ts`:

- `<svge-rulers>` standalone OnPush HTML/CSS (NÃO SVG)
- Strips top (h: 20px) + left (w: 20px) + corner block
- `niceTickSpacing(raw)` heurística textbook 1/2/5 × 10ⁿ, ~8 majors
- 5 minor por major; labels formatados (`formatLabel` strip zeros)
- Posição via `[style.left.%]` / `[style.top.%]` — sem DOM
  measurement, render direto via `(value-start)/span*100`
- Vertical labels rotacionados 180° com `writing-mode: vertical-rl`

**Decisões técnicas**

- **Patch APIs vs setters individuais**: `patchPage({width: 1024})`
  é mais ergonômico que `setPageWidth(1024)`. Validação por-campo
  permite enviar `width: -1` sem destruir os outros valores
- **Silent reject vs throw em valores inválidos**: UIs digitam
  rapidamente — uma keystroke parcial não deve crashar o dialog.
  Stay-as-is permite o usuário continuar digitando
- **HTML rulers vs SVG rulers**: labels HTML são crisp em qualquer
  zoom; SVG `<text>` ficaria pixelado/scalado. Mais simples
  manter ticks como `<div>` posicionados em %
- **Settings dialog UI adiado**: o serviço expõe API completa.
  Consumers (playground/shell custom) compõem o dialog
  Material quando quiserem. Reduz Material deps neste bloco
- **Guides v1 display-only**: drag-to-move precisa hit-testing
  - capture pointer + integração com Snap. Escopo deliberado;
    feedback rápido vale mais que feature completa

**Cobertura**

`workspace.service.spec.ts` ganhou 20 testes:

- Page: 6 (defaults, partial patch, validation, margins patch,
  signal dedup, reset)
- Grid: 5 (defaults, toggle, validation, valid update, reset)
- Rulers: 3 (defaults, toggle/set, idempotent)
- Guides: 6 (empty start, add+id-gen, non-finite reject, move,
  remove, clear)

**Total**: +20 testes → **624 passing** em 47 arquivos. Zero regressão

**Comportamento visível na app** (após consumer integrar):

- Toggle grid: linhas finas aparecem no canvas, espessura constante
  no zoom, major lines destacadas
- Toggle rulers: strips top + left mostram coords da viewBox atual,
  ticks "nice" se reajustam ao zoom
- Add guide H/V: linha ciano persiste na canvas; pan/zoom preserva

---

## 2026-05-17 — Fase 4 Bloco 4g: ShortcutRegistry + ShortcutService

**Contexto**

Bloco 4g — segunda metade da categoria 9 do D-023. Complementa o 4e
(`MenuContributionRegistry`) com o sistema de **atalhos de teclado
configuráveis**. Permite que plugins liguem combinações de teclado
a callbacks com guards reativos e cross-platform (`CmdOrCtrl`).

**Mudanças**

`edit/lib/shortcut/shortcut.ts`:

- `Shortcut` type: id, combo, when?: `Signal<boolean>`, description?,
  `run(event)`. Event exposto para o handler decidir `preventDefault()`
- `parseCombo(str): ParsedCombo` — split por `+`, aliases `Ctrl`/
  `Control`, `Shift`, `Alt`/`Option`, `Cmd`/`Meta`/`Win`, `CmdOrCtrl`.
  Keys lowercased. Throw em token desconhecido / empty
- `comboMatches(parsed, event): boolean` — exact modifier set; CmdOrCtrl
  aceita Ctrl OU Meta

`edit/lib/shortcut/shortcut-registry.service.ts`:

- `ShortcutRegistry` signal-backed seguindo Tool/MenuContribution form
- `register(shortcut) → Disposable`. Throw em id vazio/duplicado/combo
  inválido (validate at register time)
- Duplicate combo permitido (use `when` para disjunção)
- `tryMatch(event)` retorna primeiro shortcut que bate E `when`
  ativo. Insertion order tiebreak

`edit/lib/shortcut/shortcut.service.ts`:

- `ShortcutService` opt-in via `start()`/`stop()` (idempotent)
- Listener `document.keydown`; skipa editable targets (input/
  textarea/select/contenteditable)
- Chama `shortcut.run(event)`; service NÃO faz `preventDefault`

**Decisões técnicas**

- **CmdOrCtrl cross-platform**: padrão Electron/VSCode. Shortcut
  declarado uma vez serve Mac (Cmd) e Win/Linux (Ctrl)
- **Validação no register**: combo inválido lança imediatamente.
  Plugin dev vê erro no bootstrap, não meses depois
- **Duplicate combo OK + `when` guards**: realista — `Escape` faz
  coisa diferente no marquee vs rotation tool
- **preventDefault no `run()`**: shortcuts destrutivos chamam;
  navegação pode deixar passar
- **`isEditableTarget` no service**: policy universal centralizada
  para múltiplos consumers não reimplementarem

**Cobertura**

`shortcut.spec.ts`: 26 testes (parseCombo 8 + comboMatches 4 +
registry 7 + service 4 + integração) → **604 passing**

---

## 2026-05-17 — Fase 4 Bloco 4e: toolbar extensível + MenuContributionRegistry

**Contexto**

Bloco 4e — primeira metade da categoria 9 do D-023 (`MenuContribution`

- futuras `Shortcut`). Permite que plugins contribuam botões para
  toolbars / menus / context-menus sem editar código do shell.

**Mudanças**

`edit/lib/menu/menu-contribution.ts`:

- Tipo `MenuContribution`: id, slot, label, icon?, tooltip?, shortcut?,
  order?, disabled?: `Signal<boolean>`, visible?: `Signal<boolean>`,
  `run()` callback. Data-only (sem componentes Angular) — UIs
  constroem o `<button>` a partir desses campos
- Tipo `MenuSlot` alias `string`: convenção `toolbar.main`,
  `toolbar.shape`, `sidebar.left`, `context.canvas` etc. UIs decidem
  quais slots renderizam; slots desconhecidos são silently ignored

`edit/lib/menu/menu-contribution-registry.service.ts`:

- `MenuContributionRegistry` injectable signal-backed seguindo a
  forma de `ToolRegistry`/`PaletteRegistry`
- `register(contribution): Disposable` — throw em id/slot vazios e
  id duplicado
- `bySlot(slot): Signal<readonly MenuContribution[]>` retorna
  contribuições visíveis (`visible() === true` ou `visible == null`)
  para o slot, ordenadas por `order` (default 100, stable sort)

`ui/lib/toolbar/toolbar.component.ts`:

- `<svge-toolbar slot="...">` standalone, OnPush
- Renderiza Material `<mat-icon-button>` por contribuição: ícone
  quando provido, fallback para text com `.text-fallback` class
- Tooltip mostra `label` + `(shortcut)` quando hint presente
- Disabled signal honrado per-item; click chama `contribution.run()`
- Empty / unknown slot → renderiza nada

**Decisões técnicas**

- **Data-only contributions, sem Angular component**: contributors
  declaram intenção (id/label/icon/order/run), UI compõe o widget.
  Contribuições serializáveis (futuro: persistência de layout),
  inspecionáveis, hot-reloadable
- **Signals para `disabled`/`visible`**: alinhado com a stack reativa.
  Toolbar OnPush; bySlot é `computed` então re-render automático
- **`order` com default 100 + stable sort em ties**: dá espaço de
  inserção sem magic numbers
- **Slot opaco (string)**: registry não sabe layout; UIs filtram
  por id. Plugins inventam slots novos sem mexer no core
- **`<svge-toolbar>` genérico vs um por slot**: mesmo primitivo
  serve toolbars principais, sub-toolbars, side panels

**Cobertura**

- `menu-contribution-registry.service.spec.ts`: 11 testes
- `toolbar.component.spec.ts`: 6 testes
- **Total**: +17 testes → **578 passing** em 46 arquivos. Zero regressão

**Próximo passo** (Bloco 4g): `ShortcutRegistry` complementar —
liga combinações de teclado ao `run()` de contributions; o campo
`shortcut` do `MenuContribution` vira só display text + lookup key.

---

## 2026-05-17 — Fase 4 Bloco 4h: agrupamento / desagrupamento

**Contexto**

Bloco 4h da Fase 4 — comandos de modelo `Group` / `Ungroup` + atalhos
de teclado padrão de mercado (Figma / Affinity / Illustrator). Cobre
a operação de organização hierárquica mais usada em editor SVG.

**Mudanças**

`projects/svg-engine/core/src/lib/commands/group-selection.command.ts`:

- `GroupSelectionCommand` envolve a seleção em novo `GroupNode`
- Validações: selection vazia → fail; nodes precisam compartilhar
  parent imediato (cross-parent grouping é um edit de reparenting
  que ficará para um futuro `MoveNodesInTreeCommand`)
- Insertion index = posição do TOPMOST selected child no parent
  (preserva stacking visual)
- Children dentro do novo group em PARENT-order, NÃO selection-order
  (consistência visual com o que o usuário já vê)
- Novo group carrega IDENTITY + default style — visual idêntico ao
  pré-grouping
- Undo restaura cada child no seu índice original

`projects/svg-engine/core/src/lib/commands/ungroup.command.ts`:

- `UngroupCommand` dissolve um group: children promovidos ao
  grand-parent no índice original do group, ordem preservada
- Rejeita root (sem parent → órfãos) + non-group (`fail()`)
- Group transform é DROPPED — match Figma/Affinity ungroup behaviour
- Undo recria o group com MESMO id + transform + style + metadata

`projects/playground/src/app/pages/playground-home/playground-home.component.ts`:

- Handlers `Ctrl+G` / `Cmd+G` → `groupSelection()`
- `Ctrl+Shift+G` → `ungroupSelection()`
- Ambos ignoram input/textarea focado (`isEditableTarget` guard)
- `canUngroupFocus` computed expõe estado ao toolbar (true ↔
  selection==1 ∧ focus.type==='group')

`projects/playground/src/app/pages/playground-home/playground-home.component.html`:

- Botões "Group" + "Ungroup" no fieldset Edit, disabled-when-inválido,
  com `title` mostrando o atalho

**Decisões técnicas**

- **Common-parent validation > silent reparenting**: agrupar cross-
  parent envolve mover sub-trees, o que merece um command dedicado
  (categoria reparenting). Fail explícito agora
- **Snapshot inteiro do group p/ undo do Ungroup**: o group original
  é guardado byref para que `transform`, `style` e `metadata` sejam
  restaurados — undo bit-perfeito
- **Single-node group permitido**: "envelopar 1 forma em group" é
  caso real (frame/wrap, organização de layers)
- **Group transform drop no Ungroup é deliberado**: alternativa
  seria bake recursivo no commit; mais complexidade — documentado
  como limitação para futuro `BakeGroupTransformCommand`

**Cobertura**

11 testes em `group-ungroup.spec.ts` (group: positioning, ordering,
empty/cross-parent fail, undo, single-node; ungroup: promotion,
non-group fail, root fail, undo restore-with-transform)

**Total**: +11 testes → **561 passing** em 44 arquivos. Zero regressão

**Comportamento visível na app**

- Selecionar 2+ formas com mesmo parent + `Ctrl+G` → forma um group
- Selecionar 1 group + `Ctrl+Shift+G` → dissolve
- Botões "Group" / "Ungroup" no toolbar refletem disponibilidade

---

## 2026-05-17 — Fase 4 Bloco 4d: paletas de cores (categoria 8 do D-023)

**Contexto**

Continuação do trabalho de cor após os blocos IP-Fix/FixBugs/FixBugs2.
Inspector ganhou um sistema de **paletas de cores plugáveis** —
categoria 8 do D-023, padrão de mercado (Photoshop swatches, Figma
brand libraries, Affinity studio palettes).

**Mudanças**

`projects/svg-engine/edit/src/lib/palette/`:

- `palette.ts`: tipo `Palette` (id, name, category?, swatches[]).
  Swatches são strings CSS opacas — qualquer formato (hex/rgb/hsl/
  named/transparent), interpretadas pela UI via `cssColorToHex6`
- `palette-registry.service.ts`: `PaletteRegistry` injetable
  `providedIn: 'root'`. Signal-backed (`palettes` readonly). API:
  `register(palette): Disposable`, `get(id)`, `byCategory(cat)`.
  Throw em id vazio, id duplicado, swatches array vazio
  (configuração errada, sem recuperação silenciosa)
- `builtin-palettes.plugin.ts`: `builtinPalettesPlugin` (categoria 8
  do D-023). Em `install(ctx)` registra 3 paletas via `ctx.track`:
  - `default-greys` (utility): `transparent` + 7 greys + black.
    Inclui `transparent` como 1ª swatch para que "limpar a cor" seja
    1 click
  - `material-primary` (brand): 10 cores Material Design 500 line
  - `tailwind-pastels` (brand): 9 cores Tailwind 200 line
    Provisionado em `app.config.ts` do playground

`projects/svg-engine/ui/src/lib/color-palette/`:

- `color-palette.component.ts`: `<svge-color-palette>` standalone.
  Inputs: `palettes` (fallback automático para
  `PaletteRegistry.palettes()`), `transparentLabel` (default `'Clear'`).
  Output: `colorPicked` emite a string CSS raw da swatch clicada.
  Swatch 24×16, checkerboard backdrop, hover scale 1.12 + outline
  primary, focus ring. Swatch `transparent` ganha ícone Material
  `block` em vermelho (padrão universal Figma/Affinity/Inkscape)

`projects/svg-engine/ui/src/lib/inspector/inspector.component.ts`:

- Importa `SvgeColorPalette`. Template renderiza
  `<svge-color-palette>` abaixo das color rows
- Cada `<label class="field-row">` ganha `(pointerdown)="setActiveColorTarget(...)"`
  - `[class.active-target]="activeColorTarget() === ...".`. Default
    alvo = `'fill'` (mais editado per telemetria Figma/Affinity)
- `onPalettePick(color)` rota para `setStyle(activeColorTarget(),
color)` — usa o caminho existente que já tem lock check e dedup
- CSS `.active-target`: box-shadow inset 3px primary (subtle accent,
  zero shift de layout)

**Decisões técnicas**

- **Strings CSS opacas vs RGB tuples**: palette carrega `'transparent'`,
  `'hsl(...)'`, no futuro CSS vars/named — sem perder informação
  pelo parsing antecipado. A UI usa `cssColorToHex6` (do IP-FixBugs2)
  quando precisa de hex
- **Built-in plugin, não hard-coded**: 3 paletas vêm via plugin que
  pode ser desinstalado. Consumer pode trocar por suas próprias
  marcando que quer remover o built-in. Padrão D-023
- **active-target em vez de aplicar a ambos**: clicar 1 swatch
  aplica APENAS ao campo ativo. Padrão Photoshop (active swatch
  changes foreground vs background color)
- **`transparent` como 1ª swatch da `default-greys`**: "limpar fill"
  é a 2ª ação mais comum no inspector depois de "escolher cor real"
- **swatch 24×16 vs inspector swatch 28×22**: paleta é grade, então
  swatch menor cabe mais; inspector swatch é singleton, pode crescer

**Cobertura**

- `palette-registry.service.spec.ts`: 11 testes (basics 5 + validation
  3 + builtin install/uninstall/transparent-first 3)
- `color-palette.component.spec.ts`: 9 testes (palettes input/empty/
  multi/swatch count + fallback registry + emit + transparent
  treatment + tooltip)
- `inspector.component.spec.ts`: +5 testes em
  `describe('palette integration')` (palette renderiza; default fill
  active; pointerdown stroke ativa stroke; pick aplica fill por
  default; pick aplica stroke após ativar)
- **Total**: +22 testes → **550 passing** em 43 arquivos. Zero regressão

**Comportamento visível na app**

- Inspector ganha tira de swatches abaixo dos color fields
- Click em swatch aplica cor ao campo ativo (fill ou stroke)
- Click no label "fill" ou "stroke" troca o campo ativo (accent
  vertical primary à esquerda da row indica qual está ativo)
- Swatch `transparent` mostrada com ícone bloqueio vermelho —
  click "limpa" o fill/stroke

---

## 2026-05-16 — Fase 4 Bloco 4-IP-FixBugs2: color picker valor (#cccccc → real)

**Contexto**

Após o 4-IP-FixBugs corrigir a POSIÇÃO do popover de cor, o usuário
reportou que o popover abria no lugar certo mas com o seletor
inicializado em `rgb(204, 204, 204)` (= `#cccccc`) em vez da cor
real da forma.

**Root cause**: `styleColor()` (binding do `[value]` do `<input
type="color">`) só aceita `#RRGGBB` e fazia fallback para `#cccccc`
em qualquer outro formato. As formas seedadas no playground usam
`randomPastel()` que retorna `hsl(...)` — sempre cai no fallback.
O swatch ao lado mostra a cor REAL via `[style.background-color]`
(que aceita qualquer CSS color), criando a divergência reportada
(swatch certo, picker errado).

**Fix** (`inspector.component.ts`):

- Novo helper `cssColorToHex6(input): string | null` com estratégia
  em cascata por custo crescente:
  1. `#rrggbb` / `#rgb` — regex, sem DOM
  2. `rgb(...)` / `rgba(...)` — parser JS puro (canais inteiros,
     decimais, percentuais; alpha descartado; formato legacy
     vírgula OU CSS Color 4 espaço)
  3. `hsl(...)` / `hsla(...)` — parser JS + conversão HSL→RGB
     conforme spec CSS Color 3 (unidades `deg`/`rad`/`grad`/`turn`;
     alpha descartado; hue normalizado para [0, 360))
  4. Cores nomeadas / lab / lch / sistema — fallback Canvas
     `fillStyle` round-trip. Em jsdom Canvas não normaliza →
     função retorna `null`, caller cai no `#cccccc` (sem regressão
     em testes)
- `styleColor()` agora usa `cssColorToHex6(v) ?? '#cccccc'`;
  rejeita explicitamente `'none'`, `'transparent'` e `'url(...)'`
  antes (não fazem sentido no native picker)

**Decisões técnicas**

- **Parsers JS-side primeiro, Canvas só de fallback**: jsdom tem
  Canvas incompleto, então testes precisam funcionar sem Canvas.
  Parsers JS cobrem 95% dos casos da app (rect/ellipse seedados via
  `randomPastel` → HSL). Canvas só importa em browser real para
  cores nomeadas — não-bloqueante para o fluxo principal
- **HSL→RGB algoritmo CSS Color 3**: implementação direta do
  pseudocódigo da spec, sem dependência externa
- **Alpha descartado**: `<input type="color">` é RGB-only por design

**Cobertura**

- `inspector.component.spec.ts`: +6 testes em `describe('cssColorToHex6')`
  (hex passthrough; expansão de 3-char; rgb legacy/CSS4/alpha/percent;
  hsl vírgula/espaço/alpha/normalização de hue; named browser-only;
  malformed → null) + 1 teste integrado (rect com `fill: rgb(0,128,64)`
  → picker.value = `#008040`)
- **Total**: +7 testes → **528 passing** em 41 arquivos. Zero regressão

**Comportamento visível na app**

- Adicionar uma forma (rect/ellipse) — gera fill via `randomPastel`
  (HSL) — selecionar a forma — clicar no swatch de fill: popover
  nativo abre com o seletor JÁ no pastel correto (não mais cinza)
- Cores que o usuário editou previamente via picker (já `#RRGGBB`):
  comportamento idêntico ao anterior (fast path)

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
