import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { type EditorPlugin, PLUGIN_API_VERSION, PluginManagerService } from 'svg-engine/edit';
import { SvgePluginManager } from 'svg-engine/ui';

/**
 * **D-083 Fase 1 — showcase do gerenciador de plugins.**
 *
 * Renderiza o `<svge-plugin-manager>` (que lê o catálogo app-wide
 * populado pelos builtins providos no `app.config`) ao lado de uma nota
 * explicativa e de um botão que instala um plugin **externo** de
 * demonstração em runtime — para exercitar a seção "External" + o
 * uninstall, que os builtins (internos) não têm.
 *
 * Esta página é showcase: prova que o mecanismo existe e é usável. Em um
 * produto real, o consumer monta o manager onde sua própria autorização
 * permitir (a library não tem login/perfis — mecanismo, não política).
 */
const DEMO_EXTERNAL_PLUGIN: EditorPlugin = {
  id: 'com.demo.external.sample',
  name: 'Sample External Plugin',
  version: '0.1.0',
  apiVersion: PLUGIN_API_VERSION,
  description: 'Plugin de terceiro instalado em runtime — ligue/desligue ou desinstale.',
  author: 'Playground Demo',
  icon: 'extension',
  category: 'other',
  install: () => undefined,
};

@Component({
  selector: 'app-plugins',
  standalone: true,
  imports: [SvgePluginManager],
  template: `
    <section class="plugins-page">
      <div class="intro">
        <h2>Gerenciador de plugins</h2>
        <p>
          Lista todos os plugins que o app registrou, agrupados por tipo (<strong>Internal</strong>
          = empacotados; <strong>External</strong> = terceiros). Ative / desative qualquer um (a
          preferência persiste); desinstale os externos. Plugins internos só podem ser desativados.
        </p>
        <button type="button" class="demo-btn" (click)="installDemo()">
          Instalar plugin externo de demonstração
        </button>
      </div>
      <div class="manager-host">
        <svge-plugin-manager />
      </div>
    </section>
  `,
  styles: `
    .plugins-page {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 16px;
      height: 100%;
      padding: 16px;
      box-sizing: border-box;
    }
    .intro {
      max-width: 56ch;
    }
    .intro h2 {
      margin-top: 0;
    }
    .intro p {
      color: var(--mat-sys-on-surface-variant, #555);
      line-height: 1.5;
    }
    .demo-btn {
      margin-top: 8px;
      padding: 8px 14px;
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--mat-sys-outline, #999);
      border-radius: 6px;
      background: var(--mat-sys-surface-container, #f0f0f0);
    }
    .demo-btn:hover {
      background: var(--mat-sys-surface-container-high, #e6e6e6);
    }
    .manager-host {
      height: 100%;
      min-height: 400px;
      border: 1px solid var(--mat-sys-outline-variant, #ddd);
      border-radius: 8px;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PluginsPage {
  private readonly manager = inject(PluginManagerService);

  protected installDemo(): void {
    // Idempotent for the demo: installExternal returns ok:false if it's
    // already in the catalog — fine, the row is already shown.
    this.manager.installExternal(DEMO_EXTERNAL_PLUGIN);
  }
}
