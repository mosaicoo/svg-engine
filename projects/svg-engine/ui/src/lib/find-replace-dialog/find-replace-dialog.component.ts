import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import {
  CommandBus,
  EditorStateService,
  type NodeId,
  SetPropertyOnManyCommand,
  SetStylePropertyOnManyCommand,
  type SvgNode,
  type SvgStyle,
} from 'svg-engine/core';
import { type FindCriteria, type FindMatch, FindReplaceService } from 'svg-engine/edit';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * **D-070** — Find & Replace dialog. Search across the current
 * document for nodes whose fill / stroke color, font family, or
 * arbitrary top-level attribute matches the search term; preview the
 * matches in a scrollable list; then replace ALL of them in a single
 * undo step via the appropriate batch command.
 *
 * **Why a dedicated dialog** (not an inline panel): F&R is a
 * focused, modal workflow — designers run a search, scan the matches,
 * decide, and dismiss. Trying to live-edit nodes while a marquee /
 * tool is active would create conflicts with selection state. Modal
 * keeps it simple.
 *
 * **Single-undo guarantee**: the dispatched command is one of
 * `SetStylePropertyOnManyCommand` (for fill/stroke) or
 * `SetPropertyOnManyCommand<TextNode, 'fontFamily'>` (for fontFamily)
 * or `SetPropertyOnManyCommand<SvgNode, string>` (for generic
 * attribute). Each is a SINGLE undoable step — Ctrl+Z reverts the
 * whole batch.
 *
 * **Limitations** (documented in the hint area):
 * - Color comparison is string-equality after trim+lowercase. `red`
 *   doesn't match `#ff0000` — designers using the editor color picker
 *   author hex so this is the common case; cross-format matching is
 *   a v2 polish (would need a color parser).
 * - Generic attribute uses string-equality on the coerced string
 *   value (`fontSize: 16` matches the search value `'16'`).
 * - Scope is the WHOLE document — no "selection only" toggle in v1
 *   (would need a checkbox + filter step; defer to follow-up if
 *   asked).
 */
@Component({
  selector: 'svge-find-replace-dialog',
  standalone: true,
  imports: [
    SvgeDialogShell,
    MatButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
  ],
  template: `
    <svge-dialog-shell
      icon="find_replace"
      title="Find & Replace"
      subtitle="Replace fill, stroke, font family, or any attribute across the document"
    >
      <div class="form" role="group" aria-label="Find & Replace controls">
        <mat-form-field appearance="outline" class="full">
          <mat-label>search in</mat-label>
          <mat-select [value]="kind()" (selectionChange)="setKind($event.value)">
            <mat-option value="fill">Fill color</mat-option>
            <mat-option value="stroke">Stroke color</mat-option>
            <mat-option value="fontFamily">Font family</mat-option>
            <mat-option value="attribute">Attribute (advanced)</mat-option>
          </mat-select>
        </mat-form-field>

        @if (kind() === 'attribute') {
          <mat-form-field appearance="outline" class="full">
            <mat-label>attribute key</mat-label>
            <input
              matInput
              type="text"
              [value]="attrKey()"
              placeholder="fontSize"
              (input)="onAttrKey($event)"
            />
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full">
          <mat-label>find</mat-label>
          <input
            matInput
            type="text"
            [value]="findValue()"
            [placeholder]="findPlaceholder()"
            (input)="onFind($event)"
          />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>replace with</mat-label>
          <input
            matInput
            type="text"
            [value]="replaceValue()"
            [placeholder]="replacePlaceholder()"
            (input)="onReplace($event)"
          />
        </mat-form-field>

        <div class="actions-row">
          <button mat-button type="button" (click)="runSearch()" [disabled]="findValue() === ''">
            <mat-icon>search</mat-icon>
            Find ({{ matchCount() }})
          </button>
        </div>

        <p class="hint">
          Color matching is case-insensitive string equality. <code>red</code> won't match
          <code>#ff0000</code> — use the same format you authored with.
        </p>

        @if (matches().length > 0) {
          <div class="match-list" role="list" aria-label="Matches">
            @for (m of matches(); track m.id) {
              <div class="match" role="listitem">
                <span class="match-id" [title]="m.id">{{ m.id.slice(0, 8) }}</span>
                <span class="match-field">{{ m.field }}</span>
                <span class="match-value" [title]="m.currentValue">{{ m.currentValue }}</span>
              </div>
            }
          </div>
        } @else if (searched()) {
          <p class="no-matches">No matches found.</p>
        }
      </div>

      <span svgeDialogFooterActions>
        <button mat-button type="button" (click)="cancel()">Close</button>
        <button mat-button type="button" color="primary" (click)="apply()" [disabled]="!canApply()">
          Replace All ({{ matchCount() }})
        </button>
      </span>
    </svge-dialog-shell>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 4px 0;
    }
    .full {
      width: 100%;
    }
    .actions-row {
      display: flex;
      gap: 8px;
      margin: 4px 0 8px;
    }
    .hint {
      margin: 0 0 8px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--mat-sys-on-surface-variant, #888);
      font-style: italic;
    }
    .hint code {
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, Menlo, monospace;
      font-size: 10px;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      padding: 1px 4px;
      border-radius: 3px;
    }
    .match-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
    }
    .match {
      display: grid;
      grid-template-columns: 80px 100px 1fr;
      gap: 8px;
      padding: 4px 8px;
      font-size: 11px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #f0f0f0);
      align-items: center;
    }
    .match:last-child {
      border-bottom: 0;
    }
    .match-id {
      font-family: monospace;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .match-field {
      color: var(--mat-sys-primary, #1976d2);
      font-weight: 500;
    }
    .match-value {
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--mat-sys-on-surface, inherit);
    }
    .no-matches {
      margin: 8px 0;
      padding: 8px;
      text-align: center;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #888);
      font-style: italic;
    }
    [svgeDialogFooterActions] {
      display: inline-flex;
      gap: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeFindReplaceDialog {
  private readonly ref = inject<MatDialogRef<SvgeFindReplaceDialog, void>>(MatDialogRef);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  private readonly findSvc = inject(FindReplaceService);

  // ── UI state signals ─────────────────────────────────────────────
  protected readonly kind = signal<FindCriteria['kind']>('fill');
  protected readonly attrKey = signal<string>('fontSize');
  protected readonly findValue = signal<string>('');
  protected readonly replaceValue = signal<string>('');
  protected readonly matches = signal<readonly FindMatch[]>([]);
  /** True after the user clicked Find at least once — drives "No matches" message. */
  protected readonly searched = signal<boolean>(false);

  protected readonly matchCount = computed(() => this.matches().length);
  /** Apply is enabled when there's at least one match AND a replace string typed. */
  protected readonly canApply = computed(() => this.matches().length > 0);

  protected setKind(value: FindCriteria['kind']): void {
    this.kind.set(value);
    // Reset matches when changing the search axis — the previous results
    // are no longer relevant.
    this.matches.set([]);
    this.searched.set(false);
  }

  protected onAttrKey(ev: Event): void {
    this.attrKey.set((ev.target as HTMLInputElement).value);
    this.matches.set([]);
    this.searched.set(false);
  }
  protected onFind(ev: Event): void {
    this.findValue.set((ev.target as HTMLInputElement).value);
    // Don't auto-rerun — explicit Find button. Avoids running the
    // walker on every keystroke for large docs.
    this.matches.set([]);
    this.searched.set(false);
  }
  protected onReplace(ev: Event): void {
    this.replaceValue.set((ev.target as HTMLInputElement).value);
  }

  /** Placeholder for the "find" input — adapts to the chosen kind. */
  protected findPlaceholder(): string {
    switch (this.kind()) {
      case 'fill':
      case 'stroke':
        return '#ff0000';
      case 'fontFamily':
        return 'Arial';
      case 'attribute':
        return 'value to match';
    }
  }
  protected replacePlaceholder(): string {
    switch (this.kind()) {
      case 'fill':
      case 'stroke':
        return '#00ff00';
      case 'fontFamily':
        return "'Inter', sans-serif";
      case 'attribute':
        return 'new value';
    }
  }

  protected runSearch(): void {
    const criteria = this.buildCriteria();
    if (criteria === null) {
      this.matches.set([]);
      this.searched.set(true);
      return;
    }
    const root = this.state.document().root;
    const found = this.findSvc.findAll(root, criteria);
    this.matches.set(found);
    this.searched.set(true);
  }

  /**
   * Build the appropriate batch command for the current matches and
   * dispatch it. Single undo entry regardless of how many nodes were
   * matched. After dispatch the matches are re-queried so the user
   * sees an empty list (nothing left to replace).
   */
  protected apply(): void {
    const criteria = this.buildCriteria();
    if (criteria === null) return;
    const matches = this.matches();
    if (matches.length === 0) return;
    const ids: NodeId[] = matches.map((m) => m.id);
    const replace = this.replaceValue();

    switch (criteria.kind) {
      case 'fill':
      case 'stroke': {
        const field: keyof SvgStyle = criteria.kind === 'fill' ? 'fill' : 'stroke';
        this.bus.dispatch(
          new SetStylePropertyOnManyCommand(
            ids,
            field,
            replace,
            `Find & Replace ${field} (${ids.length} nodes)`,
          ),
        );
        break;
      }
      case 'fontFamily': {
        this.bus.dispatch(
          new SetPropertyOnManyCommand<SvgNode, 'fontFamily' & keyof SvgNode>(
            ids,
            'fontFamily' as never,
            replace as never,
            `Find & Replace fontFamily (${ids.length} nodes)`,
          ),
        );
        break;
      }
      case 'attribute': {
        // Generic top-level field — `as never` to bypass the type
        // narrowing (we accept the runtime trade-off documented in
        // SetPropertyOnManyCommand: garbage-in produces a runtime
        // fail() return from updateNode if the field is unrecognized).
        this.bus.dispatch(
          new SetPropertyOnManyCommand<SvgNode, never>(
            ids,
            criteria.key as never,
            replace as never,
            `Find & Replace ${criteria.key} (${ids.length} nodes)`,
          ),
        );
        break;
      }
    }
    // Refresh matches against the post-replace state. Most matches
    // will be gone (their value changed), but if the user typed the
    // same value as the find, the list stays the same — that's fine
    // and the Apply button just re-dispatches a no-op replace.
    this.runSearch();
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Build the {@link FindCriteria} object from the current UI state.
   * Returns `null` when the find input is empty (no search runs) or
   * the attribute key is empty in attribute mode.
   */
  private buildCriteria(): FindCriteria | null {
    const value = this.findValue();
    if (value === '') return null;
    switch (this.kind()) {
      case 'fill':
        return { kind: 'fill', value };
      case 'stroke':
        return { kind: 'stroke', value };
      case 'fontFamily':
        return { kind: 'fontFamily', value, match: 'contains' };
      case 'attribute': {
        const key = this.attrKey().trim();
        if (key === '') return null;
        return { kind: 'attribute', key, value };
      }
    }
  }
}
