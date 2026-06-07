import { computed, inject, Injectable, signal, type Signal } from '@angular/core';
import { type VoiceEngine, type VoiceProvider, VOICE_WHISPER_PROVIDER } from 'svg-engine/ai/nlu';
import { VoiceRecognitionService } from './voice-recognition.service';
import { readVoicePref, writeVoicePref } from './voice-prefs';

/**
 * **`VoiceEngineService`** — orquestrador de voz com engine
 * **selecionável pelo usuário** (D-046 voz híbrida).
 *
 * Expõe a MESMA surface de um {@link VoiceProvider}
 * (`isSupported`/`listening`/`lastError`/`listen`/`stop`) para o
 * `<svge-nlu-input>` consumir de forma transparente, mas internamente
 * delega para:
 * - **Web Speech** ({@link VoiceRecognitionService}) — sempre presente.
 * - **Whisper local** (via {@link VOICE_WHISPER_PROVIDER}) — opcional,
 *   só quando o app chamou `provideWhisperVoiceEngine()`.
 *
 * **Modos** ({@link VoiceEngine}):
 * - `'web-speech'`: usa só a Web Speech API.
 * - `'whisper'`: usa só o Whisper local (offline).
 * - `'auto'`: tenta Web Speech e, em **falha** (ex.: `network`),
 *   cai automaticamente para o Whisper. Só fica disponível quando as
 *   duas engines existem.
 *
 * O `lastError` é **próprio** do orquestrador (não espelha os providers
 * diretamente): zera no início de cada `listen()` e só é setado quando
 * a tentativa realmente falha — assim um erro `network` do Web Speech
 * não fica "preso" na UI após um fallback Whisper bem-sucedido.
 */
@Injectable({ providedIn: 'root' })
export class VoiceEngineService {
  private readonly webSpeech = inject(VoiceRecognitionService);
  /** Provider Whisper, se o app registrou; senão `null`. */
  private readonly whisper = inject<VoiceProvider | null>(VOICE_WHISPER_PROVIDER, {
    optional: true,
  });

  private readonly _engine = signal<VoiceEngine>('web-speech');
  /** Engine atualmente selecionada. */
  readonly engine: Signal<VoiceEngine> = this._engine.asReadonly();

  /** `true` se a voz local (Whisper) está registrada. */
  readonly whisperAvailable = computed<boolean>(() => this.whisper !== null);

  /**
   * Engines disponíveis (suportadas no ambiente atual). `'auto'` só
   * aparece quando as duas engines básicas existem. A UI mostra o
   * seletor apenas quando há mais de uma opção.
   */
  readonly availableEngines = computed<readonly VoiceEngine[]>(() => {
    const list: VoiceEngine[] = [];
    if (this.webSpeech.isSupported()) list.push('web-speech');
    const w = this.whisper;
    if (w !== null && w.isSupported()) list.push('whisper');
    if (list.length > 1) list.push('auto');
    return list;
  });

  /** `false` quando nenhuma engine está disponível (UI esconde o mic). */
  readonly isSupported = computed<boolean>(() => this.availableEngines().length > 0);

  /** `true` enquanto qualquer provider está capturando/processando. */
  readonly listening = computed<boolean>(
    () => this.webSpeech.listening() || (this.whisper?.listening() ?? false),
  );

  /** `true` durante o carregamento do modelo Whisper (primeira vez). */
  readonly modelLoading = computed<boolean>(() => this.whisper?.modelLoading?.() ?? false);

  private readonly _lastError = signal<string | null>(null);
  /** Último erro do orquestrador (limpo a cada `listen` bem-sucedido). */
  readonly lastError: Signal<string | null> = this._lastError.asReadonly();

  constructor() {
    // 1) Restaura a escolha persistida (se ainda disponível no ambiente).
    const saved = readVoicePref('engine');
    if (saved !== null && this.availableEngines().includes(saved as VoiceEngine)) {
      this._engine.set(saved as VoiceEngine);
      return;
    }
    // 2) Sem preferência salva: cross-browser por padrão — quando a voz
    // local (Whisper) existe, 'auto' tenta a Web Speech (precisa em
    // Chrome/Safari) e cai pro Whisper local quando a nuvem falha
    // (Edge/Brave/Firefox costumam dar erro 'network').
    if (this.whisper !== null) {
      this._engine.set('auto');
    }
  }

  /** Troca a engine ativa. Ignora valores não disponíveis no ambiente. */
  setEngine(engine: VoiceEngine): void {
    if (this.availableEngines().includes(engine)) {
      this._engine.set(engine);
      writeVoicePref('engine', engine);
    }
  }

  /**
   * Inicia a captura na engine selecionada e resolve com a transcrição.
   * Em `'auto'`, tenta Web Speech e cai para o Whisper se falhar.
   */
  async listen(lang?: string, options: { readonly timeoutMs?: number } = {}): Promise<string> {
    this._lastError.set(null);
    const engine = this._engine();
    const w = this.whisper;

    // Whisper explícito (ou Web Speech indisponível e Whisper presente).
    if (engine === 'whisper' && w !== null) {
      return this.runProvider(w, lang, options);
    }
    // Web Speech explícito, OU sem Whisper registrado.
    if (engine === 'web-speech' || w === null) {
      return this.runProvider(this.webSpeech, lang, options);
    }
    // auto: Web Speech primeiro; fallback Whisper em falha.
    try {
      return await this.webSpeech.listen(lang, options);
    } catch (primaryErr) {
      if (w.isSupported()) {
        try {
          return await w.listen(lang, options);
        } catch {
          this._lastError.set(w.lastError() ?? 'unknown');
          throw primaryErr;
        }
      }
      this._lastError.set(this.webSpeech.lastError() ?? 'unknown');
      throw primaryErr;
    }
  }

  /** Encerra a captura ativa em ambos os providers (seguro se inativos). */
  stop(): void {
    this.webSpeech.stop();
    this.whisper?.stop();
  }

  /** Executa um provider único, propagando o erro para `_lastError`. */
  private async runProvider(
    provider: VoiceProvider,
    lang: string | undefined,
    options: { readonly timeoutMs?: number },
  ): Promise<string> {
    try {
      return await provider.listen(lang, options);
    } catch (err) {
      this._lastError.set(provider.lastError() ?? 'unknown');
      throw err;
    }
  }
}
