import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  CommandBus,
  createEllipse,
  createPath,
  createRect,
  EditorStateService,
  HistoryService,
  InsertNodeCommand,
  MoveNodeCommand,
  RemoveNodeCommand,
} from 'svg-engine/core';
import { resolveNodeIdFromEvent, SelectionService } from 'svg-engine/edit';
import { SvgeRenderer, ViewportService } from 'svg-engine/render';

type ShapeKind = 'rect' | 'ellipse' | 'path';

/**
 * Playground root. Consumes `svg-engine/core` and `svg-engine/render`
 * exactly as a third-party application would (D-018 dogfooding). Bare-bones
 * UI — no Angular Material here, on purpose: validates that the library's
 * headless boundary (D-017) holds in real consumption.
 *
 * The visual canvas is `<svge-renderer>` driven by `EditorStateService`
 * signals; viewport pan/zoom is delegated to `ViewportService` (signals).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SvgeRenderer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  protected readonly viewport = inject(ViewportService);

  protected readonly title = signal('SVGEngine Playground');

  protected readonly tree = computed(() => this.state.document().root);
  protected readonly viewBox = computed(() => this.state.document().viewBox);
  protected readonly nodeCount = this.state.nodeCount;
  protected readonly canUndo = this.history.canUndo;
  protected readonly canRedo = this.history.canRedo;
  protected readonly zoomPct = computed(() => `${(this.viewport.zoom() * 100).toFixed(0)}%`);
  protected readonly selectedCount = this.selection.count;
  protected readonly focusIdShort = computed(() => {
    const id = this.selection.focusId();
    return id === null ? '—' : id.slice(0, 8);
  });

  constructor() {
    // Sync the viewport's content box with the document's viewBox so the
    // renderer pans/zooms over the actual document bounds.
    this.viewport.setContentBox(this.state.document().viewBox);
  }

  protected addShape(kind: ShapeKind): void {
    const x = Math.round(Math.random() * 600);
    const y = Math.round(Math.random() * 400);
    const w = 50 + Math.round(Math.random() * 100);
    const h = 50 + Math.round(Math.random() * 100);
    const fill = randomPastel();

    const node =
      kind === 'rect'
        ? createRect(
            { x, y, width: w, height: h },
            { style: { fill, stroke: '#333', strokeWidth: 1 } },
          )
        : kind === 'ellipse'
          ? createEllipse(
              { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 },
              { style: { fill, stroke: '#333', strokeWidth: 1 } },
            )
          : createPath(`M${x} ${y} L${x + w} ${y} L${x + w / 2} ${y + h} Z`, {
              style: { fill, stroke: '#333', strokeWidth: 1 },
            });

    this.bus.dispatch(new InsertNodeCommand(this.state.document().root.id, node));
  }

  protected nudgeFirst(): void {
    const first = this.firstChild();
    if (!first) return;
    this.bus.dispatch(new MoveNodeCommand(first.id, 10, 10));
  }

  protected removeFirst(): void {
    const first = this.firstChild();
    if (!first) return;
    this.bus.dispatch(new RemoveNodeCommand(first.id));
  }

  protected undo(): void {
    this.bus.undo();
  }

  protected redo(): void {
    this.bus.redo();
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

  /**
   * Canvas pointer-down handler: walks the SVG event chain to find the
   * owning `data-node-id` (set by the renderer dispatcher) and selects
   * that node. Clicking the SVG background (no node ancestor) clears
   * the selection.
   */
  protected onCanvasPointerDown(event: PointerEvent): void {
    const id = resolveNodeIdFromEvent(event);
    if (id === null) {
      this.selection.clear();
    } else {
      this.selection.select(id);
    }
  }

  private firstChild() {
    return this.tree().children.at(0) ?? null;
  }
}

function randomPastel(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 60% 75%)`;
}
