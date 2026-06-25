import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvgeNluInput } from '@mosaicoo/svg-engine/ai/nlu-ui';
import { SvgeDialogShell } from '@mosaicoo/svg-engine/ui';

/**
 * **`<studio-command-palette>`** — Command Palette do SVG Studio (estilo
 * Figma "Quick actions" / VSCode / Linear) que hospeda o
 * {@link SvgeNluInput} (texto + voz) num overlay modal.
 *
 * **Mesmo chrome dos diálogos internos**: usa o `<svge-dialog-shell>`
 * (o mesmo do "View Source" / Smart Object / etc.), então herda de graça
 * o **arraste pelo cabeçalho** e o **redimensionamento** pelo canto
 * inferior-direito — exatamente as características que os modais internos
 * do editor já têm. Abrir via `svgeDialogConfig()` (no plugin) completa o
 * look padronizado (largura, maxHeight, panelClass, foco no input).
 *
 * **Por que mora no app (e não no shell)**: o `<svge-shell-pro>` vive em
 * `svg-engine/ui`, deliberadamente desacoplado da camada de IA
 * (`svg-engine/ai/*`). Embutir o NLU no shell forçaria todo consumidor a
 * puxar a stack de ML. Aqui (app) é a fronteira correta para juntar
 * `ui` (dialog-shell) + `ai/nlu-ui` (input).
 *
 * **Injector do escopo (crítico)**: o `<svge-nlu-input>` resolve os
 * serviços do editor via `inject(Injector)`. Um `MatDialog` abre num
 * contexto de DI separado, então o plugin que dispara o diálogo passa o
 * `injector` do **escopo da rota** via `MatDialogConfig.injector` — assim
 * os comandos atuam no canvas do Studio, não num editor-root vazio.
 *
 * **Fica aberto após executar**: mantemos o diálogo aberto para o usuário
 * ver o feedback (confidence / status / alternativas) que o
 * `<svge-nlu-input>` mostra inline e encadear comandos. O input se limpa
 * sozinho após cada sucesso. Fecha com Esc, backdrop ou o botão ✕ do shell.
 */
@Component({
  selector: 'studio-command-palette',
  standalone: true,
  imports: [SvgeDialogShell, SvgeNluInput],
  template: `
    <svge-dialog-shell
      icon="auto_awesome"
      title="Assistente"
      subtitle="Digite ou fale um comando em linguagem natural (PT ou EN)"
    >
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
          <li><code>criar retângulo com gradiente azul para vermelho</code></li>
          <li><code>crie 6 círculos espalhados</code></li>
          <li>
            <code>selecionar tudo</code> · <code>desfazer</code> · <code>deletar</code> ·
            <code>aproximar</code>
          </li>
          <li class="cp-ai">
            ✨ com IA: <code>crie um card de KPI moderno com ícone, título, valor e status</code>
          </li>
        </ul>
      </details>

      <span svgeDialogFooterStatus
        >Esc fecha · arraste o cabeçalho para mover · redimensione pelo canto</span
      >
    </svge-dialog-shell>
  `,
  styles: `
    svge-nlu-input {
      display: block;
    }
    .cp-examples {
      margin-top: 10px;
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
    .cp-ai {
      margin-top: 2px;
      color: var(--mat-sys-primary, #6750a4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPaletteDialog {}
