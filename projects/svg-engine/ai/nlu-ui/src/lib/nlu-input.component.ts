import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import {
  type NluCandidate,
  type NluExecuteResult,
  NaturalLanguageService,
} from 'svg-engine/ai/nlu';
import { VoiceRecognitionService } from './voice-recognition.service';

/**
 * **`<svge-nlu-input>`** — D-046 Fase 1 UI surface.
 *
 * Input textual com botão de voz para enviar comandos em linguagem
 * natural para o {@link NaturalLanguageService}. Mostra:
 *
 * - Campo de texto (Material outlined) com mic button suffix
 * - Live preview do top candidate enquanto digita (com confidence bar)
 * - Botão "Run" (Enter também envia)
 * - Linha de status com o resultado da última execução
 * - Lista colapsável de alternativas (top N) quando confidence < auto
 *
 * **Por que componente standalone** (e não fragmentos): mesmo padrão
 * dos outros UI components da lib (`<svge-color-picker>`,
 * `<svge-layers-panel>`, etc.). Consumer importa o componente único.
 *
 * **Multi-editor (D-042/D-043)**: o input do `NaturalLanguageService.execute()`
 * recebe `{ injector: this.hostInjector }` — services do scope ativo,
 * idêntico ao padrão dos handlers de menu / shortcut. Consumer
 * mounta o componente DENTRO do scope do editor (route-scoped).
 *
 * **Voice**: usa {@link VoiceRecognitionService}, ativável com clique
 * no mic. Idioma default `pt-BR`, customizável via input `voiceLang`.
 * Botão fica disabled quando Web Speech API não suportada (Firefox
 * sem polyfill).
 *
 * **Eventos**:
 * - `executed` — emite após cada `execute()` retornar (sucesso ou
 *   rejeição); consumer pode usar pra UI feedback / analytics.
 *
 * **Acessibilidade**:
 * - Input ARIA-described com hint do top candidate.
 * - Botão mic com `aria-pressed="true"` enquanto gravando.
 * - Lista de alternativas com `role="listbox"`.
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
    MatProgressBarModule,
    MatTooltip,
  ],
  template: `
    <div class="svge-nlu-root">
      <mat-form-field appearance="outline" class="svge-nlu-field">
        <mat-label>{{ label() }}</mat-label>
        <mat-icon matPrefix class="svge-nlu-prefix" aria-hidden="true">smart_toy</mat-icon>
        <input
          matInput
          type="text"
          [value]="text()"
          (input)="onInput($any($event.target).value)"
          (keydown.enter)="runNow()"
          [attr.aria-label]="label()"
          [attr.aria-describedby]="topCandidate() ? 'svge-nlu-hint' : null"
          [placeholder]="placeholder()"
        />
        @if (voice.isSupported()) {
          <button
            mat-icon-button
            matSuffix
            type="button"
            class="svge-nlu-mic"
            [class.recording]="voice.listening()"
            [attr.aria-pressed]="voice.listening()"
            [matTooltip]="voice.listening() ? 'Stop' : 'Voice (' + voiceLang() + ')'"
            (click)="toggleVoice()"
          >
            <mat-icon>{{ voice.listening() ? 'mic_off' : 'mic' }}</mat-icon>
          </button>
        }
        <button
          mat-icon-button
          matSuffix
          type="button"
          class="svge-nlu-run"
          matTooltip="Run"
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
              >Executed: <strong>{{ result.candidate!.intent.id }}</strong></span
            >
          } @else {
            <mat-icon class="warn" aria-hidden="true">info</mat-icon>
            <span>{{ describeRejection(result) }}</span>
          }
        </div>
      }

      @if (alternatives().length > 0) {
        <details class="svge-nlu-alts">
          <summary>{{ alternatives().length }} alternative(s)</summary>
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

      @if (voice.lastError() && voice.lastError() !== 'aborted') {
        <p class="svge-nlu-voice-error" role="alert">Voice error: {{ voice.lastError() }}</p>
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
      gap: 6px;
      padding: 8px 12px;
      margin-top: 6px;
      border-radius: 6px;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      font-size: 13px;
    }
    .svge-nlu-status .ok {
      color: #2e7d32;
    }
    .svge-nlu-status .warn {
      color: var(--mat-sys-tertiary, #b26500);
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
  /** Label do input (Material outline). Default `Try a natural-language command`. */
  readonly label = input<string>('Try a natural-language command');
  /** Placeholder textual. Default exemplo PT. */
  readonly placeholder = input<string>('ex: criar retângulo vermelho 100x50');
  /** BCP-47 language tag pra voice recognition. Default `pt-BR`. */
  readonly voiceLang = input<string>('pt-BR');

  /**
   * Confidence mínima pra auto-execute. Abaixo disso, o componente
   * **não** dispara automaticamente — só executa quando o usuário
   * pressiona Enter / clica Run / escolhe na lista de alternativas.
   */
  readonly autoExecuteThreshold = input<number>(0.7);

  /** Evento emitido após cada execute (sucesso ou rejeição). */
  readonly executed = output<NluExecuteResult>();

  protected readonly nlu = inject(NaturalLanguageService);
  protected readonly voice = inject(VoiceRecognitionService);
  private readonly hostInjector = inject(Injector);

  // ── Estado reativo ──────────────────────────────────────────
  protected readonly text = signal('');
  protected readonly lastResult = signal<NluExecuteResult | null>(null);
  /**
   * Tick que muda toda vez que `nlu.intents()` muda, forçando o
   * recompute de `candidates` (registry signal é dependência).
   */
  protected readonly candidates = computed<readonly NluCandidate[]>(() => {
    const t = this.text().trim();
    if (t.length === 0) return [];
    // Subscreve ao registry pra recomputar quando intents mudarem.
    void this.nlu.intents();
    return this.nlu.parse(t, { injector: this.hostInjector }, { threshold: 0.25, maxResults: 5 });
  });

  protected readonly topCandidate = computed<NluCandidate | null>(
    () => this.candidates()[0] ?? null,
  );
  protected readonly alternatives = computed<readonly NluCandidate[]>(() =>
    this.candidates().slice(1),
  );

  // ── Handlers ────────────────────────────────────────────────
  protected onInput(value: string): void {
    this.text.set(value);
  }

  protected async runNow(): Promise<void> {
    const t = this.text().trim();
    if (t.length === 0) return;
    const result = await this.nlu.execute(
      t,
      { injector: this.hostInjector },
      { autoExecuteThreshold: this.autoExecuteThreshold() },
    );
    this.lastResult.set(result);
    this.executed.emit(result);
    // Se executou, limpa o input pra próximo comando.
    if (result.executed) this.text.set('');
  }

  protected async execCandidate(cand: NluCandidate): Promise<void> {
    await cand.intent.execute(cand.slots, { injector: this.hostInjector });
    const synthetic: NluExecuteResult = {
      executed: true,
      candidate: cand,
      alternatives: [],
      rejection: null,
    };
    this.lastResult.set(synthetic);
    this.executed.emit(synthetic);
    this.text.set('');
  }

  protected async toggleVoice(): Promise<void> {
    if (this.voice.listening()) {
      this.voice.stop();
      return;
    }
    try {
      const transcript = await this.voice.listen(this.voiceLang());
      if (transcript.length > 0) {
        this.text.set(transcript);
        // Auto-run quando vem por voz — confiança do usuário no
        // que falou + threshold ainda protege destrutivos.
        await this.runNow();
      }
    } catch {
      // Erro já reportado via `voice.lastError()` signal.
    }
  }

  // ── Helpers de display ──────────────────────────────────────
  protected describeIntent(c: NluCandidate): string {
    const desc = c.intent.description;
    return typeof desc === 'string' && desc.length > 0 ? desc : c.intent.id;
  }

  protected confidencePercent(c: NluCandidate): number {
    return Math.round(c.confidence * 100);
  }

  protected describeRejection(result: NluExecuteResult): string {
    if (result.candidate === null) return 'No matching command found';
    const id = result.candidate.intent.id;
    switch (result.rejection) {
      case 'below-threshold':
        return `"${id}" matched with low confidence — press Run to confirm`;
      case 'destructive-no-gate':
        return `"${id}" is destructive — confirmation required`;
      case 'confirmation-declined':
        return `"${id}" declined`;
      case 'no-match':
        return 'No matching command found';
      default:
        return `Rejected: ${id}`;
    }
  }
}
