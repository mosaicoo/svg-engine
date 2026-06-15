/**
 * **D-096** — SVG Studio deploy configuration. This file is the **default**
 * (used by the production build); the dev build swaps it for
 * `environment.development.ts` via `angular.json` `fileReplacements`.
 *
 * Keep every host/URL here so changing a deploy target is a **config edit,
 * never a code edit** — the app code reads `environment.*`, not hard-coded
 * literals.
 */
export const environment = {
  production: true,

  /**
   * Trusted origin (`scheme://host`) for the external-plugin allowlist
   * (`PluginLoader`). The Studio serves its own `/plugins/` from here, so in
   * production the plugin `import()` is same-origin.
   */
  pluginsOrigin: 'https://svgstudio.mosaicoo.tech',

  /**
   * Project homepage / repository shown in the **About** dialog. Fed to the
   * library via `provideSvgeHelpLinks({ homepage })` in `app.config.ts`.
   */
  homepageUrl: 'https://github.com/mosaicoo/svg-engine',
};
