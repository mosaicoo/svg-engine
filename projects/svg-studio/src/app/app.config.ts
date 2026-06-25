import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  providePluginLoader,
  provideSvgEngineEditorBuiltins,
  provideSvgEnginePlugin,
  provideSvgeHelpLinks,
} from '@mosaicoo/svg-engine/edit';
import { provideSvgeUiBuiltins } from '@mosaicoo/svg-engine/ui';
import { builtinNluPlugin, provideOllamaChat } from '@mosaicoo/svg-engine/ai/nlu';

import { environment } from '../environments/environment';
import { commandPalettePlugin } from './command-palette/command-palette.plugin';
import {
  mosaicooLoaderDemoPlugin,
  mosaicooModuleLoader,
  STUDIO_PLUGINS_ORIGIN,
} from './plugins/mosaicoo-loader-demo';
import { routes } from './app.routes';

/**
 * **SVG Studio bootstrap providers** — por tiers (REFACTOR-1):
 *
 * - `provideSvgEngineEditorBuiltins()` (tier **editor headless**, em
 *   `svg-engine/edit`) — tools + libraries + io/optimize/effects +
 *   teclado + menus, na ordem correta (select primeiro; menus antes do
 *   NLU). Substitui as ~24 chamadas manuais de `provideSvgEnginePlugin`.
 * - `provideSvgeUiBuiltins()` (tier **Material**, em `svg-engine/ui`) —
 *   tool-options + itens de menu que abrem diálogos.
 * - **AI (separada)**: `builtinNluPlugin` + o `commandPalettePlugin`
 *   local. Provisionados **depois** dos builtins para que o auto-discovery
 *   do NLU enxergue as contribuições de menu (edit-side e ui-side).
 *
 * **Divergência intencional vs. playground**: o Studio não traz o
 * `stamp-tool` (showcase) nem a voz Whisper; traz o Command Palette.
 * A lista compartilhada agora vive nos helpers da lib, então os dois
 * apps não precisam mais ser sincronizados à mão.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Required by MatDialog (workspace-settings, find-replace, svg-source,
    // trace-image, smart-object-editor, command-palette). Async variant
    // lazy-loads BrowserAnimationsModule on first use.
    provideAnimationsAsync(),
    provideRouter(routes),

    // ── D-096 — Help link destinations from the app environment ────
    // Repoints the host-dependent links (here: the About dialog's homepage)
    // without touching the library. The docs links keep the lib defaults
    // (relative /docs/… → resolve against this app's own origin).
    provideSvgeHelpLinks({ homepage: environment.homepageUrl }),

    // ── Editor builtins (tier headless) ───────────────────────────
    ...provideSvgEngineEditorBuiltins(),
    // ── UI builtins (tier Material) ───────────────────────────────
    ...provideSvgeUiBuiltins(),

    // ── AI (tier separado) — NLU. APÓS os builtins (auto-discovery). ─
    provideSvgEnginePlugin(builtinNluPlugin),
    // ── D-093 — Provider LLM (Ollama) que ATIVA a camada de IA do
    // Command Palette: o <svge-nlu-input> ganha o fallback inteligente
    // (composições "card de KPI…", escalonamento de pedidos vagos e o
    // botão "Pedir à IA"). Opt-in por ambiente: registrado só quando
    // `environment.aiChat` existe (dev). Em prod (`null`) o NLU segue
    // 100% rule-based, sem rede. É um provider DI normal (não plugin),
    // então a ordem não importa para a resolução.
    ...(environment.aiChat ? provideOllamaChat(environment.aiChat) : []),
    // Command Palette (Ctrl+K + botão "Assistente") que hospeda o
    // <svge-nlu-input> num MatDialog escopado ao editor. App-level (não
    // no shell) p/ preservar o desacoplamento ui↛ai.
    provideSvgEnginePlugin(commandPalettePlugin),

    // ── D-083 Fase 2 — loader de plugins externos (origem REAL) ────
    // Mecanismo, não política: o app escolhe as origens confiáveis e o
    // transporte (import() nativo). Origem = o PRÓPRIO domínio do Studio
    // (svgstudio.mosaicoo.tech) → em produção o import() é same-origin
    // (sem CORS). Allowlist é por origem: cobre todas as subpastas em
    // /plugins/. Teste real em File ▸ "Carregar plugin externo (Mosaicoo)…".
    providePluginLoader({
      trustedOrigins: [STUDIO_PLUGINS_ORIGIN],
      moduleLoader: mosaicooModuleLoader,
    }),
    provideSvgEnginePlugin(mosaicooLoaderDemoPlugin),
  ],
};
