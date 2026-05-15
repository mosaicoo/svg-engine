# 08 — Histórico de Alterações

> Registro narrativo das mudanças estruturais do projeto. Mais detalhado
> que `git log`, focado em **decisões e contexto**, não em diffs.
> Convenção: ordem cronológica reversa (mais recente no topo).

---

## 2026-05-15 — Fix: zoom/pan agora aplicam mesmo com input viewBox

**Sintoma reportado**: pan/zoom controls no playground não tinham
efeito visual. Console limpo, sem erro; estado interno do
`ViewportService` mudava (signal `zoom` atualizava), mas o atributo
`viewBox` do `<svg>` renderizado nunca refletia a mudança.

**Causa raiz**: o `SvgeRenderer.viewBoxAttr` priorizava o input
`viewBox` sobre `viewport.viewBox()`:

```typescript
// ANTES (bugado):
const box = explicit ?? this.viewport.viewBox(); // explicit ganha
```

Como o playground passa `[viewBox]="docViewBox"`, o renderer ignorava
qualquer mudança em `viewport.zoom()` ou `viewport.pan()`.

**Fix**: single source of truth = `ViewportService`. O input `viewBox`
torna-se um **seed** para `viewport.contentBox` (via effect que já
existia); o atributo do `<svg>` é **sempre** derivado de
`viewport.viewBox()`, que aplica zoom + pan sobre o contentBox:

```typescript
// DEPOIS:
protected readonly viewBoxAttr = computed(() => {
  const box = this.viewport.viewBox(); // sempre via viewport
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
});
```

Comportamento resultante:

- `zoom = 1`, `pan = 0` (default): `viewBoxAttr` = `contentBox` (=
  input `viewBox`). Sem mudança visível, compatível com o
  comportamento esperado.
- `zoom = 2`: `viewBoxAttr` mostra metade da `contentBox` (centrada),
  conteúdo aparece 2× maior na tela.
- `pan(50, 30)`: `viewBoxAttr` translada o window em 50,30 unidades
  do conteúdo.

**Tests**:

- 2 novos casos no `svge-renderer.component.spec.ts`:
  - "zoom on ViewportService updates the rendered viewBox even when
    input is set"
  - "pan on ViewportService updates the rendered viewBox even when
    input is set"
- Test antigo "uses explicit viewBox when provided" renomeado para
  "uses explicit viewBox as seed (zoom=1, pan=0 → matches input
  exactly)" — semântica mais precisa, asserção idêntica.
- Total: **112 testes verdes em 10 arquivos** (eram 110).

**Docs atualizadas**: `09-api-publica.md` documenta a semântica nova
do input `viewBox` ("seed para viewport.contentBox").

---

## 2026-05-15 — Fix bug visual + refactor renderers para SVG-puro

**Sintoma reportado pelo usuário**: ao adicionar formas via playground,
nada aparecia visualmente apesar dos elementos `<rect>` etc. estarem
corretamente no DOM (com x, y, width, height, fill, stroke aplicados).
Screenshot do DevTools mostrou estrutura `<svge-rect><g><rect/></g></svge-rect>`.

**Causa raiz**: dois problemas em sequência.

1. **Sizing do `<svg>` interno** (commit `1770422`): o `<svg>`
   sem `width`/`height` attrs defaulta para 300×150 px (replaced element
   HTML). CSS no `host` dimensionava o custom element `<svge-renderer>`
   mas não cascateava para o `<svg>` interno. Fix: component styles
   `:host { 100% } svg { 100% }`.
2. **Custom HTML elements dentro de SVG** (este commit): mesmo após o
   sizing, as formas continuavam não renderizando. Razão: as componentes
   `<svge-node>` e `<svge-rect>` etc. são custom HTML elements (Angular
   cria via `document.createElement`, não `createElementNS`). Por
   limitação da spec SVG, o painter **não atravessa elementos não-SVG**
   para renderizar conteúdo embaixo deles. Os `<rect>` etc. estavam
   no DOM mas dentro de wrappers HTML que cortam a cadeia de render.

**Refactor**:

- **8 per-type components → 8 diretivas**: `SvgeRectDirective`,
  `SvgeEllipseDirective`, `SvgeLineDirective`, `SvgePolygonDirective`,
  `SvgePolylineDirective`, `SvgePathDirective`, `SvgeTextDirective`,
  `SvgeImageDirective`. Cada uma com selector attribute (`[svgeRect]`
  etc.) aplicado ao elemento SVG nativo correspondente. Atributos via
  `host: { '[attr.x]': 'node().x', ... }`. Input aliasado ao nome da
  diretiva: `[svgeRect]="rectNode"`.
- **`SvgeNodeRenderer` (dispatcher)**: selector mudou de `svge-node`
  para `g[svgeNode]` (atributo num `<svg:g>`). Host = `<svg:g>` com
  `data-node-id` e `transform`. Template `@switch` cria os elementos
  SVG diretamente (`<svg:rect [svgeRect]="rectNode()" />` etc.). Caso
  `group` itera children com `<svg:g svgeNode [node]="child">` (recursivo).
- **`SvgeRenderer` top-level**: `<svge-node>` no template virou
  `<svg:g svgeNode [node]="tree()"></svg:g>`.
- **8 arquivos `*-renderer.component.ts` deletados**, substituídos por
  `*-renderer.directive.ts`.
- **Tests atualizados** + lint disable inline no selector híbrido.

**DOM resultante** (puro SVG):

```
<svg viewBox="0 0 800 600">
  <g data-node-id="root">
    <g data-node-id="rect-id" transform="...">
      <rect x="..." y="..." width="..." height="..." fill="..." stroke="..." />
    </g>
  </g>
</svg>
```

**Validação**:

- `ng build svg-engine`: OK
- `ng lint`: OK
- `ng test svg-engine`: **110 testes verdes em 10 arquivos** (asserts
  iguais — estrutura final equivalente em jsdom)
- HTTP fetch `/main.js`: `svgeRect`/`svgeNode` (novos) 17/44 matches,
  `svge-rect`/`svge-node` (antigos) **0 matches**.

**Lições**:

- Componentes que renderizam conteúdo SVG devem ter selector compatível
  com SVG (atributo em elemento SVG real ou `svg:tag` no selector).
- Custom HTML elements como wrappers em SVG são **anti-padrão silencioso**:
  o DOM "parece certo" mas o render falha sem erro de console.
- Tests em jsdom validam estrutura DOM mas não chamam o painter SVG real;
  validação visual exige browser real.

---

## 2026-05-14 — Plugin extensibilidade (D-020) + Workspace pendente (D-021)

**O que aconteceu**

Esclarecimento explícito do usuário em 2026-05-14, durante o intervalo
entre Bloco 1 e Bloco 2 da Fase 2:

1. **Plugin/extensão obrigatória**: terceiros devem poder estender a
   library com tipos de nó custom (estrelas, gráficos, etc.), renderers
   custom, ferramentas custom e painéis custom. Toda decisão de design
   subsequente deve prever ponto de extensão.
2. **Workspace / prancheta / página**: conceito acima do `SvgDocument`
   SVG-spec, envolvendo configuração de página (tamanho, orientação),
   background, margens, grid, eventual multi-página. Apenas para
   registro — implementação futura.

**Decisões registradas**

- D-020: sistema de plugins de primeira classe — toda feature subsequente
  expõe registry como ponto de extensão.
- D-021: conceito de Workspace/Página — **PENDENTE**, definir antes da
  Fase 4 (UI). Duas opções a avaliar (estender `SvgDocument` vs novo
  `Workspace`).

**Impacto imediato**

Bloco 2 (renderer) já é desenhado com `NodeRendererRegistry` exposto
desde o primeiro commit, evitando refatoração futura quando o primeiro
plugin chegar.

---

## 2026-05-14 — Fase 2 Bloco 2: `svg-engine/render` entregue

**O que foi entregue**

Novo entry point `svg-engine/render` (zero deps de UI Material — D-017):

- **Top-level**: `<svge-renderer>` standalone com inputs `tree`, `viewBox?`,
  `width?`, `height?`, `ariaLabel?`. Renderiza `<svg>` com `role="img"`
  para acessibilidade.
- **8 renderers per-tipo**: `<svge-rect>`, `<svge-ellipse>`, `<svge-line>`,
  `<svge-polygon>`, `<svge-polyline>`, `<svge-path>`, `<svge-text>`,
  `<svge-image>` — cada um envolto em `<svg:g data-node-id transform>`
  para suportar futura camada de seleção/handles.
- **Dispatcher `<svge-node>`**: `@switch` para os 8 built-ins + `group`
  recursivo inline (evita import circular) + `@default` fallback no
  registry.
- **`ViewportService`**: signals `zoom/panX/panY/contentBox/viewBox`
  com APIs `pan`, `zoomIn/Out`, `multiplyZoom`, `setZoom`, `setPan`,
  `reset`, `fit`, `setZoomLimits`. Clamping automático.
- **`NodeRendererRegistry`** (D-020): API `register/unregister/resolve/registeredTypes`.
  Dispatcher monta plugins via `*ngComponentOutlet`.
- **`renderTransformAttr`**: util que serializa matriz para
  `matrix(a b c d e f)` ou retorna `null` para identidade (omite atributo).
- **`projectDocumentToRenderer`**: helper para extrair `tree`+`viewBox`
  de um `SvgDocument`.

**Validação**

- `ng build svg-engine`: **OK** — 3 entry points (primary + core + render)
  geram FESM separados em `dist/svg-engine/fesm2022/`.
- `ng lint`: **OK** em ambos projetos.
- `ng test svg-engine`: **110 testes verdes em 10 arquivos** (44 novos
  no render: transform-attr 5, registry 5, viewport 17, renderers 12,
  svge-renderer integração 7).
- Playground: substituiu lista de IDs por canvas SVG real com 3 botões
  de Add (rect/ellipse/triangle path), Nudge/Remove/Undo/Redo, controles
  de Zoom in/out/reset, status com node count e zoom %.
- Runtime via `ng serve`: bundle do playground contém `svge-renderer`,
  `svge-rect`, `NodeRendererRegistry` (tree-shaking confirmado).

**Componentização** (cumpre D-016 produto de mercado):

- 1 componente standalone por tipo de nó (focused, OnPush).
- Dispatcher é o único acoplamento entre tipos.
- Plugin extensibility (D-020) embutida desde o primeiro commit.
- Acessibilidade básica: `role="img"` + `aria-label` configurável.

**Próximo**: aguardar validação do usuário antes de Fase 3 (seleção,
transformação, canvas interativo em `svg-engine/edit`).

---

## 2026-05-14 — Fase 2 Bloco 1: `svg-engine/core` entregue

**O que foi entregue**

Library `svg-engine` refatorada para o padrão **secondary-only multi-entry-point**:

- Placeholder do schematic removido (`svg-engine.ts` + spec).
- Primary `svg-engine/src/public-api.ts` reduzido a `SVG_ENGINE_VERSION`
  com docstring explicando o padrão (alinhado a `@angular/material`).
- Tsconfigs ajustados para incluir `core/src/**` (lib + spec).
- `angular.json` com `sourceRoot: "projects/svg-engine"` para
  test discovery encontrar specs em todos os entry points.

Novo entry point `svg-engine/core` (zero deps de UI):

- **Tipos primitivos**: `NodeId` branded, `Transform` (matriz afim
  6-elementos com ops), `Point`, `BoundingBox`, `SvgStyle`, `SvgMetadata`.
- **Modelo**: `SvgNodeBase` + 9 tipos concretos imutáveis (`RectNode`,
  `EllipseNode`, `LineNode`, `PolygonNode`, `PolylineNode`, `PathNode`,
  `TextNode`, `ImageNode`, `GroupNode`) + union discriminated `SvgNode`.
- **Factories**: `createRect`, `createEllipse`, `createLine`,
  `createPolygon`, `createPolyline`, `createPath`, `createText`,
  `createImage`, `createGroup`.
- **Tree ops imutáveis com structural sharing**: `findNodeById`,
  `findParent`, `insertNode`, `removeNode`, `updateNode<T>`, `walk`,
  `collectNodes`, `countNodes`.
- **Document**: `SvgDocument` + `createEmptyDocument`.
- **Command pattern**: `Command` interface + `CommandResult`/`ok`/`fail` +
  4 comandos concretos (`InsertNodeCommand`, `RemoveNodeCommand`,
  `MoveNodeCommand`, `SetPropertyCommand<T, K>`).
- **Services Angular** (signal-based, `providedIn: 'root'`):
  `EditorStateService`, `HistoryService`, `CommandBus`.

**Validação**

- `ng build svg-engine`: **OK** — gera bundles separados:
  - `dist/svg-engine/fesm2022/svg-engine.mjs` (primary, simbólico)
  - `dist/svg-engine/fesm2022/svg-engine-core.mjs` (secondary, real)
- `ng lint`: **OK** em ambos projetos.
- `ng test svg-engine`: **66 testes verdes em 5 arquivos**
  (transform math, tree-ops, 4 comandos com round-trip undo/redo,
  HistoryService stack invariants, CommandBus integration).
- **Dogfooding**: `playground/src/app/app.ts` consome
  `import { CommandBus, createRect, EditorStateService, HistoryService,
InsertNodeCommand, MoveNodeCommand, RemoveNodeCommand } from 'svg-engine/core'`
  e expõe botões para validar a API end-to-end. Build e lint verdes.

**Decisão revisada**

- D-018: **secondary-only sem primary útil** (alinhado a `@angular/material`).
  Após análise do mercado, decidido que libs com camadas funcionais
  distintas não expõem primary entry point — força tree-shaking e enforça
  D-017 (headless boundary) pelo TypeScript.

**Componentização** (cumpre D-016 / produto de mercado):

- Cada conceito em seu próprio arquivo (uma classe/interface/função pública
  por arquivo).
- Barrels (`index.ts`) por subdiretório re-exportam apenas o necessário.
- Imports `type-only` para forward references (sem ciclos em runtime).
- Zero `any`. Tipos branded para identificadores. Discriminated union.

**Próximo**: Bloco 2 — `svg-engine/render` (`<svge-renderer>` read-only +
`ViewportService` pan/zoom).

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
