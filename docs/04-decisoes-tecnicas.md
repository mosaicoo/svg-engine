# 04 — Decisões Técnicas

> Registro cronológico e rastreável de decisões. Cada decisão tem ID,
> data, contexto, alternativas consideradas e consequências. Decisões
> revogadas **não são apagadas** — são marcadas como `Status: Revogada`
> com link para a substituta.

---

## D-001 — Distribuição como library Angular
- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: O SVGEngine precisa ser reutilizável em múltiplos
  produtos do ecossistema (Mosaicoo) e potencialmente publicado.
- **Decisão**: Construir como **library Angular** (`projects/svg-engine`)
  dentro de um workspace que também contém uma app demo (`projects/playground`).
- **Alternativas**:
  - App monolítica → rejeitada: dificulta reuso e impõe decisões de
    framework de UI ao consumidor.
  - Pacote framework-agnostic (TS puro) → rejeitada na fase 1: aumenta
    complexidade sem demanda atual; pode ser destilado depois se necessário.
- **Consequências**: exige `ng-packagr`, `public-api.ts` disciplinada e
  controle estrito de side-effects.

## D-002 — DOM SVG nativo + camada própria
- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Necessidade de controle total sobre rendering, performance
  e modelo de dados. Editores SVG profissionais (Figma, Boxy SVG) constroem
  pipelines próprios.
- **Decisão**: Usar **DOM SVG nativo** + camada de abstração própria.
  **Não** adotar `svg.js`, `snap.svg`, `fabric.js` ou similares.
- **Alternativas**: bibliotecas externas — rejeitadas: amarram arquitetura,
  somam dependência transitiva, dificultam virtualização e plugins.
- **Consequências**: maior esforço inicial em geometria/transformações;
  liberdade arquitetural total.

## D-003 — Repositório Git no GitHub privado
- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Repo em `https://github.com/mosaicoo/svg-engine` (privado).
  Branch padrão: `main`.
- **Consequências**: requer credenciais GitHub configuradas localmente
  (Git Credential Manager ou SSH).

## D-004 — TypeScript estrito
- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: `tsconfig.json` com `strict: true`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`.
- **Consequências**: código mais seguro; curva inicial maior.

## D-005 — Angular Material como UI lib
- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: UI do editor (toolbar, painel de camadas, inspector,
  diálogos) usa Angular Material **v21** (alinhado à versão Angular).
- **Consequências**: dependência peer da library no `@angular/material@21`;
  documentar versões compatíveis no README.

## D-006 — Angular v21 como versão alvo
- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Em 2026-05-14, o cenário é:
  - v19 (LTS) termina em 2026-05-19 — descartada.
  - v20 (LTS) termina em 2026-11-28 — só 6 meses de suporte.
  - v21 (Active) vira LTS em 2026-05-19, com suporte até 2027-05-19.
  - v22 sai em 2026-05-19 (RC no momento).
- **Decisão**: Scaffold com **Angular v21** (`@angular/core@21`,
  `@angular/cli@21`, `@angular/material@21`).
- **Alternativas**:
  - v22 estável (aguardar 5 dias) — rejeitada: usuário optou por iniciar
    imediatamente; revisitar quando v22 e ecossistema estabilizarem.
  - v22-rc — rejeitada: instabilidade inaceitável para projeto produtivo.
  - v20 — rejeitada: janela de suporte curta demais.
  - v19 — rejeitada: EOL em 5 dias.
- **Consequências**: planejar upgrade para v22 quando esta amadurecer
  (provável janela: 2 a 3 meses após release).

## D-007 — Vitest como test runner
- **Data**: 2026-05-14
- **Status**: Aceita
- **Contexto**: Em Angular CLI v21, Vitest passou a ser o **default**
  (`--test-runner=vitest`) substituindo Karma. Vitest oferece execução
  mais rápida, modo watch melhor e API moderna alinhada a Jest.
- **Decisão**: Adotar **Vitest** como test runner para ambos os projetos
  (`svg-engine` e `playground`).
- **Alternativas**: Karma (legado, lento); Web Test Runner (menor
  ecossistema). Ambas rejeitadas.

## D-008 — File name style guide 2025
- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Manter o default v21 (`--file-name-style-guide=2025`):
  arquivos concisos como `app.ts`, `app.html` em vez de `app.component.ts`.
- **Consequências**: alinhado ao novo guia oficial Angular; familiarizar
  o time com a nova convenção.

## D-009 — `--ai-config=claude` ativado
- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: Workspace gerado com `--ai-config=claude`, criando
  `.claude/CLAUDE.md` (guia de boas práticas Angular para Claude Code)
  e `.vscode/mcp.json` (MCP server `angular-cli`).
- **Consequências**: Claude Code recebe contexto Angular automático em
  toda interação; VS Code expõe ferramentas Angular via MCP.

## D-010 — Zone.js mantido (não-zoneless)
- **Data**: 2026-05-14
- **Status**: Aceita (revisitar na Fase 6)
- **Contexto**: Angular v21 oferece `--zoneless` para apps sem zone.js
  baseadas inteiramente em signals. Para SVG editor com signals como
  fonte de verdade (declarado em arquitetura), zoneless é direção
  natural.
- **Decisão**: **Manter zone.js** na Fase 1 para baseline estável.
  Migrar para zoneless na Fase 6 (performance) quando padrões signals
  estiverem maduros no projeto.
- **Consequências**: leve overhead de change detection comparado a
  zoneless puro, aceitável durante construção do núcleo.

## D-011 — Estilo SCSS
- **Data**: 2026-05-14
- **Status**: Aceita
- **Decisão**: SCSS para todos os componentes (`--style=scss`).
- **Razão**: alinhado ao Angular Material que usa SCSS como API de
  theming (`@use '@angular/material' as mat;`).

## D-012 — Tema Material: M3 prebuilt + light/dark via OS
- **Data**: 2026-05-14
- **Status**: Aceita parcialmente — toggle explícito pendente (Fase 4)
- **Decisão (Fase 1)**:
  - Tema Material 3 com `mat.theme()` mixin: primary `azure-palette`,
    tertiary `blue-palette`, typography Roboto, density 0.
  - `color-scheme: light dark` no `body` → segue preferência do OS
    automaticamente via `prefers-color-scheme`.
- **Decisão pendente (Fase 4)**:
  - Toggle UI explícito (botão na toolbar) que sobreponha a preferência
    do OS, persistindo escolha em `localStorage`.
- **Consequências**: dark mode funciona "de graça" para usuários que já
  têm OS em modo escuro; toggle vem depois sem refatorar o tema.

---

## Decisões pendentes (em aberto)

| ID provis. | Tema                                         |
|------------|----------------------------------------------|
| D-013?     | Versionamento + changelog (changesets?)      |
| D-014?     | Registry de publicação                       |
| D-015?     | Estratégia de i18n no editor                 |
| D-016?     | Acessibilidade (a11y) — alvo WCAG            |
| D-017?     | Migração para zoneless (revisar D-010)       |
