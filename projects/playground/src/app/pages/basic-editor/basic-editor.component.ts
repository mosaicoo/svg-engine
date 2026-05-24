import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
import { SvgeEditor } from 'svg-engine/ui';

/**
 * `<svge-editor>` shell demo route. Demonstrates the **plug-and-play**
 * way to use the library: a single `<svge-editor>` tag with overlays
 * projected as children. No manual wireing of toolbar / background /
 * canvas — the shell composes them itself (Material-styled).
 *
 * Compare with the `/custom-editor` route (ex `playground-home`, renamed
 * in D-041) which wires every primitive by hand (D-018 dogfooding). Both
 * are valid library consumption styles; the shell is for consumers who
 * want the easy mode.
 *
 * **Limitations of this demo**:
 * - No layers panel / inspector — the shell currently doesn't embed
 *   them (Bloco 4-shell-refinement, post-4e). Consumers wanting those
 *   compose them manually for now.
 * - No Add Shape buttons — to demonstrate the shell needs content,
 *   we seed two shapes on construction so the canvas isn't empty.
 *   Future shell refinement could expose a contribution slot for
 *   custom toolbar buttons.
 */
@Component({
  selector: 'app-pg-basic-editor',
  standalone: true,
  imports: [
    SvgeEditor,
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
    <div class="hint">
      <p>
        <strong>Editor básico:</strong> uma única tag <code>&lt;svge-editor&gt;</code> compõe a
        toolbar (com slot de contribuição de plugin), background, canvas e status bar (D-034/D-035,
        2026-05-20). Compare com <a routerLink="/custom-editor">/custom-editor</a> (editor
        customizado, cada primitive wireada à mão) e
        <a routerLink="/modular-editor">/modular-editor</a> (flags interativas ligando/desligando
        peças).
      </p>
    </div>
    <div class="editor-area">
      <svge-editor
        [title]="title()"
        [showContextMenu]="true"
        [showToolOptions]="true"
        [showLibrariesPanel]="true"
        [showEffectsPanel]="true"
      >
        <!--
          Conjunto completo de overlays para paridade total de UX com
          /custom-editor e /pro-editor. Ordem = z-order (mais tarde =
          mais à frente). Sem o conjunto completo, Pen/Pencil/Shape/Text
          desenham mas não mostram feedback durante a interação.
        -->
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeAnchorOverlay></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
        <!-- Pen tool: rubber band, in-progress anchors + handles, preview
             da curva durante o press-drag. -->
        <svg:g svgePenOverlay></svg:g>
        <!-- Pencil tool: traçado em tempo real durante o desenho à mão
             livre. -->
        <svg:g svgePencilOverlay></svg:g>
        <!-- Shape tools (Rectangle / Ellipse / Polygon): preview tracejado
             do bounding box / polígono durante o press-drag. -->
        <svg:g svgeShapeOverlay></svg:g>
        <!-- Symbol Sprayer (D-063c): preview em tempo real das
             instâncias enquanto o usuário arrasta. Limpa em pointer-up
             quando o batch command efetiva as instâncias no documento. -->
        <svg:g svgeSymbolSprayerOverlay></svg:g>
        <!-- Inline text editor (Text tool): foreignObject +
             contentEditable. Deve vir por último — surface acima de
             todos os outros overlays. -->
        <svg:g svgeInlineTextEditor></svg:g>
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
    .hint {
      flex: 0 0 auto;
      padding: 0.5rem 0.75rem;
      background: var(--mat-sys-surface-container-low, #fff8e1);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface, inherit);
    }
    .hint p {
      margin: 0;
    }
    .hint code {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 0.05rem 0.25rem;
      border-radius: 0.2rem;
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
export class BasicEditor {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  protected readonly title = computed(() => 'SVGEngine — shell demo');

  constructor() {
    // Seed a couple of shapes so the canvas isn't empty on first visit.
    // Idempotent across re-mounts: only seed when the document is empty.
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
