import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CommandBus,
  createEllipse,
  createRect,
  EditorStateService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { Marquee, RotationPivot, SelectionOverlay, SnapGuides } from 'svg-engine/edit';
import { SvgeEditor } from 'svg-engine/ui';

/**
 * `<svge-editor>` **canvas-only** demo — modo 4 da matriz de consumo Mosaicoo
 * (D-037). Equivale ao modo 3c (Shell parcial — ambos flags `false`) pré-
 * configurado, sem checkboxes interativos.
 *
 * **Caso de uso típico Mosaicoo**: SVGEngine embedado em painéis menores
 * de outras apps Mosaicoo que já têm seu próprio chrome (toolbar / status
 * bar / sidebar do app hospedeiro). O canvas-only oferece só a área de
 * edição, sem nenhuma decoração visual extra do shell.
 *
 * **Diferença para o modo headless puro (/)**:
 * - Headless puro = consumer monta `<svge-renderer>` + overlays + DI à mão,
 *   ganha zero bundle Material.
 * - Canvas-only = consumer usa `<svge-editor>` com flags off, paga o custo
 *   de Material (mesmo sem renderizar toolbar/status) mas ganha simplicidade
 *   (1 tag em vez de wiring manual de overlays + background + canvas
 *   gestures + workspace).
 *
 * Trade-off: simplicidade vs. bundle. Mosaicoo escolhe canvas-only quando
 * a app hospedeira já tem Material (overhead zero adicional) e quer o
 * canvas com mínimo wiring.
 */
@Component({
  selector: 'app-pg-shell-canvas-only',
  standalone: true,
  imports: [SvgeEditor, SelectionOverlay, RotationPivot, Marquee, SnapGuides, RouterLink],
  template: `
    <header class="bar">
      <p>
        <strong>Shell canvas-only:</strong>
        <code>&lt;svge-editor [showToolbar]="false" [showStatusBar]="false"&gt;</code> — modo 4 da
        matriz Mosaicoo. Comparar com <a routerLink="/">/</a> (headless puro, zero Material) e
        <a routerLink="/shell-partial-demo">/shell-partial-demo</a> (mesmo modo, checkboxes
        interativos).
      </p>
    </header>
    <div class="editor-area">
      <svge-editor
        [title]="'Canvas-only embed'"
        [showToolbar]="false"
        [showStatusBar]="false"
        [showContextMenu]="true"
      >
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
    .editor-area {
      flex: 1 1 auto;
      min-height: 0;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellCanvasOnly {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  constructor() {
    queueMicrotask(() => {
      const root = this.state.document().root;
      if (root.type === 'group' && root.children.length === 0) {
        this.bus.dispatch(
          new InsertNodeCommand(
            root.id,
            createRect(
              { x: 80, y: 60, width: 160, height: 100 },
              { style: { fill: '#90caf9', stroke: '#1565c0', strokeWidth: 1 } },
            ),
          ),
        );
        this.bus.dispatch(
          new InsertNodeCommand(
            root.id,
            createEllipse(
              { cx: 360, cy: 200, rx: 60, ry: 60 },
              { style: { fill: '#ffe082', stroke: '#ef6c00', strokeWidth: 1 } },
            ),
          ),
        );
      }
    });
  }
}
