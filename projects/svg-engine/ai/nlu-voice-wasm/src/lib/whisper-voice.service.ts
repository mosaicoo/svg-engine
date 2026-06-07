import { Injectable, signal, type Signal } from '@angular/core';
import { injectWhisperVoiceConfig, type WhisperVoiceConfig } from './whisper-voice.config';

/**
 * **`WhisperVoiceService`** — reconhecimento de voz **100% local** via
 * Whisper (transformers.js + onnxruntime-web WASM). Implementa o MESMO
 * contrato público do `VoiceRecognitionService` (Web Speech) de
 * `svg-engine/ai/nlu-ui` — `isSupported` / `listening` / `lastError` /
 * `listen()` / `stop()` — para ser intercambiável pelo orquestrador.
 *
 * **Offline-first (garantia arquitetural)**: configura o transformers.js
 * com `allowRemoteModels = false` + `localModelPath`/`wasmPaths`
 * apontando para assets servidos pela **própria origem** (modelo
 * vendorado no submódulo + `.wasm` copiados do npm). Nenhuma requisição
 * sai para `huggingface.co` (verificável na aba Rede do DevTools).
 *
 * **Fluxo**: `getUserMedia` → `MediaRecorder` (grava até `stop()` ou
 * `maxRecordMs`) → decode + downmix mono + reamostragem 16 kHz
 * (`OfflineAudioContext`) → `pipeline('automatic-speech-recognition')`
 * → transcrição.
 *
 * **v1 — main-thread**: a inferência roda na thread principal (simples e
 * portável entre bundlers). Para comandos curtos é aceitável; mover para
 * Web Worker é um follow-up de performance.
 *
 * **Multilíngue**: Whisper base cobre PT-BR / ES / EN (e mais). O idioma
 * é mapeado de BCP-47 para o nome que o Whisper espera.
 */

/** Forma mínima do pipeline ASR do transformers.js que consumimos. */
type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text?: string } | { text?: string }[]>;

/** BCP-47 → nome de idioma do Whisper (subset suportado oficialmente). */
const WHISPER_LANG: Readonly<Record<string, string>> = {
  pt: 'portuguese',
  es: 'spanish',
  en: 'english',
};

function toWhisperLanguage(bcp47: string, fallback: string): string {
  const lower = bcp47.toLowerCase();
  const primary = lower.split('-')[0] ?? lower;
  return WHISPER_LANG[lower] ?? WHISPER_LANG[primary] ?? WHISPER_LANG[fallback] ?? 'portuguese';
}

@Injectable({ providedIn: 'root' })
export class WhisperVoiceService {
  private readonly config: WhisperVoiceConfig = injectWhisperVoiceConfig();

  /** `false` quando o ambiente não tem mic/WebAssembly (UI esconde o botão). */
  readonly isSupported: Signal<boolean> = signal(detectSupport()).asReadonly();

  private readonly _listening = signal(false);
  /** `true` enquanto está gravando OU transcrevendo. */
  readonly listening: Signal<boolean> = this._listening.asReadonly();

  private readonly _modelLoading = signal(false);
  /** `true` durante o (primeiro) carregamento do modelo do disco. */
  readonly modelLoading: Signal<boolean> = this._modelLoading.asReadonly();

  private readonly _lastError = signal<string | null>(null);
  /** Último erro (`'not-allowed'`, `'audio-capture'`, `'load-failed'`, …). */
  readonly lastError: Signal<string | null> = this._lastError.asReadonly();

  /** Pipeline ASR carregado uma vez e reutilizado entre capturas. */
  private transcriber: AsrPipeline | null = null;
  /** Recorder/stream da captura ativa (para `stop()`). */
  private activeRecorder: MediaRecorder | null = null;
  private activeStream: MediaStream | null = null;

  /**
   * Inicia a captura e resolve com a transcrição final. Grava até
   * `stop()` ser chamado OU `maxRecordMs` expirar, então transcreve.
   *
   * @param lang BCP-47 (default `config.defaultLanguage`)
   * @param options.timeoutMs duração máxima de captura (default
   *   `config.maxRecordMs`)
   */
  listen(lang?: string, options: { readonly timeoutMs?: number } = {}): Promise<string> {
    const language = toWhisperLanguage(
      lang ?? this.config.defaultLanguage,
      this.config.defaultLanguage,
    );
    const maxMs = options.timeoutMs ?? this.config.maxRecordMs;
    this._lastError.set(null);

    return new Promise<string>((resolve, reject) => {
      if (!this.isSupported()) {
        this._lastError.set('not-supported');
        reject(new Error('WhisperVoiceService: getUserMedia/WebAssembly not available'));
        return;
      }

      let settled = false;
      let autoStop: ReturnType<typeof setTimeout> | null = null;
      const chunks: Blob[] = [];

      const cleanup = (): void => {
        if (autoStop !== null) clearTimeout(autoStop);
        if (this.activeStream !== null) {
          for (const track of this.activeStream.getTracks()) track.stop();
        }
        this.activeRecorder = null;
        this.activeStream = null;
        this._listening.set(false);
      };

      const fail = (code: string, err: unknown): void => {
        if (settled) return;
        settled = true;
        this._lastError.set(code);
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (settled) {
            for (const t of stream.getTracks()) t.stop();
            return;
          }
          this.activeStream = stream;
          const recorder = new MediaRecorder(stream);
          this.activeRecorder = recorder;

          recorder.ondataavailable = (e: BlobEvent): void => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          recorder.onerror = (): void => fail('audio-capture', new Error('MediaRecorder error'));
          recorder.onstop = (): void => {
            if (settled) return;
            // Transição gravando → transcrevendo (mantém `listening`).
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            this.transcribe(blob, language)
              .then((text) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(text);
              })
              .catch((err: unknown) => fail('transcribe-failed', err));
          };

          recorder.start();
          this._listening.set(true);
          if (maxMs > 0) {
            autoStop = setTimeout(() => {
              if (recorder.state !== 'inactive') recorder.stop();
            }, maxMs);
          }
        })
        .catch((err: unknown) => {
          // getUserMedia rejeita com NotAllowedError / NotFoundError etc.
          const name = err instanceof DOMException ? err.name : '';
          const code = name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture';
          fail(code, err);
        });
    });
  }

  /** Encerra a captura ativa (dispara a transcrição do que foi gravado). */
  stop(): void {
    const rec = this.activeRecorder;
    if (rec !== null && rec.state !== 'inactive') {
      rec.stop();
    }
  }

  // ── Internals ────────────────────────────────────────────────────

  /** Decodifica + downmix mono + reamostra para 16 kHz e roda o ASR. */
  private async transcribe(blob: Blob, language: string): Promise<string> {
    const audio = await decodeToMono16k(blob);
    const asr = await this.ensurePipeline();
    const out = await asr(audio, {
      language,
      task: 'transcribe',
      chunk_length_s: 30,
      return_timestamps: false,
    });
    const text = Array.isArray(out) ? (out[0]?.text ?? '') : (out.text ?? '');
    return text.trim();
  }

  /**
   * Carrega (uma vez) o pipeline ASR a partir dos assets locais. Lazy
   * `import()` do transformers.js — só puxa a lib quando a voz Whisper é
   * realmente usada. Configura o env para **não** acessar a rede externa.
   */
  private async ensurePipeline(): Promise<AsrPipeline> {
    if (this.transcriber !== null) return this.transcriber;
    this._modelLoading.set(true);
    try {
      const { env, pipeline } = await import('@huggingface/transformers');
      // Offline: nunca buscar modelos remotos; ler só do caminho local.
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = this.config.modelBasePath;
      const wasm = env.backends?.onnx?.wasm;
      if (wasm !== undefined) {
        wasm.wasmPaths = this.config.wasmBasePath;
        wasm.numThreads = this.config.numThreads;
      }
      const asr = (await pipeline('automatic-speech-recognition', this.config.modelId, {
        dtype: this.config.dtype,
        device: 'wasm',
      })) as unknown as AsrPipeline;
      this.transcriber = asr;
      return asr;
    } catch (err) {
      this._lastError.set('load-failed');
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      this._modelLoading.set(false);
    }
  }
}

// ── Helpers puros (testáveis) ──────────────────────────────────────

/** Capacidade do ambiente: microfone (getUserMedia) + WebAssembly. */
function detectSupport(): boolean {
  if (typeof navigator === 'undefined' || typeof WebAssembly === 'undefined') return false;
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/**
 * Decodifica um `Blob` de áudio (webm/opus, mp4, …) para `Float32Array`
 * **mono a 16 kHz** — o formato que o Whisper espera. Usa
 * `decodeAudioData` (lida com qualquer container/codec do MediaRecorder)
 * e `OfflineAudioContext` para o downmix mono + reamostragem.
 */
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const TARGET_RATE = 16000;
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor = resolveAudioContext();
  if (Ctor === null) throw new Error('AudioContext unavailable');
  const ac = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await ac.decodeAudioData(arrayBuffer);
  } finally {
    void ac.close();
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination); // downmix p/ mono automático
  src.start(0);
  const rendered = await offline.startRendering();
  // Cópia (o getChannelData é uma view do buffer interno).
  return rendered.getChannelData(0).slice();
}

/** Resolve `AudioContext` (com fallback `webkitAudioContext`). */
function resolveAudioContext(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}
