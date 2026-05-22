/*
 * Public API surface of `svg-engine/nlu-ui` — D-046 Fase 1 UI surface.
 *
 * Material + Web Speech API components to interact with the NLU
 * (`svg-engine/nlu`): text input + voice button + autocomplete +
 * results list with confidence visualization.
 *
 * **Opt-in pesado**: este entry point depende de `@angular/material`
 * e `@angular/cdk`. Consumers em Modo 1 headless (D-037) **não**
 * precisam instalar — usam `NaturalLanguageService.parse()` direto
 * e constroem sua própria UI.
 *
 * **Surface**:
 * - {@link SvgeNluInput} — `<svge-nlu-input>` componente standalone
 *   com input texto + voice button + autocomplete de intents.
 * - {@link VoiceRecognitionService} — wrapper Web Speech API com
 *   detection de support, recording state via signals.
 *
 * **Roadmap**: quando Fase 2 / 3 chegarem, nlu-ui ganha entry points
 * paralelos (`svg-engine/nlu-ui-ml`, `svg-engine/nlu-ui-slm`) ou
 * componentes adicionais aqui mesmo (decisão por sprint).
 */

export * from './lib';
