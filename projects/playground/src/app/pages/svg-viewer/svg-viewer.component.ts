import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SvgDocument } from 'svg-engine/core';
import { svgImporter } from 'svg-engine/io';
import { SvgeRenderer } from 'svg-engine/render';

/**
 * **Visualizador SVG (read-only)** — demonstra o **menor footprint
 * possível** do SVGEngine: apenas `<svge-renderer>` (entry point
 * `svg-engine/render`) + parser `svgImporter` (entry point
 * `svg-engine/io`). **Zero dependência de `svg-engine/edit`**, zero
 * Material/CDK, zero plugins, zero registries.
 *
 * **Caso de uso real**: embed de visualização de logos/ícones/diagramas
 * SVG em apps que não querem nem o overhead do `<svge-editor>`. Bundle
 * mínimo do SVGEngine — só o renderer + parser.
 *
 * **Diferença para `/embeddable-canvas`**:
 * - Embeddable canvas usa `<svge-editor>` com toolbar/status off, mas
 *   ainda **permite editar** (selection, drag-move, isolation). Paga
 *   o custo de Material.
 * - SVG viewer usa só `<svge-renderer>`, **read-only puro**, sem
 *   nenhuma interação. Bundle radicalmente menor.
 *
 * **Como usar**:
 * 1. Cole markup SVG na textarea (parsing acontece a cada keystroke), ou
 * 2. Carregue um arquivo `.svg` do disco via `<input type="file">`, ou
 * 3. Clique em "Carregar exemplo" para popular com um SVG de teste.
 *
 * Erros de parsing aparecem inline (sem dialog Material — esta rota
 * é puramente headless visualmente).
 */
@Component({
  selector: 'app-pg-svg-viewer',
  standalone: true,
  imports: [SvgeRenderer, RouterLink],
  template: `
    <header class="bar">
      <p>
        <strong>Visualizador SVG (read-only)</strong> — apenas <code>&lt;svge-renderer&gt;</code> +
        <code>svgImporter</code>. Zero <code>svg-engine/edit</code>, zero Material. Compare com
        <a routerLink="/embeddable-canvas">/embeddable-canvas</a> (canvas com edição mas sem chrome)
        e <a routerLink="/custom-editor">/custom-editor</a> (editor completo construído à mão).
      </p>
    </header>
    <div class="layout">
      <aside class="input-pane">
        <label for="svg-source">Cole markup SVG ou carregue arquivo:</label>
        <textarea
          id="svg-source"
          class="source"
          placeholder="<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>...</svg>"
          [value]="rawSource()"
          (input)="onInput($event)"
          spellcheck="false"
          autocomplete="off"
        ></textarea>
        <div class="actions">
          <label class="file-btn">
            <input
              type="file"
              accept=".svg,image/svg+xml"
              (change)="onFile($event)"
              aria-label="Carregar arquivo SVG"
            />
            Carregar arquivo
          </label>
          <button type="button" (click)="loadExample()">Carregar exemplo</button>
          <button type="button" (click)="clear()" [disabled]="rawSource().length === 0">
            Limpar
          </button>
        </div>
        @if (error()) {
          <div class="error" role="alert">⚠ {{ error() }}</div>
        }
        @if (warnings().length > 0) {
          <details class="warnings">
            <summary>{{ warnings().length }} aviso(s) ao importar</summary>
            <ul>
              @for (w of warnings(); track w) {
                <li>{{ w }}</li>
              }
            </ul>
          </details>
        }
      </aside>
      <main class="render-pane">
        @if (doc()) {
          <svge-renderer
            [tree]="doc()!.root"
            [viewBox]="doc()!.viewBox"
            [ariaLabel]="'SVG carregado pelo viewer'"
          />
        } @else {
          <div class="placeholder">
            <p>Cole um SVG ou carregue um arquivo para visualizar</p>
          </div>
        }
      </main>
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
    .bar {
      padding: 0.5rem 0.75rem;
      background: var(--mat-sys-surface-container-low, #fff8e1);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      font-size: 0.85rem;
    }
    .bar p {
      margin: 0;
    }
    .bar code {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 0.05rem 0.25rem;
      border-radius: 0.2rem;
      font-size: 0.8rem;
    }
    .layout {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 2fr;
      gap: 0.5rem;
    }
    .input-pane {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.5rem;
      background: var(--mat-sys-surface, #fafafa);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      min-height: 0;
    }
    .input-pane label {
      font-size: 0.85rem;
      font-weight: 500;
    }
    .source {
      flex: 1 1 auto;
      min-height: 200px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.78rem;
      padding: 0.4rem;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.25rem;
      resize: none;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .actions button,
    .file-btn {
      padding: 0.35rem 0.7rem;
      font-size: 0.8rem;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 0.25rem;
      background: var(--mat-sys-surface-container, #fff);
      cursor: pointer;
      user-select: none;
    }
    .file-btn input[type='file'] {
      display: none;
    }
    .actions button:hover:not(:disabled),
    .file-btn:hover {
      background: var(--mat-sys-surface-container-high, #f0f0f0);
    }
    .actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .error {
      padding: 0.4rem 0.6rem;
      background: var(--mat-sys-error-container, #ffe5e5);
      color: var(--mat-sys-on-error-container, #5a1014);
      border-radius: 0.25rem;
      font-size: 0.8rem;
    }
    .warnings {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant, #555);
    }
    .warnings summary {
      cursor: pointer;
    }
    .warnings ul {
      margin: 0.25rem 0 0 1rem;
      padding: 0;
    }
    .render-pane {
      position: relative;
      background: var(--mat-sys-surface-container-low, #fff);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      overflow: hidden;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .placeholder {
      color: var(--mat-sys-on-surface-variant, #888);
      font-size: 0.9rem;
      text-align: center;
      padding: 1rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgViewer {
  protected readonly rawSource = signal<string>('');
  protected readonly doc = signal<SvgDocument | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly warnings = signal<readonly string[]>([]);

  protected onInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.rawSource.set(text);
    this.parse(text);
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file === null) return;
    void file.text().then((text) => {
      this.rawSource.set(text);
      this.parse(text);
    });
    // Reset input value so the same file can be re-selected to re-trigger parse
    (event.target as HTMLInputElement).value = '';
  }

  protected loadExample(): void {
    const example = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="180" height="180" fill="#90caf9" stroke="#1565c0" stroke-width="2"/>
  <circle cx="100" cy="100" r="60" fill="#ffe082" stroke="#ef6c00" stroke-width="2"/>
  <path d="M 60 140 L 100 60 L 140 140 Z" fill="#a5d6a7" stroke="#2e7d32" stroke-width="2"/>
  <text x="100" y="180" text-anchor="middle" font-size="14" fill="#333">SVGEngine viewer</text>
</svg>`;
    this.rawSource.set(example);
    this.parse(example);
  }

  protected clear(): void {
    this.rawSource.set('');
    this.doc.set(null);
    this.error.set(null);
    this.warnings.set([]);
  }

  private parse(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      this.doc.set(null);
      this.error.set(null);
      this.warnings.set([]);
      return;
    }
    const result = svgImporter.import(trimmed);
    if (result.ok) {
      this.doc.set(result.document);
      this.error.set(null);
      this.warnings.set(result.warnings);
    } else {
      this.doc.set(null);
      this.error.set(result.error);
      this.warnings.set([]);
    }
  }
}
