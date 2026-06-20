/**
 * **D-096** — dev override of {@link environment}. Swapped in for the default
 * `environment.ts` by `angular.json` `fileReplacements` on the `development`
 * build configuration. Same shape; only the values differ when a local/
 * staging deploy needs different hosts.
 */
export const environment = {
  production: false,

  // Same trusted remote as prod — the external-plugin demo loads from the
  // real Studio host even when developing on localhost. Repoint here to test
  // against a local/staging plugin origin.
  pluginsOrigin: 'https://svgstudio.mosaicoo.tech',

  homepageUrl: 'https://github.com/mosaicoo/svg-engine',

  // **D-093** — LLM local (Ollama) p/ a camada de IA do Command Palette.
  // Aponta p/ o servidor de dev do usuário (mesmo do playground). Trocar
  // baseUrl/model aqui conforme o hardware (3b cabe na GPU; 7b é mais lento).
  // `null` desliga o LLM (NLU vira só rule-based) — vide environment.ts (prod).
  aiChat: { baseUrl: 'http://192.168.1.21:11434', model: 'qwen2.5:3b' } as {
    readonly baseUrl: string;
    readonly model: string;
  } | null,
};
