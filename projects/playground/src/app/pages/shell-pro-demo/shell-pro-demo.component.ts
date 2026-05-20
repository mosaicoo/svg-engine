import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CommandBus,
  createEllipse,
  createRect,
  EditorStateService,
  InsertNodeCommand,
} from 'svg-engine/core';
import {
  AnchorOverlay,
  Marquee,
  RotationPivot,
  SelectionOverlay,
  SnapGuides,
} from 'svg-engine/edit';
import { SvgeShellPro } from 'svg-engine/ui';

/**
 * **`<svge-shell-pro>` showcase route** — D-038 Phase 4 final.
 *
 * Layout profissional completo: menu bar, toolbar (built-ins + plugin
 * contributions), tool options, tools palette à esquerda, canvas no
 * centro, layers panel + inspector à direita, status bar no rodapé,
 * context menu right-click. Equivalente a Illustrator / Affinity /
 * Inkscape em termos de chrome.
 *
 * **Como validar manualmente**:
 *
 * - Topo: clique em File / Edit / Help → dropdowns aparecem
 *   (`menu.*` slots populados pelo `demoMenuBarPlugin`).
 * - Edit > Transform → submenu cascading funciona.
 * - Tool options bar mostra "No options for this tool" para Select
 *   (placeholder ativo); pressione **K** (Stamp Tool) → bar mostra
 *   radius + color togglers; click no canvas dropa círculo.
 * - Tools palette à esquerda: clique nos ícones para trocar tool ativo
 *   (Select, Pen, Pencil, Stamp, Shapes, Text — todos plugins
 *   registrados em app.config.ts).
 * - Right-click no canvas → context menu (Paste / Select All / Zoom).
 * - Status bar no rodapé: tool ativa, cursor, zoom, etc.
 * - Layers + Inspector painéis à direita.
 */
@Component({
  selector: 'app-pg-shell-pro-demo',
  standalone: true,
  imports: [
    SvgeShellPro,
    SelectionOverlay,
    RotationPivot,
    AnchorOverlay,
    Marquee,
    SnapGuides,
    RouterLink,
  ],
  template: `
    <header class="bar">
      <p>
        <strong>Shell profissional</strong> — composição completa estilo Illustrator/Affinity (D-038
        Phase 4): menu bar + toolbar + tool options + tools palette + canvas + context menu + layers
        + inspector + status bar. Compare com <a routerLink="/shell-demo">/shell-demo</a> (shell
        completo mas minimal), <a routerLink="/shell-partial-demo">/shell-partial-demo</a> (toggling
        individual) e <a routerLink="/">/</a> (headless puro).
      </p>
    </header>
    <div class="editor-area">
      <svge-shell-pro [title]="'SVGEngine Pro'">
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeAnchorOverlay></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
      </svge-shell-pro>
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
export class ShellProDemo {
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
