import type { Injector } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import {
  type EditorPlugin,
  MenuContributionRegistry,
  PLUGIN_API_VERSION,
  ShortcutRegistry,
} from 'svg-engine/edit';
import { CommandPaletteDialog } from './command-palette.dialog';

/**
 * **`commandPalettePlugin`** — expõe o NLU no SVG Studio como um
 * **Command Palette** (overlay modal estilo Figma "Quick actions" /
 * VSCode / Linear), disponível por:
 *
 * - **`Ctrl/Cmd+K`** — registrado no {@link ShortcutRegistry} (mesmo
 *   mecanismo dos atalhos built-in Ctrl+Z/G/A). O `ShortcutService`
 *   é escopado por editor (D-042), então `runCtx.injector` é o escopo
 *   da rota — os comandos do NLU agem no editor focado.
 * - **Botão "Assistente" (✦)** no `toolbar.main` — contribuição de
 *   menu (D-043). A `<svge-toolbar>` repassa seu `injector` ao `run`,
 *   também escopado.
 *
 * **Como o escopo chega ao `<svge-nlu-input>`**: abrimos o
 * {@link CommandPaletteDialog} via `MatDialog.open(..., { injector })`.
 * O `MatDialogConfig.injector` torna esse injector o pai do componente
 * do diálogo — assim o `inject(Injector)` interno do `<svge-nlu-input>`
 * resolve o `CommandBus`/`EditorStateService` **escopados** (e não os do
 * root). Sem isso, o NLU dispararia comandos num editor-root vazio.
 *
 * **Por que mora no app (svg-studio) e não na lib**: o `<svge-shell-pro>`
 * (em `svg-engine/ui`) é desacoplado da camada de IA por design — montar
 * o NLU dentro dele forçaria todo consumidor do shell a puxar a stack de
 * ML. O app é a fronteira correta para juntar `ui` + `ai/nlu-ui`.
 *
 * **Toggle único compartilhado**: o closure `openRef` é vivido pelo
 * install (roda uma vez), compartilhado entre atalho e botão — reabrir
 * fecha o diálogo aberto, evitando duplicatas.
 */
export const commandPalettePlugin: EditorPlugin = {
  id: 'studio.command-palette',
  name: 'SVG Studio — Command Palette (NLU)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const shortcuts = ctx.injector.get(ShortcutRegistry);
    const menus = ctx.injector.get(MenuContributionRegistry);

    // Referência ao diálogo aberto (null = fechado). Compartilhada entre
    // o atalho e o botão para que reabrir alterne (toggle) em vez de
    // empilhar instâncias.
    let openRef: MatDialogRef<CommandPaletteDialog> | null = null;

    const toggle = (injector: Injector): void => {
      if (openRef !== null) {
        openRef.close();
        return;
      }
      const dialog = injector.get(MatDialog);
      openRef = dialog.open(CommandPaletteDialog, {
        // **Escopo do editor** — chave de tudo: faz o inject(Injector)
        // do <svge-nlu-input> resolver os serviços escopados da rota.
        injector,
        panelClass: 'studio-command-palette-panel',
        width: 'min(640px, 92vw)',
        maxWidth: '92vw',
        // Posição de "palette" (topo-centro), não diálogo centralizado.
        position: { top: '12vh' },
        // Foca o campo de texto do NLU ao abrir (digitar imediato).
        autoFocus: 'input',
        restoreFocus: true,
        ariaLabel: 'Assistente de comandos em linguagem natural',
      });
      openRef.afterClosed().subscribe(() => {
        openRef = null;
      });
    };

    // ── Atalho Ctrl/Cmd+K ──────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'studio.command-palette.shortcut',
        combo: 'Ctrl+K',
        description: 'Abrir o assistente de comandos (linguagem natural)',
        run(event, runCtx) {
          event.preventDefault();
          toggle(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── Botão "Assistente" na toolbar principal ────────────────────
    ctx.track(
      menus.register({
        id: 'studio.command-palette.toolbar',
        slot: 'toolbar.main',
        label: 'Assistente',
        icon: 'auto_awesome',
        tooltip: 'Assistente de comandos em linguagem natural',
        shortcut: 'Ctrl+K',
        // Cedo no slot para virar um ponto de entrada visível à esquerda.
        order: 5,
        run(menuCtx) {
          toggle(menuCtx?.injector ?? ctx.injector);
        },
      }),
    );
  },
};
