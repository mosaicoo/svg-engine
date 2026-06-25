/**
 * **NLU UI (Material + Web Speech) — D-046 Fase 1 surface.**
 *
 * Wrappers Material para interagir com `NaturalLanguageService`:
 *
 * - {@link SvgeNluInput} `<svge-nlu-input>` — text + voice + alternatives
 * - {@link VoiceRecognitionService} — wrapper Web Speech API
 * - {@link VoiceEngineService} — orquestrador de engine selecionável
 *   (Web Speech / Whisper local / auto)
 *
 * Importação:
 * ```ts
 * import { SvgeNluInput, VoiceEngineService } from '@mosaicoo/svg-engine/ai/nlu-ui';
 * ```
 */

export { SvgeNluInput } from './nlu-input.component';
export { VoiceRecognitionService } from './voice-recognition.service';
export { VoiceEngineService } from './voice-engine.service';
