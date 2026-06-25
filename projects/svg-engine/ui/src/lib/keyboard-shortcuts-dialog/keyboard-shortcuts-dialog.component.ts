import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import {
  comboFromEvent,
  formatCombo,
  type KeybindingView,
  KeybindingsService,
} from '@mosaicoo/svg-engine/edit';
import { SvgeDialogShell } from '../dialog-shell';

/** A category header plus its rows, for the grouped list rendering. */
interface ShortcutGroup {
  readonly category: string;
  readonly rows: readonly KeybindingView[];
}

/**
 * **D-087** — Keyboard Shortcuts manager. Central dialog that lists every
 * registered command, shows its effective key combination, and lets the
 * user **rebind, unbind, or reset** it — with live conflict warnings and
 * a one-click "restore all defaults".
 *
 * **Model**: reads {@link KeybindingsService.bindings} (defaults + user
 * overrides, conflict-flagged) and writes back through the same service,
 * which persists to `localStorage` and feeds {@link ShortcutService}'s
 * dispatch — so a rebind takes effect the moment the dialog closes (and
 * survives reload).
 *
 * **Recorder**: editing a row focuses a key-capture box. `keydown` is
 * captured locally (`preventDefault` + `stopPropagation`) so the global
 * shortcut listener doesn't *fire* the command we're trying to rebind,
 * and Escape cancels the capture instead of closing the dialog. The
 * captured combo is validated + conflict-checked before Save.
 *
 * **Limitations** (v1, documented in the footer hint): chord bindings
 * (VSCode's `Ctrl+K Ctrl+S`) aren't supported — single combos only; the
 * recorder reserves Escape for "cancel", so Escape itself can't be bound
 * through the recorder (rare for editor commands, which use modifiers).
 */
@Component({
  selector: 'svge-keyboard-shortcuts-dialog',
  standalone: true,
  imports: [
    SvgeDialogShell,
    MatButton,
    MatIconButton,
    MatIcon,
    MatTooltip,
    MatFormField,
    MatLabel,
    MatInput,
    MatSuffix,
  ],
  template: `
    <svge-dialog-shell
      icon="keyboard"
      title="Keyboard Shortcuts"
      subtitle="View and customize the key combination for each command"
    >
      <!-- Body content goes straight into the shell's flex-column body
           (.dlg-body) — NO intermediate wrapper. An extra flex level
           between the body and the scroll region collapses the fill and
           leaves dead space below the footer on resize; the working
           dialogs (source viewer, etc.) put the flex-fill child directly
           in the body. The list is that flex-fill child. -->
      <mat-form-field appearance="outline" class="search">
        <mat-label>Search commands</mat-label>
        <input
          matInput
          type="text"
          [value]="filter()"
          (input)="onFilter($event)"
          placeholder="group, Ctrl+G, snapshot…"
        />
        @if (filter() !== '') {
          <button
            matSuffix
            mat-icon-button
            type="button"
            class="clear-search"
            matTooltip="Clear search"
            aria-label="Clear search"
            (click)="clearFilter()"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>

      @if (groups().length === 0) {
        <p class="empty">No commands match “{{ filter() }}”.</p>
      } @else {
        <div class="list" role="table" aria-label="Keyboard shortcuts">
          @for (g of groups(); track g.category) {
            <div class="group" role="rowgroup">
              <h3 class="group-title">{{ g.category }}</h3>
              @for (b of g.rows; track b.id) {
                <div class="row" role="row" [class.editing]="editingId() === b.id">
                  <span class="row-desc" role="cell" [title]="b.id">{{ b.description }}</span>

                  <span class="row-binding" role="cell">
                    @if (editingId() === b.id) {
                      <span
                        #recorder
                        class="recorder"
                        tabindex="0"
                        role="textbox"
                        aria-label="Press the new shortcut"
                        (keydown)="onRecordKey($event)"
                      >
                        @if (recordedCombo() === null) {
                          <span class="recorder-hint">Press shortcut…</span>
                        } @else {
                          <kbd class="combo">{{ display(recordedCombo()!) }}</kbd>
                        }
                      </span>
                    } @else if (b.isUnbound) {
                      <span class="unbound" title="No shortcut">—</span>
                    } @else {
                      <kbd class="combo" [class.is-conflict]="b.conflict">{{
                        display(b.combo!)
                      }}</kbd>
                      @if (b.conflict) {
                        <mat-icon
                          class="conflict-icon"
                          matTooltip="Also bound to another command"
                          aria-label="Shortcut conflict"
                          >warning</mat-icon
                        >
                      }
                      @if (b.isCustom) {
                        <span
                          class="custom-dot"
                          matTooltip="Customized"
                          aria-label="Customized"
                        ></span>
                      }
                    }
                  </span>

                  <span class="row-actions" role="cell">
                    @if (editingId() === b.id) {
                      @if (recordConflicts().length > 0) {
                        <span class="record-conflict" role="alert">
                          Conflicts: {{ recordConflicts().join(', ') }}
                        </span>
                      }
                      <button
                        mat-icon-button
                        type="button"
                        class="act"
                        matTooltip="Save"
                        aria-label="Save shortcut"
                        [disabled]="recordedCombo() === null"
                        (click)="save(b.id)"
                      >
                        <mat-icon>check</mat-icon>
                      </button>
                      <button
                        mat-icon-button
                        type="button"
                        class="act"
                        matTooltip="Remove shortcut"
                        aria-label="Remove shortcut"
                        (click)="unbind(b.id)"
                      >
                        <mat-icon>block</mat-icon>
                      </button>
                      <button
                        mat-icon-button
                        type="button"
                        class="act"
                        matTooltip="Cancel"
                        aria-label="Cancel"
                        (click)="cancel()"
                      >
                        <mat-icon>close</mat-icon>
                      </button>
                    } @else {
                      <button
                        mat-icon-button
                        type="button"
                        class="act"
                        matTooltip="Edit shortcut"
                        aria-label="Edit shortcut"
                        (click)="startEdit(b.id)"
                      >
                        <mat-icon>edit</mat-icon>
                      </button>
                      @if (b.isCustom) {
                        <button
                          mat-icon-button
                          type="button"
                          class="act"
                          matTooltip="Reset to default"
                          aria-label="Reset to default"
                          (click)="reset(b.id)"
                        >
                          <mat-icon>restart_alt</mat-icon>
                        </button>
                      }
                    }
                  </span>
                </div>
              }
            </div>
          }
        </div>
      }

      <p class="hint">
        Press the keys for a command to rebind it. <kbd>Esc</kbd> cancels. Single combos only (no
        chords).
      </p>

      <span svgeDialogFooterActions>
        <button
          mat-button
          type="button"
          [disabled]="!keybindings.hasCustomizations()"
          (click)="resetAll()"
        >
          Restore all defaults
        </button>
        <button mat-button type="button" color="primary" (click)="close()">Close</button>
      </span>
    </svge-dialog-shell>
  `,
  styles: `
    /* Search + list + hint are DIRECT children of the shell's flex-column
       body (no wrapper). The list is the flex-fill child (mirrors the
       source-viewer's <pre>); search + hint stay fixed. This keeps the
       list as the single scroll region that tracks the dialog height on
       resize, with the footer pinned and no dead space below it. */
    .search {
      width: 100%;
      flex: 0 0 auto;
      margin-bottom: 4px;
    }
    .clear-search {
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 32px;
      --mat-icon-button-touch-target-display: none;
    }
    .clear-search mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }
    /* Vertically center the clear (×) button in the outline field. Removing
       the icon button's touch target collapses it off-center inside the
       suffix wrapper; pin the wrapper to center against the input row.
       Material renders the suffix in its own view → pierce with :host
       ::ng-deep (scoped to this dialog's search field). */
    :host ::ng-deep .search .mat-mdc-form-field-icon-suffix {
      align-self: center;
      display: inline-flex;
      align-items: center;
      padding: 0 4px 0 0;
    }
    .empty {
      margin: 8px 0;
      padding: 8px;
      text-align: center;
      font-size: 12px;
      font-style: italic;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .list {
      /* The single scroll region: flex-fills the body and is the only
         scroller, so it tracks the dialog height on resize. min-height: 0
         (not a fixed floor) is required for the flex item to shrink and
         scroll instead of pushing the footer down — same as the proven
         source-viewer <pre>. */
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      border-radius: 6px;
      background: var(--mat-sys-surface, #fff);
    }
    .group-title {
      margin: 0;
      padding: 6px 10px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mat-sys-on-surface-variant, #888);
      background: var(--mat-sys-surface-container-low, #f7f7f7);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #eee);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 8px;
      padding: 2px 6px 2px 10px;
      min-height: 36px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #f0f0f0);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .row.editing {
      background: var(--mat-sys-surface-container-high, rgba(25, 118, 210, 0.06));
    }
    .row-desc {
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row-binding {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      justify-self: end;
    }
    .combo {
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, Menlo, monospace;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      background: var(--mat-sys-surface-container, #f3f3f3);
      color: var(--mat-sys-on-surface, inherit);
      white-space: nowrap;
    }
    .combo.is-conflict {
      border-color: var(--mat-sys-error, #d32f2f);
      color: var(--mat-sys-error, #d32f2f);
    }
    .conflict-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--mat-sys-error, #d32f2f);
    }
    .custom-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--mat-sys-primary, #1976d2);
    }
    .unbound {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #aaa);
    }
    .recorder {
      display: inline-flex;
      align-items: center;
      min-width: 120px;
      justify-content: center;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px dashed var(--mat-sys-primary, #1976d2);
      background: var(--mat-sys-surface, #fff);
      cursor: text;
      outline: none;
    }
    .recorder:focus {
      border-style: solid;
      box-shadow: 0 0 0 2px var(--mat-sys-primary, rgba(25, 118, 210, 0.3));
    }
    .recorder-hint {
      font-size: 11px;
      font-style: italic;
      color: var(--mat-sys-on-surface-variant, #999);
    }
    .row-actions {
      display: inline-flex;
      align-items: center;
      gap: 0;
      justify-self: end;
    }
    .act {
      width: 30px;
      height: 30px;
      --mdc-icon-button-state-layer-size: 30px;
      --mat-icon-button-touch-target-display: none;
    }
    .act mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
    }
    .record-conflict {
      font-size: 10px;
      color: var(--mat-sys-error, #d32f2f);
      margin-right: 4px;
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hint {
      margin: 6px 2px 0;
      font-size: 11px;
      line-height: 1.4;
      font-style: italic;
      color: var(--mat-sys-on-surface-variant, #888);
      flex: 0 0 auto;
    }
    .hint kbd {
      font-family: monospace;
      font-size: 10px;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      padding: 1px 4px;
      border-radius: 3px;
      font-style: normal;
    }
    [svgeDialogFooterActions] {
      display: inline-flex;
      gap: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeKeyboardShortcutsDialog {
  protected readonly keybindings = inject(KeybindingsService);
  private readonly ref = inject<MatDialogRef<SvgeKeyboardShortcutsDialog, void>>(MatDialogRef);

  protected readonly filter = signal<string>('');
  /** Id of the row currently in capture mode (`null` = none). */
  protected readonly editingId = signal<string | null>(null);
  /** Combo captured by the recorder for the editing row (`null` = none yet). */
  protected readonly recordedCombo = signal<string | null>(null);

  private readonly recorderEl = viewChild<ElementRef<HTMLElement>>('recorder');

  constructor() {
    // Focus the recorder the moment it appears so the user can press the
    // combo without an extra click. Re-runs when editingId toggles.
    effect(() => {
      if (this.editingId() === null) return;
      this.recorderEl()?.nativeElement.focus();
    });
  }

  /** Bindings filtered by the search box, grouped by category (sorted). */
  protected readonly groups = computed<readonly ShortcutGroup[]>(() => {
    const q = this.filter().trim().toLowerCase();
    const rows = this.keybindings.bindings().filter((b) => {
      if (q === '') return true;
      if (b.description.toLowerCase().includes(q)) return true;
      if (b.category.toLowerCase().includes(q)) return true;
      if (b.combo !== null && b.combo.toLowerCase().includes(q)) return true;
      if (b.combo !== null && this.display(b.combo).toLowerCase().includes(q)) return true;
      return false;
    });
    const out: { category: string; rows: KeybindingView[] }[] = [];
    for (const b of rows) {
      let g = out[out.length - 1];
      if (g === undefined || g.category !== b.category) {
        g = { category: b.category, rows: [] };
        out.push(g);
      }
      g.rows.push(b);
    }
    return out;
  });

  /** Descriptions of commands that already use the combo being recorded. */
  protected readonly recordConflicts = computed<readonly string[]>(() => {
    const combo = this.recordedCombo();
    const id = this.editingId();
    if (combo === null || id === null) return [];
    const ids = this.keybindings.conflictIdsFor(combo, id);
    if (ids.length === 0) return [];
    const byId = new Map(this.keybindings.bindings().map((b) => [b.id, b.description]));
    return ids.map((cid) => byId.get(cid) ?? cid);
  });

  protected display(combo: string): string {
    return formatCombo(combo);
  }

  protected onFilter(ev: Event): void {
    this.filter.set((ev.target as HTMLInputElement).value);
  }

  protected clearFilter(): void {
    this.filter.set('');
  }

  protected startEdit(id: string): void {
    this.recordedCombo.set(null);
    this.editingId.set(id);
  }

  protected cancel(): void {
    this.editingId.set(null);
    this.recordedCombo.set(null);
  }

  /**
   * Capture a keystroke as the candidate combo. Stops the event so the
   * global shortcut listener doesn't fire the command (or the dialog
   * close on Escape) while we record. Escape cancels capture.
   */
  protected onRecordKey(ev: KeyboardEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      this.cancel();
      return;
    }
    const combo = comboFromEvent(ev);
    if (combo !== null) this.recordedCombo.set(combo);
  }

  protected save(id: string): void {
    const combo = this.recordedCombo();
    if (combo === null) return;
    this.keybindings.setBinding(id, combo);
    this.cancel();
  }

  protected unbind(id: string): void {
    this.keybindings.unbind(id);
    this.cancel();
  }

  protected reset(id: string): void {
    this.keybindings.resetBinding(id);
  }

  protected resetAll(): void {
    this.keybindings.resetAll();
  }

  protected close(): void {
    this.ref.close();
  }
}
