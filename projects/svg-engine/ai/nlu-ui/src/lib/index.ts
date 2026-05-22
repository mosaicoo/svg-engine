/**
 * **NLU UI (Material + Web Speech) — D-046 Fase 1 surface.**
 *
 * Wrappers Material para interagir com `NaturalLanguageService`:
 *
 * - {@link SvgeNluInput} `<svge-nlu-input>` — text + voice + alternatives
 * - {@link VoiceRecognitionService} — wrapper Web Speech API
 *
 * Importação:
 * ```ts
 * import { SvgeNluInput, VoiceRecognitionService } from 'svg-engine/ai/nlu-ui';
 * ```
 */

export { SvgeNluInput } from './nlu-input.component';
export { VoiceRecognitionService } from './voice-recognition.service';
