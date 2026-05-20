import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CommandBus,
  createEllipse,
  createRect,
  EditorStateService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { Marquee, RotationPivot, SelectionOverlay, SnapGuides } from 'svg-engine/edit';
import { SvgeEditor } from 'svg-engine/ui';

/**
 * `<svge-editor>` shell demo route. Demonstrates the **plug-and-play**
 * way to use the library: a single `<svge-editor>` tag with overlays
 * projected as children. No manual wireing of toolbar / background /
 * canvas — the shell composes them itself (Material-styled).
 *
 * Compare with the `playground-home` route which wires every primitive
 * by hand (D-018 dogfooding). Both are valid library consumption styles;
 * the shell is for consumers who want the easy mode.
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
  selector: 'app-pg-shell-demo',
  standalone: true,
  imports: [SvgeEditor, SelectionOverlay, RotationPivot, Marquee, SnapGuides, RouterLink],
  template: `
    <div class="hint">
      <p>
        <strong>Shell completo:</strong> a single <code>&lt;svge-editor&gt;</code> tag composes the
        toolbar (with plugin contributions slot), background, canvas and status bar (D-034/D-035,
        2026-05-20). Compare with the <a routerLink="">home page</a> (headless puro — every
        primitive wired by hand) and <a routerLink="/shell-partial-demo">shell parcial</a> (flags
        toggling individual pieces).
      </p>
    </div>
    <div class="editor-area">
      <svge-editor [title]="title()">
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
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
export class ShellDemo {
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
