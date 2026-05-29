# 11 — Auditoria de Pendências

> **Propósito**: registro persistente do estado real das "pendências" que
> aparecem em sumários, labels de task e notas antigas. Cada item carrega
> evidência concreta (file:line + comando de verificação) para evitar
> alucinação por confiança em rótulos desatualizados.
>
> **Regra de manutenção**: ao tomar uma decisão ou shipar uma feature
> que afeta um item desta lista, atualizar o status aqui. **Nunca**
> remover um item — só virar o status, manter a evidência histórica.

---

## 🔴 Protocolo obrigatório: AUDITAR antes de AGIR

> **Estabelecido em 2026-05-29 pelo proprietário do projeto, como regra absoluta.**
>
> _"A auditoria é sempre necessário antes de qualquer ação para termos a
> certeza das mudanças, seja para documentação ou código."_

Esta regra **não admite exceções**. Vale para:

- ✋ **Antes de mudar código**: ler os arquivos afetados + procurar
  cross-references via grep. Nunca alterar baseado em memória de sessão
  anterior, label de task, ou inferência a partir de filename.
- ✋ **Antes de atualizar doc**: confirmar cada claim do doc velho contra
  o código atual (não copiar texto antigo sem reverificar).
- ✋ **Antes de registrar pendência**: rodar grep/read e provar que o
  item realmente está em estado "X" via `file:line`.
- ✋ **Antes de afirmar "X existe / Y falta"**: pedir evidência (sua
  própria via Read/Grep, ou de subagente com instrução anti-alucinação
  explícita) — _nunca_ confiar em sumário de agente prévio sem
  cross-check, _nunca_ confiar em comentário de doc antigo.
- ✋ **Antes de pedir ao usuário para revisar**: garantir que o que está
  sendo apresentado tem evidência rastreável, não só prosa.

### Por que isso virou regra dura

Em 2026-05-28, durante uma rodada de auditoria, **5 de 6 itens** que
apareceram como "pendentes" estavam na verdade implementados ou
obsoletos. Padrão recorrente das 5 alucinações:

1. **Confiar em label de task list** sem ler o código → PAGES-FIX-2 (já feito)
2. **Confiar em entrada deferred antiga** sem checar features novas que superaram → Export with Options (superseded por D-077)
3. **Confiar em header de docstring** sem ler o corpo das classes → Smooth/Gradient/Width
4. **Confiar em sumário de agente** sem cross-check no código → D-072g
5. **Confundir "5 services centralizados existem"** com "5 follow-ups pendentes" → D-044

### Checklist operacional

- ❌ Não anotar item como pendente sem evidência `file:line` no código
- ❌ Não confiar em sumário de agente, label ou comentário de doc antigo
  sem reverificar
- ❌ Não alterar código baseado em "lembrança" de sessão anterior
- ❌ Não atualizar doc copiando texto velho — reverificar cada claim
- ✅ Para cada item suspeito: rodar grep/read no código atual
- ✅ Verificar se feature mais recente superou o item antigo (supersedure check)
- ✅ Registrar evidência aqui (file:line + comando que provou)
- ✅ Quando usar subagentes: briefing explícito anti-alucinação +
  exigir `file:line` em cada claim + cap de palavras pra forçar foco
  em evidência
- ✅ Quando 2+ agentes concordam com `file:line` independentes → alta
  confiança; quando só 1 → marcar como single-source na consolidação

### Ferramentas que ajudam

- `Grep` com `output_mode: "content"` + `-n true` retorna `file:line` direto
- `Read` com `limit`/`offset` para inspecionar trecho exato
- `git log --oneline -N` para confirmar quando uma feature shipou
- `git log --grep="<termo>"` para encontrar o commit que entregou X
- Subagentes paralelos quando o escopo é grande (5-6 dimensões em paralelo
  reduzem tempo e expõem contradições — se 2 agentes discordam, sinal de
  ponto onde verificação extra é necessária)

---

## Pendências REAIS confirmadas (2026-05-28)

> **Atualização 2026-05-28 round 2** — autonomia: 4 dos 5 itens
> entregues. Item #2 (NLU tiebreaker) ficou intencionalmente diferido
> por risco vs benefício (workaround documentado, change quebraria
> spec-trava de scoring constants).

### 1. Asset export persistence — `MÉDIA` → ✅ **IMPLEMENTADO** (commit autonomous round 2)

**Evidência**:

- API pronta: `AssetExportRegistry.setAll()` em `projects/svg-engine/edit/src/lib/asset-export/asset-export-registry.service.ts:87`
- Comment do tipo em `asset-export.types.ts:18-19` afirma: _"the host app decides whether to round-trip through localStorage or the document file format"_
- Grep `setAll(` retorna **apenas** no spec do registry (test fixture) — nenhum consumer em produção
- `AutoSaveService` não conhece `AssetExportRegistry`

**Verificação**:

```bash
grep -rn '\.setAll(' projects/svg-engine/edit/src/lib/asset-export/
# Só aparece em asset-export-registry.service.spec.ts (fixture)
```

**O que falta**:

- Serviço novo `AssetExportPersistenceService` (espelho do `SnapshotsPersistenceService`)
- Effect que chama `registry.setAll(JSON.parse(localStorage.getItem(KEY)))` no startup + `localStorage.setItem(KEY, JSON.stringify(registry.slots()))` em mudanças
- Token de storage key (per-editor, mesmo pattern do D-073)
- Wire-up no scope provider

**Impacto**: usuário perde as slots ao recarregar a página.

---

**Entrega**: criado `AssetExportPersistenceService` espelhando `SnapshotsPersistenceService` (D-073).
Auto-hydrate no constructor + auto-save com debounce 500ms, schema v1, key configurável
via `ASSET_EXPORT_STORAGE_KEY` token (per-editor via D-042 scope). 9 specs novos cobrindo
round-trip / schema gate / payload corruption / cross-editor isolation.

### 2. NLU intent ranking — `BAIXA` (workaround documentado) — ⏭️ **INTENCIONALMENTE DIFERIDO**

**Por que não entreguei na round 2**: a "correção" proposta no FUTURE-FIX (bumpar
`SLOT_BONUS_REQUIRED` de 0.10 → 0.15) **quebra a invariant test** em
`scoring-constants.spec.ts:40` (constante congelada) E **quebra os cenários
calibrados** em `expectedScore` (`// 0.5 + 0.25 + 0.10 + 0.10 = 0.95`). O comment
do scoring-constants.ts é categórico: _"REGRA DE OURO: qualquer mudança numérica
aqui DEVE rodar scoring-constants.spec.ts que tem fixtures cobrindo casos limite"_.

Mudar o constante exigiria **re-calibração de ~50 user commands** (a base
empírica original), o que escapa do escopo de "autonomous round" — risco vs
benefício péssimo para um edge case com workaround documentado
("selecionar tipo retangulo" em vez de "selecionar todos retangulos").

**Caminho alternativo se quiser fechar**: implementar tiebreaker de "filled slots"
no scorer (não na constante) — preserva os scores ao mesmo tempo que muda o
desempate. Não fiz porque é uma re-arquitetura, não um bump de constante.

### 2-OLD. NLU intent ranking — original info abaixo

**Evidência**:

- Spec skipped em `projects/svg-engine/ai/nlu/src/lib/intents/professional-intents.spec.ts:214`:
  ```
  it.skip('FUTURE-FIX: select-by-type deveria vencer select-all quando há shape específica', ...)
  ```
- Comment detalha a correção (linhas 215-222): aumentar peso de slot required filled de 0.10 → 0.15 quando intent matched só por keyword

**Verificação**:

```bash
grep -rn 'it\.skip\|FUTURE-FIX' projects/svg-engine/ai/nlu/
# 1 ocorrência: professional-intents.spec.ts:214
```

**O que falta**:

- Ajuste de peso no scorer (`src/lib/parsers/...`)
- Remover `.skip` do test

**Impacto**: edge case onde "selecionar todos retangulos" cai em select-all em vez de select-by-type. Workaround válido: "selecionar tipo retangulo".

---

### 3. Header "(stub)" desatualizado em extra-tools.ts — `BAIXA` (cosmético) — ✅ **CORRIGIDO** (autonomous round 2)

Header reescrito explicando o estado real: Width + Symbol Sprayer são reais (D-062a/D-062b),
Mesh foi removido (D-062-fix). Tag "(stub)" eliminada do título.

### 3-OLD. Header "(stub)" — original info abaixo

**Evidência**:

- `projects/svg-engine/edit/src/lib/tool/extra-tools.ts:453`:
  ```
  // ── 5/6/7. Width / Mesh / Symbol Sprayer (stub) ──────────────────────
  ```
- Docstring (linhas 455-469) descreve as 3 tools como "stub" mas:
  - **Width** é real desde D-062b (`expandStrokeWithProfile` + 3 profiles + service com signal)
  - **Symbol Sprayer** é real desde D-062a + D-063 (preview service + overlay)
  - **Mesh** foi REMOVIDO em D-062-fix (task #221)

**Verificação**:

```bash
sed -n '453,470p' projects/svg-engine/edit/src/lib/tool/extra-tools.ts
```

**O que falta**:

- Atualizar comment header pra: "5/6. Width / Symbol Sprayer (real D-062a/D-062b)"
- Reescrever docstring "Stub tool" — não se aplica mais

**Impacto**: nenhum em runtime. Causa confusão em auditorias futuras.

---

### 4. Doc 06 sobre dialog-shell — `MÉDIA` (DX de plugin) — ✅ **DOCUMENTADO** (autonomous round 2)

Adicionada seção "Dialog design system — `<svge-dialog-shell>` + `svgeDialogConfig` (D-044 follow-up)"
em `docs/06-componentes-editor-svg.md` com: quando usar, tabela de 4 buckets, tabela de
4 content-projection slots, exemplo end-to-end (component + service + menu wire-up),
nota sobre D-017 boundary.

### 4-OLD. Doc 06 — original info abaixo

**Evidência**:

- ZERO ocorrências de `dialog-shell`, `svge-dialog-shell`, `svgeDialogConfig` ou `SvgeDialogShell` em `docs/06-componentes-editor-svg.md`
- Explicitamente marcado como deferred na entrada D-044 follow-up do histórico (linha 6297-6298): _"Documentação no docs/06-componentes-editor-svg.md sobre como criar novos dialogs usando o shell — deixar para o próximo doc-catchup consolidado"_

**Verificação**:

```bash
grep -c 'dialog-shell\|svgeDialogConfig' docs/06-componentes-editor-svg.md
# Retorna 0
```

**O que falta**:

- Seção nova em doc 06 com:
  - Quando usar `<svge-dialog-shell>` (sempre que abrir um Material dialog)
  - Buckets do `svgeDialogConfig` (`sm` 440 / `md` 600 / `lg` 720 / `xl` 960)
  - Os 4 content-projection slots (`default` body, `svgeDialogHeaderActions`, `svgeDialogFooterActions`, `svgeDialogFooterStatus`)
  - Exemplo end-to-end (component + service + wire-up no menu plugin)
  - Pattern do "centralized opener service" (mesmo pattern dos 5 services D-044)

**Impacto**: plugin authors externos não têm guidance pra integrar dialogs novos. Atualmente teriam que ler o código fonte dos 5 dialogs existentes para inferir o pattern.

---

### 5. About SVGEngine Material-styled — `BAIXA` (cosmético) — ✅ **IMPLEMENTADO** (autonomous round 2)

Criado `<svge-about-dialog>` + `SvgeAboutDialogService` em
`projects/svg-engine/ui/src/lib/about-dialog/`. Item de menu **migrado** do
edit-side plugin (que só podia chamar `alert()`) para o UI-side plugin
(`builtinUiMenuContributionsPlugin`), respeitando D-017. Bucket `'sm'` (440px)
do `svgeDialogConfig`. Mesmo ID do item antigo (`svge.builtin.help.about`)
preservando back-compat.

### 5-OLD. About SVGEngine — original info abaixo

**Evidência**:

- `projects/svg-engine/edit/src/lib/menu/builtin/builtin-menu-contributions.plugin.ts:1636`:
  ```ts
  run() {
    alert(
      'SVGEngine — headless-first SVG editor for Angular.\nhttps://github.com/mosaicoo/builtin-ui-menu-contributions.plugin.ts',
    );
  },
  ```
- `projects/svg-engine/ui/src/lib/menu-extras/builtin-ui-menu-contributions.plugin.ts:71` registra como deferred: _"About SVGEngine (Material-styled About box vs the alert in the edit-side plugin)"_
- Grep `svge-about\|AboutDialog\|svgeAbout` retorna zero ocorrências

**Verificação**:

```bash
grep -rn 'About SVGEngine\|svge-about\|AboutDialog' projects/svg-engine/ui
# Só comment do plugin UI
```

**O que falta** (escopo pequeno mas exige cross-boundary):

- Criar `projects/svg-engine/ui/src/lib/about-dialog/` com:
  - `about-dialog.component.ts` — usa `<svge-dialog-shell>` ('sm'), mostra versão, GitHub link, license
  - `about-dialog.service.ts` — opener centralizado padrão D-044
  - `index.ts`
- Mover registro do item Help ▸ About SVGEngine do `builtinMenuContributionsPlugin` (edit) para `builtinUiMenuContributionsPlugin` (ui) — porque envolve MatDialog, viola D-017 ficar em edit
- Manter compat: edit-side plugin perde o item, UI-side ganha
- Doc-catchup na entrada D-044 do histórico

**Impacto**: cosmético — `alert()` é funcional mas pobre UX em comparação com dialog Material.

---

### 6. Sistema de unidades na régua (mm/cm/in/pt) — `MÉDIA` (deferred — future feature)

**Contexto** (registrado em 2026-05-28 a pedido do usuário, após auditoria do selection-band shipped no commit `72ddc34`): a régua hoje mostra apenas **unidades abstratas de documento** (mesmo espaço do `viewBox`). Não há unidade física associada nem sufixo no label. Quando o `viewBox` está em pixels, os valores coincidem numericamente com pixels CSS, mas a régua não afirma isso em lugar nenhum — é convenção, não contrato.

**Evidência**:

- `projects/svg-engine/edit/src/lib/workspace/workspace.service.ts:35-37`:
  ```
  Units are abstract document units — same as `viewBox`. We don't bake
  in mm/in/px here because conversion is the consumer's job (depends
  on output device DPI). A future `units` extension can layer on top.
  ```
- `projects/svg-engine/ui/src/lib/rulers/rulers.component.ts:731-735` — `formatLabel(value)` retorna número puro sem sufixo de unidade:
  ```ts
  function formatLabel(value: number): string {
    if (Math.abs(value) >= 1000) return `${Math.round(value)}`;
    if (Math.abs(value) >= 1 || value === 0) return `${Math.round(value * 100) / 100}`;
    return value.toFixed(2);
  }
  ```
- Não existe nenhum signal `currentUnit` no `WorkspaceService` nem token `EDITOR_UNIT_SYSTEM`. Grep `'mm\\|cm\\|in\\b\\|pt\\b'` no diretório `rulers/` retorna zero hits relevantes pra unidade.

**Verificação**:

```bash
grep -rn 'currentUnit\|unitSystem\|EDITOR_UNIT' projects/svg-engine/
# Zero hits
grep -n 'formatLabel\|niceTickSpacing' projects/svg-engine/ui/src/lib/rulers/rulers.component.ts
# formatLabel: 731 (sem sufixo); niceTickSpacing: usa "px" implícito
```

**O que falta** (escopo de uma decision nova, provável D-080 quando priorizado):

1. **Modelo de unidades** em `WorkspaceService`: signal `currentUnit: 'px' | 'mm' | 'cm' | 'in' | 'pt'` + signal `dpi: number` (default 96) configuráveis per-editor (via D-042 scope).
2. **Conversão doc → unit display**: helper puro `convertDocToUnit(value, unit, dpi): number` (px = 1:1 com doc unit; mm = `value / dpi * 25.4`; in = `value / dpi`; pt = `value / dpi * 72`; cm = `mm / 10`).
3. **Sufixo no label** quando `unit ≠ 'px'`: `formatLabel(value, unit)` retorna `"50mm"` em vez de `"50"`. Atalho: se `currentUnit() === 'px'`, manter o comportamento atual (sem sufixo) pra evitar regressão visual.
4. **`niceTickSpacing` ajustado por unit**: hoje o algoritmo escolhe 1/2/5/10 × 10^N que faz sentido em pixels; em mm/cm precisamos da mesma família mas em escala diferente (1mm, 5mm, 10mm, 50mm…). Provavelmente o mesmo nice-spacing funciona, mas precisa rodar zoom-out extremo pra validar que os labels não colidem.
5. **UI em Workspace Settings**: dropdown `<mat-select>` "Display unit" no `<svge-workspace-settings-dialog>` ligando ao signal. Persistir via `WorkspaceConfig` (round-trip pelo file format ou localStorage, mesmo pattern do D-073/D-077).
6. **Inspector + Page sizes alinhados**: a unit configurada deve refletir no Inspector (campos `x`, `y`, `width`, `height` mostrarem `50mm` quando unit=mm) e no Page sizes preset list (A4 = 210×297mm já em mm-native em vez de 794×1123px).
7. **Round-trip no SVG export**: emitir `<svg width="50mm" height="50mm" viewBox="0 0 189 189">` quando unit=mm, preservando a unidade declarada quando o SVG é re-aberto.

**Impacto**:

- Sem isso, a régua é "honest about being abstract" mas users vindos de Illustrator/Figma esperam ver "mm" / "in" quando trabalham em layouts pra print.
- Bloqueia features de print/export físico (PDF com tamanho real, export de assets pra mídia impressa em DPI específico).

**Por que está deferred**: o usuário sinalizou explicitamente "será algo que teremos que avançar em algum momento". É feature transversal (toca rulers + workspace + inspector + page sizes + export) e merece um D-080 dedicado em vez de squeeze em outra task.

**Workaround atual**: usuário pode mentalmente assumir que `1 doc unit ≈ 1px CSS` quando o viewBox usa dimensões em pixels. Para print, exportar SVG e abrir em ferramenta externa que aplique a unidade real.

---

## Itens INICIALMENTE listados como pendentes mas CONFIRMADOS já resolvidos

### Page selection overlay specs — `JÁ COBERTO`

**Evidência**:

- `projects/svg-engine/edit/src/lib/pages/page-selection-overlay.spec.ts` tem **435 linhas, 13 it() blocks** cobrindo:
  - 3 testes de render gates (null when no page / null when not selected / overlay when active)
  - 2 testes de geometria de bracket (TL e BR)
  - 3 testes de drag preview (move / resize TR / resize BL clamp to MIN_PAGE_DIM)
  - 2 testes de pointerup (MovePageCommand + ResizePageCommand dispatch)
  - 1 teste de push pra PageDragService
  - 2 testes de ESC (cancel + no-op outside drag)

**Verificação**:

```bash
wc -l projects/svg-engine/edit/src/lib/pages/page-selection-overlay.spec.ts
# 435
grep -c '^\s*it(' projects/svg-engine/edit/src/lib/pages/page-selection-overlay.spec.ts
# 13
```

**Veredito**: minha alegação de "área frágil sem regression specs" estava errada. Cobertura é boa para o componente.

---

### Export with Options dialog — `OBSOLETO` (superseded por D-077)

**Evidência**:

- Histórico (linha 6293) lista como deferred _"Export with Options… dialog (formato + dimensões + qualidade)"_
- D-077 (AssetExportPanel) shipou DEPOIS, com:
  - Formato (via `ExporterRegistry`, exporterId per slot — SVG/PNG)
  - Dimensões (campo `scale` numérico per slot — @1x/@2x/@3x)
  - Batch persistente (vantagem sobre dialog one-shot)
- "Quality" não se aplica porque os 2 exporters built-in são lossless (SVG vetor + PNG DEFLATE)

**Verificação visual**: screenshot do usuário em 2026-05-28 mostra panel com 3 slots cobrindo todos os atributos.

**Veredito**: deferred OBSOLETO. Quando adicionarmos JPEG/WebP no futuro, estender `ExportSlot` com campo `quality?: number` opcional (não criar dialog separado).

---

## Como atualizar este documento

1. **Ao auditar um item novo**: rodar a verificação com comando exato (grep/read/wc) e colar o output. Anotar `file:line` específico.
2. **Ao implementar um item**: virar status para `JÁ COBERTO` na seção apropriada, manter evidência.
3. **Ao descobrir que algo está obsoleto** (feature nova superou): mover pra "OBSOLETO" com referência ao D-XXX que substituiu.
4. **Ao referenciar este doc em commit**: usar título de seção como anchor (ex.: "fix per `docs/11-auditoria-pendencias.md` §1").
