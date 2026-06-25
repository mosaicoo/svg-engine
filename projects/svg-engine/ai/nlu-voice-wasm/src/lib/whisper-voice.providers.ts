import { type Provider } from '@angular/core';
import { VOICE_WHISPER_PROVIDER } from '@mosaicoo/svg-engine/ai/nlu';
import { provideWhisperVoice, type WhisperVoiceConfig } from './whisper-voice.config';
import { WhisperVoiceService } from './whisper-voice.service';

/**
 * **Bootstrap da voz local (Whisper) como engine selecionável.**
 *
 * Registra o {@link WhisperVoiceService} no token opcional
 * `VOICE_WHISPER_PROVIDER` (de `svg-engine/ai/nlu`), tornando-o
 * disponível para o `VoiceEngineService` (orquestrador em `nlu-ui`).
 * A partir daí o usuário pode escolher a engine `'whisper'` ou
 * `'auto'` no `<svge-nlu-input>`.
 *
 * Aceita um patch opcional de {@link WhisperVoiceConfig} (caminhos de
 * assets, dtype, idioma padrão). Sem o patch, usa os defaults
 * (`/assets/ml/whisper`, `/assets/ml/ort/`, `whisper-base`, `q8`).
 *
 * ```ts
 * // app.config.ts
 * providers: [
 *   ...provideWhisperVoiceEngine(),
 *   // ou com caminhos custom:
 *   ...provideWhisperVoiceEngine({ modelBasePath: '/cdn/whisper' }),
 * ]
 * ```
 *
 * **Pré-requisito**: os assets do modelo + `.wasm` do onnxruntime
 * precisam estar servidos pela origem do app (ver `angular.json`).
 */
export function provideWhisperVoiceEngine(config: Partial<WhisperVoiceConfig> = {}): Provider[] {
  return [
    provideWhisperVoice(config),
    // useExisting: o WhisperVoiceService satisfaz VoiceProvider estruturalmente.
    { provide: VOICE_WHISPER_PROVIDER, useExisting: WhisperVoiceService },
  ];
}
