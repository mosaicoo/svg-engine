import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  CommandBus,
  createRect,
  EditorStateService,
  HistoryService,
  InsertNodeCommand,
  MoveNodeCommand,
  RemoveNodeCommand,
} from 'svg-engine/core';

/**
 * Playground root. Consumes `svg-engine/core` exactly as a third-party
 * application would (D-018 dogfooding). UI is intentionally bare-bones
 * — its purpose is to validate that the library's public API works
 * end-to-end. Rich editor UI lives in `svg-engine/ui` (Phase 4).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);

  protected readonly title = signal('SVGEngine Playground');

  protected readonly nodeCount = this.state.nodeCount;
  protected readonly canUndo = this.history.canUndo;
  protected readonly canRedo = this.history.canRedo;
  protected readonly nodeIds = computed(() =>
    this.state
      .allNodes()
      .filter((n) => n.id !== this.state.document().root.id)
      .map((n) => `${n.type}:${n.id.slice(0, 8)}`),
  );

  protected addRect(): void {
    const rect = createRect({
      x: Math.round(Math.random() * 700),
      y: Math.round(Math.random() * 500),
      width: 50 + Math.round(Math.random() * 100),
      height: 50 + Math.round(Math.random() * 100),
    });
    this.bus.dispatch(new InsertNodeCommand(this.state.document().root.id, rect));
  }

  protected nudgeFirst(): void {
    const first = this.state.allNodes().find((n) => n.id !== this.state.document().root.id);
    if (!first) return;
    this.bus.dispatch(new MoveNodeCommand(first.id, 10, 10));
  }

  protected removeFirst(): void {
    const first = this.state.allNodes().find((n) => n.id !== this.state.document().root.id);
    if (!first) return;
    this.bus.dispatch(new RemoveNodeCommand(first.id));
  }

  protected undo(): void {
    this.bus.undo();
  }

  protected redo(): void {
    this.bus.redo();
  }
}
