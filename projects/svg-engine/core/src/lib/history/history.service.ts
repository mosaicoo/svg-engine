import { computed, Injectable, signal } from '@angular/core';
import type { Command } from '../commands/command';

const DEFAULT_MAX_HISTORY = 100;
const MIN_MAX_HISTORY = 1;

/**
 * Two stacks (`undo`, `redo`) of {@link Command} instances. Pure
 * bookkeeping — does **not** call `execute`/`undo` itself; that is the
 * {@link CommandBus}'s responsibility, which calls {@link push} after a
 * successful execute and {@link commitUndo} / {@link commitRedo} after a
 * successful inverse operation.
 *
 * Exposed as Angular signals so consumers can drive `[disabled]` on Undo
 * and Redo buttons without manual subscriptions.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly _undoStack = signal<readonly Command[]>([]);
  private readonly _redoStack = signal<readonly Command[]>([]);
  private readonly _maxSize = signal<number>(DEFAULT_MAX_HISTORY);

  readonly undoStack = this._undoStack.asReadonly();
  readonly redoStack = this._redoStack.asReadonly();
  readonly maxSize = this._maxSize.asReadonly();

  readonly canUndo = computed(() => this._undoStack().length > 0);
  readonly canRedo = computed(() => this._redoStack().length > 0);

  /** Push a freshly-executed command and clear the redo stack. */
  push(command: Command): void {
    this._undoStack.update((stack) => trimToMax([...stack, command], this._maxSize()));
    this._redoStack.set([]);
  }

  /** Top of the undo stack without removing it. */
  peekUndo(): Command | null {
    return this._undoStack().at(-1) ?? null;
  }

  /** Top of the redo stack without removing it. */
  peekRedo(): Command | null {
    return this._redoStack().at(-1) ?? null;
  }

  /** Move top of undo onto redo. Call **only** after a successful undo. */
  commitUndo(): void {
    const stack = this._undoStack();
    const top = stack.at(-1);
    if (!top) return;
    this._undoStack.set(stack.slice(0, -1));
    this._redoStack.update((s) => [...s, top]);
  }

  /** Move top of redo onto undo. Call **only** after a successful redo. */
  commitRedo(): void {
    const stack = this._redoStack();
    const top = stack.at(-1);
    if (!top) return;
    this._redoStack.set(stack.slice(0, -1));
    this._undoStack.update((s) => trimToMax([...s, top], this._maxSize()));
  }

  /** Empty both stacks (e.g., when loading a new document). */
  clear(): void {
    this._undoStack.set([]);
    this._redoStack.set([]);
  }

  /** Configure the maximum undo history size (oldest entries are dropped). */
  setMaxSize(size: number): void {
    if (!Number.isFinite(size) || size < MIN_MAX_HISTORY) {
      throw new RangeError(`HistoryService.setMaxSize: size must be >= ${MIN_MAX_HISTORY}`);
    }
    const next = Math.trunc(size);
    this._maxSize.set(next);
    this._undoStack.update((stack) => trimToMax(stack, next));
  }
}

function trimToMax(stack: readonly Command[], max: number): readonly Command[] {
  if (stack.length <= max) return stack;
  return stack.slice(stack.length - max);
}
