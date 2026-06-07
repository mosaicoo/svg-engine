import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import {
  detectLanguage,
  type NluCandidate,
  type NluExecuteResult,
  NaturalLanguageService,
  type VoiceEngine,
} from 'svg-engine/ai/nlu';
import { tokenize } from 'svg-engine/ai/nlu';
import { VoiceEngineService } from './voice-engine.service';

/**
 * **`<svge-nlu-input>`** — D-046 Fase 1 UI surface.
 *
 * Input textual + voice button para enviar comandos em linguagem
 * natural ao {@link NaturalLanguageService}. Mostra:
 *
 * - Campo de texto Material outlined + prefix icon (smart_toy)
 * - **Mic button** (Web Speech API) com pulse animation enquanto grava
 * - **Run button** (Enter também dispara)
 * - **Live preview** do top candidate (label + confidence% + bar colorida)
 * - **Status** do último execute (success / rejeição com motivo humano)
 * - **Botão "Confirmar"** quando rejection é destructive ou low-confidence
 *   — usuário aprova explicitamente em vez de ficar travado
 * - **Lista de alternativas** clicável (cada click respeita threshold +
 *   destructive via `nlu.executeCandidate`)
 *
 * **Por que `window.confirm` default e não Material dialog**: zero
 * dependência circular `nlu-ui → ui` (D-017-style isolation entre
 * camadas AI e dialogs Material). Consumer pode override via input
 * `confirmGate` se quiser dialog próprio.
 *
 * **Multi-editor (D-042/D-043)**: passa `{ injector: this.hostInjector }`
 * para `executeCandidate`/`execute` — handlers resolvem services do
 * scope ativo automaticamente.
 *
 * **Acessibilidade**:
 * - Input ARIA-described com hint do top candidate
 * - Mic button: `aria-pressed` reativo
 * - Lista de alternatives: `role="listbox"` + `role="option"` + `aria-selected="false"`
 * - Status com `aria-live="polite"`
 */
@Component({
  selector: 'svge-nlu-input',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormField,
    MatLabel,
    MatPrefix,
    MatSuffix,
    MatIcon,
    MatInput,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltip,
  ],
  template: `
    <div class="svge-nlu-root">
      <mat-form-field appearance="outline" class="svge-nlu-field">
        <mat-label>{{ label() }}</mat-label>
        <mat-icon matPrefix class="svge-nlu-prefix" aria-hidden="true">smart_toy</mat-icon>
        <input
          #textInput
          matInput
          type="text"
          (input)="onInput($any($event.target).value)"
          (keydown.enter)="runNow()"
          [attr.aria-label]="label()"
          [attr.aria-describedby]="topCandidate() ? 'svge-nlu-hint' : null"
          [placeholder]="placeholder()"
        />
        @if (voice.availableEngines().length > 1) {
          <button
            mat-icon-button
            matSuffix
            type="button"
            class="svge-nlu-engine"
            [matMenuTriggerFor]="engineMenu"
            [matTooltip]="'Motor de voz: ' + engineLabel(voice.engine())"
            aria-label="Selecionar motor de voz"
          >
            <mat-icon>{{ engineIcon(voice.engine()) }}</mat-icon>
          </button>
          <mat-menu #engineMenu="matMenu">
            @for (e of voice.availableEngines(); track e) {
              <button mat-menu-item type="button" (click)="voice.setEngine(e)">
                <mat-icon>{{ voice.engine() === e ? 'check' : engineIcon(e) }}</mat-icon>
                <span>{{ engineLabel(e) }}</span>
              </button>
            }
          </mat-menu>
        }
        @if (voice.isSupported()) {
          <button
            mat-icon-button
            matSuffix
            type="button"
            class="svge-nlu-mic"
            [class.recording]="voice.listening()"
            [disabled]="voice.modelLoading()"
            [attr.aria-pressed]="voice.listening()"
            [matTooltip]="micTooltip()"
            (click)="toggleVoice()"
          >
            <mat-icon>{{
              voice.modelLoading() ? 'hourglass_empty' : voice.listening() ? 'mic_off' : 'mic'
            }}</mat-icon>
          </button>
        }
        <button
          mat-icon-button
          matSuffix
          type="button"
          class="svge-nlu-run"
          matTooltip="Run (Enter)"
          [disabled]="text().trim().length === 0"
          (click)="runNow()"
        >
          <mat-icon>send</mat-icon>
        </button>
      </mat-form-field>

      @if (topCandidate(); as top) {
        <div class="svge-nlu-hint" id="svge-nlu-hint" role="status">
          <span class="svge-nlu-hint-label">{{ describeIntent(top) }}</span>
          <span class="svge-nlu-hint-confidence" [class.low]="top.confidence < 0.6">
            {{ confidencePercent(top) }}%
          </span>
        </div>
        <mat-progress-bar
          mode="determinate"
          [value]="top.confidence * 100"
          [color]="top.confidence >= 0.7 ? 'primary' : top.confidence >= 0.4 ? 'accent' : 'warn'"
          class="svge-nlu-confidence-bar"
        />
      }

      @if (lastResult(); as result) {
        <div class="svge-nlu-status" role="status" aria-live="polite">
          @if (result.executed) {
            <mat-icon class="ok" aria-hidden="true">check_circle</mat-icon>
            <span
              >Executado: <strong>{{ describeIntent(result.candidate!) }}</strong></span
            >
          } @else {
            <mat-icon class="warn" aria-hidden="true">info</mat-icon>
            <span class="svge-nlu-status-text">{{ describeRejection(result) }}</span>
            @if (canForceExecute(result)) {
              <button
                mat-stroked-button
                type="button"
                color="primary"
                class="svge-nlu-confirm-btn"
                (click)="forceExecute(result)"
              >
                <mat-icon>play_arrow</mat-icon>
                <span>Confirmar</span>
              </button>
            }
          }
        </div>
      }

      @if (alternatives().length > 0) {
        <details class="svge-nlu-alts">
          <summary>{{ alternatives().length }} alternativa(s)</summary>
          <ul role="listbox">
            @for (alt of alternatives(); track alt.intent.id) {
              <li
                role="option"
                [attr.aria-selected]="false"
                class="svge-nlu-alt"
                (click)="execCandidate(alt)"
                (keydown.enter)="execCandidate(alt)"
                tabindex="0"
              >
                <span class="svge-nlu-alt-label">{{ describeIntent(alt) }}</span>
                <span class="svge-nlu-alt-confidence">{{ confidencePercent(alt) }}%</span>
              </li>
            }
          </ul>
        </details>
      }

      @if (voiceErrorMessage(); as msg) {
        <p class="svge-nlu-voice-error" role="alert">{{ msg }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .svge-nlu-root {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .svge-nlu-field {
      width: 100%;
    }
    .svge-nlu-prefix {
      color: var(--mat-sys-primary, #1976d2);
      margin-right: 6px;
    }
    .svge-nlu-mic.recording {
      color: var(--mat-sys-error, #d32f2f);
      animation: svge-nlu-pulse 1.2s ease-in-out infinite;
    }
    @keyframes svge-nlu-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }
    .svge-nlu-hint {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 8px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .svge-nlu-hint-label {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .svge-nlu-hint-confidence {
      flex: 0 0 auto;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      color: var(--mat-sys-primary, #1976d2);
    }
    .svge-nlu-hint-confidence.low {
      color: var(--mat-sys-tertiary, #b26500);
    }
    .svge-nlu-confidence-bar {
      height: 3px;
      border-radius: 2px;
    }
    .svge-nlu-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-top: 6px;
      border-radius: 6px;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      font-size: 13px;
    }
    .svge-nlu-status-text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .svge-nlu-status .ok {
      color: #2e7d32;
    }
    .svge-nlu-status .warn {
      color: var(--mat-sys-tertiary, #b26500);
    }
    .svge-nlu-confirm-btn {
      flex: 0 0 auto;
    }
    .svge-nlu-alts {
      margin-top: 6px;
      padding: 6px 12px;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      border-radius: 6px;
      font-size: 13px;
    }
    .svge-nlu-alts summary {
      cursor: pointer;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .svge-nlu-alts ul {
      list-style: none;
      margin: 6px 0 0;
      padding: 0;
    }
    .svge-nlu-alt {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      cursor: pointer;
      border-radius: 4px;
    }
    .svge-nlu-alt:hover,
    .svge-nlu-alt:focus-visible {
      background: var(--mat-sys-surface-variant, rgba(0, 0, 0, 0.06));
      outline: none;
    }
    .svge-nlu-alt-confidence {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-primary, #1976d2);
      font-size: 12px;
    }
    .svge-nlu-voice-error {
      margin: 6px 0 0;
      padding: 6px 12px;
      border-radius: 6px;
      background: var(--mat-sys-error-container, #fde7e9);
      color: var(--mat-sys-on-error-container, #5a1014);
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeNluInput {
  /** Label do input (Material outline). Default em PT. */
  readonly label = input<string>('Comando em linguagem natural');
  /** Placeholder textual. Default exemplo PT. */
  readonly placeholder = input<string>('ex: criar retângulo vermelho 100x50');
  /**
   * BCP-47 language tag pra voice recognition. Default `pt-BR`.
   *
   * **D-046 review-10 (M14)**: quando `autoDetectLanguage = true`,
   * o componente sobreescreve esse default usando `detectLanguage(text)`
   * (PT/EN). Override manual deste input sempre tem prioridade.
   */
  readonly voiceLang = input<string>('pt-BR');

  /**
   * **D-046 review-10 (M14)**: auto-detecta idioma do input via
   * dicionários PT/EN (hits count). Quando `true`, passa o resultado
   * pra `voice.listen()` em vez de `voiceLang()` estático.
   *
   * Útil pra apps que aceitam PT E EN sem o user trocar config manual.
   */
  readonly autoDetectLanguage = input<boolean>(false);

  /**
   * **D-046 review-10 (M5)**: debounce em ms antes de rodar `parse()`.
   * Default 0 (sem debounce — mantém comportamento Fase 1).
   * Recomendado `150` pra voice input rápido (~6 keystrokes/s).
   * Acima de 300 fica perceptível pro user.
   */
  readonly parseDebounceMs = input<number>(0);

  /**
   * Confidence mínima pra auto-execute. Abaixo disso, o componente
   * **não** dispara automaticamente — mostra "Confirmar" pra usuário
   * aprovar explicitamente, OU rejeita se gate não aprovar.
   */
  readonly autoExecuteThreshold = input<number>(0.7);

  /**
   * Gate de confirmação customizado. Quando ausente (default), usa
   * **`window.confirm`** nativo — funciona sem dependência extra, é
   * universal, e dispensa abrir Material dialog (privacy + zero
   * coupling com `svg-engine/ui`).
   *
   * Override pra integrar com Material dialog próprio ou tela custom:
   * ```ts
   * <svge-nlu-input [confirmGate]="myDialogGate" />
   * ```
   *
   * O gate recebe o candidate (com `intent.id`, `intent.destructive`,
   * `confidence`, `slots`) e retorna `boolean | Promise<boolean>`.
   */
  readonly confirmGate = input<((candidate: NluCandidate) => boolean | Promise<boolean>) | null>(
    null,
  );

  /** Evento emitido após cada execute (sucesso ou rejeição). */
  readonly executed = output<NluExecuteResult>();

  protected readonly nlu = inject(NaturalLanguageService);
  protected readonly voice = inject(VoiceEngineService);
  private readonly hostInjector = inject(Injector);
  private readonly textInputRef = viewChild<ElementRef<HTMLInputElement>>('textInput');

  // ── Estado reativo ──────────────────────────────────────────
  protected readonly text = signal('');
  /**
   * **D-046 review-10 (M5)**: signal debouncado pra reduzir parse rate.
   * Quando `parseDebounceMs=0`, sempre igual a `text()`. Caso contrário,
   * só atualiza após o delay sem mudanças (typing burst absorve).
   */
  protected readonly debouncedText = signal('');
  private debounceHandle: ReturnType<typeof setTimeout> | undefined;
  protected readonly lastResult = signal<NluExecuteResult | null>(null);
  /**
   * Candidates ordenados por confidence — recomputa quando
   * `debouncedText` muda OU quando o registry de intents muda.
   */
  protected readonly candidates = computed<readonly NluCandidate[]>(() => {
    const t = this.debouncedText().trim();
    if (t.length === 0) return [];
    // Subscreve ao registry pra recomputar quando intents mudarem.
    void this.nlu.intents();
    return this.nlu.parse(t, { injector: this.hostInjector }, { threshold: 0.25, maxResults: 5 });
  });

  /**
   * **D-046 review-10 (M14)**: idioma detectado do input (PT/EN/unknown).
   * Quando `autoDetectLanguage = true`, este valor sobreescreve `voiceLang()`
   * default pra escolher o engine STT do browser correto.
   */
  protected readonly detectedLanguage = computed<'pt' | 'en' | 'unknown'>(() => {
    const t = this.debouncedText().trim();
    if (t.length === 0) return 'unknown';
    return detectLanguage(tokenize(t)).language;
  });

  /**
   * Resolve BCP-47 effective pro `voice.listen(lang)`. Se autoDetect
   * está ON e detectou PT, retorna 'pt-BR'. Se detectou EN, 'en-US'.
   * Caso unknown ou autoDetect OFF, usa `voiceLang()` (default 'pt-BR').
   */
  protected readonly effectiveVoiceLang = computed<string>(() => {
    if (!this.autoDetectLanguage()) return this.voiceLang();
    const lang = this.detectedLanguage();
    if (lang === 'pt') return 'pt-BR';
    if (lang === 'en') return 'en-US';
    return this.voiceLang();
  });

  protected readonly topCandidate = computed<NluCandidate | null>(
    () => this.candidates()[0] ?? null,
  );
  protected readonly alternatives = computed<readonly NluCandidate[]>(() =>
    this.candidates().slice(1),
  );

  /**
   * Mensagem **acionável** pra erro do Web Speech API. Mapeia os codes
   * crus (`'network'`, `'not-allowed'`, `'no-speech'`, `'audio-capture'`,
   * `'service-not-allowed'`) pra texto humano em PT com o passo concreto
   * que o usuário pode tomar pra resolver. Retorna `null` quando não
   * deve mostrar nada (sem erro OU erro `'aborted'` que é silencioso).
   *
   * **Por que `'network'` é comum no Chrome**: o Web Speech API delega
   * o reconhecimento a servidores Google STT — sem internet, com
   * firewall corporativo ou com bloqueador (uBlock/Brave Shields)
   * filtrando `*.google.com`, o handshake falha e o navegador dispara
   * esse erro. Não é bug do app — é dependência arquitetural do
   * Web Speech API spec ao backend STT do vendor.
   */
  protected readonly voiceErrorMessage = computed<string | null>(() => {
    const err = this.voice.lastError();
    if (err === null || err === 'aborted') return null;
    switch (err) {
      case 'network':
        return 'Voz indisponível: sem conexão com o serviço de reconhecimento (Google STT). Verifique internet, firewall corporativo ou extensões (uBlock/Brave Shields podem bloquear *.google.com).';
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Permissão de microfone negada. Habilite no ícone 🔒 da barra de endereço e tente novamente.';
      case 'no-speech':
        return 'Não detectei voz. Fale mais perto do microfone e tente de novo.';
      case 'audio-capture':
        return 'Microfone não disponível. Verifique se há um microfone conectado e se outra aba/app não está usando-o.';
      case 'language-not-supported':
        return `Idioma "${this.voiceLang()}" não suportado pelo navegador.`;
      case 'bad-grammar':
        return 'Erro de gramática do reconhecimento — tente um comando mais simples.';
      // ── Voz local (Whisper / WASM) ──
      case 'not-supported':
        return 'Voz local indisponível neste ambiente (sem microfone ou WebAssembly).';
      case 'load-failed':
        return 'Falha ao carregar o modelo de voz local (Whisper). Verifique se os assets do modelo estão publicados (ex.: /assets/ml/whisper).';
      case 'transcribe-failed':
        return 'Falha ao transcrever o áudio localmente. Fale novamente e tente de novo.';
      default:
        return `Erro de voz: ${err}`;
    }
  });

  // ── Engine de voz (seletor) ─────────────────────────────────

  /** Rótulo humano para cada engine de voz. */
  protected engineLabel(engine: VoiceEngine): string {
    switch (engine) {
      case 'web-speech':
        return 'Navegador (rápido)';
      case 'whisper':
        return 'Local / Whisper (offline)';
      case 'auto':
        return 'Automático (ambos)';
    }
  }

  /** Ícone Material para cada engine de voz. */
  protected engineIcon(engine: VoiceEngine): string {
    switch (engine) {
      case 'web-speech':
        return 'cloud';
      case 'whisper':
        return 'offline_bolt';
      case 'auto':
        return 'auto_awesome';
    }
  }

  /** Tooltip do botão de microfone (reflete carregamento/gravação). */
  protected micTooltip(): string {
    if (this.voice.modelLoading()) return 'Carregando modelo de voz local…';
    if (this.voice.listening()) return 'Parar';
    return `Voz (${this.effectiveVoiceLang()})`;
  }

  // ── Handlers ────────────────────────────────────────────────

  /**
   * Input handler — atualiza o signal a partir do valor nativo. Não
   * usamos `[value]` binding (que conflita com o controle interno do
   * MatInput em digitação rápida); em vez disso lemos do input direto
   * e setamos programaticamente via `setTextProgrammatically` quando
   * preciso (voice transcript, limpar pós-execute).
   */
  protected onInput(value: string): void {
    this.text.set(value);
    // **D-046 review-10 (M5)**: debounce conforme parseDebounceMs.
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = undefined;
    }
    const ms = this.parseDebounceMs();
    if (ms <= 0) {
      this.debouncedText.set(value);
      return;
    }
    this.debounceHandle = setTimeout(() => {
      this.debouncedText.set(value);
      this.debounceHandle = undefined;
    }, ms);
  }

  /**
   * Seta o valor do input programaticamente (voice transcript, clear
   * pós-execute). Atualiza o signal E o input element value — o input
   * nativo não escuta mudanças de signal sozinho.
   *
   * **D-046 review-10**: também atualiza `debouncedText` IMEDIATO
   * (sem debounce) — caller programático sabe que o valor é final.
   */
  private setTextProgrammatically(value: string): void {
    this.text.set(value);
    this.debouncedText.set(value);
    if (this.debounceHandle !== undefined) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = undefined;
    }
    const el = this.textInputRef()?.nativeElement;
    if (el) el.value = value;
  }

  protected async runNow(): Promise<void> {
    const t = this.text().trim();
    if (t.length === 0) return;
    const result = await this.nlu.execute(
      t,
      { injector: this.hostInjector },
      this.executeOptions(),
    );
    this.lastResult.set(result);
    this.executed.emit(result);
    // Se executou, limpa o input pra próximo comando.
    if (result.executed) this.setTextProgrammatically('');
  }

  /**
   * Executa um candidate específico (clique na lista de alternativas)
   * — usa `nlu.executeCandidate` que aplica gate + threshold +
   * destructive check, em vez de chamar `intent.execute` direto
   * (que bypassaria toda a defesa).
   */
  protected async execCandidate(cand: NluCandidate): Promise<void> {
    const result = await this.nlu.executeCandidate(
      cand,
      { injector: this.hostInjector },
      this.executeOptions(),
    );
    this.lastResult.set(result);
    this.executed.emit(result);
    if (result.executed) this.setTextProgrammatically('');
  }

  /**
   * Força a execução do top candidate **após** o usuário clicar
   * "Confirmar" — passa um gate `() => true` overridand a rejeição
   * `'destructive-no-gate'` / `'below-threshold'` anterior.
   */
  protected async forceExecute(rejected: NluExecuteResult): Promise<void> {
    const cand = rejected.candidate;
    if (cand === null) return;
    const result = await this.nlu.executeCandidate(
      cand,
      { injector: this.hostInjector },
      { ...this.executeOptions(), confirmGate: async () => true },
    );
    this.lastResult.set(result);
    this.executed.emit(result);
    if (result.executed) this.setTextProgrammatically('');
  }

  /**
   * `true` quando o último resultado merece um botão "Confirmar" na
   * UI: usuário escolheu rodar e bateu numa proteção (destrutivo sem
   * gate, ou confidence baixa sem gate), mas há candidate concreto
   * pra forçar execução manualmente.
   */
  protected canForceExecute(result: NluExecuteResult): boolean {
    if (result.executed || result.candidate === null) return false;
    return result.rejection === 'destructive-no-gate' || result.rejection === 'below-threshold';
  }

  protected async toggleVoice(): Promise<void> {
    if (this.voice.listening()) {
      this.voice.stop();
      return;
    }
    try {
      // **D-046 review-10 (M14)**: usa effectiveVoiceLang (auto-detect
      // PT/EN do input quando autoDetectLanguage=true).
      const transcript = await this.voice.listen(this.effectiveVoiceLang());
      if (transcript.length > 0) {
        this.setTextProgrammatically(transcript);
        // Auto-run quando vem por voz — confiança do usuário no
        // que falou + threshold/gate ainda protege destrutivos.
        await this.runNow();
      }
    } catch {
      // Erro já reportado via `voice.lastError()` signal.
    }
  }

  // ── Helpers de display ──────────────────────────────────────

  /**
   * Texto humano pra exibir do candidate. Prioridade:
   * 1. `intent.description` (quando explícita)
   * 2. Keywords joined (mais legível que reverse-DNS id)
   * 3. `intent.id` (último recurso)
   */
  protected describeIntent(c: NluCandidate): string {
    const desc = c.intent.description;
    if (typeof desc === 'string' && desc.length > 0) return desc;
    const kws = c.intent.keywords;
    if (Array.isArray(kws) && kws.length > 0) {
      // Junta as 3 primeiras keywords pra dar contexto sem virar lista enorme.
      return kws.slice(0, 3).join(' / ');
    }
    return c.intent.id;
  }

  protected confidencePercent(c: NluCandidate): number {
    return Math.round(c.confidence * 100);
  }

  protected describeRejection(result: NluExecuteResult): string {
    if (result.candidate === null) return 'Nenhum comando reconhecido';
    const label = this.describeIntent(result.candidate);
    const pct = this.confidencePercent(result.candidate);
    switch (result.rejection) {
      case 'below-threshold':
        return `Confidence baixa (${pct}%) em "${label}" — confirme se é o que quer`;
      case 'destructive-no-gate':
        return `Ação destrutiva: "${label}" — confirme pra executar`;
      case 'confirmation-declined':
        return `"${label}" cancelado`;
      case 'no-match':
        return 'Nenhum comando reconhecido';
      default:
        return `Rejeitado: ${label}`;
    }
  }

  /**
   * Monta as `NluExecuteOptions` consolidadas: thresholds + gate.
   * Quando o consumer não passou `confirmGate` via input, usa
   * `window.confirm` como default — universal, zero dep.
   */
  private executeOptions(): {
    autoExecuteThreshold: number;
    confirmGate: (c: NluCandidate) => boolean | Promise<boolean>;
  } {
    const externalGate = this.confirmGate();
    const gate =
      externalGate ??
      ((c: NluCandidate): boolean => {
        // Default browser-native confirmation. Mensagem em PT pra ficar
        // alinhada com o label/placeholder default; consumer que
        // quiser i18n customiza via input `confirmGate`.
        if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
        const label = this.describeIntent(c);
        const pct = this.confidencePercent(c);
        const prefix = c.intent.destructive ? '[ação destrutiva] ' : '';
        return window.confirm(`${prefix}Executar "${label}" (${pct}%)?`);
      });
    return {
      autoExecuteThreshold: this.autoExecuteThreshold(),
      confirmGate: gate,
    };
  }
}
