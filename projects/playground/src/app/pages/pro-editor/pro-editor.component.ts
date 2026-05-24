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
  InlineTextEditor,
  Marquee,
  PenOverlay,
  PencilOverlay,
  provideSvgEngineEditorScope,
  RotationPivot,
  SelectionOverlay,
  ShapeOverlay,
  SnapGuides,
  SymbolSprayerOverlay,
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
 *   (`menu.*` slots populados pelo `builtinMenuContributionsPlugin`
 *   — D-043 substituiu o antigo `demoMenuBarPlugin` que era só mocks).
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
  selector: 'app-pg-pro-editor',
  standalone: true,
  imports: [
    SvgeShellPro,
    SelectionOverlay,
    RotationPivot,
    AnchorOverlay,
    Marquee,
    SnapGuides,
    PenOverlay,
    PencilOverlay,
    ShapeOverlay,
    SymbolSprayerOverlay,
    InlineTextEditor,
    RouterLink,
  ],
  // D-042: route-scoped editor state — independent document per visit.
  providers: [provideSvgEngineEditorScope()],
  template: `
    <header class="bar">
      <p>
        <strong>Editor profissional</strong> — composição completa estilo Illustrator/Affinity
        (D-038 Phase 4): menu bar + toolbar + tool options + tools palette + canvas + context menu +
        layers + inspector + status bar. Compare com
        <a routerLink="/basic-editor">/basic-editor</a> (drop-in básico),
        <a routerLink="/modular-editor">/modular-editor</a> (configurador interativo) e
        <a routerLink="/custom-editor">/custom-editor</a> (editor customizado sem shell).
      </p>
    </header>
    <div class="editor-area">
      <svge-shell-pro [title]="'SVGEngine Pro'">
        <!--
          Overlays projetados no slot do svge-renderer. Ordem = z-order
          (mais tarde = mais à frente). Espelha o conjunto completo do
          /custom-editor para que o pro-editor tenha paridade total de
          UX — sem isso, Pen/Pencil/Shape/Text não mostram nenhum
          feedback durante a interação, dando a impressão de que as
          ferramentas estão quebradas.
        -->
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeAnchorOverlay></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
        <!-- Pen tool: rubber band, in-progress anchors + handles, preview
             da curva durante o press-drag (D-046 Pen review 2026-05-22). -->
        <svg:g svgePenOverlay></svg:g>
        <!-- Pencil tool: traçado em tempo real durante o desenho à mão
             livre (D-046 Pencil review 2026-05-22). -->
        <svg:g svgePencilOverlay></svg:g>
        <!-- Shape tools (Rectangle / Ellipse / Polygon): preview tracejado
             do bounding box / polígono durante o press-drag. -->
        <svg:g svgeShapeOverlay></svg:g>
        <!-- D-063c — Symbol Sprayer live preview: instâncias ghosted
             aparecem em tempo real enquanto o usuário arrasta; limpa
             em pointer-up quando o batch command efetiva no doc. -->
        <svg:g svgeSymbolSprayerOverlay></svg:g>
        <!-- Inline text editor: foreignObject + contentEditable que abre
             quando InlineTextEditorService.editingId é não-nulo.
             Renderiza nada caso contrário. DEVE vir por último para o
             surface de edição ficar acima de todos os outros overlays. -->
        <svg:g svgeInlineTextEditor></svg:g>
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
export class ProEditor {
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
