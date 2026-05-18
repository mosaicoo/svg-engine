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
import { PageOverlay, SvgeCanvasGestures, WorkspaceBackground } from 'svg-engine/edit';

/**
 * Full-featured editor shell (Fase 4 Bloco 4a). Composes the headless
 * editor surface (`WorkspaceBackground` + `SvgeRenderer` + projected
 * overlays) under a Material toolbar with the most common editor
 * actions (undo/redo, zoom, reset).
 *
 * **Why a shell instead of forcing every consumer to build their own**:
 * the playground proved that wiring renderer + overlays + handlers is
 * 200+ lines of boilerplate. `<svge-editor>` collapses that into one
 * tag for the 80%-case consumer. Power consumers can still skip this
 * shell and compose primitives directly (the playground does that
 * intentionally to keep dogfooding honest).
 *
 * **Headless boundary (D-017)**: this component lives in `svg-engine/ui`
 * — the *only* entry point allowed to import `@angular/material`. Other
 * entry points (`core/render/io/optimize/edit`) remain Material-free,
 * so consumers who don't want Material keep working without it.
 *
 * **What's IN this Bloco 4a shell** (minimum useful surface):
 * - Material toolbar with title + undo/redo + zoom in/out + reset view
 *   buttons; signals from `HistoryService` and `ViewportService` drive
 *   reactive state (button disabled, zoom %)
 * - `<svge-workspace-background>` wrapping the canvas (bg config
 *   read from `WorkspaceService` automatically — managed by the
 *   consumer or a future settings panel from 4f)
 * - `<svge-renderer>` projecting `<ng-content>` for overlays — consumer
 *   slots in selection-overlay / rotation-pivot / marquee / snap-guides
 *   exactly like with the bare renderer
 * - Sensible default sizing (host fills its container, toolbar sticks
 *   to the top, canvas takes remaining space)
 *
 * **What's NOT yet here** (subsequent Fase 4 blocos):
 * - 4b: `<svge-layers-panel>` slot on the side
 * - 4c: `<svge-inspector>` slot on the side
 * - 4d: `<svge-color-palette>` integration
 * - 4e: extensible toolbar contributions via `MenuContributionRegistry`
 * - 4f: workspace settings panel (page/grid/guides/rulers)
 *
 * Usage:
 * ```html
 * <svge-editor [tree]="doc().root" [viewBox]="doc().viewBox">
 *   <svg:g svgeSelectionOverlay></svg:g>
 *   <svg:g svgeRotationPivot></svg:g>
 *   <svg:g svgeMarquee></svg:g>
 *   <svg:g svgeSnapGuides></svg:g>
 * </svge-editor>
 * ```
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
  ],
  template: `
    <mat-toolbar class="editor-toolbar">
      <span class="title">{{ title() ?? 'SVGEngine' }}</span>
      <span class="spacer"></span>
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
    <div class="canvas-area" svgeCanvasGestures>
      <svge-workspace-background>
        <svge-renderer
          [tree]="resolvedTree()"
          [viewBox]="resolvedViewBox()"
          [defs]="resolvedDefs()"
          [ariaLabel]="ariaLabel() ?? 'Editable SVG document'"
        >
          <!--
            Page marker comes BEFORE consumer's projected overlays so
            user-supplied content (selection, marquee, etc) renders on
            top. Consumers can hide the page by zeroing out width/height
            in WorkspaceService.patchPage (rejected silently, so set
            via resetPage if needed) or just not provisioning it (the
            shell is the only place that auto-includes it).
          -->
          <svg:g svgePageOverlay></svg:g>
          <ng-content />
        </svge-renderer>
      </svge-workspace-background>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeEditor {
  private readonly bus = inject(CommandBus);
  private readonly history = inject(HistoryService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);

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
