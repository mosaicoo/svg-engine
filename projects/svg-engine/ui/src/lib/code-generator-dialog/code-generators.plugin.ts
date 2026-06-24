import type { ProviderToken } from '@angular/core';
import {
  type EditorPlugin,
  MENU_SLOT,
  MenuContributionRegistry,
  type MenuContributionContext,
  PLUGIN_API_VERSION,
} from 'svg-engine/edit';
import { BUILTIN_CODE_GENERATORS, CodeGeneratorRegistry } from 'svg-engine/io';
import { SvgeCodeGeneratorDialogService } from './code-generator-dialog.service';

/**
 * **`codeGeneratorsPlugin`** — D-110 (Code Generators, Group A).
 *
 * A single managed plugin that does two things:
 *
 * 1. **Registers the built-in code generators** (React JSX / React Component /
 *    Data URI) into the {@link CodeGeneratorRegistry} via
 *    `ctx.track(registry.register(...))` — the same disposable-tracking
 *    contribution pattern as importers/exporters/optimizers.
 * 2. **Adds `File ▸ Generate Code…`** which opens
 *    `<svge-code-generator-dialog>` (a preview-and-copy surface, *not* the
 *    asset-export panel — the user-chosen model for textual outputs).
 *
 * **Why one plugin** (not split io-side + ui-side): the generators are pure
 * (`svg-engine/io`) and a headless consumer can register them directly, but
 * the *feature* the user asked for — preview before export — is inherently a
 * UI surface (Material dialog, D-017), so the plugin lives here and bundles
 * both halves. It surfaces in **Tools ▸ Plugins ▸ Manage Plugins** like every
 * other built-in (provisioned via `provideSvgeUiBuiltins()` with
 * `withPluginMeta`).
 *
 * **Mechanism, not policy**: a consumer that wants different formats plugs in
 * their own `CodeGenerator`s (or omits this plugin and registers the bare
 * generators from `svg-engine/io`).
 */
export const codeGeneratorsPlugin: EditorPlugin = {
  id: 'svge.builtin.ui.code-generators',
  name: 'Code Generators (React JSX / Component / Data URI) (D-110)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    // ── 1. Register the Group-A generators ───────────────────────────
    const generators = ctx.injector.get(CodeGeneratorRegistry);
    for (const gen of BUILTIN_CODE_GENERATORS) {
      ctx.track(generators.register(gen));
    }

    // ── 2. File ▸ Generate Code… ─────────────────────────────────────
    const reg = ctx.injector.get(MenuContributionRegistry);
    const fromCtx = <T>(token: ProviderToken<T>, runCtx?: MenuContributionContext): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    // Order 55 sits between View Source… (50) and Optimize… (60) — code
    // output reads as a natural sibling of "view the source".
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.file.generate-code',
        slot: MENU_SLOT.FILE,
        label: 'Generate Code…',
        icon: 'code_blocks',
        order: 55,
        run(runCtx) {
          const service = fromCtx(SvgeCodeGeneratorDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );
  },
};
