import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  type EditorPlugin,
  PLUGIN_API_VERSION,
  PluginLoader,
  PluginManagerService,
} from '@mosaicoo/svg-engine/edit';
import { SvgePluginManager } from '@mosaicoo/svg-engine/ui';

import { LOADER_DEMO_ORIGIN, trustedManifest, untrustedManifest } from './loader-demo';

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

        <h3>Fase 2 — carregar via PluginLoader (origem confiável)</h3>
        <p class="small">
          O playground configurou <code>providePluginLoader</code> com uma origem confiável fake
          (<code>{{ trustedOrigin }}</code
          >) e um <code>moduleLoader</code> em memória (simula um CDN, sem rede). Clique para
          exercitar o loader real de ponta a ponta.
        </p>
        <div class="loader-row">
          <button type="button" class="demo-btn" (click)="loadTrusted()">
            Carregar (confiável)
          </button>
          <button type="button" class="demo-btn danger" (click)="loadUntrusted()">
            Tentar origem NÃO-confiável
          </button>
        </div>
        @if (loaderResult(); as r) {
          <p class="loader-result" [class.err]="!r.ok" role="status">
            {{ r.ok ? '✓ ' : '✗ ' }}{{ r.message }}
          </p>
        }
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
    .demo-btn.danger {
      border-color: var(--mat-sys-error, #ba1a1a);
      color: var(--mat-sys-error, #ba1a1a);
    }
    .intro h3 {
      margin: 20px 0 4px;
      font-size: 14px;
    }
    .intro .small {
      font-size: 12px;
    }
    .intro code {
      font-size: 11px;
      background: var(--mat-sys-surface-container-high, #eee);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .loader-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .loader-result {
      margin-top: 8px;
      font-size: 12px;
      color: var(--mat-sys-primary, #1976d2);
    }
    .loader-result.err {
      color: var(--mat-sys-error, #ba1a1a);
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
  private readonly loader = inject(PluginLoader);

  protected readonly trustedOrigin = LOADER_DEMO_ORIGIN;
  protected readonly loaderResult = signal<{ ok: boolean; message: string } | null>(null);

  protected installDemo(): void {
    // Idempotent for the demo: installExternal returns ok:false if it's
    // already in the catalog — fine, the row is already shown.
    this.manager.installExternal(DEMO_EXTERNAL_PLUGIN);
  }

  /** Fase 2: load from the trusted origin → should succeed + appear in the list. */
  protected async loadTrusted(): Promise<void> {
    const res = await this.loader.load(trustedManifest());
    this.loaderResult.set({
      ok: res.ok,
      message: res.ok ? 'Carregado e instalado (veja em External).' : (res.error ?? 'Falhou'),
    });
  }

  /** Fase 2: load from an off-allowlist origin → should be refused by the loader. */
  protected async loadUntrusted(): Promise<void> {
    const res = await this.loader.load(untrustedManifest());
    this.loaderResult.set({
      ok: res.ok,
      message: res.ok ? 'Carregado (inesperado!)' : (res.error ?? 'Recusado'),
    });
  }
}
