# 01 — Visão Geral

## Projeto

**SVGEngine** — Editor SVG profissional, modular e extensível, distribuído
como **biblioteca Angular reutilizável** com aplicação de demonstração
embutida.

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
2. **Library-first** — qualquer feature do editor nasce no projeto
   `svg-engine`; a `playground` apenas consome.
3. **Evolução incremental** — sem mudanças massivas sem justificativa.
4. **Arquitetura modular por feature/domínio**.
5. **Tipagem forte e APIs internas explícitas**.
6. **Documentação viva** — muda o código, muda o doc no mesmo turno.
7. **Performance e extensibilidade** como requisitos não-funcionais centrais.
8. **Sem dependências sem justificativa** registrada em `04-decisoes-tecnicas.md`.

## Ver também

- [02 — Arquitetura](02-arquitetura.md)
- [03 — Restrições](03-restricoes.md)
- [04 — Decisões técnicas](04-decisoes-tecnicas.md)
- [05 — Roadmap](05-roadmap.md)
- [06 — Componentes do Editor SVG](06-componentes-editor-svg.md)
- [07 — Backend .NET (futuro/opcional)](07-backend-dotnet.md)
- [08 — Histórico de alterações](08-historico-de-alteracoes.md)
