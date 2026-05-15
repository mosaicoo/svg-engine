# 09 — API Pública

> Contrato versionado da library. Tudo que aparece aqui é considerado
> **superfície pública** sujeita a SemVer. Mudanças breaking exigem
> bump major + entrada em `08-historico-de-alteracoes.md` + nota em
> `04-decisoes-tecnicas.md`.
>
> Itens marcados como `@internal` ou `@experimental` **não** entram
> aqui — ficam fora do `public-api.ts` ou anotados explicitamente.

---

## Status

- **Versão**: `0.0.0` (pré-release; APIs ainda em formação durante Fases 2..5).
- **SemVer estável**: a partir de `1.0.0` (após Fase 5 — IO + extensibilidade).
- **Política até `1.0.0`**: minor pode ter breaking se devidamente documentado.
- **Política após `1.0.0`**: breaking = major.

---

## Entry points

Cada entry point tem sua própria seção. A seção é populada conforme
a fase do roadmap implementa o conteúdo.

### `svg-engine/core` (Fase 2)

> Modelo de dados, comandos, histórico e estado. Sem dependência de UI.

_(populado quando Fase 2 entregar)_

#### Tipos planejados

- `SvgNode` (union discriminated): `RectNode | EllipseNode | LineNode | PolygonNode | PolylineNode | PathNode | TextNode | ImageNode | GroupNode`
- `Transform`, `BoundingBox`, `Style`, `Metadata`
- `Command<T = void>`, `CommandResult`
- `EditorStateService`
- `HistoryService`
- `CommandBus`

### `svg-engine/render` (Fase 2 final)

> Componente renderer (read-only) e viewport.

_(populado quando Fase 2 entregar)_

### `svg-engine/io` (Fase 5)

> Parse, sanitização e serialização de SVG.

_(populado quando Fase 5 entregar)_

### `svg-engine/optimize` (Fase 5)

> Pipeline de otimizações de SVG.

_(populado quando Fase 5 entregar)_

### `svg-engine/edit` (Fases 3 e 4)

> Seleção, transformação, canvas interativo, plugins.

_(populado conforme entregas)_

### `svg-engine/ui` (Fase 4)

> Componentes Angular Material para o editor completo.

_(populado quando Fase 4 entregar)_

---

## Convenções

- **Nomes**: `PascalCase` para classes/interfaces/tipos; `camelCase` para
  funções/serviços; `kebab-case` para selectors (`<svge-canvas>`).
- **Standalone components** sempre.
- **Inputs/outputs**: usar `input()`, `output()` (D-009 Angular guidance);
  nunca `@Input`/`@Output` decorators.
- **Estado reativo**: `signal`, `computed`, `effect`. RxJS apenas onde
  o ecossistema exige.
- **Deprecation**: marcar com `@deprecated` por **um** ciclo minor antes
  de remover (post-`1.0.0`).

---

## Como adicionar uma entrada aqui

1. Implementar e exportar em `projects/svg-engine/<entry>/src/public-api.ts`.
2. Documentar nesta seção do entry point correspondente: nome, assinatura,
   exemplo mínimo, "since" (versão).
3. Cobrir com testes unitários.
4. Confirmar `ng build svg-engine` verde.
5. Linkar no PR.
