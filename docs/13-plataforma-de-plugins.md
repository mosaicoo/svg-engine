# 13 — Plataforma de Plugins (D-084): análise de negócio e arquitetura alvo

> **Status**: análise concluída + arquitetura decidida (2026-06-11/12).
> Sucede o doc `12` (que decidiu as Fases 1/2, ambas entregues) e o spike
> de Native Federation (branch `spike/native-federation-3.1`, não mergeada).
> Este documento é a **referência da Fase 3** — o que falta para o SVG Studio
> virar **ferramenta de mercado com ecossistema** e para o svg-engine dar o
> suporte de **plataforma** (interno, embedding e marketplace).

---

## 1. O negócio: quem usa plugin, para quê

A palavra "plugin" cobre **quatro atores com necessidades diferentes**. Toda a
arquitetura abaixo decorre de separá-los explicitamente:

| #   | Ator                                                                        | O que quer                                                                                                                    | Canal                  |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A1  | **Mosaicoo (interno)**                                                      | Construir o próprio editor como plugins (builtins) — modularidade, ordem, disable                                             | Build-time             |
| A2  | **Embedder** (terceiro que **embute** a lib `svg-engine` no app dele)       | Estender o editor com tools/menus/efeitos próprios, com **type-safety total**, e controlar a política de segurança do seu app | Build-time (npm)       |
| A3  | **Autor de plugin de marketplace** (terceiro que publica para o SVG Studio) | Escrever um plugin **sem rebuild do Studio**, publicar, versionar, ser instalável por usuários                                | Runtime (URL/registro) |
| A4  | **Usuário final do Studio**                                                 | Instalar/ativar/remover plugins com 1 clique, com segurança                                                                   | Marketplace UI         |

**Princípio mantido (doc 12, D-083): a library é mecanismo, não política.**
A lib fornece registros, loader e contratos; quem decide _o que_ é confiável
(origens, assinatura, review) é o app consumidor (o Studio para A3/A4; o
embedder para o app dele).

---

## 2. Inventário — o que JÁ existe (ancorado no código)

### 2.1 Núcleo (svg-engine/edit `lib/plugin/`) — sólido

| Peça                                           | Papel                                                                                                                                                      | Estado    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `EditorPlugin` + `PluginContext` (`plugin.ts`) | Contrato: id reverse-DNS, `version`, `apiVersion`, `dependencies?`, metadata de exibição, `install(ctx)`/`uninstall?`; `ctx.track()` p/ cleanup automático | ✅ D-020  |
| `PluginRegistry`                               | Lifecycle: valida id/apiVersion (major)/deps, instala com **rollback** se `install()` lança, uninstall com dispose **LIFO** resiliente                     | ✅        |
| `PluginCatalog` + `PluginSource`               | Universo de plugins conhecidos, `'internal'` vs `'external'`                                                                                               | ✅ Fase 1 |
| `PluginStateStore`                             | Preferência enable/disable persistida (localStorage, fail-defensive)                                                                                       | ✅ Fase 1 |
| `PluginManagerService`                         | Façade: `plugins()` reativo, enable/disable/uninstall com bloqueio por dependentes, erros viram estado (não crash)                                         | ✅ Fase 1 |
| `ExternalPluginManifest` + validador           | Contrato wire (entry URL, `integrity?` SRI, apiVersion) tratado como input não-confiável                                                                   | ✅ Fase 2 |
| `PluginLoader` + `providePluginLoader`         | Carga runtime **fail-closed**: manifesto → gate apiVersion → **allowlist de origem** → `moduleLoader` (do consumer) → shape-check → install                | ✅ Fase 2 |
| `<svge-plugin-manager>` + dialog (ui)          | UI de gestão (Internal/External, toggle, uninstall, erro) + File ▸ Manage Plugins                                                                          | ✅ Fase 1 |

### 2.2 Pontos de extensão que um plugin alcança hoje (via `ctx.injector`)

`ToolRegistry`, `CommandBus`/commands, `MenuContributionRegistry` (menus,
toolbar, context-menu), `ShortcutRegistry`, `LibraryRegistry` (shapes, palettes,
brushes, …), `EffectRegistry`/optimizers/importers/exporters, NLU intents — o
**editor inteiro é construído como ~30 plugins builtins** sobre esses registries
(`provideSvgEngineEditorBuiltins()` + `provideSvgeUiBuiltins()`). Os consumidores
provam o modelo: playground (stamp-tool com `optionsComponent`), svg-studio
(command-palette), e o `mosaicoo-hello` carregado **em produção real** de
`svgstudio.mosaicoo.tech` via Fase 2.

### 2.3 Lições dos experimentos (evidência, não opinião)

1. **Fase 2 em produção (✅ provado)**: o Studio publicado carregou um plugin
   real por URL same-origin (`/plugins/<nome>/…`), instalou, listou em External,
   toggle/uninstall funcionando. Transporte + guardas + lifecycle estão prontos.
2. **Limite da Fase 2**: o plugin precisa ser **autônomo** (não importar
   `svg-engine`), senão carrega uma **2ª cópia** das classes e o DI não casa
   (`injector.get(ToolRegistry)` falha). Um plugin "de verdade" (como o STAMP)
   não funciona por esse canal **sem uma solução de compartilhamento**.
3. **Spike Native Federation (🔴 rejeitado p/ marketplace)**: host e remote
   buildam, Angular compartilha; mas os **entry-points secundários**
   (`svg-engine/edit`, `/core`, …) não fecham — `shareAll` só cobre o primário;
   `share()` explícito é descartado por `ignoreUnusedDeps:true`; desligar essa
   feature quebra o build na stack ML nativa (`onnxruntime-node`). Custo de
   integração alto/incerto com 9 entry-points + ML. Branch preservada
   (`spike/native-federation-3.1`, doc `SPIKE-native-federation-3.1.md`).

---

## 3. A decisão central (D-084): três canais, um contrato

### Canal 1 — **Build-time / npm** (A1 interno + A2 embedding) — _full power_

O que existe hoje, formalizado como produto:

- O plugin é código TS que importa `svg-engine/*` e usa os registries direto
  (`EditorPlugin` + `ctx.injector`). Poder total, type-safety total, UI Angular
  (`Tool.optionsComponent`, painéis) nativa.
- Entrega: **pacote npm publicado** (`@mosaicoo/svg-engine`) — o embedder faz
  `npm install` e `provideSvgEnginePlugin(meuPlugin)`. É também o caminho dos
  builtins.
- **Nada muda** neste canal; ele já funciona e segue sendo o teto de capacidade.

### Canal 2 — **Marketplace runtime via Host-API factory** (A3 + A4) — _o novo_

A peça que falta. Em vez de compartilhar o engine binariamente (federation), o
plugin de marketplace **recebe o engine por parâmetro**:

```ts
// O módulo hospedado em /plugins/<nome>/<nome>.plugin.js exporta:
export default function create(host: SvgeHostApi): EditorPlugin { ... }
// (o default OBJETO da Fase 2 continua aceito — plugins autônomos/standalone)
```

- **`SvgeHostApi`** é uma **fachada estreita e versionada** que o host (Studio
  ou embedder) constrói sobre o injector escopado e entrega ao plugin. O plugin
  **não importa `svg-engine`** — sem 2ª cópia, sem DI quebrado, sem federation,
  sem acoplamento de versão do Angular, **qualquer bundler** gera o `.js`.
- **Reaproveita 100% da Fase 2**: mesmo `PluginLoader`, manifesto, allowlist,
  SRI, lifecycle. A única extensão é o passo pós-load: se `default` for função,
  chamar `default(hostApi)`; se objeto, fluxo atual.
- **`@mosaicoo/svge-plugin-sdk`**: pacote **types-only** (a interface
  `SvgeHostApi`, `EditorPlugin`, helpers) + template de projeto. O autor instala
  o SDK como devDependency; em runtime não pesa nada.
- A fachada **é o contrato estável do Pilar 1**: superfície pequena e intencional,
  versionada por `hostApiVersion` (semver, gate igual ao `apiVersion`), com
  política de deprecação. Evolui aditivamente; quebrar = major.

**Desenho v1 da fachada (escopo mínimo que cobre o STAMP e a maioria dos casos):**

```ts
interface SvgeHostApi {
  readonly hostApiVersion: string; // '1.0.0'
  readonly tools: {
    // registrar tool interativa
    register(tool: HostToolSpec): Disposable; // pointer events + doc coords
  };
  readonly menus: { register(item: HostMenuItemSpec): Disposable };
  readonly shortcuts: { register(s: HostShortcutSpec): Disposable };
  readonly document: {
    // leitura + mutação via commands
    insertShape(spec: ShapeSpec): CommandOutcome; // ellipse/rect/path/text…
    setStyle(ids: string[], style: Partial<StyleSpec>): CommandOutcome;
    remove(ids: string[]): CommandOutcome;
    exportSvg(): string;
    selection(): readonly string[];
  };
  readonly ui: {
    // opções de tool DECLARATIVAS
    registerToolOptions(toolId: string, schema: OptionFieldSpec[]): Disposable;
    notify(message: string): void; // snackbar/toast do host
  };
}
```

- Implementação em `svg-engine/edit` (headless; a parte `ui.notify`/options é
  adaptada pelo host com Material quando presente). Internamente cada método
  delega aos registries/commands existentes — é **adaptação fina, não motor novo**.
- **Opções de tool declarativas** (schema → host renderiza) substituem o
  `optionsComponent` Angular para este canal — limite consciente: UI custom
  Angular rica continua exclusiva do Canal 1.

### Canal 3 — **Scripts sandboxed** (usuário não-confiável) — _futuro, D-024_

WebWorker + API curada via postMessage para automações de usuário final
(macros, geração). Sem DOM, sem rede, kill-switch. Continua planejado como
etapa posterior (D-084d) — o Canal 2 não o substitui: Canal 2 é para autores
**revisados/assinados**; código de qualquer um cai no Canal 3.

### Segurança/confiança por canal (modelo honesto)

| Canal         | Código roda                                                            | Confiança exigida                                                   | Enforcement               |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| 1 npm         | full-trust no bundle                                                   | total (você compila)                                                | revisão de código própria |
| 2 marketplace | full-trust na página (JS é JS — a fachada é contrato, **não** sandbox) | **publisher verificado**: allowlist + SRI + **assinatura + review** | pipeline de publicação    |
| 3 scripts     | **sandbox** (Worker)                                                   | nenhuma                                                             | técnico (isolamento real) |

> Transparência: um `.js` carregado no Canal 2 _poderia_ tecnicamente tocar o
> DOM — por isso o canal exige **curadoria** (registro próprio, assinatura,
> review), nunca "cole uma URL". Isolamento técnico de verdade é o Canal 3.

---

## 4. Gaps para marketplace (levantados na análise, em ordem de ataque)

1. **`SvgeHostApi` + extensão do loader** (factory default) — _desbloqueia tudo_.
2. **Persistência de instalados**: hoje um external instalado **não sobrevive ao
   reload** (o `PluginStateStore` guarda enable/disable, mas ninguém re-carrega o
   manifesto no boot). Falta `InstalledPluginsStore` (manifesto persistido) +
   re-load automático na inicialização.
3. **Registro/catálogo remoto**: um `catalog.json` servido em
   `svgstudio.mosaicoo.tech/plugins/` (lista de manifestos) + UI "Browse"
   no manager (instalar da lista, não de URL).
4. **Update**: comparar `version` instalada × catálogo; "Update" = uninstall +
   load do novo entry.
5. **Assinatura/verificação**: campo `signature` no manifesto + verificação
   (Web Crypto, chave pública do registro embutida no Studio) ao lado do SRI —
   o SRI já tem contrato, falta o `moduleLoader` de produção verificá-lo
   (fetch → hash → import blob).
6. **SDK + guia do autor**: pacote types-only + template + doc 10 estendido.
7. **Telemetria/erros**: superfícies de erro do manager já existem; falta
   relatório de "plugin X quebrou ao carregar" persistente p/ suporte.

---

## 5. Roadmap D-084 (substitui o "Fase 3" do doc 12)

| Etapa                        | Entrega                                                                                     | Aceite                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **D-084a — Host-API core**   | `SvgeHostApi` v1 (edit) + loader aceita factory + specs                                     | **STAMP reescrito contra a fachada**, carregado por URL no Studio, ferramenta carimbando de verdade |
| **D-084b — SDK do autor**    | `@mosaicoo/svge-plugin-sdk` (types) + template + guia                                       | autor externo cria plugin só com o SDK, sem clonar o repo                                           |
| **D-084c — Marketplace**     | InstalledPluginsStore + re-load no boot + catálogo remoto + update + assinatura + UI Browse | usuário instala/atualiza/remove pela UI; instalado sobrevive a reload; só assinado carrega          |
| **D-084d — Scripts sandbox** | ScriptRuntime (D-024) + API curada + console                                                | script de usuário roda isolado                                                                      |

Sequência: **a → b → c** (d em paralelo quando fizer sentido). O critério de
aceite do D-084a é deliberadamente o mesmo do spike NF — provar o STAMP — para
fechar a pergunta que originou a Fase 3.

---

## 6. Resumo executivo

- A fundação (Fases 1+2) está **pronta e provada em produção**; o núcleo de
  lifecycle/segurança não precisa ser refeito.
- **Federation foi avaliada com spike real e rejeitada** para o marketplace
  (custo/fricção); fica documentada como alternativa se o contexto mudar.
- A plataforma terá **três canais com um princípio comum** (mecanismo na lib,
  política no app): npm full-power para interno/embedding, **host-API factory**
  para o marketplace (a decisão nova — D-084), sandbox para o não-confiável.
- A fachada `SvgeHostApi` é simultaneamente a solução técnica do marketplace
  **e** o contrato público estável que uma plataforma exige.
