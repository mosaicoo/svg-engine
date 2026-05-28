import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
 * **SVG Studio main editor** — clone of the playground's `ProEditor`
 * (`/pro-editor` route) **without the playground's banner header**.
 *
 * What's the same:
 * - `<svge-shell-pro>` composition (menu bar, toolbar, tool options,
 *   tools palette, canvas, layers + inspector right rail, status bar,
 *   context menu).
 * - The full overlay set projected into the renderer's slot
 *   (selection, rotation pivot, anchors, marquee, snap guides, Pen /
 *   Pencil / Shape / SymbolSprayer previews, InlineTextEditor).
 * - Per-route editor scope via `provideSvgEngineEditorScope()` so
 *   navigating away and back gives a fresh, isolated document.
 * - Bootstrap seed: drops a blue rect + orange circle on first mount
 *   so the canvas isn't empty on first load.
 *
 * What's different:
 * - **No `<header class="bar">`** — Studio is single-screen, so the
 *   "compare with other routes" banner the playground uses doesn't
 *   apply here.
 * - **No `routerLink` import** — without the header, there are no
 *   links left to render.
 * - **Full-bleed layout** — the editor stretches the entire viewport
 *   (no padding / border / radius wrapper) since there's nothing
 *   above or below to leave room for.
 */
@Component({
  selector: 'studio-pro-editor',
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
  ],
  // D-042: route-scoped editor state — independent document per visit.
  providers: [provideSvgEngineEditorScope()],
  template: `
    <!--
      **Wrapper .editor-area** — same pattern the playground's
      /pro-editor uses (without the visual chrome of border/radius).
      Why wrap instead of putting flex: 1 directly on <svge-shell-pro>:
      the shell's own :host declares "display: grid" with rows
      "auto auto auto 1fr auto" and "height: 100%" — .main (the
      canvas row) gets the 1fr track. If we set display: flex on
      <svge-shell-pro> from outside, our rule wins (component-scoped
      selectors beat :host on specificity) — that kills the grid,
      .main loses its 1fr track height, and the canvas collapses to
      its intrinsic content size (the gap shown in the bug
      screenshot). Wrapping in a plain block div lets the shell's
      grid stand untouched while .editor-area's flex: 1 gives it a
      definite height for height: 100% to resolve.
    -->
    <div class="editor-area">
      <svge-shell-pro [title]="'SVG Studio'">
        <!--
          Overlays projected into the svge-renderer slot. Order = z-order
          (later = more in front). Same set the playground's pro-editor
          uses — without these, Pen/Pencil/Shape/Text show no feedback
          during interaction and the tools feel broken.
        -->
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeAnchorOverlay></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
        <!-- Pen tool: rubber band, in-progress anchors + handles, curve
             preview during press-drag (D-046 Pen review 2026-05-22). -->
        <svg:g svgePenOverlay></svg:g>
        <!-- Pencil tool: real-time freehand stroke during draw
             (D-046 Pencil review 2026-05-22). -->
        <svg:g svgePencilOverlay></svg:g>
        <!-- Shape tools (Rectangle / Ellipse / Polygon): dashed preview
             of bounding box / polygon during press-drag. -->
        <svg:g svgeShapeOverlay></svg:g>
        <!-- D-063c — Symbol Sprayer live preview: ghosted instances
             appear in real time while the user drags; cleared on
             pointer-up when the batch command commits to the doc. -->
        <svg:g svgeSymbolSprayerOverlay></svg:g>
        <!-- Inline text editor: foreignObject + contentEditable that opens
             when InlineTextEditorService.editingId is non-null. Renders
             nothing otherwise. MUST come last so the edit surface paints
             above every other overlay. -->
        <svg:g svgeInlineTextEditor></svg:g>
      </svge-shell-pro>
    </div>
  `,
  styles: `
    :host {
      /* Flex column inside studio-root (also flex column) — we grow
         to fill the viewport with flex: 1 1 auto. min-* overrides
         flex's default "auto" so inner panels can scroll without
         pushing us wider/taller than the viewport. */
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    .editor-area {
      /* Definite-size box for the shell. Two jobs:
         1. flex: 1 1 auto + min: 0 → grows to fill our :host
         2. block display + sized → propagates a real height down to
            <svge-shell-pro>, whose :host { height: 100% } needs a
            non-flex parent to resolve correctly. Putting flex: 1
            directly on <svge-shell-pro> caused two issues: (a) our
            display: flex declaration overrode shell-pro's display:
            grid, killing its row tracking; (b) percentage heights
            inside grid children of a flex item can fail to resolve
            in some layout passes. */
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProEditor {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  constructor() {
    // Seed bootstrap shapes so the canvas isn't empty on first paint —
    // matches the playground's pro-editor first-impression so a user
    // landing on Studio sees the editor "working" immediately. Only
    // fires when the root is a fresh empty group (legacy single-root
    // document); resume from auto-save (if AutoSaveService restored a
    // saved doc) skips this branch naturally.
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
