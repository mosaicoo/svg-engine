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
};
