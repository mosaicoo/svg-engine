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

| Termo conceitual            | Implementação real                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SVG Engine** (produto)    | npm package `@mosaicoo/svg-engine` — versão atual `0.1.2`                                                                                                                                                                                                |
| **Canvas Engine / Core**    | conjunto headless: `svg-engine/{core,render,io,optimize,edit}` — 5 entry points sem dependência de Material                                                                                                                                              |
| **Canvas físico**           | `<svge-renderer>` (read-only, em `render`) — gestures vêm via diretivas de `edit` aplicadas em projeção. **Não existe `<svge-canvas>`** — esse selector era da fase de planejamento, a composição real é renderer+diretivas.                             |
| **SVG Engine Professional** | entry point `svg-engine/ui` — em particular `<svge-shell-pro>` (drop-in completo) e `<svge-editor>` (configurável)                                                                                                                                       |
| **Shell parcial**           | Modo 3 (D-037) — composição manual de componentes de `svg-engine/ui`                                                                                                                                                                                     |
| **NLU layer** (D-046)       | Entry points `svg-engine/ai/{nlu,nlu-ui,nlu-voice-wasm}` — comandos por linguagem natural: NLU rule-based (~33 intents) + escalonamento opcional para LLM (Ollama, D-093/D-095) + voz (Web Speech e Whisper WASM local, D-046). Opt-in, separado do core |
| **Playground**              | app `projects/playground/` — sandbox + showcase + benchmark com **9 rotas + stampToolPlugin demo**. Não é produto, é referência para consumers entenderem cada modo                                                                                      |
| **SVG Studio**              | app `projects/svg-studio/` — **deliverable de produto** standalone (1 rota full-bleed, `<svge-shell-pro>` puro). Set de plugins espelhado do playground **menos demos pedagógicos**. Single-page, deep-links sempre no editor                            |

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
| `/nlu-test`          | NLU bench: `<svge-editor>` lado a lado com `<svge-nlu-input>` (texto + voz) — comandos em linguagem natural (D-046)     | Showcase              |
| `/plugins`           | Showcase do `<svge-plugin-manager>` — instala/desinstala plugin externo em runtime (D-083)                              | Showcase              |

**URLs antigas redirecionam para os novos slugs** (`/raw-primitives`,
`/shell-demo`, `/shell-partial-demo`, `/shell-canvas-only`,
`/shell-pro-demo`, `/perf`) — bookmarks continuam funcionando.

## Quatro casos de uso explícitos (D-037)

A library é desenhada para que terceiros consumam de **quatro** formas
distintas. Todas precisam funcionar sem quebrar as outras:

| Modo                  | O que o consumer importa                                                                                   | Componentes UI envolvidos              |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **1. Headless puro**  | `svg-engine/{core,render,io,optimize,edit}` — sem `ui`                                                     | Nenhum — consumer constrói UI própria  |
| **2. Shell completo** | `svg-engine/ui` (`<svge-shell-pro>` ou `<svge-editor [shell]="true">`)                                     | Editor profissional pronto             |
| **3. Shell parcial**  | `svg-engine/ui` (escolhendo componentes individuais)                                                       | Toolbar + canvas + inspector (por ex.) |
| **4. Canvas-only**    | `svg-engine/render` (`<svge-renderer>`) + opcionalmente `edit` para gestures via `[svgeShellInteractions]` | Só o canvas + pan/zoom                 |

**Consequência arquitetural**: nenhum entry point headless pode
importar Material/CDK (D-017). Apenas `svg-engine/ui` e
`svg-engine/ai/nlu-ui` podem. A `playground` demonstra os 4 modos em
rotas separadas.

## Diretório raiz

`C:\Projetos\ClaudeCode\SVGEngine`

## Repositório

- GitHub: `https://github.com/mosaicoo/svg-engine` (privado)
- Owner: `mosaicoo`
- Branch padrão: `main`

## Estado atual (2026-06-27)

A **primeira etapa de desenvolvimento está concluída**: a library é
publicável e cobre engine, edição, UI profissional e camada de IA.

- **Library publicável** (`projects/svg-engine/`) versão **0.1.2** com **9 secondary entry points** (`core`, `render`, `io`, `optimize`, `edit`, `ui`, `ai/nlu`, `ai/nlu-ui`, `ai/nlu-voice-wasm`) + 1 umbrella não-funcional. Headless boundary D-017 íntegra (Material/CDK só em `ui` e `ai/nlu-ui`; nenhum import real de Material/CDK nos 5 entry points headless).
- **2 apps consumers**: `playground` (showcase com 9 rotas) e `svg-studio` (deliverable de produto, full-bleed pro-editor).
- **Cobertura de testes**: **223 arquivos `.spec.ts`** na library (≈2885 casos `it`), cobrindo os 9 entry points. Build limpo nos 3 projetos; lint limpo.
- **Features shipadas** (resumido — ver `docs/05-roadmap.md`):
  - **Core engine**: 10 tipos de nó, 71 comandos undoable, scope per-editor (D-042), CommandBus com auto-snapshot interceptor (D-073)
  - **Render**: `<svge-renderer>` + 9 diretivas per-tipo + ViewportService + NodeRendererRegistry (extensível)
  - **IO + Optimize**: SVG importer/exporter determinístico + PNG exporter (@1x/@2x/@3x) + 4 optimizers built-in
  - **Edit + UI**: 15 tools, 10 catálogos de biblioteca built-in (shapes/palettes/graphic-styles/gradients/patterns/templates/symbols/brushes/clip-paths/masks), 30 plugins built-in, 51 componentes UI (todos `standalone`+`OnPush`), 10 dialogs Material via service opener centralizado (D-044)
  - **Performance**: viewport culling opt-in + harness de performance (rota `/benchmark`)
  - **Path Editor + Pathfinder**: AnchorOverlay + comandos de anchor + 5 boolean ops via `polygon-clipping` + operações de path (Simplify/Split/Join/Reverse/Outline Stroke/Offset/Clean Up, D-090)
  - **NLU + IA** (D-046): `NaturalLanguageService` rule-based (intents builtin + auto-descobertos do menu) + escalonamento opcional para LLM (Ollama, D-093/D-095) + voz (Web Speech + Whisper WASM local) — entry points `ai/nlu`, `ai/nlu-ui`, `ai/nlu-voice-wasm`
  - **Pages / Artboards** (D-079 + D-080): multi-page com `<svge-page-selection-overlay>`, page tool (padrão Illustrator Artboard), persistência localStorage
  - **Animation Timeline** (D-082): tracks/keyframes não-destrutivos + `<svge-timeline>` editável
  - **Outros**: History Snapshots (D-073), Smart Objects (D-074), Asset Export (D-077), Find & Replace (D-070), Logical Layers (D-072), Custom Attributes (D-089), Keybindings customizáveis (D-086), Effects ecosystem (D-047), Libraries ecosystem (D-048), fidelidade de import (D-098–D-101)
- **Auditoria persistente**: `docs/11-auditoria-pendencias.md` cataloga as pendências conhecidas com `file:line` por item. Protocolo "auditar antes de agir" estabelecido como regra.
- **Próximos passos**: ver `docs/05-roadmap.md`.

## Stack alvo

- **Front-end**: Angular **v21** (vira LTS em 2026-05-19, suporte até 2027-05-19). Decisão D-006.
- **UI**: Angular Material **v21** (alinhado).
- **Linguagem**: TypeScript em modo `strict`.
- **Estilo de SVG**: DOM SVG nativo + camada de abstração própria.
  Sem dependência de `svg.js`, `snap.svg`, `fabric.js` ou similares.
- **Distribuição**: workspace Angular com **library** `svg-engine`
  (npm package `@mosaicoo/svg-engine`, 9 secondary entry points) + **apps**
  `playground` (sandbox/showcase/benchmark) e `svg-studio` (deliverable de
  produto) — **nenhum** dos apps é o produto distribuído.
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
- [03 — Restrições](internal/03-restricoes.md)
- [04 — Decisões técnicas](internal/04-decisoes-tecnicas.md)
- [05 — Roadmap](internal/05-roadmap.md)
- [06 — Componentes do Editor SVG](06-componentes-editor-svg.md)
- [07 — Backend .NET (futuro/opcional)](internal/07-backend-dotnet.md)
- [08 — Histórico de alterações](internal/08-historico-de-alteracoes.md)
- [09 — API Pública (versionada)](09-api-publica.md)
