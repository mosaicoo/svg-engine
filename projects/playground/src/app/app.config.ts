import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
  providePluginLoader,
  provideSvgEngineEditorBuiltins,
  provideSvgEnginePlugin,
} from 'svg-engine/edit';
import { provideSvgeUiBuiltins } from 'svg-engine/ui';
import { builtinNluPlugin, provideOllamaChat } from 'svg-engine/ai/nlu';
import { provideWhisperVoiceEngine } from 'svg-engine/ai/nlu-voice-wasm';

/**
 * **D-093** — endereço do servidor Ollama local (DEV). Troque para o seu
 * (ou `http://localhost:11434` se rodar na mesma máquina). Requer
 * `OLLAMA_ORIGINS` liberado no servidor para o fetch do browser passar.
 */
const OLLAMA_BASE_URL = 'http://192.168.1.21:11434';
const OLLAMA_MODEL = 'qwen2.5:3b';

import { LOADER_DEMO_ORIGIN, loaderDemoModuleLoader } from './pages/plugins/loader-demo';
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
    // ── D-093 — LLM fallback (Ollama local) ───────────────────────
    // Liga o "fallback inteligente" no <svge-nlu-input>: quando o NLU
    // rule-based não reconhece o pedido, ele escala para o LLM, que
    // devolve um plano de comandos já registrados. Opt-in: sem este
    // provider, o NLU segue só rule-based (zero rede).
    ...provideOllamaChat({ baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL }),

    // ── Demo-only — Stamp tool (D-038 Phase 3 showcase). Press K. ──
    provideSvgEnginePlugin(stampToolPlugin),

    // ── D-083 Fase 2 — loader de plugins externos (demo, sem rede) ──
    // O consumer configura as origens confiáveis E o moduleLoader (aqui
    // um mapa em memória que simula um CDN). Em produção seria
    // `moduleLoader: (m) => import(m.entry)`.
    providePluginLoader({
      trustedOrigins: [LOADER_DEMO_ORIGIN],
      moduleLoader: loaderDemoModuleLoader,
    }),
  ],
};
