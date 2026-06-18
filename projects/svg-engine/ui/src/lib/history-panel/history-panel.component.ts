import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CommandBus, HistoryService } from 'svg-engine/core';

/** One row in the History list (one document state). */
interface HistoryRow {
  /** Number of applied commands at this state — the target for `goto`. */
  readonly depth: number;
  /** Human-readable action name (the `Command.label`, or "Open" for the baseline). */
  readonly label: string;
  /** Best-effort Material icon for the action kind. */
  readonly icon: string;
  /** The current document state (highlighted). */
  readonly current: boolean;
  /** A redo-branch state ahead of current (dimmed; discarded on a new edit). */
  readonly future: boolean;
}

/**
 * **D-134 — `<svge-history-panel>`**. Photoshop-style History panel: a
 * linear list of every command on the {@link HistoryService} stacks, with
 * **click-to-time-travel**.
 *
 * **Layout** (Photoshop / Affinity / Blender "Undo History" convention):
 *
 * - Oldest state at the top, newest at the bottom. The first row is the
 *   **"Open"** baseline (state 0 — the document before any command).
 * - The **current** state is highlighted; states **ahead** of it (the redo
 *   branch) are shown **dimmed** and are discarded the moment the user makes a
 *   new edit (the linear-history model — `HistoryService.push` already clears
 *   the redo stack, so this panel just reflects it).
 * - Clicking any row **jumps to that state** via {@link CommandBus.goto}
 *   (replays undo/redo). The current row auto-scrolls into view.
 *
 * **Read-only over existing state**: it owns no state of its own — it renders
 * the `HistoryService` signals (`undoStack` / `redoStack` / `maxSize`) and
 * drives `CommandBus`. Complementary to `<svge-snapshots-panel>` (manual,
 * named, persistent document checkpoints); History is automatic, linear,
 * per-command and ephemeral.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` because it uses
 * Material; the history CORE (stacks + time-travel) is in `svg-engine/core`.
 */
@Component({
  selector: 'svge-history-panel',
  standalone: true,
  imports: [MatIcon, MatIconButton],
  template: `
    <header class="actions-bar" role="toolbar" aria-label="History actions">
      <span class="title">History</span>
      <span class="spacer"></span>
      <span class="count" [attr.aria-label]="depth() + ' of ' + history.maxSize() + ' states'"
        >{{ depth() }}/{{ history.maxSize() }}</span
      >
      <button
        mat-icon-button
        type="button"
        class="clear-btn"
        title="Clear history"
        aria-label="Clear history"
        [disabled]="isEmpty()"
        (click)="clear()"
      >
        <mat-icon>delete_sweep</mat-icon>
      </button>
    </header>

    <div class="list" role="list" aria-label="History states">
      @for (s of states(); track s.depth) {
        <div
          class="row"
          role="listitem"
          tabindex="0"
          [class.current]="s.current"
          [class.future]="s.future"
          [attr.aria-current]="s.current"
          [attr.aria-label]="s.label + (s.current ? ', current state' : '')"
          (click)="goto(s.depth)"
          (keydown.enter)="onKey($any($event), s.depth)"
          (keydown.space)="onKey($any($event), s.depth)"
        >
          <mat-icon class="ico" aria-hidden="true">{{ s.icon }}</mat-icon>
          <span class="label">{{ s.label }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #fafafa);
    }
    .actions-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px 4px 10px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-low, #f5f5f5);
    }
    .title {
      font-weight: 500;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .count {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant, #666);
      font-size: 11px;
    }
    .clear-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .clear-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .list {
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
      padding: 4px 0;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      cursor: pointer;
      color: var(--mat-sys-on-surface, #1a1a1a);
    }
    .row:hover {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .row:focus {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
    }
    .row.current {
      background: var(--mat-sys-primary-container, #cce4ff);
      color: var(--mat-sys-on-primary-container, #001a3a);
    }
    /* Redo branch: states ahead of the current one. Dimmed, since the next
       edit discards them (linear history). */
    .row.future {
      opacity: 0.45;
    }
    .ico {
      flex: 0 0 auto;
      font-size: 17px;
      width: 17px;
      height: 17px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .row.current .ico {
      color: inherit;
    }
    .label {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeHistoryPanel {
  protected readonly history = inject(HistoryService);
  private readonly bus = inject(CommandBus);
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;

  /** Applied-command count = the current state's depth. */
  protected readonly depth = computed(() => this.history.undoStack().length);

  protected readonly isEmpty = computed(
    () => this.history.undoStack().length === 0 && this.history.redoStack().length === 0,
  );

  /**
   * The flat list of states, oldest → newest:
   * - row 0: the "Open" baseline (depth 0).
   * - rows 1..k: each applied command from `undoStack` (depth = index + 1);
   *   the last is the current state.
   * - rows k+1..k+m: the redo branch from `redoStack`, in chronological order
   *   (the stack's top is the NEXT redo, so we walk it in reverse), shown dimmed.
   */
  protected readonly states = computed<HistoryRow[]>(() => {
    const undo = this.history.undoStack();
    const redo = this.history.redoStack();
    const k = undo.length;
    const rows: HistoryRow[] = [
      { depth: 0, label: 'Open', icon: 'flag', current: k === 0, future: false },
    ];
    undo.forEach((cmd, i) => {
      rows.push({
        depth: i + 1,
        label: cmd.label,
        icon: iconForLabel(cmd.label),
        current: i === k - 1,
        future: false,
      });
    });
    for (let d = k + 1; d <= k + redo.length; d++) {
      const cmd = redo[redo.length - (d - k)]!;
      rows.push({
        depth: d,
        label: cmd.label,
        icon: iconForLabel(cmd.label),
        current: false,
        future: true,
      });
    }
    return rows;
  });

  constructor() {
    // Keep the current state visible as the user undoes/redoes or edits.
    effect(() => {
      this.states();
      queueMicrotask(() => {
        const el = this.host.nativeElement.querySelector('.row.current');
        if (el === null) return;
        try {
          el.scrollIntoView({ block: 'nearest' });
        } catch {
          // `scrollIntoView` is unavailable / unimplemented in some
          // environments (jsdom) — the auto-scroll is a nicety, never
          // essential, so swallow rather than surface a noisy error.
        }
      });
    });
  }

  protected goto(depth: number): void {
    this.bus.goto(depth);
  }

  protected onKey(event: KeyboardEvent, depth: number): void {
    event.preventDefault();
    this.goto(depth);
  }

  protected clear(): void {
    const ok =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Clear the history? Undo/redo steps will be discarded (the document itself is kept).',
          );
    if (!ok) return;
    this.history.clear();
  }
}

/**
 * Best-effort Material icon for a command, inferred from its label keywords.
 * Purely cosmetic — unknown labels fall back to a generic edit icon.
 */
function iconForLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('delete') || l.includes('remove')) return 'delete';
  if (l.includes('insert') || l.includes('add') || l.includes('create') || l.includes('shape'))
    return 'add_box';
  if (l.includes('duplicate')) return 'content_copy';
  if (l.includes('paste')) return 'content_paste';
  if (l.includes('move')) return 'open_with';
  if (l.includes('rotate')) return 'rotate_right';
  if (l.includes('scale') || l.includes('resize')) return 'aspect_ratio';
  if (l.includes('flip')) return 'flip';
  if (l.includes('ungroup')) return 'folder_off';
  if (l.includes('group')) return 'folder';
  if (l.includes('fill') || l.includes('color') || l.includes('gradient') || l.includes('style'))
    return 'palette';
  if (l.includes('stroke')) return 'border_color';
  if (l.includes('text') || l.includes('font')) return 'title';
  if (l.includes('path') || l.includes('anchor') || l.includes('node')) return 'timeline';
  if (l.includes('page') || l.includes('artboard')) return 'crop_landscape';
  if (l.includes('align') || l.includes('distribute')) return 'align_horizontal_left';
  if (l.includes('front') || l.includes('back') || l.includes('order')) return 'flip_to_front';
  if (l.includes('snapshot') || l.includes('restore')) return 'restore';
  return 'edit';
}
