import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { type BoundingBox, EditorStateService, type SvgNode } from 'svg-engine/core';
import {
  ActiveDefsService,
  GradientOverlay,
  GridOverlay,
  GuidesOverlay,
  IsolationFilter,
  IsolationService,
  LayersFilter,
  OutlineFilter,
  PageOverlay,
  resolveSelectableNodeId,
  SvgeCanvasGestures,
  SvgeShellInteractions,
  WorkspaceBackground,
} from 'svg-engine/edit';
import { SvgeRenderer } from 'svg-engine/render';
import { CONTEXT_MENU_SLOT, SvgeContextMenuTrigger } from '../context-menu';
import { SvgeEffectsPanel } from '../effects-panel';
import { SvgeGradientEditor } from '../gradient-editor';
import { SvgeInspector } from '../inspector';
import { LayersPanel } from '../layers-panel';
import { SvgeLibrariesPanel } from '../libraries-panel';
import { SnapshotsPanel } from '../snapshots-panel';
import { SvgeMenuBar } from '../menu-bar';
import { SvgePanelGroup, SvgePanelGroupTab } from '../panel-group';
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
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ <svge-menu-bar>                                                  │  ← top
 * ├─────────────────────────────────────────────────────────────────┤
 * │ <svge-toolbar slot="toolbar.main"> (plugin contributions)        │  ← toolbar
 * ├─────────────────────────────────────────────────────────────────┤
 * │ <svge-tool-options> (context-sensitive per active tool)          │  ← tool options
 * ├────┬────────┬─────────────────────────────┬────────────────────┤
 * │T   │ Lib    │                             │[Layers│Props│Appea]│
 * │O   │ rari   │  <svge-renderer>            │ ──────────────────  │
 * │O   │ es     │  + projected overlays       │                    │
 * │L   │ (D-048)│  + page overlay             │ (active tab body — │
 * │S   │ tabs   │  + right-click context menu │  ocupa 100% da     │
 * │    │        │                             │  altura do rail)   │
 * ├────┴────────┴─────────────────────────────┴────────────────────┤
 * │ <svge-status-bar>                                                │  ← status
 * └─────────────────────────────────────────────────────────────────┘
 *
 * **D-061 follow-up 3**: right rail é UM único `<svge-panel-group>`
 * com 3 abas (Layers | Properties | Appearance). Antes eram 3
 * grupos empilhados verticalmente (1/3 da altura cada); agora o
 * painel ativo ocupa o rail inteiro, troca por click na aba.
 * Padrão Photoshop / Figma right panel.
 * ```
 *
 * **Diferença de `<svge-editor>`**:
 *
 * | Aspecto       | `<svge-editor>` (Bloco 4a + D-034/035/038 opt-in) | `<svge-shell-pro>` (D-038 Phase 4 + D-047/048) |
 * | ------------- | ------------------------------------------------- | ---------------------------------- |
 * | Defaults      | toolbar + canvas + status (D-037 modes 2-4)       | TUDO ativo (defaults profissionais) |
 * | Layout        | flexbox vertical simples                          | CSS grid 4-col + sidebars dockáveis |
 * | Tools palette | ❌                                                | ✅ esquerda                         |
 * | Libraries     | ❌                                                | ✅ 2ª coluna (D-048)                |
 * | Layers panel  | ❌                                                | ✅ direita 1/3                      |
 * | Inspector     | ❌                                                | ✅ direita 2/3                      |
 * | Effects       | ❌                                                | ✅ direita 3/3 (D-047 pipeline)     |
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
    GuidesOverlay,
    OutlineFilter,
    LayersFilter,
    IsolationFilter,
    GradientOverlay,
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
    SnapshotsPanel,
    SvgeInspector,
    SvgeGradientEditor,
    SvgeEffectsPanel,
    SvgeLibrariesPanel,
    SvgePanelGroup,
    SvgePanelGroupTab,
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
      <!--
        Libraries column (D-048) — Illustrator-style "Libraries" rail
        between tools palette and canvas. Self-hides nothing: the
        component shows section headers even when registries are empty
        (consumers who don't install any *Plugin will see "empty"
        sections, which is the intended hint to provision them).
      -->
      <aside class="libraries-side" aria-label="Libraries panel">
        <svge-libraries-panel />
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
            svgeLayersFilter
            svgeIsolationFilter
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
            <!--
              Guides overlay — renders horizontal/vertical reference
              lines from WorkspaceService.guides(). Stays in the FRONT
              projection slot (above content + page + grid) so dragged
              guides remain visible. Without this, drag-from-ruler
              creates the state but nothing draws it — the visual
              bug previously isolated to custom-editor which had this
              line baked into its template.
            -->
            <svg:g svgeGuidesOverlay></svg:g>
            <!-- D-058: gradient inline editor overlay (auto-hides). -->
            <svg:g svgeGradientOverlay></svg:g>
          </svge-renderer>
        </svge-workspace-background>
        <!--
          Rulers overlay — internally conditional on
          WorkspaceService.rulers().enabled (toggled via View > Show
          Rulers menu item).
        -->
        <svge-rulers />
      </div>
      <!--
        Right rail (D-061 follow-up 3) — UM único panel-group com 3
        abas (Layers | Properties | Appearance). Antes eram 3 grupos
        empilhados verticalmente; usuário pediu pra agrupar tudo num
        container só pra ver UM painel por vez, com mais altura útil
        e troca rápida via aba (padrão Photoshop / Figma right panel).
        Painéis internos intactos — só remontados num único contêiner.
      -->
      <aside class="right-side" aria-label="Layers, properties and appearance panels">
        <svge-panel-group class="rs-group">
          <ng-template svgePanelGroupTab svgePanelGroupTabId="layers" label="Layers" icon="layers">
            <svge-layers-panel />
          </ng-template>
          <!--
            D-073 — History snapshots tab. Sits next to Layers because
            both are document-scope navigators: Layers shows what
            exists right now; History shows what existed before.
            Photoshop / Figma collocate them similarly.
          -->
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="history"
            label="History"
            icon="history"
          >
            <svge-snapshots-panel />
          </ng-template>
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="properties"
            label="Properties"
            icon="tune"
          >
            <svge-inspector />
            <!--
              D-058 — Gradient inline editor. Auto-hides via its
              internal active() computed when selection has no gradient
              fill, so it sits inert when irrelevant.
            -->
            <svge-gradient-editor />
          </ng-template>
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="appearance"
            label="Appearance"
            icon="auto_awesome"
          >
            <svge-effects-panel />
          </ng-template>
        </svge-panel-group>
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
      /* No rules — svge-tool-options already paints its own surface +
         bottom border; we keep the selector so the grid row tracking
         in the host doesn't shift if a consumer overrides via ::ng-deep. */
    }
    .main {
      display: grid;
      /* 4-column layout (D-048):
       * tools-side (auto, ~44px) | libraries-side (220px) | canvas (1fr) | right-side (280px)
       */
      grid-template-columns: auto 220px 1fr 280px;
      min-height: 0;
      overflow: hidden;
    }
    .tools-side {
      min-width: 44px;
    }
    .libraries-side {
      min-width: 0;
      overflow: auto;
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface, transparent);
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
      display: flex;
      flex-direction: column;
      /* D-061 follow-up 3 — single tabbed container. The lone
       * panel-group expands to fill the full rail height; tabs
       * (Layers | Properties | Appearance) trocam o body. Cada
       * painel ganha 100% da altura quando ativo (vs 33% antes). */
      min-height: 0;
      border-left: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface, transparent);
    }
    .rs-group {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .status-row {
      /* No rules — svge-status-bar paints its own top border + background;
         we keep the selector so the grid row tracking in the host doesn't
         shift if a consumer overrides via ::ng-deep. */
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeShellPro {
  private readonly state = inject(EditorStateService);
  private readonly isolation = inject(IsolationService);
  // D-058 export fix — central composer for dynamic <defs> (gradients,
  // patterns, effects, chains, clipPaths, masks). Same service feeds
  // the exporter so the exported SVG matches the canvas paint.
  private readonly activeDefs = inject(ActiveDefsService);

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
  /**
   * Effective `<defs>` fragment fed to `<svge-renderer>`. Delegates to
   * `ActiveDefsService.buildExportDefs()` — same composer the exporter
   * uses, so canvas paint and exported file see identical defs.
   */
  protected readonly resolvedDefs = computed<string | null>(() => {
    const merged = this.activeDefs.buildExportDefs(this.state.document().defs);
    return merged.length > 0 ? merged : null;
  });
}
