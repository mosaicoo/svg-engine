# 08 — Histórico de Alterações

> Registro narrativo das mudanças estruturais do projeto. Mais detalhado
> que `git log`, focado em **decisões e contexto**, não em diffs.
> Convenção: ordem cronológica reversa (mais recente no topo).

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
