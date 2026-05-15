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

## Fase 1 — Scaffold do workspace (Angular v21)
- [ ] `npx --yes -p @angular/cli@21 ng new SVGEngine --create-application=false --directory=. --skip-git --package-manager=npm --strict`
- [ ] `ng generate library svg-engine --prefix=svge`
- [ ] `ng generate application playground --routing=true --style=scss --prefix=app`
- [ ] `ng add @angular/material@21 --project=playground` (tema a confirmar — D-012)
- [ ] ESLint + Prettier + EditorConfig
- [ ] Husky + lint-staged (commit hooks)
- [ ] CI mínimo: lint + build da library + build da app
- [ ] Atualizar `02-arquitetura.md` com a estrutura real gerada

## Fase 2 — Núcleo do editor (sem UI rica ainda)
- [ ] Modelo `SvgNode` (Rect, Ellipse, Path, Group, Text, Image)
- [ ] `EditorStateService` com signals
- [ ] `HistoryService` (undo/redo via Command pattern)
- [ ] `<svg-canvas>` MVP: render da árvore + viewBox controlado
- [ ] Pan/zoom (mouse + trackpad + atalhos)
- [ ] `playground` exibindo um documento de exemplo

## Fase 3 — Seleção e transformação
- [ ] `SelectionService` + seleção única e múltipla (marquee)
- [ ] Handles de seleção (overlay separado)
- [ ] Drag, resize, rotate, scale via comandos
- [ ] Snap-to-grid e snap-to-objects opcionais
- [ ] Alinhamento e distribuição (esquerda, centro, etc.)

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
