# 08 — Histórico de Alterações

> Registro narrativo das mudanças estruturais do projeto. Mais detalhado
> que `git log`, focado em **decisões e contexto**, não em diffs.
> Convenção: ordem cronológica reversa (mais recente no topo).

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
