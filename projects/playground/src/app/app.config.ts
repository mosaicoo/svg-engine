import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideSvgEngineEditorBuiltins, provideSvgEnginePlugin } from 'svg-engine/edit';
import { provideSvgeUiBuiltins } from 'svg-engine/ui';
import { builtinNluPlugin } from 'svg-engine/ai/nlu';
import { provideWhisperVoiceEngine } from 'svg-engine/ai/nlu-voice-wasm';

import { stampToolPlugin } from './plugins/stamp-tool.plugin';
import { routes } from './app.routes';

/**
 * **Playground bootstrap providers** — por tiers (REFACTOR-1):
 *
 * - `provideSvgEngineEditorBuiltins()` (`svg-engine/edit`) — conjunto
 *   built-in headless completo (tools + libraries + io/optimize/effects +
 *   teclado + menus), na ordem correta. Substitui as ~24 chamadas
 *   manuais que existiam aqui.
 * - `provideSvgeUiBuiltins()` (`svg-engine/ui`) — tier Material
 *   (tool-options + menus que abrem diálogos).
 * - **AI (separada)** — `builtinNluPlugin` + voz Whisper local
 *   (`provideWhisperVoiceEngine()`). Provisionados **depois** dos
 *   builtins (auto-discovery do NLU vê os menus).
 * - **Demo-only** — `stampToolPlugin` (showcase D-038 do
 *   Tool.optionsComponent; não é tool de produção).
 *
 * Os apps (playground/svg-studio) não precisam mais sincronizar a lista
 * de plugins à mão: o conjunto compartilhado vive nos helpers da lib.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Required by MatDialog (workspace-settings + outros). Async variant
    // lazy-loads BrowserAnimationsModule on first use.
    provideAnimationsAsync(),
    provideRouter(routes),

    // ── Editor builtins (tier headless) ───────────────────────────
    ...provideSvgEngineEditorBuiltins(),
    // ── UI builtins (tier Material) ───────────────────────────────
    ...provideSvgeUiBuiltins(),

    // ── AI (tier separado) — NLU + voz Whisper. APÓS os builtins. ──
    // D-046 Fase 1 — NLU rule-based. transformers.js é lazy: o modelo
    // Whisper só baixa na primeira vez que a voz local é acionada.
    provideSvgEnginePlugin(builtinNluPlugin),
    ...provideWhisperVoiceEngine(),

    // ── Demo-only — Stamp tool (D-038 Phase 3 showcase). Press K. ──
    provideSvgEnginePlugin(stampToolPlugin),
  ],
};
