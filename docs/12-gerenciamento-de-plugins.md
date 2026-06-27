# 12 — Gerenciamento de plugins (documento de decisão)

> **Status: decidido — Fases 1 e 2 implementadas (2026-06-11).** As decisões
> foram tomadas e registradas em
> [D-083](04-decisoes-tecnicas.md#d-083--gerenciamento-e-distribuição-de-plugins);
> a **Fase 1** (gerenciador dos plugins bundlados) e a **Fase 2**
> (carregamento runtime de origem confiável) estão implementadas e verdes.
> A **Fase 3** (repositório/marketplace + scripts sandboxed) segue planejada.
> Este documento permanece como o mapa de raciocínio: opções com
> trade-offs e a recomendação faseada que foi adotada.
>
> Pré-requisitos de leitura: [D-020](04-decisoes-tecnicas.md#d-020--sistema-de-plugins-de-primeira-classe)
> (infra), [D-023](04-decisoes-tecnicas.md#d-023--categorias-de-plugin-roadmap)
> (categorias), [D-024](04-decisoes-tecnicas.md#d-024--scriptruntimeplugin-deferido-para-fase-6)
> (scripts sandboxed) e o [Guia do autor de plugin](10-guia-plugin.md).

---

## 1. O que foi pedido

> "Para uma ferramenta que trabalha com plugins vejo a necessidade de
> criarmos uma forma de gerenciá-los, instalá-los, desinstalá-los,
> ativá-los e desativá-los. Talvez outras funções. E como seria algum
> usuário querer instalar um plugin, deveria existir um repositório de
> plugins online? Qual o mecanismo correto para o nosso sistema?"

Duas perguntas distintas:

1. **Gerência de ciclo de vida** — instalar / desinstalar / ativar /
   desativar (+ funções correlatas) e a UI que expõe isso.
2. **Distribuição** — de onde os plugins vêm; faz sentido um repositório
   online? Qual o mecanismo correto e seguro?

---

## 2. Estado atual (ancorado no código)

A infra de plugins do SVGEngine já é madura. O que **existe hoje** vs o
que **falta** para "gerenciar plugins" como produto:

| Capacidade                              |            Existe?            | Onde / Observação                                                                                                      |
| --------------------------------------- | :---------------------------: | ---------------------------------------------------------------------------------------------------------------------- |
| Contrato `EditorPlugin`                 |              ✅               | `edit/lib/plugin/plugin.ts` — `id/version/name/apiVersion/dependencies?/install/uninstall?`                            |
| `PluginContext` (DI + `track`)          |              ✅               | injector cru + `track<T>(d):T` (LIFO cleanup)                                                                          |
| Install em **build-time**               |              ✅               | `provideSvgEnginePlugin(p)` via `ENVIRONMENT_INITIALIZER` (ordem do array)                                             |
| Install/uninstall em **runtime**        |              ✅               | `PluginRegistry.install(p)` / `uninstall(id)` — **idempotente**, rollback no throw, disposal LIFO best-effort          |
| Introspeção                             |              ✅               | `has(id)`, `get(id)`, `list()`, `installed` (signal reativo)                                                           |
| Gate de versão de API                   |              ✅               | semver **major** contra `PLUGIN_API_VERSION = '1.0.0'`                                                                 |
| Checagem de dependências                |              ✅               | cada id em `dependencies` precisa estar instalado antes (hard error)                                                   |
| Atomicidade / cleanup determinístico    |              ✅               | install que joga → roll back; uninstall → `uninstall()` hook + dispose LIFO; erros isolados não abortam o restante     |
| **Ativar / desativar** (≠ desinstalar)  |            ✅ (F1)            | `PluginManagerService` (D-083 F1): enable/disable = uninstall + lembrar; `PluginRegistry` intacto                      |
| **Persistência** do estado de plugins   |            ✅ (F1)            | `PluginStateStore` + `PluginCatalog` (D-083 F1): set persistido; `provideSvgEnginePlugin` pula install dos desativados |
| **Metadata de exibição**                |            ✅ (F1)            | `EditorPlugin` ganhou `description`/`author`/`icon`/`category` (aditivos, D-083 F1)                                    |
| **UI de gerência** (Plugin Manager)     |            ✅ (F1)            | `<svge-plugin-manager>` (`svg-engine/ui`) consome o catálogo + rota `/plugins` no playground (D-083 F1)                |
| **Carregar plugin de terceiro runtime** |            ✅ (F2)            | `PluginLoader` + `installExternal` + `providePluginLoader({ trustedOrigins, moduleLoader })` — fail-closed (D-083 F2)  |
| **Repositório / descoberta**            |            ❌ (F3)            | sem manifesto, sem índice remoto, sem marketplace — **Fase 3, não iniciada**                                           |
| Scripts de usuário final (sandbox)      | 🟡 decidido, não implementado | `ScriptRuntimePlugin` (D-024) — WebWorker isolado + API curada; **deferido p/ Fase 3 (Bloco 6e)**                      |

**Resumo:** o _motor_ de ciclo de vida e a **camada de produto** (Fases 1–2:
ativar/desativar, persistência, metadata, UI de gerência, carregamento
runtime de origem confiável) estão prontos. Falta apenas a **distribuição**
(Fase 3: repositório/marketplace + scripts sandboxed) — não iniciada.

---

## 3. O insight central: existem **dois canais**, não um

A pergunta "deveria existir um repositório de plugins online?" só tem
resposta correta depois de separar dois tipos de extensão que hoje a
linguagem comum mistura:

### Canal A — **Plugins** (D-020): código TypeScript compilado, _full-trust_

Um plugin recebe `ctx.injector` — **o injector cru do Angular**. Com ele
pega _qualquer_ service (CommandBus, persistência, IO, etc.). Isso é
deliberado e documentado (D-020: "injector cru, não façade") e é o que dá
o poder real às 10+ categorias. **Consequência de segurança:** um plugin
roda com os **mesmos privilégios do host**. Não é sandboxável como está —
carregar um plugin compilado de terceiro = executar código arbitrário com
confiança total. É exatamente o modelo do **VS Code / Figma plugins**:
poderosos, e por isso o vetor de confiança é o _publisher_, não um
sandbox.

### Canal B — **Scripts** (D-024): código do usuário final, _sandboxed_

Já decidido (D-024) e **propositalmente diferente**: scripts rodam num
**WebWorker isolado**, sem `window`/DOM/Injector, falando com o main
thread por uma **API curada** (`ScriptHostAPI`) que só devolve
`CommandRequest`s. Um script malicioso não exfiltra dados nem destrói
estado — no pior caso emite comandos que o host valida. É o canal **seguro
por construção**.

> **A virada de chave:** o "repositório online onde qualquer um instala
> com um clique" pertence ao **Canal B (scripts)**, não ao Canal A
> (plugins). Scripts são seguros para compartilhamento comunitário aberto;
> plugins compilados full-trust **não são** e exigem confiança no
> publisher (curadoria/assinatura), nunca um "cole a URL e rode".

Esse enquadramento responde a pergunta do usuário diretamente — ver §6 e
§7.

---

## 4. Funções de gerência: gap analysis + design

As funções pedidas, mapeadas ao que falta:

### 4.1 Instalar

- **Build-time** (já existe): `provideSvgEnginePlugin` no `app.config`. É o
  caminho dos builtins e do _consumer_ que monta seu editor. **Manter como
  default.**
- **Runtime, plugin já carregado em memória** (já existe):
  `PluginRegistry.install(p)`. É o que a UI usa para "ativar" algo que já
  está no bundle.
- **Runtime, plugin de terceiro vindo de fora** (não existe): exige um
  `PluginLoader` que faça `import(url)` de um bundle ESM e instale o export
  default. **É a parte sensível** — ver §5 e §6.

### 4.2 Desinstalar

`PluginRegistry.uninstall(id)` já faz o trabalho completo (hook + dispose
LIFO + remove). **Gap:** a UI precisa **bloquear desinstalar um plugin do
qual outros dependem** (hoje a checagem de `dependencies` é só no install).
Design: antes de desinstalar, computar `dependents(id)` varrendo
`list()`; se houver, exigir desinstalar os dependentes primeiro (ou
oferecer cascata explícita).

### 4.3 Ativar / Desativar (o gap conceitual mais importante)

Hoje **não existe** "instalado porém inativo". Duas formas de implementar:

| Abordagem                               | Como                                                                                                 | Prós                                                               | Contras                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **A. Disable = uninstall + lembrar** ✅ | Desativar chama `uninstall(id)` mas grava o id num set `disabled` persistido; ativar re-`install(p)` | **Zero mudança no motor**; reusa cleanup determinístico já provado | Re-install perde estado interno do plugin (aceitável — plugins devem ser stateless no install, já é regra do guia) |
| B. Estado `enabled` dentro do registry  | `PluginRegistry` ganha `enabled` flag + `setEnabled`; registries consultam a flag                    | Estado "instalado mas off" explícito                               | Vaza o conceito para **todas** as 10+ capability registries; muda contrato D-020; muito mais superfície e risco    |

> **Recomendação:** **Abordagem A.** Mantém o motor intacto (D-020/D-023
> não mudam), reusa o disposal LIFO já testado, e "desativar" vira só
> "desinstalar + registrar preferência". Ativar = re-instalar a partir do
> catálogo conhecido. Isso exige um **catálogo** (§4.6) que mapeie `id →
EditorPlugin` para conseguir re-instanciar.

### 4.4 Persistência

Necessária para que ativar/desativar sobreviva ao reload. Seguindo o
padrão já usado no projeto (`AutoSaveService`, localStorage _per-editor_
via token — ver D-073/AUDIT-FIX P8):

- Guardar **apenas o set de ids desativados** (preferência do usuário),
  não os plugins em si.
- Chave _scoped_ ao editor (mesma convenção do AutoSave) para não vazar
  entre instâncias.
- No boot: `app.config` registra o catálogo completo; um inicializador lê
  o set persistido e **pula** o install dos desativados (ou instala todos e
  desinstala os desativados logo após — escolha de implementação).

### 4.5 Metadata de exibição

Para uma UI decente, `EditorPlugin` precisa de campos opcionais
(retrocompatíveis — `?`): `description?`, `author?`, `icon?` (Material
icon name, coerente com tools/menus), `category?` (uma das do D-023),
`homepage?`. **Aditivo, não-breaking** — `PLUGIN_API_VERSION` permanece
`1.0.0` (minor bump no máximo).

### 4.6 Catálogo (peça nova necessária)

Ativar/desativar e uma UI de gerência exigem um **registro do que é conhecido**
(instalado _ou não_), separado de `PluginRegistry` (que só conhece o que
está _instalado agora_). Proposta: um `PluginCatalog` (ou estender o
provide) que mapeia `id → { plugin, source: 'builtin' | 'runtime' }`. A UI
lista o catálogo; o `installed` signal diz quais estão ativos.

### 4.7 Outras funções ("Talvez outras funções")

Candidatas naturais, todas baratas sobre a base atual:

- **Inspecionar contribuições** de um plugin (quais tools/menus/effects ele
  adicionou) — exige o registry _taggear_ contribuições por `pluginId`
  (hoje as registries não sabem quem contribuiu; D-020 diz isso
  explicitamente). É trabalho extra; deixar para fase posterior.
- **Reordenar** plugins (ordem de install importa p/ deps e p/ quem vence
  em slots) — útil mas secundário.
- **Configurações por plugin** — um `SettingsRegistry`/painel; nova
  categoria D-023 se virar recorrente.
- **Health/erros** — surfacing de plugins que falharam no install (hoje
  jogam exceção no boot; a UI poderia capturar e mostrar como "com erro").

---

## 5. Modelo de distribuição — opções e trade-offs

Como um plugin (Canal A) chega ao editor:

| Modelo                                            | Mecanismo                                                                                                                                     | Confiança                | Quando usar                                                               | Custo                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- | ----------------------- |
| **1. npm + bundling em build-time** ✅ (atual)    | Consumer instala pacote npm e chama `provideSvgEnginePlugin` no `app.config`                                                                  | Total (build)            | Builtins + parceiros verificados + plugins do próprio consumer            | Zero (já existe)        |
| **2. `import(url)` dinâmico de origem confiável** | `PluginLoader` faz `import()` de ESM hospedado num **origin que o consumer configura** (seu CDN), com **SRI/hash** + checagem de `apiVersion` | Alta (origem controlada) | Consumer quer "ligar/desligar" extensões sem rebuild, de catálogo próprio | Médio                   |
| **3. Marketplace público aberto (1-clique)**      | Índice remoto + usuário final instala qualquer plugin de qualquer autor                                                                       | **Baixa** ⚠️             | **Não recomendado para Canal A** (ver §6)                                 | Alto + risco            |
| **3'. Marketplace de _scripts_ (Canal B)**        | Índice de scripts; instala no `ScriptRegistry`; roda sandboxed                                                                                | Segura p/ design         | O lugar **correto** para compartilhamento comunitário aberto              | Alto (depende de D-024) |

Observações:

- Modelo 1 é, e deve continuar, o **default**. É como VS Code/Figma
  distribuem o grosso (e como bibliotecas Angular são consumidas).
- Modelo 2 é a evolução natural quando o _consumer_ (não o usuário final
  anônimo) quer um catálogo dinâmico próprio. A chave: **a allowlist de
  origens é configuração do consumer**, com integridade (SRI) e o mesmo
  gate de `apiVersion` que já existe.
- Modelo 3 (marketplace aberto de plugins compilados) é o que parece a
  resposta intuitiva à pergunta do usuário, mas é o **caminho de maior
  risco** — ver §6.

---

## 6. Segurança — por que "repositório online de plugins" merece cuidado

Esta seção é o núcleo da resposta à pergunta do usuário.

1. **Plugin compilado = execução de código arbitrário com privilégio
   total.** Com `ctx.injector.get(...)` o plugin alcança persistência, IO,
   rede (qualquer service), DOM via Angular. Um "repositório online onde o
   usuário final instala plugins com um clique" é, na prática, **pedir para
   o usuário rodar código de estranhos com confiança total** — um vetor
   clássico de supply-chain.

2. **O sandbox que temos é para o Canal B, não o A.** D-024 já resolveu
   _como_ rodar código não-confiável com segurança: WebWorker isolado, sem
   Injector, API curada. Isso vale para **scripts**, não para plugins
   compilados. Tentar "sandboxar plugins" significaria reescrevê-los para a
   API curada — ou seja, transformá-los em scripts. Então a separação dos
   canais não é burocracia: é a fronteira de segurança.

3. **O mecanismo correto, por canal:**
   - **Plugins (A):** distribuição primária por **npm + build-time** (o
     consumer escolhe e confia). Runtime só via **`import()` de origem que o
     consumer configurou**, com **SRI** (integridade) e gate de
     `apiVersion`. **Nunca** "cole uma URL e rode" para o usuário final.
     Um marketplace de plugins, se um dia existir, precisa de **identidade
     de publisher + assinatura + curadoria/review** (o modelo VS Code
     Marketplace) — é um produto-plataforma à parte, não um MVP.
   - **Scripts (B):** _este_ é o canal onde um **repositório comunitário
     aberto** faz sentido e é seguro, porque o sandbox neutraliza o
     código. É a forma certa de entregar "qualquer usuário instala algo da
     internet".

4. **Alinhamento com a fronteira de instrução-vs-dado do projeto.** O
   mesmo princípio que trata conteúdo observado como dado (não comando) se
   aplica: código baixado é **não-confiável por padrão**. Plugins
   confiáveis entram por um canal auditável (build/npm/origem allowlisted);
   código arbitrário da internet só roda sandboxed (scripts).

> **Conclusão de segurança:** Sim, pode existir "repositório online" — mas
> a forma profissional é: **plugins** via npm/build-time (e, no máximo,
> `import()` de origem confiável configurada pelo consumer, com SRI);
> **scripts** (D-024) como o canal aberto/comunitário sandboxed. Um
> marketplace público de plugins compilados full-trust é um produto
> separado, caro e arriscado, que só se justifica se o SVGEngine virar
> plataforma — e mesmo aí exige assinatura + curadoria.

---

## 7. UI proposta — `<svge-plugin-manager>`

Componente novo em `svg-engine/ui` (respeita o headless boundary: a infra
fica em `edit`, a UI Material em `ui`). Consome `PluginRegistry.installed`
(signal) + o catálogo (§4.6):

- **Lista** por categoria (D-023): nome, versão, autor, descrição, ícone.
- **Toggle ativar/desativar** por item (Abordagem A, §4.3) — desabilitado
  quando há dependentes ativos, com tooltip explicando.
- **Desinstalar** (para os de `source: 'runtime'`); builtins não se
  desinstalam, só desativam.
- **Detalhe**: dependências, `apiVersion`, e (fase posterior) contribuições
  que o plugin adicionou.
- **Estado de erro**: plugin que falhou no install aparece marcado.
- Montável no _right rail_ do `<svge-shell-pro>` (como os outros panels) e
  como dialog.

Persistência do toggle via a convenção de localStorage scoped (§4.4).

---

## 8. Versionamento e compatibilidade

Já há base (`PLUGIN_API_VERSION` + gate major). Acrescentar:

- Os campos de metadata (§4.5) são **aditivos** → no máximo minor bump
  (`1.1.0`). Plugins `1.0.0` continuam válidos.
- Se/quando `import()` dinâmico entrar: o loader **deve** checar
  `apiVersion` _antes_ de instalar (o `install` já checa, mas falhar cedo,
  no fetch, dá melhor UX) e validar SRI.
- Um manifesto JSON (modelo 2/3) carregaria: `id`, `name`, `version`,
  `apiVersion`, `entry` (URL ESM), `integrity` (SRI), `dependencies`,
  `category`, `author`.

---

## 9. Roadmap recomendado (faseado)

Ordenado por **valor/risco** — cada fase entrega algo útil e não bloqueia
a seguinte:

- **Fase 1 — Plugin Manager dos plugins já existentes (alto valor, baixo
  risco). ✅ IMPLEMENTADA (2026-06-11).** Metadata opcional em `EditorPlugin`;
  catálogo (§4.6 → `PluginCatalog`); ativar/desativar via Abordagem A com
  persistência encapsulada (`PluginStateStore`, app-wide); `PluginManagerService`
  - bloqueio por dependentes; UI `<svge-plugin-manager>` (playground `/plugins`).
    **Resolveu exatamente o que foi pedido** (gerenciar/instalar/desinstalar/
    ativar/desativar) para o set de plugins que o editor já carrega. **Nenhuma
    superfície de segurança nova.**
- **Fase 2 — carregamento runtime de origem confiável. ✅ IMPLEMENTADA
  (2026-06-11).** `ExternalPluginManifest` + validator; `PluginLoader`
  fail-closed (allowlist de origens **do consumer** + gate de `apiVersion` +
  shape-check) → `installExternal`; `providePluginLoader({ trustedOrigins,
moduleLoader })` opt-in — o `import()` real + SRI vivem no `moduleLoader` do
  consumer (a lib não embute "carregar URL arbitrária"). Sem marketplace público.
- **Fase 3 — Canais de distribuição "online" (o real "repositório").**
  Dois sub-tracks, independentes:
  - **3a. Script repository (sandboxed, comunitário)** — implementar D-024
    (`ScriptRuntimePlugin`) e, sobre ele, um índice/compartilhamento de
    scripts. **É o canal aberto seguro.** Provavelmente o mais alinhado ao
    que o usuário imaginou como "instalar da internet".
  - **3b. Plugin marketplace curado (full-trust)** — só se o produto virar
    plataforma: identidade de publisher, assinatura, review. Caro;
    avaliar sob demanda real.

---

## 10. Decisão recomendada (resumo executivo)

1. **Construir a gerência (Fase 1) sobre o motor que já existe** — sem
   mexer em D-020/D-023. Ativar/desativar = uninstall+lembrar (Abordagem
   A); persistência scoped; metadata aditiva; UI `<svge-plugin-manager>`.
2. **Distribuição padrão permanece npm + build-time.** Evolução opcional:
   `import()` de **origem confiável configurada pelo consumer** + SRI
   (Fase 2). **Não** abrir marketplace público de plugins compilados.
3. **O "repositório online aberto" é o de _scripts_ (Canal B / D-024),
   sandboxed** — esse é o mecanismo correto e seguro para
   compartilhamento entre usuários (Fase 3a). Marketplace de plugins
   full-trust (3b) é produto-plataforma à parte, só sob demanda real, com
   assinatura + curadoria.

---

## 11. Decisões tomadas (resolvido)

As perguntas em aberto foram respondidas e registradas em
[D-083](04-decisoes-tecnicas.md#d-083--gerenciamento-e-distribuição-de-plugins):

1. **Público-alvo:** há **dev** (embarca a lib e cria plugins internos) e
   **usuário** (opera a aplicação final), mas a library **não modela papéis
   nem login** — entrega o **mecanismo** (`PluginManagerService` +
   `<svge-plugin-manager>`); o **controle de acesso é do consumer**.
2. **MVP:** começou pela **Fase 1** (gerência dos plugins bundlados). ✅
3. **Carregamento runtime de terceiros (Fase 2):** não agora — mantém
   build-time/npm; o loader de origem confiável fica para a Fase 2.
4. **Repositório:** o "instalar da internet" aberto nasce como **repositório
   de scripts sandboxed** (Fase 3a / D-024); marketplace de plugins compilados
   (3b) só sob demanda real.

> A **Fase 1** está implementada e verde, e a **Fase 2** foi entregue **e
> provada em produção** (plugin real carregado de
> `svgstudio.mosaicoo.tech/plugins/...` no Studio publicado) — ver D-083 e o
> histórico 2026-06-11.
>
> A **Fase 3 foi redesenhada como [D-084]** após o spike de Native Federation:
> a arquitetura definitiva da plataforma (três canais: build-time/npm,
> **marketplace via Host-API factory** e scripts sandboxed) está em
> **[13-plataforma-de-plugins.md](13-plataforma-de-plugins.md)** — este
> documento (12) permanece como registro histórico das decisões das Fases 1–2.
