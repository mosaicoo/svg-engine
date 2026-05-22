import { Injectable, signal, type Signal } from '@angular/core';

/**
 * **`VoiceRecognitionService`** — D-046 Fase 1 UI.
 *
 * Wrapper sobre a **Web Speech API** (`SpeechRecognition`), browser-
 * native e gratuita. Detecta suporte, gerencia ciclo
 * `start`/`stop`/`abort` e expõe estado via signals para os
 * componentes consumidores (`<svge-nlu-input>`).
 *
 * **Por que Web Speech API e não vendor cloud STT**:
 * - **Privacy-first** (alinhado com D-046): nada sai do browser na
 *   maioria dos casos (Chrome usa cloud Google, Edge usa Windows,
 *   Safari usa Apple — mas é decisão do browser, não nossa).
 * - **Gratuita**: zero API key, zero billing.
 * - **Nativa**: parte do browser desde 2013 (Chrome/Edge/Safari);
 *   Firefox parcial.
 *
 * **Suporte**: o `isSupported()` signal pode ser checado pelas UIs
 * para desabilitar o botão de voz quando indisponível (Firefox sem
 * `webkitSpeechRecognition`, browsers velhos).
 *
 * **Idioma**: configurável via `lang` (default `pt-BR`). Componentes
 * podem expor um seletor pra alternar entre PT/EN/etc.
 *
 * **Limites**:
 * - `interimResults: false` (default) — só evento final, mais
 *   determinístico pro NLU parse.
 * - `continuous: false` — uma frase por vez (start → resultado →
 *   stop). UIs que querem "always-listening" reiniciam o serviço.
 *
 * **Headless**: serviço puro, sem dependência de Material. Pode ser
 * consumido por qualquer UI (Material, custom, headless API).
 */

/**
 * Tipo mínimo da Web Speech API que usamos. Evitamos depender de
 * `@types/dom-speech-recognition` (não está no projeto) e do
 * `lib.dom.d.ts` que só expõe `SpeechRecognition` em alguns engines.
 *
 * **Estrutural**: cobre só o subset que `start()/stop()/abort()` +
 * handler `onresult` precisam.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<
    ArrayLike<{ readonly transcript: string; readonly confidence: number }>
  >;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/**
 * Localiza a construção `SpeechRecognition` em `window`. Tenta o nome
 * standard primeiro, depois o prefixed `webkitSpeechRecognition` (que
 * Chrome ainda mantém).
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

@Injectable({ providedIn: 'root' })
export class VoiceRecognitionService {
  /** Quando `false`, a UI deve esconder/desabilitar o botão de voz. */
  readonly isSupported: Signal<boolean> = signal(getSpeechRecognition() !== null).asReadonly();

  private readonly _listening = signal(false);
  /** `true` enquanto o microfone está capturando. */
  readonly listening: Signal<boolean> = this._listening.asReadonly();

  private readonly _lastError = signal<string | null>(null);
  /**
   * Último erro do recognizer (`'no-speech'`, `'aborted'`,
   * `'not-allowed'`, etc.). Reseta no próximo `start()`.
   */
  readonly lastError: Signal<string | null> = this._lastError.asReadonly();

  private activeRec: SpeechRecognitionLike | null = null;

  /**
   * Inicia a captura. Resolve com a transcrição final quando o
   * recognizer terminar. Rejeita em erro ou se chamado sem suporte.
   *
   * @param lang BCP-47 language tag (default `pt-BR`)
   */
  listen(lang = 'pt-BR'): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const Ctor = getSpeechRecognition();
      if (Ctor === null) {
        reject(new Error('Web Speech API not supported in this browser'));
        return;
      }
      // Se já tem captura ativa, aborta a anterior antes de começar
      // a nova — UI consistente (uma sessão por vez).
      if (this.activeRec !== null) {
        try {
          this.activeRec.abort();
        } catch {
          /* ignore */
        }
        this.activeRec = null;
      }
      const rec: SpeechRecognitionLike = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      this._lastError.set(null);
      this.activeRec = rec;

      let resolved = false;

      rec.onstart = (): void => {
        this._listening.set(true);
      };
      rec.onresult = (event): void => {
        const first = event.results[0]?.[0];
        if (first && typeof first.transcript === 'string') {
          resolved = true;
          resolve(first.transcript);
        }
      };
      rec.onerror = (event): void => {
        this._lastError.set(event.error ?? 'unknown');
        if (!resolved) {
          resolved = true;
          reject(new Error(`SpeechRecognition error: ${event.error}`));
        }
      };
      rec.onend = (): void => {
        this._listening.set(false);
        if (this.activeRec === rec) this.activeRec = null;
        if (!resolved) {
          // Terminou sem `onresult` (sem fala detectada) — resolve com vazio.
          resolved = true;
          resolve('');
        }
      };

      try {
        rec.start();
      } catch (err) {
        // Chrome throws DOMException quando .start() é chamado 2× em
        // sequência sem stop. Reset state e propaga.
        this.activeRec = null;
        this._listening.set(false);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Aborta a captura ativa, se houver. */
  stop(): void {
    if (this.activeRec === null) return;
    try {
      this.activeRec.abort();
    } catch {
      /* ignore */
    }
    this.activeRec = null;
    this._listening.set(false);
  }
}
