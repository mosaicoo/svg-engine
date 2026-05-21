import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import {
  type BoundingBox,
  CommandBus,
  EditorStateService,
  HistoryService,
  type SvgNode,
} from 'svg-engine/core';
import { SvgeRenderer, ViewportService } from 'svg-engine/render';
import {
  IsolationService,
  PageOverlay,
  resolveSelectableNodeId,
  SvgeCanvasGestures,
  SvgeShellInteractions,
  WorkspaceBackground,
} from 'svg-engine/edit';
import { CONTEXT_MENU_SLOT, SvgeContextMenuTrigger } from '../context-menu';
import { SvgeMenuBar } from '../menu-bar';
import { SvgeStatusBar } from '../status-bar';
import { SvgeToolbar } from '../toolbar';
import { SvgeToolOptions } from '../tool-options';

/**
 * Full-featured editor shell (Fase 4 Bloco 4a — expanded in Fase 6
 * D-034/D-035 with `<svge-toolbar>` + `<svge-status-bar>` integration).
 * Composes the headless editor surface (`WorkspaceBackground` +
 * `SvgeRenderer` + projected overlays) under a Material toolbar with
 * built-in undo/redo/zoom actions, optionally extended by plugin-
 * contributed buttons from `MenuContributionRegistry`, and optionally
 * capped by a `<svge-status-bar>` showing tool/selection/zoom/cursor/snap state.
 *
 * **THREE MODES** — guaranteed by design:
 *
 * 1. **Headless puro** — consumer ignores `svg-engine/ui` entirely and
 *    composes `<svge-renderer>` + overlays + services by hand (see the
 *    `custom-editor` route — `projects/playground/src/app/pages/custom-editor/`).
 *    Zero Material in their bundle.
 *
 * 2. **Shell completo** — drop in `<svge-editor>` with no flags; you
 *    get toolbar + canvas + status bar + projected overlays. The
 *    Mosaicoo "Editor" surface uses this.
 *
 * 3. **Shell parcial** — flags toggle individual pieces:
 *
 *    ```html
 *    <!-- canvas only (no toolbar, no status bar) — Mosaicoo "viewer with edit" -->
 *    <svge-editor [showToolbar]="false" [showStatusBar]="false">
 *      <svg:g svgeSelectionOverlay></svg:g>
 *    </svge-editor>
 *
 *    <!-- canvas + my own status bar (toolbar disabled) -->
 *    <svge-editor [showToolbar]="false">
 *      <my-status-bar status-bar></my-status-bar>
 *      <svg:g svgeSelectionOverlay></svg:g>
 *    </svge-editor>
 *    ```
 *
 *    Custom toolbar / status-bar contributions slot in via projected
 *    content with the `toolbar-extras` / `status-bar` selectors (see
 *    `<ng-content>` slots in the template).
 *
 * **Headless boundary (D-017)** — UNCHANGED: this component lives in
 * `svg-engine/ui`, the only entry point allowed to import
 * `@angular/material` and `@angular/cdk`. Consumers who never import
 * from `svg-engine/ui` get zero Material in their bundle. The three
 * modes above only affect which subset of UI you opt into; the
 * headless route remains fully supported.
 *
 * **Why opt-in flags instead of three separate components**: the
 * canvas + overlay + background composition is identical across all
 * three modes — the only thing that varies is what wraps it. Flags
 * + slots let consumers tune one component; three components would
 * mean three nearly-identical templates to maintain.
 *
 * **Built-in toolbar buttons**: undo, redo, zoom in/out, reset. These
 * are intentionally hard-coded (not contributions) so the shell stays
 * useful even without `MenuContributionRegistry` populated. Plugins
 * add to the strip via `<svge-toolbar>` which appears next to the
 * built-ins (when `showToolbar` is true).
 */
@Component({
  selector: 'svge-editor',
  standalone: true,
  imports: [
    MatToolbar,
    MatIconButton,
    MatIcon,
    MatTooltip,
    SvgeRenderer,
    WorkspaceBackground,
    PageOverlay,
    SvgeCanvasGestures,
    SvgeToolbar,
    SvgeStatusBar,
    SvgeMenuBar,
    SvgeContextMenuTrigger,
    SvgeToolOptions,
    SvgeShellInteractions,
  ],
  template: `
    @if (showMenuBar()) {
      <div class="menu-area">
        <svge-menu-bar />
      </div>
    }
    @if (showToolbar()) {
      <mat-toolbar class="editor-toolbar">
        <span class="title">{{ title() ?? 'SVGEngine' }}</span>
        <span class="spacer"></span>
        <!-- Plugin-contributed toolbar items (left side of built-ins). -->
        <svge-toolbar [slot]="toolbarSlot()" />
        <!-- Consumer-projected extras between contributions and built-ins. -->
        <ng-content select="[toolbar-extras]" />
        <span class="separator" aria-hidden="true">|</span>
        <button
          mat-icon-button
          type="button"
          matTooltip="Undo"
          [disabled]="!canUndo()"
          (click)="undo()"
          aria-label="Undo"
        >
          <mat-icon>undo</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          matTooltip="Redo"
          [disabled]="!canRedo()"
          (click)="redo()"
          aria-label="Redo"
        >
          <mat-icon>redo</mat-icon>
        </button>
        <span class="separator" aria-hidden="true">|</span>
        <button
          mat-icon-button
          type="button"
          matTooltip="Zoom out"
          (click)="zoomOut()"
          aria-label="Zoom out"
        >
          <mat-icon>zoom_out</mat-icon>
        </button>
        <span class="zoom-pct" aria-live="polite">{{ zoomPct() }}</span>
        <button
          mat-icon-button
          type="button"
          matTooltip="Zoom in"
          (click)="zoomIn()"
          aria-label="Zoom in"
        >
          <mat-icon>zoom_in</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          matTooltip="Reset view"
          (click)="resetView()"
          aria-label="Reset view"
        >
          <mat-icon>fit_screen</mat-icon>
        </button>
      </mat-toolbar>
    }
    @if (showToolOptions()) {
      <svge-tool-options [showPlaceholder]="toolOptionsShowPlaceholder()" />
    }
    <div
      class="canvas-area"
      svgeCanvasGestures
      svgeShellInteractions
      [svgeContextMenu]="showContextMenu() ? contextMenuSlot() : ''"
      [svgeContextMenuResolver]="showContextMenu() ? contextMenuResolver : null"
    >
      <svge-workspace-background>
        <svge-renderer
          [tree]="resolvedTree()"
          [viewBox]="resolvedViewBox()"
          [defs]="resolvedDefs()"
          [ariaLabel]="ariaLabel() ?? 'Editable SVG document'"
        >
          <!--
            Page marker — MUST carry the literal svgeBehind attribute
            so SvgeRenderer's ng-content select="[svgeBehind]" slot
            picks it up and projects it UNDER the document content. The
            page rect has a semi-transparent white fill (Illustrator/
            Affinity "paper" convention) — without behind projection
            that fill would veil shapes inside the page boundary,
            desaturating their colors.

            Why the attribute MUST be literal in this template (not
            host-bound on PageOverlay): Angular content projection is
            a compile-time decision based on attributes written in the
            consumer's template. Runtime host bindings on the projected
            component don't affect the projection slot — they only mark
            the DOM after the slot is already decided. This caught us
            in a previous attempt at "auto-tagging" — see the fix
            history in docs/08-historico-de-alteracoes.md.

            Consumers can hide the page by zeroing out width/height in
            WorkspaceService.patchPage (rejected silently, so set via
            resetPage if needed) or just not provisioning it (the shell
            is the only place that auto-includes it).
          -->
          <svg:g svgePageOverlay svgeBehind></svg:g>
          <ng-content />
        </svge-renderer>
      </svge-workspace-background>
    </div>
    @if (showStatusBar()) {
      <div class="status-area">
        <!-- Consumer can fully replace the built-in svge-status-bar by
             projecting a custom element with the status-bar attribute. -->
        <ng-content select="[status-bar]">
          <svge-status-bar />
        </ng-content>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .menu-area {
      flex: 0 0 auto;
      padding: 2px 0.5rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface, transparent);
    }
    .editor-toolbar {
      flex: 0 0 auto;
    }
    .title {
      font-size: 16px;
      font-weight: 500;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .separator {
      opacity: 0.4;
      margin: 0 4px;
    }
    .zoom-pct {
      min-width: 48px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      opacity: 0.85;
    }
    .canvas-area {
      flex: 1 1 auto;
      min-height: 0;
      position: relative;
      overflow: hidden;
    }
    /* Children of the canvas area need to fill it for the renderer
       to size correctly. */
    .canvas-area > * {
      position: absolute;
      inset: 0;
    }
    .status-area {
      flex: 0 0 auto;
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .status-area > * {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeEditor {
  private readonly bus = inject(CommandBus);
  private readonly history = inject(HistoryService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly isolation = inject(IsolationService);

  /**
   * **D-040** — Resolver for the dynamic context-menu slot. Bound to
   * `[svgeContextMenuResolver]` on the canvas-area when `showContextMenu`
   * is true. On every right-click, hit-tests the cursor position:
   * - hits a selectable node → `'context.node'`
   * - hits canvas background  → `'context.canvas'`
   *
   * Plugins register items in either slot via `MenuContributionRegistry`;
   * the directive opens the right menu without the consumer wiring two
   * `[svgeContextMenu]`s. Arrow-function so `this` binding survives the
   * directive-to-resolver call.
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

  /**
   * The tree to render. Optional — when omitted, falls back to the
   * current document's `root` from `EditorStateService` (consumers
   * using the bus-driven workflow don't have to thread the tree
   * through manually).
   */
  readonly tree = input<SvgNode | null>(null);

  /** Optional viewBox — when omitted, falls back to the document's viewBox. */
  readonly viewBox = input<BoundingBox | null>(null);

  /** Effective tree fed to `<svge-renderer>` (input → state fallback). */
  protected readonly resolvedTree = computed<SvgNode>(
    () => this.tree() ?? this.state.document().root,
  );

  /** Effective viewBox fed to `<svge-renderer>` (input → state fallback). */
  protected readonly resolvedViewBox = computed<BoundingBox>(
    () => this.viewBox() ?? this.state.document().viewBox,
  );

  /**
   * Effective reusable-defs fragment fed to `<svge-renderer>` (Fase 6c-1).
   * Reads from the current document's `defs` field — populated by the
   * SVG importer when it encounters `<defs>`/`<linearGradient>`/`<clipPath>`
   * etc. Null when the document has no defs.
   */
  protected readonly resolvedDefs = computed<string | null>(
    () => this.state.document().defs ?? null,
  );

  /** Optional title displayed in the toolbar. Defaults to "SVGEngine". */
  readonly title = input<string | null>(null);

  /** Optional aria-label for the inner `<svg>` element. */
  readonly ariaLabel = input<string | null>(null);

  /**
   * **Sprint Pro-Editor (D-038 phase 1) — opt-in menu bar.**
   *
   * When `true`, renders a `<svge-menu-bar>` ABOVE the toolbar.
   * Default: `false` — preserves D-037 invariants (existing modes
   * "Shell completo" / "Shell parcial" / "Canvas-only" all keep their
   * current visible shape; this input must be EXPLICITLY enabled).
   *
   * Plugins contribute menu items via `MenuContributionRegistry.register()`
   * with slot `'menu.file' | 'menu.edit' | 'menu.view' | 'menu.object' |
   * 'menu.help'` (see `MENU_SLOT` constants exported from `svg-engine/ui`).
   * Submenus via the `parentId` field. Empty slots render an empty
   * dropdown — consumers wanting to hide a slot pass a filtered `[slots]`
   * via the wrapper component or use `<svge-menu-bar>` directly.
   */
  readonly showMenuBar = input<boolean>(false);

  /**
   * **Sprint Pro-Editor (D-038 phase 2) — opt-in right-click context menu.**
   *
   * When `true`, attaches the `[svgeContextMenu]` directive to the canvas
   * area so right-click opens a `<svge-context-menu>` reading the slot
   * named by `[contextMenuSlot]` (default `'context.canvas'`).
   *
   * Default: `false` — preserves D-037 invariants (existing modes do NOT
   * change visually; browser's native right-click menu remains in effect
   * unless this is explicitly enabled).
   *
   * Plugins contribute via `MenuContributionRegistry.register({ slot:
   * 'context.canvas', ... })` (or `CONTEXT_MENU_SLOT.CANVAS` for the
   * canonical constants exported from `svg-engine/ui`).
   */
  readonly showContextMenu = input<boolean>(false);

  /**
   * **D-038 phase 2** — slot id used for the canvas right-click menu
   * when `[showContextMenu]` is true. Default: `'context.canvas'`.
   *
   * Override when a single page mounts multiple `<svge-editor>`s and
   * each needs its own context menu items (use disjoint slot names so
   * contributions don't leak across editors).
   */
  readonly contextMenuSlot = input<string>('context.canvas');

  /**
   * **Sprint Pro-Editor (D-038 phase 3) — opt-in tool options bar.**
   *
   * When `true`, renders a `<svge-tool-options>` row BELOW the toolbar
   * and ABOVE the canvas. The bar renders the active tool's
   * `optionsComponent` (if any). Default: `false` — preserves D-037.
   *
   * Tools declare their options UI via the optional `optionsComponent`
   * field on the `Tool` interface. Tools without one yield a
   * collapsed (or "No options" placeholder, depending on
   * `[toolOptionsShowPlaceholder]`) bar so the layout stays predictable.
   */
  readonly showToolOptions = input<boolean>(false);

  /**
   * Forwarded to `<svge-tool-options [showPlaceholder]>`. When `true`,
   * the bar shows a "No options for this tool" placeholder instead of
   * collapsing when the active tool lacks an options component.
   * Default: `false` (collapse — Mosaicoo preference: chrome should
   * disappear when not earning its keep).
   */
  readonly toolOptionsShowPlaceholder = input<boolean>(false);

  /**
   * D-034 — render the toolbar row (title, plugin contributions, built-in
   * undo/redo/zoom). Default: `true`.
   *
   * Set to `false` for the "canvas-only" shell variant — useful when
   * the consuming app provides its own application chrome and just
   * wants the editor canvas widget. Built-in keyboard shortcuts
   * (undo via Ctrl+Z, etc.) are NOT affected; they live in the
   * services, not in the toolbar buttons.
   */
  readonly showToolbar = input<boolean>(true);

  /**
   * D-035 — render the status bar (tool / selection / zoom / cursor /
   * snap / isolation / dirty). Default: `true`.
   *
   * Set to `false` to suppress the built-in status bar. Consumers can
   * either (a) skip the status bar entirely, or (b) project their own
   * custom element via the `[status-bar]` selector:
   *
   * ```html
   * <svge-editor [showStatusBar]="true">
   *   <my-status-bar status-bar></my-status-bar>
   * </svge-editor>
   * ```
   *
   * Projection takes precedence over the default `<svge-status-bar>`
   * because of how `<ng-content>` fallback content works.
   */
  readonly showStatusBar = input<boolean>(true);

  /**
   * Which `MenuContributionRegistry` slot the embedded `<svge-toolbar>`
   * renders. Default: `'toolbar.main'`. Consumers running multiple
   * editors with disjoint plugin sets can use distinct slot names so
   * contributions don't leak across editors.
   */
  readonly toolbarSlot = input<string>('toolbar.main');

  /**
   * Emitted when the user clicks Undo/Redo from the toolbar — useful
   * for consumers that want to react (status bar update, telemetry).
   * The undo/redo themselves run automatically via {@link CommandBus}.
   */
  readonly undoTriggered = output<void>();
  readonly redoTriggered = output<void>();

  protected readonly canUndo = this.history.canUndo;
  protected readonly canRedo = this.history.canRedo;

  protected readonly zoomPct = computed(() => `${Math.round(this.viewport.zoom() * 100)}%`);

  protected undo(): void {
    this.bus.undo();
    this.undoTriggered.emit();
  }

  protected redo(): void {
    this.bus.redo();
    this.redoTriggered.emit();
  }

  protected zoomIn(): void {
    this.viewport.zoomIn();
  }

  protected zoomOut(): void {
    this.viewport.zoomOut();
  }

  protected resetView(): void {
    this.viewport.reset();
  }
}
