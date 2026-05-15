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

## Três casos de uso explícitos

A library é desenhada para que terceiros consumam de três formas:

| Modo               | O que precisa estar disponível                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| **1. Render**      | Apenas viewer: parse + render de SVG, sem edição. Embed em qualquer app Angular. |
| **2. Manipulação** | API programática (e/ou UI) para inserir, mover, transformar elementos.           |
| **3. Otimização**  | Pipeline de otimizações (ex.: redução de path, dedup, minificação) standalone.   |

**Consequência arquitetural**: a library deve permitir consumo
**headless** (engine sem UI), e a UI do editor é uma camada **opcional**.

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
- **Distribuição**: workspace Angular com **library** `svg-engine` +
  **app** `playground` (consumidora/demonstração).
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
