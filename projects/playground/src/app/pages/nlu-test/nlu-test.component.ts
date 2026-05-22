import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Marquee,
  provideSvgEngineEditorScope,
  RotationPivot,
  SelectionOverlay,
  SnapGuides,
} from 'svg-engine/edit';
import type { NluExecuteResult } from 'svg-engine/nlu';
import { SvgeNluInput } from 'svg-engine/nlu-ui';
import { SvgeEditor } from 'svg-engine/ui';

/**
 * **NLU Test bench** — rota `/nlu-test` (D-046 Fase 1 demo).
 *
 * Página standalone que mostra o `<svge-editor>` lado a lado com o
 * `<svge-nlu-input>` (text + voice). Permite ao usuário digitar OU
 * falar comandos em linguagem natural e ver o efeito direto no
 * canvas (criar formas, deletar, undo, etc).
 *
 * **Comandos para experimentar** (mostrados como dicas):
 * - PT: "criar retângulo vermelho 100x50", "criar círculo azul",
 *   "undo", "desfazer", "deletar", "selecionar tudo"
 * - EN: "create a blue circle", "delete", "undo", "select all"
 *
 * **D-042 multi-editor scope**: `provideSvgEngineEditorScope()` garante
 * que esta rota tem seu próprio `EditorStateService` + `CommandBus` +
 * `SelectionService`. O `<svge-nlu-input>` mountado nesta rota injeta
 * o injector próprio dela ao executar — comandos atuam APENAS no
 * canvas desta rota (multi-editor safe, mesmo padrão D-043).
 */
@Component({
  selector: 'app-pg-nlu-test',
  standalone: true,
  imports: [
    SvgeEditor,
    SvgeNluInput,
    SelectionOverlay,
    RotationPivot,
    Marquee,
    SnapGuides,
    RouterLink,
  ],
  providers: [provideSvgEngineEditorScope()],
  template: `
    <div class="hint">
      <p>
        <strong>NLU — Linguagem natural:</strong> digite ou fale comandos para o editor. Cobertura
        rule-based (D-046 Fase 1) inclui criar formas, undo, delete, select all — em PT ou EN.
        Auto-discovery enxerga todos os menu items registrados (≈30 intents). Voltar para
        <a routerLink="/custom-editor">/custom-editor</a>.
      </p>
      <details>
        <summary>Comandos para experimentar</summary>
        <ul>
          <li><code>criar retângulo vermelho 100x50</code> — cria rect com fill #e53935</li>
          <li><code>create a blue circle</code> — cria ellipse circular fill azul</li>
          <li><code>desenhar elipse verde</code> — cria ellipse fill verde</li>
          <li><code>undo</code> / <code>desfazer</code> — desfaz último comando</li>
          <li><code>select all</code> / <code>selecionar tudo</code></li>
          <li><code>deletar</code> — remove selecionados (destrutivo, pede confirmação)</li>
          <li><code>zoom in</code> / <code>aproximar</code></li>
        </ul>
      </details>
    </div>

    <div class="nlu-area">
      <svge-nlu-input
        label="Comando em linguagem natural"
        placeholder="ex: criar retângulo vermelho 100x50"
        voiceLang="pt-BR"
        (executed)="onExecuted($event)"
      />
      @if (lastExecutedId(); as id) {
        <p class="last-exec" aria-live="polite">
          Último comando executado: <code>{{ id }}</code>
        </p>
      }
    </div>

    <div class="editor-area">
      <svge-editor title="NLU Test Editor" [showContextMenu]="true" [showToolOptions]="true">
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
      </svge-editor>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      padding: 0.5rem;
      box-sizing: border-box;
      gap: 0.5rem;
    }
    .hint {
      flex: 0 0 auto;
      padding: 0.5rem 0.75rem;
      background: var(--mat-sys-surface-container-low, #fff8e1);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      font-size: 0.85rem;
    }
    .hint p {
      margin: 0 0 0.25rem;
    }
    .hint details {
      margin-top: 0.25rem;
    }
    .hint ul {
      margin: 0.25rem 0 0;
      padding-left: 1.5rem;
    }
    .hint code {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 0 4px;
      border-radius: 3px;
      font-size: 0.85em;
    }
    .nlu-area {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .last-exec {
      margin: 0;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .last-exec code {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 0 4px;
      border-radius: 3px;
    }
    .editor-area {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    svge-editor {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NluTest {
  protected readonly lastExecutedId = signal<string | null>(null);

  protected onExecuted(result: NluExecuteResult): void {
    if (result.executed && result.candidate !== null) {
      this.lastExecutedId.set(result.candidate.intent.id);
    }
  }
}
