# Spike 3.1 — Native Federation (Fase 3 / D-084)

**Branch:** `spike/native-federation-3.1` (isolada do `main`).
**Objetivo:** provar que um plugin **compilado** que usa o engine (o STAMP) pode ser
carregado por URL no **svg-studio** com o `svg-engine` + Angular **compartilhados**
(singletons), resolvendo o problema de DI que bloqueava a Fase 3.

## ✅ Provado (nível de build)

| Item                                     | Resultado                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NF compatível com Angular 21             | `@angular-architects/native-federation@~21.2.4` ↔ Angular `^21.2` ✅                                                                                                                                  |
| svg-studio como **dynamic host**         | `ng add … --type dynamic-host`; builder de federation; split `main.ts`→`bootstrap.ts`; build OK (commit `0138387`)                                                                                    |
| `stamp-plugin` como **remote** (vizinho) | projeto novo `projects/stamp-plugin`; `expose './plugin'` = `EditorPlugin`; build OK (commit `54744a7`)                                                                                               |
| Angular/rxjs/tslib compartilhados        | singletons no `remoteEntry.json` ✅                                                                                                                                                                   |
| **`svg-engine` compartilhado**           | via **tsconfig mapped-paths (default do NF)** — chunks `@nf-internal/*`. **Confirmado no build de produção: o chunk exposto caiu de 848 KB (dev) → 47 KB (prod)** → o engine NÃO vai dentro do plugin |

**Conclusão:** o mecanismo funciona. O STAMP buildado à parte usa o **mesmo** `svg-engine`
do host em runtime → os tokens de DI (`ToolRegistry`, `CommandBus`) batem.

## Aprendizados / gotchas

- **Dev inlina, prod deduplica.** O `plugin.js` em `--configuration development` tem 848 KB
  (engine inlinado), mas o runtime do NF roteia pelos chunks compartilhados; o build de
  **produção** confirma o dedup (47 KB). Não se assustar com o tamanho em dev.
- **`file:dist/svg-engine` foi red herring** — o sharing vem dos mapped-paths do tsconfig,
  não de tornar o engine um pacote node_modules. Revertido.
- **`npm install` precisou de `--legacy-peer-deps`** (skew 21.2.15 vs 21.2.17, compatível).
- **Builds pesados pelo PowerShell**, não pelo Git-Bash (o fork do Cygwin falha sob pressão
  de memória: `fork: Resource temporarily unavailable`).
- O `main.ts` gerado pelo schematic usa `.then(_ => …)` → quebra o ESLint (`no-unused-vars`);
  trocado por `() =>` (host e remote).

## ⬜ Falta (para o spike rodar ponta a ponta)

1. **Fiar o host:** registrar o remote no `projects/svg-studio/public/federation.manifest.json`
   e um `moduleLoader` que use `loadRemoteModule({ remoteEntry, exposedModule: './plugin' })`,
   entregando o `default` (EditorPlugin) ao `PluginManager` (Fase 1/2). Isso conecta o
   `loadRemoteModule` ao gerenciador existente.
2. **Verificação no browser (precisa de você):** `ng serve stamp-plugin` (porta 4201) +
   `ng serve svg-studio`, carregar o remote e confirmar:
   - o `console.info('[stamp-remote] install() …')` aparece (código remoto rodou),
   - a tool "Stamp (remote)" fica ativa e **carimba um círculo** ao clicar (prova de que
     `ctx.injector.get(ToolRegistry)` resolveu a instância **do host** — DI compartilhado).
     _(Não consigo validar no browser por aqui — o preview do harness está enraizado em outro
     projeto.)_

## Implicação para a Fase 3 (D-084)

Native Federation está **validado** como o mecanismo de sharing (Pilar 2 do plano). Os
mapped-paths do tsconfig já compartilham o `svg-engine` sem virar um pacote publicado — mas
para **terceiros** (fora do monorepo) o engine **terá** que ser um pacote npm publicado
(`@mosaicoo/svg-engine`) com `requiredVersion`/semver no `shared`. Isso reforça o **Pilar 1
(contrato + versão estáveis)** como pré-requisito.

## Como retomar

```powershell
git checkout spike/native-federation-3.1
# (node_modules já tem o NF instalado nesta branch)
npx ng build stamp-plugin --configuration production   # ~47 KB exposto = engine compartilhado
```

Commits do spike: `0138387` (host) · `54744a7` (remote) · este doc.
