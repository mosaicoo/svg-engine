import { computed, type Injector, type Signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  type EditorPlugin,
  type ExternalPluginManifest,
  MENU_SLOT,
  MenuContributionRegistry,
  PLUGIN_API_VERSION,
  PluginLoader,
  type PluginModuleLoader,
} from 'svg-engine/edit';
import { SvgePluginManagerDialogService } from 'svg-engine/ui';

/**
 * **Teste real da Fase 2 (D-083) no SVG Studio** — carregar um plugin
 * externo *de verdade*, por rede, de uma origem confiável.
 *
 * A Fase 2 é **mecanismo, não política**: a biblioteca nunca embute um
 * primitivo "carregue qualquer URL". É o **consumidor** (este app) que
 * decide as origens confiáveis e fornece o `moduleLoader`. Aqui o Studio
 * confia em `https://mosaicoo.tech` e usa um `import()` nativo como
 * transporte — exatamente o que um produto faria.
 *
 * Fluxo provado de ponta a ponta pelo `PluginLoader`:
 * validar manifesto → gate de `apiVersion` → **allowlist de origem** →
 * `moduleLoader` (`import()` remoto) → shape-check do `default` export →
 * `installExternal` (aparece na aba **External** do gerenciador).
 *
 * **Limite consciente**: o plugin remoto (`mosaicoo-hello.plugin.js`) é
 * autônomo e NÃO importa `svg-engine` — senão traria uma segunda cópia
 * das classes e os tokens de DI não casariam com os do host. Plugins
 * compilados que integram com o engine (ex.: o STAMP, que registra uma
 * tool) exigem uma camada de compartilhamento host↔plugin (Native
 * Federation / import-map) — planejada para a Fase 3.
 */

/** Origem confiável (apenas `scheme://host`) — casada com a allowlist. */
export const MOSAICOO_ORIGIN = 'https://mosaicoo.tech';

/**
 * `moduleLoader` do consumidor: `import()` nativo do `entry` já validado.
 *
 * Os comentários desabilitam a análise estática do bundler (Vite no dev
 * do Angular; webpack em outros) para que o specifier permaneça dinâmico
 * em runtime em vez de ser pré-resolvido em build. Em produção, adicione
 * verificação de SRI aqui (fetch dos bytes → checar `manifest.integrity`
 * → importar via blob URL) antes de retornar o módulo.
 */
export const mosaicooModuleLoader: PluginModuleLoader = (manifest) =>
  import(/* @vite-ignore */ /* webpackIgnore: true */ manifest.entry) as Promise<unknown>;

/**
 * Manifesto do plugin de demonstração servido por mosaicoo.tech. Num
 * produto real viria do registro/CDN; aqui está embutido para o teste ter
 * o mínimo de partes móveis (só o `.js` precisa estar hospedado + CORS).
 */
export const MOSAICOO_HELLO_MANIFEST: ExternalPluginManifest = {
  id: 'tech.mosaicoo.hello',
  name: 'Mosaicoo Hello (remote)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  entry: `${MOSAICOO_ORIGIN}/plugins/mosaicoo-hello.plugin.js`,
  description: 'Plugin real carregado de mosaicoo.tech via PluginLoader (Fase 2 — D-083).',
  author: 'Mosaicoo',
  icon: 'cloud_done',
  category: 'other',
};

/**
 * **`mosaicooLoaderDemoPlugin`** — adiciona ao menu **File** do Studio o
 * item "Carregar plugin externo (Mosaicoo)…" que dispara o
 * {@link PluginLoader} contra o {@link MOSAICOO_HELLO_MANIFEST}. O
 * resultado vai para um snackbar; em sucesso, oferece abrir o gerenciador
 * (File ▸ Manage Plugins) onde o plugin aparece na aba **External**.
 *
 * **Por que mora no app, não na lib**: a allowlist e a oferta de "carregar
 * do nosso CDN" são política do consumidor. A lib só expõe o mecanismo.
 */
export const mosaicooLoaderDemoPlugin: EditorPlugin = {
  id: 'studio.mosaicoo-loader-demo',
  name: 'SVG Studio — Carregar plugin externo (Mosaicoo)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  description: 'Carrega um plugin externo real de mosaicoo.tech (teste da Fase 2).',
  author: 'SVG Studio',
  icon: 'cloud_download',
  category: 'other',

  install(ctx) {
    const menus = ctx.injector.get(MenuContributionRegistry);

    // Greys-out se o loader não estiver configurado (origens + moduleLoader).
    // Constante na prática — origens/loader não mudam em runtime — mas evita
    // um erro caso alguém remova o providePluginLoader do app.config.
    const disabledFactory = (injector: Injector): Signal<boolean> => {
      const loader = injector.get(PluginLoader);
      return computed(() => !loader.isEnabled);
    };

    ctx.track(
      menus.register({
        id: 'studio.mosaicoo-loader-demo.file',
        slot: MENU_SLOT.FILE,
        label: 'Carregar plugin externo (Mosaicoo)…',
        icon: 'cloud_download',
        tooltip: 'Carrega um plugin externo real de mosaicoo.tech (Fase 2)',
        // 96: logo após "Manage Plugins…" (95), agrupado com as ações globais.
        order: 96,
        disabled: disabledFactory,
        run(runCtx) {
          const injector = runCtx?.injector ?? ctx.injector;
          void loadAndReport(injector);
        },
      }),
    );
  },
};

/** Dispara o load e reporta o resultado via snackbar (com ação "Abrir"). */
async function loadAndReport(injector: Injector): Promise<void> {
  const loader = injector.get(PluginLoader);
  const snack = injector.get(MatSnackBar);

  const res = await loader.load(MOSAICOO_HELLO_MANIFEST);

  if (res.ok) {
    const ref = snack.open(
      'Plugin externo carregado de mosaicoo.tech — veja na aba External.',
      'Abrir',
      { duration: 6000 },
    );
    ref.onAction().subscribe(() => {
      injector.get(SvgePluginManagerDialogService).open(injector);
    });
  } else {
    snack.open(`Falha ao carregar: ${res.error}`, 'OK', { duration: 8000 });
  }
}
