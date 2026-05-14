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
  diálogos) usa Angular Material LTS compatível com a versão Angular
  escolhida.
- **Consequências**: dependência peer da library no `@angular/material`;
  documentar versões compatíveis no README.

---

## Decisões pendentes (em aberto)

| ID provis. | Tema                                         |
|------------|----------------------------------------------|
| D-006?     | Framework de testes (Karma / Vitest / WTR)   |
| D-007?     | Versionamento + changelog (changesets?)      |
| D-008?     | Registry de publicação                       |
| D-009?     | Estratégia de i18n no editor                 |
| D-010?     | Acessibilidade (a11y) — alvo WCAG            |
