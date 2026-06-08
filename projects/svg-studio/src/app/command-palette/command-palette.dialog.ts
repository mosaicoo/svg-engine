import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { SvgeNluInput } from 'svg-engine/ai/nlu-ui';

/**
 * **`<studio-command-palette>`** — Command Palette do SVG Studio (estilo
 * Figma "Quick actions" / VSCode / Linear) que hospeda o
 * {@link SvgeNluInput} (texto + voz) num overlay modal.
 *
 * **Por que um `MatDialog` no nível do app (e não dentro do shell)**: o
 * `<svge-shell-pro>` vive em `svg-engine/ui`, que é **deliberadamente
 * desacoplado** da camada de IA (`svg-engine/ai/*`). Embutir o NLU no
 * shell forçaria todo consumidor do shell a puxar transformers.js/ML.
 * Por isso a superfície mora aqui no `svg-studio` (app), montada como
 * irmã do shell via overlay — o shell permanece AI-free.
 *
 * **Injector do escopo (crítico)**: o `<svge-nlu-input>` resolve os
 * serviços do editor via `inject(Injector)` no ponto onde é instanciado.
 * Um `MatDialog` abre num contexto de DI separado, então quem dispara o
 * diálogo ({@link import('./command-palette.plugin').commandPalettePlugin})
 * passa o `injector` do **escopo da rota** (`provideSvgEngineEditorScope`)
 * via `MatDialogConfig.injector`. Assim os comandos atuam no canvas do
 * Studio, não num editor-root vazio.
 *
 * **Fica aberto após executar**: ao contrário de um command-palette de
 * "ação única", mantemos o diálogo aberto para o usuário ver o feedback
 * (confidence / status / alternativas) que o `<svge-nlu-input>` mostra
 * inline e encadear comandos ("crie 3 círculos", depois "deixe vermelho").
 * O input se limpa sozinho após cada sucesso. Fecha com Esc, backdrop ou
 * o botão ✕.
 */
@Component({
  selector: 'studio-command-palette',
  standalone: true,
  imports: [MatIconButton, MatIcon, SvgeNluInput],
  template: `
    <div class="cp-root">
      <header class="cp-head">
        <mat-icon class="cp-spark" aria-hidden="true">auto_awesome</mat-icon>
        <h2 class="cp-title" id="cp-title">Assistente</h2>
        <span class="cp-esc" aria-hidden="true">Esc para fechar</span>
        <button
          mat-icon-button
          type="button"
          class="cp-close"
          aria-label="Fechar assistente"
          (click)="close()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <p class="cp-sub">Digite ou fale um comando em linguagem natural (PT ou EN).</p>

      <svge-nlu-input
        label="Comando em linguagem natural"
        placeholder="ex: criar 3 círculos vermelhos em grade"
        voiceLang="pt-BR"
      />

      <details class="cp-examples">
        <summary>Exemplos</summary>
        <ul>
          <li><code>criar retângulo vermelho 100x50</code></li>
          <li><code>crie 3 círculos vermelhos em grade</code></li>
          <li><code>criar 3 retângulos amarelos em linha</code></li>
          <li><code>crie 6 círculos espalhados</code></li>
          <li>
            <code>selecionar tudo</code> · <code>desfazer</code> · <code>deletar</code> ·
            <code>aproximar</code>
          </li>
        </ul>
      </details>
    </div>
  `,
  styles: `
    .cp-root {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px 16px;
      min-width: 0;
    }
    .cp-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cp-spark {
      color: var(--mat-sys-primary, #1976d2);
      flex: 0 0 auto;
    }
    .cp-title {
      flex: 1 1 auto;
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.2;
    }
    .cp-esc {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #666);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.18));
      border-radius: 4px;
      padding: 1px 6px;
    }
    .cp-close {
      flex: 0 0 auto;
    }
    .cp-sub {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .cp-examples {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .cp-examples summary {
      cursor: pointer;
      user-select: none;
    }
    .cp-examples ul {
      list-style: none;
      margin: 6px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cp-examples code {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 11px;
    }
  `,
  host: {
    role: 'group',
    '[attr.aria-labelledby]': '"cp-title"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPaletteDialog {
  private readonly ref = inject(MatDialogRef<CommandPaletteDialog>);

  /** Fecha o diálogo (botão ✕). Esc e backdrop já fecham via MatDialog. */
  protected close(): void {
    this.ref.close();
  }
}
