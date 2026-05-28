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

## Metodologia (lições aprendidas em 2026-05-28)

Durante uma rodada de auditoria, **5 de 6 itens** que apareceram como
"pendentes" estavam na verdade implementados ou obsoletos. Padrão recorrente:

1. **Confiar em label de task list** sem ler o código → PAGES-FIX-2 (já feito)
2. **Confiar em entrada deferred antiga** sem checar features novas que superaram → Export with Options (superseded por D-077)
3. **Confiar em header de docstring** sem ler o corpo das classes → Smooth/Gradient/Width
4. **Confiar em sumário de agente** sem cross-check no código → D-072g
5. **Confundir "5 services centralizados existem"** com "5 follow-ups pendentes" → D-044

**Protocolo agora aplicado**:

- ❌ Não anotar item como pendente sem evidência `file:line` no código
- ❌ Não confiar em sumário de agente, label ou comentário de doc antigo
- ✅ Para cada item suspeito: rodar grep/read no código atual
- ✅ Verificar se feature mais recente superou o item antigo (supersedure check)
- ✅ Registrar evidência aqui (file:line + comando que provou)

---

## Pendências REAIS confirmadas (2026-05-28)

### 1. Asset export persistence — `MÉDIA`

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

### 2. NLU intent ranking — `BAIXA` (workaround documentado)

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

### 3. Header "(stub)" desatualizado em extra-tools.ts — `BAIXA` (cosmético)

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

### 4. Doc 06 sobre dialog-shell — `MÉDIA` (DX de plugin)

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

### 5. About SVGEngine Material-styled — `BAIXA` (cosmético)

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
