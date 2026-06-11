// mosaicoo-hello.plugin.js
//
// **Plugin externo REAL** para o teste end-to-end da Fase 2 (D-083).
// Hospede este arquivo em https://mosaicoo.tech/plugins/ e carregue-o no
// SVG Studio pelo menu File ▸ "Carregar plugin externo (Mosaicoo)…".
//
// É um ES module **autônomo de propósito**: NÃO importa `svg-engine`. Isso
// é deliberado — um plugin compilado que importasse o engine traria uma
// SEGUNDA cópia das classes (ToolRegistry, CommandBus, …) e os tokens de
// DI não bateriam com os do host (NullInjectorError no install). Plugins
// que precisam integrar com o engine dependem de uma camada de
// compartilhamento (Native Federation / import-map) — escopo da Fase 3.
//
// Por ser autônomo, este plugin prova exatamente o que a Fase 2 entrega:
// transporte (import remoto) → validação do manifesto → allowlist de
// origem → shape-check → install + aparição na aba "External" do
// gerenciador. O `console.info` no install é a prova de que o código
// REMOTO realmente executou no host (abra o DevTools ao carregar).

/** @type {{ id: string, name: string, version: string, apiVersion: string, install: () => void }} */
const plugin = {
  id: 'tech.mosaicoo.hello',
  name: 'Mosaicoo Hello (remote)',
  version: '1.0.0',
  // Deve casar (major) com PLUGIN_API_VERSION do host ('1.0.0').
  apiVersion: '1.0.0',
  description: 'Plugin real carregado de mosaicoo.tech via PluginLoader (Fase 2 — D-083).',
  author: 'Mosaicoo',
  icon: 'cloud_done',
  category: 'other',
  install() {
    // Prova visível no console de que o módulo remoto foi importado e
    // instalado pelo host (e não simulado).
    console.info(
      '[mosaicoo-hello] install() executou — carregado de https://mosaicoo.tech/plugins via PluginLoader (Fase 2).',
    );
  },
};

export default plugin;
