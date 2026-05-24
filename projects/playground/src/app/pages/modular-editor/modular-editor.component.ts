import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
 * `<svge-editor>` **shell parcial** demo — showcases mode 3 of D-034/D-035.
 *
 * **Six checkboxes** (menu bar / toolbar / status bar / context menu /
 * tool options / custom status replacement), each toggling one piece
 * of the shell, prove the Mosaicoo invariant: the consumer can have
 * ANY combination of shell pieces without the shell forcing a layout.
 *
 * Also demonstrates **custom slot replacement**: tick "custom status bar"
 * to swap the built-in `<svge-status-bar>` for an inline div that just
 * shows the selection count — proving consumers can inject their own UI
 * via the `[status-bar]` projection slot.
 */
@Component({
  selector: 'app-pg-modular-editor',
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
    <header class="bar">
      <p>
        <strong>Editor modular</strong> — flags individuais controlam menu bar / toolbar / status
        bar / context menu / tool options. Compare com
        <a routerLink="/basic-editor">/basic-editor</a> (drop-in básico sem flags) e
        <a routerLink="/custom-editor">/custom-editor</a> (editor customizado, sem
        &lt;svge-editor&gt;).
      </p>
      <label>
        <input
          type="checkbox"
          [checked]="showToolbar()"
          (change)="showToolbar.set($any($event.target).checked)"
        />
        Show toolbar
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="showStatusBar()"
          (change)="showStatusBar.set($any($event.target).checked)"
        />
        Show status bar
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="useCustomStatus()"
          (change)="useCustomStatus.set($any($event.target).checked)"
          [disabled]="!showStatusBar()"
        />
        Replace with custom status bar
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="showMenuBar()"
          (change)="showMenuBar.set($any($event.target).checked)"
        />
        Show menu bar (D-038 Phase 1)
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="showContextMenu()"
          (change)="showContextMenu.set($any($event.target).checked)"
        />
        Right-click context menu (D-038 Phase 2)
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="showToolOptions()"
          (change)="showToolOptions.set($any($event.target).checked)"
        />
        Tool options bar (D-038 Phase 3 — press K for Stamp Tool)
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="showLibrariesPanel()"
          (change)="showLibrariesPanel.set($any($event.target).checked)"
        />
        Libraries panel (D-048 — 8 libraries, left rail)
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="showEffectsPanel()"
          (change)="showEffectsPanel.set($any($event.target).checked)"
        />
        Effects panel (D-047 — filter pipeline editor, right rail)
      </label>
    </header>
    <div class="editor-area">
      <svge-editor
        [title]="title()"
        [showMenuBar]="showMenuBar()"
        [showToolbar]="showToolbar()"
        [showStatusBar]="showStatusBar()"
        [showContextMenu]="showContextMenu()"
        [showToolOptions]="showToolOptions()"
        [showLibrariesPanel]="showLibrariesPanel()"
        [showEffectsPanel]="showEffectsPanel()"
        [toolOptionsShowPlaceholder]="true"
      >
        @if (useCustomStatus()) {
          <div status-bar class="custom-status">
            <span>🎨 Custom status bar — selection: {{ selectionCountLabel() }}</span>
          </div>
        }
        <!--
          Conjunto completo de overlays. As checkboxes acima controlam
          peças do shell (menu / toolbar / status / context / tool
          options) — não os overlays, que estão sempre presentes para
          que qualquer tool ativa funcione com feedback visual durante
          a interação. Ordem = z-order.
        -->
        <svg:g svgeSelectionOverlay></svg:g>
        <svg:g svgeRotationPivot></svg:g>
        <svg:g svgeAnchorOverlay></svg:g>
        <svg:g svgeMarquee></svg:g>
        <svg:g svgeSnapGuides></svg:g>
        <svg:g svgePenOverlay></svg:g>
        <svg:g svgePencilOverlay></svg:g>
        <svg:g svgeShapeOverlay></svg:g>
        <svg:g svgeSymbolSprayerOverlay></svg:g>
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
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 0.75rem;
      background: var(--mat-sys-surface-container-low, #fff8e1);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      font-size: 0.85rem;
    }
    .bar p {
      margin: 0 1rem 0 0;
    }
    .bar label {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      user-select: none;
    }
    .editor-area {
      flex: 1 1 auto;
      min-height: 0;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 0.4rem;
      overflow: hidden;
    }
    .custom-status {
      padding: 0.4rem 0.75rem;
      background: var(--mat-sys-tertiary-container, #ffe0b2);
      color: var(--mat-sys-on-tertiary-container, #5a1014);
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModularEditor {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  protected readonly title = signal('Shell parcial — modular');
  protected readonly showMenuBar = signal(false);
  protected readonly showToolbar = signal(true);
  protected readonly showStatusBar = signal(true);
  protected readonly useCustomStatus = signal(false);
  protected readonly showContextMenu = signal(false);
  protected readonly showToolOptions = signal(false);
  protected readonly showLibrariesPanel = signal(false);
  protected readonly showEffectsPanel = signal(false);

  protected readonly selectionCountLabel = computed(() => {
    // Selection count is tracked by SelectionService but we don't need
    // the full service here — just read the document for shape count
    // to keep this demo minimal.
    const root = this.state.document().root;
    return root.type === 'group' ? `${root.children.length} shapes total` : '—';
  });

  constructor() {
    // Seed shapes so the canvas isn't empty on first visit (matches
    // shell-demo convention).
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
