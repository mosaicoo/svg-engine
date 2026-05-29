# 01 — Visão Geral

## Projeto

**SVGEngine** — Library Angular profissional para **renderização,
manipulação e otimização** de SVG, com camada de editor visual completa.
Distribuída para ser **embutida em sistemas de terceiros** (Mosaicoo
e externos).

## Posicionamento

**Não é MVP — é produto de mercado.** Implicações que valem para
toda decisão técnica:

- **Componentização rigorosa**: cada componente/serviço com uma única
  responsabilidade clara. Composição preferida sobre herança ou módulos
  monolíticos.
- **Boas práticas Angular** (signals, standalone, OnPush, control flow
  novo, sem ngClass/ngStyle, etc.) seguidas sempre.
- **UX/UI** segue padrões de mercado (Material Design 3 com
  acessibilidade WCAG AA mínimo).
- **API pública estável**, versionada (semver), documentada.
- **Cobertura de testes** desde o primeiro código de produção.
- **Documentação viva** sincronizada com cada PR.

### O que é "o produto" (D-041)

O produto principal do SVGEngine é o **Canvas Engine headless** — o
conjunto de entry points sem UI obrigatória. A UI profissional pronta
(`<svge-shell-pro>` e companhia) é **camada de conveniência opt-in**,
substituível pelo consumer.

Em uma frase: **"Vendemos uma engine. A UI profissional é cortesia."**

Implicações práticas:

1. Roadmap prioriza features headless primeiro — UI segue
2. Breaking changes em `ui` são menos graves do que em headless
3. Documentação de API prioriza headless
4. Dependências do headless são vigiadas; do `ui` podem crescer
5. Performance é medida contra o headless puro

Detalhes completos em D-041 (`docs/04-decisoes-tecnicas.md`).

## Vocabulário canônico

Para alinhamento entre time, doc e marketing, usamos este vocabulário:

| Termo conceitual            | Implementação real                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SVG Engine** (produto)    | npm package `svg-engine` — versão atual `0.1.0`                                                                                                                                                                               |
| **Canvas Engine / Core**    | conjunto headless: `svg-engine/{core,render,io,optimize,edit}` — 5 entry points sem dependência de Material                                                                                                                   |
| **Canvas físico**           | `<svge-renderer>` (read-only, em `render`) — gestures vêm via diretivas de `edit` aplicadas em projeção. **Não existe `<svge-canvas>`** — esse selector era da fase de planejamento, a composição real é renderer+diretivas.  |
| **SVG Engine Professional** | entry point `svg-engine/ui` — em particular `<svge-shell-pro>` (drop-in completo) e `<svge-editor>` (configurável)                                                                                                            |
| **Shell parcial**           | Modo 3 (D-037) — composição manual de componentes de `svg-engine/ui`                                                                                                                                                          |
| **NLU layer** (D-046)       | Entry points `svg-engine/ai/{nlu,nlu-ui}` — comandos por linguagem natural (Fase 8.1 rule-based ✅; 8.2/8.3 não iniciadas). Opt-in, separado do core                                                                          |
| **Playground**              | app `projects/playground/` — sandbox + showcase + benchmark com **8 rotas + stampToolPlugin demo**. Não é produto, é referência para consumers entenderem cada modo                                                           |
| **SVG Studio**              | app `projects/svg-studio/` — **deliverable de produto** standalone (1 rota full-bleed, `<svge-shell-pro>` puro). Set de plugins espelhado do playground **menos demos pedagógicos**. Single-page, deep-links sempre no editor |

### Rotas do playground (slugs EN / labels PT — D-041)

Cada rota tem **nome que descreve a atividade**, não a categoria arquitetural:

| Rota                 | Atividade                                                                                                               | Modo D-037            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `/custom-editor`     | Editor completo **construído à mão**: canvas headless + painéis de `ui` wireados sem `<svge-editor>`/`<svge-shell-pro>` | Modo 1+3 misto        |
| `/basic-editor`      | `<svge-editor>` drop-in **mínimo** (toolbar+canvas+statusbar)                                                           | Modo 2 minimal        |
| `/modular-editor`    | `<svge-editor>` com **6 checkboxes** ligando/desligando partes individuais                                              | Configurador Modo 2/4 |
| `/embeddable-canvas` | `<svge-editor>` com **tudo off** — só área de edição (sem chrome) mas ainda permite editar                              | Modo 4                |
| `/pro-editor`        | `<svge-shell-pro>` editor **profissional completo** (Illustrator/Affinity-grade)                                        | Modo 2 pro            |
| `/svg-viewer`        | `<svge-renderer>` puro **read-only** — textarea/arquivo SVG, sem `edit`, **bundle mínimo**                              | Render-only           |
| `/benchmark`         | Harness de **performance** (FPS + render-to-paint latency)                                                              | Bench                 |

**URLs antigas redirecionam para os novos slugs** (`/raw-primitives`,
`/shell-demo`, `/shell-partial-demo`, `/shell-canvas-only`,
`/shell-pro-demo`, `/perf`) — bookmarks continuam funcionando.

## Quatro casos de uso explícitos (D-037)

A library é desenhada para que terceiros consumam de **quatro** formas
distintas. Todas precisam funcionar sem quebrar as outras:

| Modo                  | O que o consumer importa                                                   | Componentes UI envolvidos              |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| **1. Headless puro**  | `svg-engine/{core,render,io,optimize,edit}` — sem `ui`                     | Nenhum — consumer constrói UI própria  |
| **2. Shell completo** | `svg-engine/ui` (`<svge-shell-pro>` ou `<svge-editor [shell]="true">`)     | Editor profissional pronto             |
| **3. Shell parcial**  | `svg-engine/ui` (escolhendo componentes individuais)                       | Toolbar + canvas + inspector (por ex.) |
| **4. Canvas-only**    | `svg-engine/render` (`<svge-canvas>`) + opcionalmente `edit` para gestures | Só o canvas + pan/zoom                 |

**Consequência arquitetural**: nenhum entry point headless pode
importar Material/CDK (D-017). `svg-engine/ui` é o único que pode.
A `playground` demonstra os 4 modos em rotas separadas.

## Diretório raiz

`C:\Projetos\ClaudeCode\SVGEngine`

## Repositório

- GitHub: `https://github.com/mosaicoo/svg-engine` (privado)
- Owner: `mosaicoo`
- Branch padrão: `main`

## Estado atual (2026-05-14)

- Restrições do agente configuradas em `.claude/settings.local.json`.
- `.gitignore` inicial criado.
- Pasta `docs/` em estruturação (01–08).
- **Nenhum** scaffold Angular gerado ainda — só após validação do
  roadmap e dos documentos 02 e 05.

## Stack alvo

- **Front-end**: Angular **v21** (vira LTS em 2026-05-19, suporte até 2027-05-19). Decisão D-006.
- **UI**: Angular Material **v21** (alinhado).
- **Linguagem**: TypeScript em modo `strict`.
- **Estilo de SVG**: DOM SVG nativo + camada de abstração própria.
  Sem dependência de `svg.js`, `snap.svg`, `fabric.js` ou similares.
- **Distribuição**: workspace Angular com **library** `svg-engine`
  (npm package, 6 entry points) + **app** `playground`
  (sandbox/showcase/benchmark — **não** é o produto).
- **Back-end**: .NET 10 LTS — **somente se** surgir necessidade real
  (persistência server-side, colaboração, exportação pesada).

## Princípios condutores

1. **Zero alucinação** — tudo verificado antes de afirmar/implementar.
2. **Library-first** — qualquer feature nasce na `svg-engine`; a
   `playground` apenas consome (e simula um terceiro qualquer).
3. **Headless-first** — núcleo (modelo, engine, otimização) **não pode**
   depender de Angular Material ou de qualquer escolha de UI. Terceiros
   podem usar só o engine e plugar a UI deles.
4. **Componentização rigorosa** — single responsibility, composição,
   componentes pequenos e focados.
5. **API pública versionada** — surface explícita, semver, breaking
   changes documentados em `04-decisoes-tecnicas.md`.
6. **Evolução incremental** — sem mudanças massivas sem justificativa.
7. **Tipagem forte** — `strict`, sem `any`, união discriminada para
   variantes (ex.: `SvgNode`).
8. **Documentação viva** — muda o código, muda o doc no mesmo turno.
9. **Performance e extensibilidade** como requisitos não-funcionais centrais.
10. **Acessibilidade WCAG AA** mínimo em toda UI.
11. **Sem dependências sem justificativa** registrada em `04-decisoes-tecnicas.md`.

## Ver também

- [02 — Arquitetura](02-arquitetura.md)
- [03 — Restrições](03-restricoes.md)
- [04 — Decisões técnicas](04-decisoes-tecnicas.md)
- [05 — Roadmap](05-roadmap.md)
- [06 — Componentes do Editor SVG](06-componentes-editor-svg.md)
- [07 — Backend .NET (futuro/opcional)](07-backend-dotnet.md)
- [08 — Histórico de alterações](08-historico-de-alteracoes.md)
- [09 — API Pública (versionada)](09-api-publica.md)
