import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { type BoundingBox, EditorStateService, type SvgNode } from 'svg-engine/core';
import {
  GridOverlay,
  IsolationService,
  OutlineFilter,
  PageOverlay,
  resolveSelectableNodeId,
  SvgeCanvasGestures,
  SvgeShellInteractions,
  WorkspaceBackground,
} from 'svg-engine/edit';
import { SvgeRenderer } from 'svg-engine/render';
import { CONTEXT_MENU_SLOT, SvgeContextMenuTrigger } from '../context-menu';
import { SvgeInspector } from '../inspector';
import { LayersPanel } from '../layers-panel';
import { SvgeMenuBar } from '../menu-bar';
import { SvgeRulers } from '../rulers';
import { SvgeStatusBar } from '../status-bar';
import { SvgeToolbar } from '../toolbar';
import { SvgeToolOptions } from '../tool-options';
import { SvgeToolsPalette } from '../tools-palette';

/**
 * **`<svge-shell-pro>` — composição profissional definitiva** (Sprint
 * Pro-Editor Phase 4, D-038). Junta TODAS as peças do editor
 * profissional num layout dockable estilo Illustrator / Affinity / Inkscape:
 *
 * ```
 * ┌──────────────────────────────────────────────────────────┐
 * │ <svge-menu-bar>                                          │  ← top
 * ├──────────────────────────────────────────────────────────┤
 * │ <svge-toolbar slot="toolbar.main"> (plugin contributions)│  ← toolbar
 * ├──────────────────────────────────────────────────────────┤
 * │ <svge-tool-options> (context-sensitive per active tool)  │  ← tool options
 * ├────┬────────────────────────────────────┬────────────────┤
 * │T   │                                    │ <svge-layers-> │
 * │O   │  <svge-renderer>                   │   panel        │
 * │O   │  + projected overlays              │                │
 * │L   │  + page overlay                    ├────────────────┤
 * │S   │  + right-click context menu        │ <svge-inspect> │
 * │    │                                    │                │
 * ├────┴────────────────────────────────────┴────────────────┤
 * │ <svge-status-bar>                                        │  ← status
 * └──────────────────────────────────────────────────────────┘
 * ```
 *
 * **Diferença de `<svge-editor>`**:
 *
 * | Aspecto       | `<svge-editor>` (Bloco 4a + D-034/035/038 opt-in) | `<svge-shell-pro>` (D-038 Phase 4) |
 * | ------------- | ------------------------------------------------- | ---------------------------------- |
 * | Defaults      | toolbar + canvas + status (D-037 modes 2-4)       | TUDO ativo (defaults profissionais) |
 * | Layout        | flexbox vertical simples                          | CSS grid + sidebars dockáveis      |
 * | Tools palette | ❌                                                | ✅ esquerda                         |
 * | Layers panel  | ❌                                                | ✅ direita topo                     |
 * | Inspector     | ❌                                                | ✅ direita baixo                    |
 * | Menu bar      | opt-in via `[showMenuBar]`                        | sempre on                          |
 *
 * `<svge-editor>` **continua existindo** intocado — é o shell drop-in
 * minimalista para apps Mosaicoo que não querem o chrome completo
 * (canvas-only, shell-completo, shell-parcial seguem suportados via
 * `<svge-editor>` + flags). `<svge-shell-pro>` é a opção "editor
 * profissional drop-in" para apps que querem Illustrator-grade.
 *
 * **`<ng-content>`**: overlays projetados (selection / marquee / pivot /
 * snap / pen / anchor) entram dentro do `<svge-renderer>` exatamente
 * como em `<svge-editor>` — a API de projeção é idêntica, facilita
 * migração entre os dois shells.
 *
 * **Inputs**: subset dos de `<svge-editor>` (`tree`, `viewBox`, `title`,
 * `ariaLabel`). Não expõe flags individuais (`showToolbar` etc.) — quem
 * quiser desligar peças usa `<svge-editor>` com flags ou compõe à mão.
 * Esta é a opinião do shell-pro: vem com tudo, ou usa outra coisa.
 *
 * **Headless boundary (D-017)**: vive em `svg-engine/ui` (única entry
 * que pode importar Material). Modo 1 (headless puro) NÃO importa esse
 * componente — segue intocado.
 */
@Component({
  selector: 'svge-shell-pro',
  standalone: true,
  imports: [
    SvgeRenderer,
    WorkspaceBackground,
    PageOverlay,
    GridOverlay,
    OutlineFilter,
    SvgeRulers,
    SvgeCanvasGestures,
    SvgeShellInteractions,
    SvgeContextMenuTrigger,
    SvgeMenuBar,
    SvgeToolbar,
    SvgeToolOptions,
    SvgeToolsPalette,
    SvgeStatusBar,
    LayersPanel,
    SvgeInspector,
  ],
  template: `
    <div class="menu-row">
      <svge-menu-bar />
      <span class="title" aria-hidden="true">{{ title() ?? 'SVGEngine Pro' }}</span>
    </div>
    <div class="toolbar-row">
      <svge-toolbar slot="toolbar.main" />
    </div>
    <svge-tool-options class="tool-options-row" [showPlaceholder]="true" />
    <div class="main">
      <aside class="tools-side" aria-label="Tools palette">
        <svge-tools-palette />
      </aside>
      <div
        class="canvas-cell"
        svgeCanvasGestures
        svgeShellInteractions
        [svgeContextMenu]="contextMenuSlot()"
        [svgeContextMenuResolver]="contextMenuResolver"
      >
        <svge-workspace-background>
          <svge-renderer
            svgeOutlineFilter
            [tree]="resolvedTree()"
            [viewBox]="resolvedViewBox()"
            [defs]="resolvedDefs()"
            [ariaLabel]="ariaLabel() ?? 'Editable SVG document'"
          >
            <!--
              Page marker — MUST carry the literal svgeBehind
              attribute. Angular content projection is compile-time so
              host bindings on PageOverlay don't help here. See the
              detailed explanation in editor.component.ts (sibling
              shell) and docs/08-historico-de-alteracoes.md for the
              fix history.
            -->
            <svg:g svgePageOverlay svgeBehind></svg:g>
            <!--
              Grid overlay — auto-conditional on WorkspaceService.grid().enabled
              (toggled via View > Show Grid menu item). svgeBehind needed
              for same reason as PageOverlay (compile-time projection).
            -->
            <svg:g svgeGridOverlay svgeBehind></svg:g>
            <ng-content />
          </svge-renderer>
        </svge-workspace-background>
        <!--
          Rulers overlay — internally conditional on
          WorkspaceService.rulers().enabled (toggled via View > Show
          Rulers menu item).
        -->
        <svge-rulers />
      </div>
      <aside class="right-side" aria-label="Layers and inspector panels">
        <section class="panel layers-section">
          <h3 class="panel-title">Layers</h3>
          <div class="panel-body">
            <svge-layers-panel />
          </div>
        </section>
        <section class="panel inspector-section">
          <h3 class="panel-title">Properties</h3>
          <div class="panel-body">
            <svge-inspector />
          </div>
        </section>
      </aside>
    </div>
    <svge-status-bar class="status-row" />
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto auto auto 1fr auto;
      width: 100%;
      height: 100%;
      min-height: 0;
      background: var(--mat-sys-surface-container-lowest, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    .menu-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 2px 0.5rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface, transparent);
    }
    .menu-row .title {
      margin-left: auto;
      font-size: 13px;
      font-weight: 500;
      opacity: 0.7;
    }
    .toolbar-row {
      display: flex;
      align-items: center;
      padding: 2px 0.5rem;
      min-height: 36px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface, transparent);
    }
    .tool-options-row {
      /* svge-tool-options already paints its own surface + border-bottom */
    }
    .main {
      display: grid;
      grid-template-columns: auto 1fr 280px;
      min-height: 0;
      overflow: hidden;
    }
    .tools-side {
      min-width: 44px;
    }
    .canvas-cell {
      position: relative;
      overflow: hidden;
      background: var(--mat-sys-surface-container-low, transparent);
    }
    .canvas-cell > * {
      position: absolute;
      inset: 0;
    }
    .right-side {
      display: grid;
      grid-template-rows: 1fr 1fr;
      min-height: 0;
      border-left: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface, transparent);
    }
    .panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .panel + .panel {
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .panel-title {
      margin: 0;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.65;
      background: var(--mat-sys-surface-container-low, transparent);
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .panel-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
    .status-row {
      /* svge-status-bar paints its own border-top + background */
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeShellPro {
  private readonly state = inject(EditorStateService);
  private readonly isolation = inject(IsolationService);

  /**
   * **D-040** — Dynamic context-menu slot resolver. Right-click on a
   * shape opens `'context.node'`; right-click on the canvas background
   * opens `'context.canvas'`. Arrow-function to preserve `this`.
   */
  protected readonly contextMenuResolver = (event: MouseEvent): string => {
    const rootId = this.state.document().root.id;
    const id = resolveSelectableNodeId(event, {
      mode: 'group',
      rootId,
      isolationRootId: this.isolation.isolationRootId(),
    });
    return id !== null && id !== rootId ? CONTEXT_MENU_SLOT.NODE : CONTEXT_MENU_SLOT.CANVAS;
  };

  /** Optional document override — same semantics as `<svge-editor>`. */
  readonly tree = input<SvgNode | null>(null);
  readonly viewBox = input<BoundingBox | null>(null);
  readonly title = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);

  /** Slot id for the right-click context menu. Default `'context.canvas'`. */
  readonly contextMenuSlot = input<string>('context.canvas');

  protected readonly resolvedTree = computed<SvgNode>(
    () => this.tree() ?? this.state.document().root,
  );
  protected readonly resolvedViewBox = computed<BoundingBox>(
    () => this.viewBox() ?? this.state.document().viewBox,
  );
  protected readonly resolvedDefs = computed<string | null>(
    () => this.state.document().defs ?? null,
  );
}
