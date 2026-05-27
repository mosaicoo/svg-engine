import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type BoundingBox,
  CommandBus,
  EditorStateService,
  EnsureDefaultPageCommand,
  type SvgNode,
} from 'svg-engine/core';
import {
  ActiveDefsService,
  ActivePageService,
  GradientOverlay,
  GridOverlay,
  GuidesOverlay,
  IsolationFilter,
  IsolationService,
  LayersFilter,
  OutlineFilter,
  PageOverlay,
  resolveSelectableNodeId,
  SELECT_TOOL_ID,
  SvgeCanvasGestures,
  SvgeShellInteractions,
  ToolHostService,
  WorkspaceBackground,
} from 'svg-engine/edit';
import { SvgeRenderer } from 'svg-engine/render';
import { CONTEXT_MENU_SLOT, SvgeContextMenuTrigger } from '../context-menu';
import { SvgeEffectsPanel } from '../effects-panel';
import { SvgeGradientEditor } from '../gradient-editor';
import { SvgeInspector } from '../inspector';
import { SvgeIsolationBreadcrumb } from '../isolation-breadcrumb';
import { LayersPanel } from '../layers-panel';
import { SvgeLibrariesPanel } from '../libraries-panel';
import { SnapshotsPanel } from '../snapshots-panel';
import { SvgeAssetExportPanel } from '../asset-export-panel';
import { SvgeMenuBar } from '../menu-bar';
import { SvgePagesPanel } from '../pages-panel';
import { SvgeThemeToggle } from '../theme-toggle';
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
    SvgeAssetExportPanel,
    SvgeMenuBar,
    SvgePagesPanel,
    SvgeThemeToggle,
    SvgeToolbar,
    SvgeToolOptions,
    SvgeToolsPalette,
    SvgeStatusBar,
    LayersPanel,
    SnapshotsPanel,
    SvgeInspector,
    SvgeGradientEditor,
    SvgeEffectsPanel,
    SvgeIsolationBreadcrumb,
    SvgeLibrariesPanel,
    SvgePanelGroup,
    SvgePanelGroupTab,
  ],
  template: `
    <div class="menu-row">
      <svge-menu-bar />
      <!--
        PRO-GAP G5 — floating theme toggle on the menu-bar's right
        side. Per the UX answer: "Botão flutuante no canto da menu
        bar (estilo VSCode)" — always visible, 1-click cycle through
        Light → Dark → System. The .menu-row already uses flex with
        the title pinned via margin-left:auto; the toggle slots
        between menu items and the title so the right edge reads
        "[theme] [title]" — title remains as the rightmost element.
      -->
      <svge-theme-toggle class="theme-toggle" />
      <span class="title" aria-hidden="true">{{ title() ?? 'SVGEngine Pro' }}</span>
    </div>
    <div class="toolbar-row">
      <svge-toolbar slot="toolbar.main" />
    </div>
    <svge-tool-options class="tool-options-row" [showPlaceholder]="true" />
    <!--
      Isolation breadcrumb (post-PAGES-FIX-4 polish). Self-gated via
      @if(visible()) on the component, so zero footprint when no
      isolation is active. Gives the Pro shell parity with the
      custom-editor route which had it wired since D-039 Phase C.
      Sits between tool-options and pages strip so the breadcrumb
      reads in the natural top-to-bottom flow.
    -->
    <svge-isolation-breadcrumb class="iso-breadcrumb-row" />
    <!--
      D-079 / PAGES-C — Pages tab strip. Auto-hides when the document
      has zero pages (PagesService.hasPages() === false), so legacy
      single-root documents render the shell unchanged. When pages
      exist, the strip sits below the tool options bar — Figma/
      Affinity convention (tabs immediately above the canvas).
    -->
    <svge-pages-panel class="pages-row" [alwaysShow]="true" />
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
            <!--
              PAGES-FIX-4: when a page is active, pass its GroupNode
              as the explicit [root] input so the panel lists the
              page's CHILDREN as top-level entries (no separate
              "Page 1" wrapper row). The page itself is the implicit
              scope; users navigate the artboard contents directly,
              matching Figma / Sketch frame-as-context model.
              Null (no page) falls back to state.document().root.
            -->
            <svge-layers-panel [root]="layersPanelRoot()" />
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
          <!--
            D-077 — Asset Export tab. Pairs with the per-editor
            AssetExportRegistry + AssetExportRunner: lists the user's
            export recipes and runs them in a batch download. Lives
            beside Layers/Properties/Appearance so the export workflow
            is reachable without leaving the canvas (Illustrator's
            Export Persona / Figma Export panel convention).
          -->
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="export"
            label="Export"
            icon="download"
          >
            <svge-asset-export-panel />
          </ng-template>
        </svge-panel-group>
      </aside>
    </div>
    <svge-status-bar class="status-row" />
  `,
  styles: `
    :host {
      display: grid;
      /* 6 rows: menu | toolbar | tool-options | pages (D-079) | main(1fr) | status.
         pages-row auto-collapses to 0 height when SvgePagesPanel renders
         nothing (legacy docs with zero pages) — no visual offset. */
      grid-template-rows: auto auto auto auto 1fr auto;
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
    /* PRO-GAP G5 — push the theme toggle (and the title that follows)
       to the right edge of the menu-bar. The toggle sits LEFT of the
       title so the title remains the visual anchor on the far right. */
    .menu-row .theme-toggle {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
    }
    .menu-row .title {
      font-size: 13px;
      font-weight: 500;
      opacity: 0.7;
      padding-left: 4px;
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
    .pages-row {
      /* No rules — svge-pages-panel paints its own surface + bottom
         border inside .pages-bar when content is visible; we keep the
         selector for parity with sibling rows and for consumer
         overrides via ::ng-deep. */
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
  // D-079 / PAGES-C — when the document has at least one page,
  // resolvedTree/ViewBox prefer the active page's GroupNode +
  // pageViewBox. Legacy docs without pages keep the full-document
  // behavior (treeForRendering / viewBoxForRendering fall back to
  // root + document.viewBox).
  private readonly activePage = inject(ActivePageService);
  private readonly bus = inject(CommandBus);
  private readonly toolHost = inject(ToolHostService);

  /**
   * **PAGES-FIX-2** — on mount:
   *
   * 1. Bootstrap `Page 1` (idempotent; migrates root-level shapes if any).
   *    Calls {@link EnsureDefaultPageCommand} so the multi-page workflow
   *    is active immediately and drawing tools have a valid parent.
   * 2. Activate the **Select** tool by default — without this, the
   *    tools palette opens with no active tool and the cursor doesn't
   *    interact with the canvas as expected (Illustrator/Affinity/
   *    Figma all default to Select on open).
   *
   * Wrapped in a microtask so it runs AFTER all the scope providers
   * have settled (Angular's DI graph is fully resolved by then).
   */
  constructor() {
    queueMicrotask(() => {
      this.bus.dispatch(new EnsureDefaultPageCommand());
      if (this.toolHost.activeId() === null) {
        this.toolHost.activate(SELECT_TOOL_ID);
      }
    });
  }

  /**
   * **D-040** — Dynamic context-menu slot resolver. Right-click on a
   * shape opens `'context.node'`; right-click on the canvas background
   * opens `'context.canvas'`. Arrow-function to preserve `this`.
   */
  /**
   * **PAGES-FIX-4** — feeds `<svge-layers-panel [root]>`. Returns the
   * active page's GroupNode when present (panel shows its children as
   * top-level entries), otherwise null (panel falls back to
   * `state.document().root`).
   */
  protected readonly layersPanelRoot = computed<SvgNode | null>(() => {
    const page = this.activePage.activePage();
    return page as unknown as SvgNode | null;
  });

  protected readonly contextMenuResolver = (event: MouseEvent): string => {
    const rootId = this.state.document().root.id;
    const activePageId = this.activePage.activePageId();
    const id = resolveSelectableNodeId(event, {
      mode: 'group',
      rootId,
      // PAGES-FIX-3: active page acts as implicit isolation scope so
      // clicks on shapes resolve to the shape (not the page).
      isolationRootId: this.isolation.isolationRootId() ?? activePageId,
    });
    // Page itself counts as canvas for the context-menu (the page IS
    // the artboard, not a user object). Document root + null map to canvas too.
    const isCanvasClick = id === null || id === rootId || id === activePageId;
    return isCanvasClick ? CONTEXT_MENU_SLOT.CANVAS : CONTEXT_MENU_SLOT.NODE;
  };

  /** Optional document override — same semantics as `<svge-editor>`. */
  readonly tree = input<SvgNode | null>(null);
  readonly viewBox = input<BoundingBox | null>(null);
  readonly title = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);

  /** Slot id for the right-click context menu. Default `'context.canvas'`. */
  readonly contextMenuSlot = input<string>('context.canvas');

  protected readonly resolvedTree = computed<SvgNode>(() => {
    // Consumer-supplied [tree] always wins (advanced use-cases).
    const explicit = this.tree();
    if (explicit !== null) return explicit;
    // D-079: when a page is active, render only its subtree.
    // ActivePageService.treeForRendering falls back to document.root
    // when no page exists (back-compat with legacy docs).
    return this.activePage.treeForRendering();
  });
  protected readonly resolvedViewBox = computed<BoundingBox>(() => {
    const explicit = this.viewBox();
    if (explicit !== null) return explicit;
    return this.activePage.viewBoxForRendering();
  });
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
