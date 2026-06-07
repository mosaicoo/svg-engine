import { inject, InjectionToken, type Provider } from '@angular/core';

/**
 * **D-046 voz local (Whisper WASM)** — configuração do provider de
 * reconhecimento de voz **100% offline** baseado em
 * `@huggingface/transformers` (transformers.js) + onnxruntime-web.
 *
 * Todos os caminhos apontam para assets **servidos pela própria
 * origem** do app (sem CDN / sem `huggingface.co` em runtime). O modelo
 * vem do submódulo `assets/ml/whisper` (repo `svgengine-ml-assets`); os
 * binários `.wasm` do onnxruntime são copiados do pacote npm para os
 * assets do app (ver `angular.json`).
 */
export interface WhisperVoiceConfig {
  /**
   * Base servida onde o transformers.js procura o modelo
   * (`env.localModelPath`). O modelo é resolvido em
   * `${modelBasePath}/${modelId}/...`. Default: `/assets/ml/whisper`.
   */
  readonly modelBasePath: string;

  /**
   * Id/pasta do modelo dentro de `modelBasePath`. Default:
   * `whisper-base`.
   */
  readonly modelId: string;

  /**
   * Base servida com os binários `.wasm` do onnxruntime-web
   * (`env.backends.onnx.wasm.wasmPaths`). Default: `/assets/ml/ort/`.
   */
  readonly wasmBasePath: string;

  /**
   * dtype do modelo ONNX. `'q8'` mapeia para os arquivos
   * `*_quantized.onnx` (que vendoramos: encoder/decoder int8). Mantenha
   * `'q8'` salvo se vendorar outra variante.
   */
  readonly dtype: 'q8' | 'fp32' | 'fp16' | 'int8' | 'uint8' | 'q4' | 'q4f16';

  /**
   * Nº de threads WASM. **1** (default) evita exigir cross-origin
   * isolation (COOP/COEP) — funciona em qualquer hospedagem. Aumente
   * apenas se o app já servir os headers de isolamento.
   */
  readonly numThreads: number;

  /**
   * Nível de otimização de grafo do onnxruntime (`session_options`).
   * **`'disabled'`** (default) evita a passada
   * `TransposeDQWeightsForMatMulNBits` do ORT 1.26, que falha ao carregar
   * o decoder int8 do Whisper base (`Missing required scale` no
   * `embed_tokens` merged/transposto). O modelo carrega e roda normal
   * sem essa fusão — só perde uma otimização de performance irrelevante
   * para comandos curtos. Suba para `'basic'`/`'all'` apenas se vendorar
   * um modelo cuja quantização o ORT consiga fundir.
   */
  readonly graphOptimizationLevel: 'disabled' | 'basic' | 'extended' | 'all';

  /**
   * Idioma BCP-47 padrão quando o chamador não informa. Default
   * `'pt'`. O Whisper base é multilíngue (PT-BR / ES / EN / …).
   */
  readonly defaultLanguage: string;

  /**
   * Duração máxima de captura por sessão (ms) antes de parar
   * automaticamente e transcrever. Funciona como teto de segurança
   * caso o VAD nunca dispare (ruído constante). Default 15000.
   */
  readonly maxRecordMs: number;

  /**
   * **VAD (detecção de silêncio)** — após a fala começar, encerra a
   * captura automaticamente quando o silêncio durar este tempo (ms).
   * Espelha o auto-stop nativo da Web Speech para manter o
   * comportamento consistente entre as engines. Default 2000 (2 s).
   * `0` desliga o VAD (só para via `stop()` ou `maxRecordMs`).
   */
  readonly silenceMs: number;

  /**
   * Limiar de energia (RMS, 0–1 no domínio do tempo) acima do qual o
   * áudio é considerado fala pelo VAD. Default 0.015. Aumente se o
   * ruído de fundo disparar falso-positivo; diminua se a fala não
   * estiver sendo detectada (mic baixo/distante).
   */
  readonly silenceThreshold: number;

  /**
   * **Timeout de "nenhuma fala"** — se o VAD **não** detectar fala
   * dentro deste tempo (ms) após iniciar, encerra a captura mesmo
   * assim. Evita o microfone ficar "preso" ligado quando o áudio fica
   * abaixo do limiar. Default 6000. `0` desliga (só `maxRecordMs`).
   */
  readonly noSpeechTimeoutMs: number;
}

/** Defaults aplicáveis ao layout padrão de assets dos apps SVGEngine. */
export const DEFAULT_WHISPER_VOICE_CONFIG: WhisperVoiceConfig = {
  modelBasePath: '/assets/ml/whisper',
  modelId: 'whisper-base',
  wasmBasePath: '/assets/ml/ort/',
  dtype: 'q8',
  numThreads: 1,
  graphOptimizationLevel: 'disabled',
  defaultLanguage: 'pt',
  maxRecordMs: 15000,
  silenceMs: 2000,
  silenceThreshold: 0.015,
  noSpeechTimeoutMs: 6000,
};

/** Token DI para a configuração do provider Whisper. */
export const WHISPER_VOICE_CONFIG = new InjectionToken<WhisperVoiceConfig>('WHISPER_VOICE_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_WHISPER_VOICE_CONFIG,
});

/**
 * Helper de bootstrap — registra a configuração do provider Whisper.
 * Passe um patch parcial; os campos ausentes usam
 * {@link DEFAULT_WHISPER_VOICE_CONFIG}.
 *
 * ```ts
 * providers: [provideWhisperVoice({ modelBasePath: '/custom/assets/whisper' })]
 * ```
 */
export function provideWhisperVoice(config: Partial<WhisperVoiceConfig> = {}): Provider {
  return {
    provide: WHISPER_VOICE_CONFIG,
    useValue: { ...DEFAULT_WHISPER_VOICE_CONFIG, ...config },
  };
}

/** Acessor interno — resolve a config (com defaults) via DI. */
export function injectWhisperVoiceConfig(): WhisperVoiceConfig {
  return inject(WHISPER_VOICE_CONFIG);
}
