# Teste real da Fase 2 — plugin externo de `svgstudio.mosaicoo.tech`

Estes arquivos são um **plugin externo real** para validar, de ponta a ponta e por rede,
o carregamento de plugins da Fase 2 (D-083) **no SVG Studio**.

| Arquivo                        | Papel                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `mosaicoo-hello.plugin.js`     | ES module **autônomo** — `export default` é o `EditorPlugin`. É o que se hospeda. |
| `mosaicoo-hello.manifest.json` | Manifesto (metadados + `entry`). Referência; o Studio já o embute no teste.       |

O Studio confia no **próprio domínio** `https://svgstudio.mosaicoo.tech` e usa `import()`
nativo como transporte (ver `projects/svg-studio/src/app/plugins/mosaicoo-loader-demo.ts`

- `app.config.ts`). **Mecanismo, não política**: a allowlist e o `moduleLoader` são do app,
  não da biblioteca.

## Origem única cobre todas as subpastas

A allowlist é por **origem** (`scheme://host`), **não por caminho**. Então a única entrada
`https://svgstudio.mosaicoo.tech` cobre **todos** os plugins sob esse domínio:

```
https://svgstudio.mosaicoo.tech/plugins/mosaicoo-hello/mosaicoo-hello.plugin.js
https://svgstudio.mosaicoo.tech/plugins/outro-plugin/outro.plugin.js
https://svgstudio.mosaicoo.tech/plugins/stamp/stamp.plugin.js   (Fase 3)
```

Cada plugin só precisa do seu próprio `manifest.entry`. **Nenhuma mudança de código** para
adicionar um plugin novo numa subpasta — só publicar o `.js` e ter o manifesto apontando
para ele.

## CORS: necessário só em cross-origin (dev)

Como os plugins ficam no **mesmo domínio do Studio**:

- **Produção** (Studio servido de `svgstudio.mosaicoo.tech`): o `import()` é **same-origin
  → sem CORS**. Nada a configurar.
- **Dev** (`ng serve` em `http://localhost:4200`): aí é cross-origin para
  `svgstudio.mosaicoo.tech` → o servidor **precisa** enviar
  `Access-Control-Allow-Origin`. Alternativa: testar direto no Studio publicado (same-origin).

CORS no nginx, apenas se for testar do `localhost`:

```nginx
location /plugins/ {
    add_header Access-Control-Allow-Origin "*" always;
    types { text/javascript js; }   # MIME canônico p/ ES modules
}
```

## 1. Hospedar (seu servidor)

Suba **`mosaicoo-hello.plugin.js`** para:

```
https://svgstudio.mosaicoo.tech/plugins/mosaicoo-hello/mosaicoo-hello.plugin.js
```

(O caminho/subpasta é livre — só a **origem** precisa bater com a allowlist. Se mudar o
caminho, ajuste o `entry` em `mosaicoo-loader-demo.ts` + `mosaicoo-hello.manifest.json`.)

Confira o serviço:

```bash
curl -sS -D - -o /dev/null https://svgstudio.mosaicoo.tech/plugins/mosaicoo-hello/mosaicoo-hello.plugin.js
# Espera: 200 + Content-Type de JavaScript. (CORS só se for testar do localhost.)
```

## 2. Testar no SVG Studio

```bash
cd C:/Projetos/ClaudeCode/SVGEngine
npm run start          # ng serve (svg-studio é o app default)
```

1. Abra o Studio no navegador e vá ao editor.
2. Menu **File ▸ "Carregar plugin externo (Mosaicoo)…"**.
3. Esperado: snackbar **"Plugin externo carregado de svgstudio.mosaicoo.tech — veja na aba External."**
   - Abra o **DevTools ▸ Console**: aparece
     `[mosaicoo-hello] install() executou — carregado de https://svgstudio.mosaicoo.tech/plugins …`
     (prova de que o código **remoto** rodou no host).
   - Clique em **"Abrir"** no snackbar (ou **File ▸ Manage Plugins…**): o plugin
     **"Mosaicoo Hello (remote)"** aparece na aba **External** — dá para ligar/desligar/desinstalar.

### O que esse teste prova (e o que não prova)

✅ Transporte real (`import()` remoto) → validação do manifesto → **allowlist de origem**
→ gate de `apiVersion` → shape-check → `installExternal` + ciclo de vida no gerenciador.

❌ **Não** prova um plugin que integra com o engine (registrar tool/comando). O
`mosaicoo-hello` é autônomo de propósito. Um plugin compilado como o **STAMP** importa
APIs do engine (`ToolRegistry`, `CommandBus`, …); carregá-lo por URL exige compartilhar o
`svg-engine` + Angular do host (senão os tokens de DI não casam). Essa camada de
compartilhamento (**Native Federation** recomendada) é escopo da **Fase 3**.

## 3. Caso negativo (opcional)

Para ver o fail-closed da allowlist, edite o `entry` do manifesto embutido no Studio para
uma origem fora de `https://svgstudio.mosaicoo.tech` — o loader recusa com
`Refused: "…" is not on the trusted-origins allowlist`, sem buscar nada.

## SRI (opcional, recomendado em produção)

O manifesto aceita `integrity` (`sha384-…`). O `moduleLoader` do demo não verifica SRI
(faz `import()` direto). Para validar a integridade, troque o `moduleLoader` por um que
faça `fetch` dos bytes, cheque o hash e importe via blob URL. Gerar o hash:

```bash
openssl dgst -sha384 -binary mosaicoo-hello.plugin.js | openssl base64 -A
# prefixe com "sha384-" no campo integrity do manifesto
```
