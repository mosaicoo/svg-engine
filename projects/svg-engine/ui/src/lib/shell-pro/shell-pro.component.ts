import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  applyAnimationToTree,
  type BoundingBox,
  CommandBus,
  EditorStateService,
  EnsureDefaultPageCommand,
  type SvgNode,
} from 'svg-engine/core';
import {
  ActiveDefsService,
  ActivePageService,
  AnimationService,
  GradientOverlay,
  GridOverlay,
  GuidesOverlay,
  IsolationFilter,
  IsolationService,
  LayersFilter,
  OutlineFilter,
  PageOverlay,
  PlaybackService,
  organizationalContainerPredicate,
  resolveSelectableNodeId,
  SvgePageSelectionOverlay,
  SELECT_TOOL_ID,
  SvgeCanvasGestures,
  SvgeShellInteractions,
  ToolHostService,
  WorkspaceBackground,
  WorkspaceService,
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
import { SvgeTimeline } from '../timeline';
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
    SvgePageSelectionOverlay,
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
    SvgeTimeline,
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
      <aside
        class="libraries-side"
        [class.is-collapsed]="leftCollapsed()"
        aria-label="Libraries panel"
      >
        <svge-libraries-panel
          [collapsed]="leftCollapsed()"
          (collapsedChange)="setLeftCollapsed($event)"
        />
      </aside>
      <div
        class="canvas-cell"
        [class.with-rulers]="ws.rulers().enabled"
        svgeCanvasGestures
        svgeShellInteractions
        [svgeContextMenu]="contextMenuSlot()"
        [svgeContextMenuResolver]="contextMenuResolver"
      >
        <!--
          Isolation breadcrumb (Affinity/Illustrator-style overlay) —
          mirrors the custom-editor positioning where the breadcrumb
          sits ABOVE the canvas (absolute, top: 0, z-index: 3) instead
          of pushing the canvas down. Self-gated via @if(visible())
          inside the component, so zero footprint when no isolation
          is active. Must be the FIRST child of canvas-cell so it
          paints on top of the renderer / workspace-background.
        -->
        <svge-isolation-breadcrumb class="iso-breadcrumb-overlay" />
        <!--
          **PAGES-REFACTOR follow-up #8** — D-079 pages tab strip,
          repositioned as a BOTTOM overlay inside the canvas (mirror of
          the breadcrumb at top). Was previously its own grid row above
          the canvas which permanently stole vertical space; now it
          floats over the bottom of the canvas — same architectural
          pattern as the isolation breadcrumb. The strip still
          auto-collapses (alwaysShow=true keeps the "+" button always
          available; the tab list grows downward only when pages exist),
          so the overlay claims minimal vertical real estate.
        -->
        <svge-pages-panel class="pages-overlay" [alwaysShow]="true" />
        <svge-workspace-background>
          <svge-renderer
            svgeLayersFilter
            svgeIsolationFilter
            svgeOutlineFilter
            [tree]="animatedTree()"
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
            <!--
              **PAGES-REFACTOR Fase 2** — page selection overlay
              (corner brackets + floating label + move handle).
              Self-gated: renders nothing when no page is selected.
              Sits AFTER the gradient overlay so the brackets paint
              on top of everything (including dragged anchors and
              gradient stops) for a crisp affordance.
            -->
            <svg:g svgePageSelectionOverlay></svg:g>
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
      <aside
        class="right-side"
        [class.is-collapsed]="rightCollapsed()"
        aria-label="Layers, properties and appearance panels"
      >
        <!--
          **D-081** — right-rail panel-group now defaults to tabSide=right
          (icons docked against the right edge of the screen). Users can
          flip to top/bottom/left via the picker chip in the header;
          their choice persists in localStorage under the groupId key.
        -->
        <!--
          A title is REQUIRED for the header h3 to render. In lateral
          (left/right) mode the panel-group shows the ACTIVE tab's name
          (activeTabLabel falling back to title) — Layers / History /
          Properties / Appearance / Export / Gradient — exactly like the
          libraries panel surfaces "GRADIENTS". Without a title the header
          at-if skips the h3 and only the side-picker chip shows, so the
          user never sees which panel is open. "Panels" is just the
          fallback when no tab is active (effectively never once a tab is
          selected).
        -->
        <svge-panel-group
          class="rs-group"
          title="Panels"
          tabSide="right"
          groupId="shell-pro-right-rail"
          [collapsible]="true"
          [collapsed]="rightCollapsed()"
          (collapsedChange)="setRightCollapsed($event)"
        >
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
          <!--
            D-058 follow-up — Gradient editor now has its OWN tab (below
            Export), instead of trailing the inspector inside Properties.
            Dedicated tab = clearer affordance: users go to "Gradient" to
            tune stops/type/orientation. The component self-gates via its
            internal active() computed — when the selection has no gradient
            fill it shows a friendly empty hint, so the tab is never broken,
            just inert. Icon matches the Gradients library section.
          -->
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="gradient"
            label="Gradient"
            icon="gradient"
          >
            <svge-gradient-editor />
          </ng-template>
        </svge-panel-group>
      </aside>
    </div>
    @if (timelineVisible()) {
      <!--
        D-082 F6 — Animation Timeline dock (bottom). Opt-in via
        [showTimeline] (default false), so the shell is byte-for-byte the
        current editor unless the consumer turns it on. The timeline reads
        the editor-scoped AnimationService/PlaybackService and edits only
        through undoable commands; the canvas preview above is driven by
        the animatedTree() computed (resolvedTree + applyAnimationToTree at
        the playhead). At playhead 0 with no tracks, animatedTree() returns
        the base tree by reference — render/hit-test unchanged.
      -->
      <svge-timeline class="timeline-row" />
    }
    <svge-status-bar class="status-row" />
  `,
  styles: `
    :host {
      display: grid;
      /* 6 rows: menu | toolbar | tool-options | main(1fr) | timeline | status.
         Pages strip (D-079) used to be its own row between tool-options
         and main; PAGES-REFACTOR follow-up #8 moved it into canvas-cell
         as a bottom overlay (same pattern as the isolation breadcrumb
         at top), so the grid row went away. D-082 F6 adds the optional
         Animation Timeline dock (5th track, auto) above the status bar —
         empty/zero-height when [showTimeline] is false (the @if renders
         nothing, so the track simply collapses). */
      grid-template-rows: auto auto auto 1fr auto auto;
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
    /* .pages-row removed in PAGES-REFACTOR follow-up #8 — the strip
       lives inside .canvas-cell as a bottom overlay now (see
       .pages-overlay below). */
    .main {
      display: grid;
      /* 4-column layout (D-048):
       * tools-side (auto, ~44px) | libraries-side | canvas (1fr) | right-side
       *
       * COLLAPSE — the libraries + right columns use CSS custom
       * properties so a collapsed panel shrinks its column to just the
       * icon strip (~36px), handing the freed width to the 1fr canvas.
       * The aside's .is-collapsed class flips the variable; the grid
       * tracks it live (no JS layout math). Default widths preserved. */
      --svge-libraries-w: 220px;
      --svge-right-w: 280px;
      grid-template-columns: auto var(--svge-libraries-w) 1fr var(--svge-right-w);
      min-height: 0;
      overflow: hidden;
    }
    /* Collapsed-width override. 36px matches the panel-group's vertical
       icon strip (min-width: 36px in panel-group.component) so the strip
       stays fully visible and clickable to re-open the panel. */
    .main:has(.libraries-side.is-collapsed) {
      --svge-libraries-w: 36px;
    }
    .main:has(.right-side.is-collapsed) {
      --svge-right-w: 36px;
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
    /* When collapsed the column is narrow; hide horizontal overflow so the
       strip never shows a scrollbar in the 36px track. */
    .libraries-side.is-collapsed,
    .right-side.is-collapsed {
      overflow: hidden;
    }
    .canvas-cell {
      position: relative;
      overflow: hidden;
      background: var(--mat-sys-surface-container-low, transparent);
    }
    /* Generic full-bleed stretch for canvas-cell children (renderer,
       workspace-background, etc.). Excludes the isolation breadcrumb
       (pinned top) and the pages overlay (pinned bottom) — see their
       dedicated rules below. */
    .canvas-cell > *:not(.iso-breadcrumb-overlay):not(.pages-overlay) {
      position: absolute;
      inset: 0;
    }
    /* Isolation breadcrumb overlay (parity with custom-editor route).
       Pinned to the top edge of the canvas-cell with z-index above the
       renderer so the bar paints on top of the topmost canvas pixels.
       Self-hides when isolation is inactive — the inner @if returns
       no DOM, so the overlay claims zero visual / pointer footprint.

       BREADCRUMB-CLICK-FIX: host stays pointer-events auto (parity
       with custom-editor's .isolation-bar, which has no pointer-events
       override so it inherits auto from the component :host). A prior
       pointer-events: none here was meant to let clicks fall through to
       the canvas, but it BROKE breadcrumb interaction: clicking a crumb
       or the bar margins passed straight through to the
       [svgeShellInteractions] directive on canvas-cell, which treated
       it as a click on empty canvas and called isolation.exit() — so
       the bar vanished on the first click and the crumbs did nothing.
       The fall-through was never needed: the component's inner
       at-if(visible()) removes ALL of its DOM when isolation is
       inactive, so there's no overlay to block canvas clicks at the
       default scope. When active, the 28px bar SHOULD capture its own
       clicks (the nav's stopPropagation then contains them) — exactly
       like Illustrator/Affinity. */
    .canvas-cell > .iso-breadcrumb-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 3;
    }
    /* PAGES-REFACTOR follow-up #5 — when rulers are visible (View ▸
       Show Rulers), shift the breadcrumb to start AFTER the vertical
       ruler (left: 24px) and BELOW the horizontal ruler (top: 24px).
       Matches Illustrator: the breadcrumb stays inside the canvas
       area, not stamped on top of the ruler tracks. Rulers are 24px
       per side (matches the width/height: 24px constants in
       rulers.component.ts). When rulers are hidden, the breadcrumb
       falls back to top: 0 / left: 0 from the base rule above. */
    .canvas-cell.with-rulers > .iso-breadcrumb-overlay {
      top: 24px;
      left: 24px;
    }
    /* PAGES-REFACTOR follow-up #8 — D-079 pages tab strip pinned to
       the BOTTOM of the canvas (mirror of the breadcrumb at top).
       Same z-index/pointer-events treatment: the host stays
       click-through so the canvas underneath remains interactive
       around the strip's actual buttons; SvgePagesPanel paints its
       own surface with pointer-events: auto on its inner controls. */
    .canvas-cell > .pages-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 3;
      pointer-events: none;
    }
    .canvas-cell > .pages-overlay > * {
      pointer-events: auto;
    }
    /* When rulers are visible, shift the pages strip in by the
       vertical-ruler width (left only — there's no bottom ruler so
       the bottom edge stays at 0). Same 24px constant as the
       breadcrumb's with-rulers offset above. */
    .canvas-cell.with-rulers > .pages-overlay {
      left: 24px;
    }
    /* BREADCRUMB-CLICK-FIX — the host above is now pointer-events auto
       (was none, which leaked breadcrumb clicks to the canvas-cell and
       triggered isolation.exit). This child rule is now redundant
       (auto child of an auto host) but kept as a defensive guard in
       case a future host-level override re-introduces none. */
    .canvas-cell > .iso-breadcrumb-overlay > * {
      pointer-events: auto;
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
  // **D-082 F6** — animation engine + transport (editor-scoped). Drive
  // the canvas preview: animatedTree() = applyAnimationToTree(base,
  // anim.sample(playhead)). Read-only here; edits go through the timeline.
  private readonly anim = inject(AnimationService);
  private readonly playback = inject(PlaybackService);
  private readonly bus = inject(CommandBus);
  private readonly toolHost = inject(ToolHostService);
  /**
   * **PAGES-REFACTOR follow-up #5** — exposed `protected` so the
   * template can bind `.with-rulers` on the canvas-cell. When the
   * rulers overlay is enabled (View ▸ Show Rulers) the breadcrumb
   * shifts to `top: 24px / left: 24px` so it doesn't overlap the
   * ruler tracks (Illustrator parity — breadcrumb sits in the canvas
   * area, not on top of the rulers).
   */
  protected readonly ws = inject(WorkspaceService);

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
   * **AUDIT FIX I2** — was wrapped in `queueMicrotask` for "scope
   * providers have settled" caution. By shell-pro constructor time,
   * Angular's DI graph IS fully resolved (all `providedIn: 'root'`
   * services exist, the editor scope has been provided, and any
   * plugins installed via APP_INITIALIZER ran during bootstrap).
   * Running synchronously avoids a one-frame race where the renderer
   * receives its first `[tree]` input pointing at the legacy
   * doc.root before the bootstrap page exists — manifested as a
   * brief flash of un-paged content on routes with existing content.
   * Synchronous dispatch makes the first paint already show the
   * bootstrapped Page 1 with its content moved inside.
   */
  constructor() {
    this.bus.dispatch(new EnsureDefaultPageCommand());
    if (this.toolHost.activeId() === null) {
      this.toolHost.activate(SELECT_TOOL_ID);
    }
  }

  // ── COLLAPSE — hide/show the side panels to reclaim canvas space ────
  //
  // Each side's collapsed flag is a signal restored from localStorage on
  // construction and persisted on every toggle (same convention as the
  // panel-group's tab-side preference). The grid in `.main` reads the
  // `.is-collapsed` class on each aside (CSS `:has`) and shrinks that
  // column to the icon strip's width, so a collapsed panel hands its
  // width to the canvas. Default: both expanded.

  private static readonly COLLAPSE_KEY_LEFT = 'svge-shell-pro-libraries-collapsed';
  private static readonly COLLAPSE_KEY_RIGHT = 'svge-shell-pro-right-rail-collapsed';

  protected readonly leftCollapsed = signal<boolean>(
    SvgeShellPro.readCollapsed(SvgeShellPro.COLLAPSE_KEY_LEFT),
  );
  protected readonly rightCollapsed = signal<boolean>(
    SvgeShellPro.readCollapsed(SvgeShellPro.COLLAPSE_KEY_RIGHT),
  );

  protected setLeftCollapsed(v: boolean): void {
    this.leftCollapsed.set(v);
    SvgeShellPro.writeCollapsed(SvgeShellPro.COLLAPSE_KEY_LEFT, v);
  }

  protected setRightCollapsed(v: boolean): void {
    this.rightCollapsed.set(v);
    SvgeShellPro.writeCollapsed(SvgeShellPro.COLLAPSE_KEY_RIGHT, v);
  }

  /** Read a persisted collapsed flag. Defensive against SSR / disabled storage. */
  private static readCollapsed(key: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  /** Persist a collapsed flag. Fails silently (quota / private mode). */
  private static writeCollapsed(key: string, v: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      // Storage unavailable — the in-memory signal still drives this session.
    }
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
      // Layers/Pages are transparent to selection (organizational only).
      isTransparentContainer: organizationalContainerPredicate(this.state.document().root),
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

  /**
   * **D-082 F6** — mount the Animation Timeline dock + drive the canvas
   * preview from the playhead. Default `false`: without it the shell renders
   * the base tree exactly as today (the `animatedTree` computed short-circuits
   * to `resolvedTree`), so existing consumers are unaffected.
   */
  readonly showTimeline = input<boolean>(false);

  protected readonly resolvedTree = computed<SvgNode>(() => {
    // Consumer-supplied [tree] always wins (advanced use-cases).
    const explicit = this.tree();
    if (explicit !== null) return explicit;
    // D-079: when a page is active, render only its subtree.
    // ActivePageService.treeForRendering falls back to document.root
    // when no page exists (back-compat with legacy docs).
    return this.activePage.treeForRendering();
  });

  /**
   * **D-082 F6** — the tree fed to `<svge-renderer>`: the base
   * {@link resolvedTree} with the animation applied at the current playhead.
   * When the timeline is off, returns the base tree untouched. When on, applies
   * `sampleAnimation(playhead)` non-destructively (`applyAnimationToTree`
   * structurally shares unchanged subtrees and returns the SAME reference when
   * nothing is animated — so playhead 0 with no tracks paints exactly the base
   * document; render, hit-test, overlays and export are unchanged).
   */
  /**
   * **D-082 F6 + follow-up** — effective timeline visibility: the
   * `[showTimeline]` input (consumer-controlled) OR the WorkspaceService
   * `timeline()` flag (end-user toggle via **View ▸ Show Timeline**). Either
   * one mounts the dock and drives the canvas preview. Default `false` on both,
   * so the shell is byte-for-byte the current editor until opted in.
   */
  protected readonly timelineVisible = computed<boolean>(
    () => this.showTimeline() || this.ws.timeline(),
  );

  protected readonly animatedTree = computed<SvgNode>(() => {
    const base = this.resolvedTree();
    if (!this.timelineVisible()) return base;
    return applyAnimationToTree(base, this.anim.sample(this.playback.playhead()));
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
