/*
 * Public API surface of `svg-engine/ai/nlu-voice-wasm` — reconhecimento
 * de voz **100% local/offline** via Whisper (transformers.js +
 * onnxruntime-web WASM).
 *
 * **Opt-in pesado**: este entry point depende de
 * `@huggingface/transformers` e `onnxruntime-web` (lazy `import()` — só
 * carregados quando a voz Whisper é realmente acionada). Consumers que
 * usam só a voz nativa (Web Speech) **não** precisam instalar estas
 * dependências.
 *
 * **Pré-requisitos de assets** (servidos pela própria origem, sem rede
 * externa em runtime):
 * - Modelo em `${modelBasePath}/${modelId}/` (default
 *   `/assets/ml/whisper/whisper-base/`) — vem do submódulo
 *   `assets/ml/whisper` (repo `svgengine-ml-assets`).
 * - Binários `.wasm` do onnxruntime em `wasmBasePath` (default
 *   `/assets/ml/ort/`) — copiados do pacote npm `onnxruntime-web` via
 *   `angular.json`.
 *
 * **Surface**:
 * - {@link WhisperVoiceService} — provider com o mesmo contrato do
 *   `VoiceRecognitionService` (Web Speech) de `svg-engine/ai/nlu-ui`.
 * - {@link provideWhisperVoice} / {@link WHISPER_VOICE_CONFIG} —
 *   configuração dos caminhos de assets, dtype, idioma padrão, etc.
 */

export * from './lib';
