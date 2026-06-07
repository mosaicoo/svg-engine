import { InjectionToken, type Signal } from '@angular/core';

/**
 * **Contrato de voz desacoplado** — D-046 voz híbrida.
 *
 * Define a abstração `VoiceProvider` num lugar **headless** (sem
 * Material, sem transformers.js) para que tanto a camada de UI
 * (`svg-engine/ai/nlu-ui`, provider Web Speech) quanto a camada WASM
 * (`svg-engine/ai/nlu-voice-wasm`, provider Whisper local) possam
 * compartilhar o mesmo contrato **sem dependência cruzada** entre elas.
 *
 * O orquestrador (`VoiceEngineService`, em `nlu-ui`) injeta o provider
 * Web Speech diretamente e o provider Whisper **opcionalmente** via
 * {@link VOICE_WHISPER_PROVIDER} — registrado pelo app só quando a voz
 * local é desejada (`provideWhisperVoiceEngine()`).
 */

/**
 * Engine de reconhecimento de voz escolhível pelo usuário:
 * - `'web-speech'` — Web Speech API nativa do navegador (rápida, mas
 *   depende de STT em nuvem do vendor — pode falhar com `network`).
 * - `'whisper'` — Whisper local via WASM (100% offline, sem rede).
 * - `'auto'` — tenta Web Speech e, em falha, cai para o Whisper.
 */
export type VoiceEngine = 'web-speech' | 'whisper' | 'auto';

/**
 * Surface mínima comum de um provider de reconhecimento de voz.
 * Tanto `VoiceRecognitionService` (Web Speech) quanto
 * `WhisperVoiceService` (WASM) a satisfazem **estruturalmente** — não
 * é preciso `implements` nominal.
 */
export interface VoiceProvider {
  /** `false` quando o ambiente não suporta esta engine. */
  readonly isSupported: Signal<boolean>;
  /** `true` enquanto captura/processa. */
  readonly listening: Signal<boolean>;
  /** Último código de erro (`'network'`, `'not-allowed'`, …) ou `null`. */
  readonly lastError: Signal<string | null>;
  /** `true` durante carregamento de modelo (só engines com modelo, ex. Whisper). */
  readonly modelLoading?: Signal<boolean>;
  /** Inicia a captura; resolve com a transcrição final. */
  listen(lang?: string, options?: { readonly timeoutMs?: number }): Promise<string>;
  /** Encerra a captura ativa, se houver. */
  stop(): void;
}

/**
 * Token DI **opcional** do provider Whisper local. Default `null`
 * (voz local não instalada). Apps que querem o Whisper offline
 * registram via `provideWhisperVoiceEngine()` de
 * `svg-engine/ai/nlu-voice-wasm`.
 */
export const VOICE_WHISPER_PROVIDER = new InjectionToken<VoiceProvider | null>(
  'VOICE_WHISPER_PROVIDER',
  { providedIn: 'root', factory: () => null },
);
