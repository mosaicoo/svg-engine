import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import {
  CommandBus,
  EditorStateService,
  RestoreSnapshotCommand,
  type Snapshot,
  SnapshotsService,
} from 'svg-engine/core';
import { SnapshotsPersistenceService } from 'svg-engine/edit';
import { renderPng } from 'svg-engine/io';
import { RenameAutoFocus } from '../layers-panel/rename-autofocus.directive';

/**
 * **D-073 — `<svge-snapshots-panel>`**. Photoshop-style snapshots
 * panel: the user's named, restorable checkpoints of the document.
 *
 * **Three operations** the user can perform per row:
 *
 * - **Click thumbnail/name** → restores via {@link RestoreSnapshotCommand}
 *   (undoable). Confirms first when the live doc differs from any
 *   snapshot — mirrors Photoshop's "unsaved changes" warning, since
 *   restoring is destructive of the current state.
 * - **F2 / dblclick name** → inline rename (same UX as the Layers
 *   panel — D-066-rename).
 * - **Delete button** → drops the snapshot (also a confirm prompt
 *   when the snapshot is the "currently viewed" one).
 *
 * **Header actions**:
 *
 * - `+ New Snapshot` — calls {@link SnapshotsService.take} with the
 *   current document. The new snapshot pops to the top of the list.
 * - Settings (gear icon) — opens an inline panel toggling
 *   `autoOnDestructive` (Photoshop's "Snapshot before destructive
 *   ops"). `autoOnOpen` is settings-driven but rarely toggled —
 *   exposed in the popover for completeness.
 *
 * **Thumbnails (D-073f)**: generated async via
 * {@link renderPng}(snapshot.document, 0.1) — small 10% scale gives
 * ~80×60 px previews for a 800×600 viewBox. Generated after a
 * snapshot lands in `snapshots()` and stitched back via
 * {@link SnapshotsService.attachThumbnail}. The first paint shows
 * a placeholder icon while the PNG renders.
 *
 * **Bootstrap responsibility**: this panel calls
 * `SnapshotsPersistenceService.hydrate()` and
 * `SnapshotsService.bootstrap(document)` on mount — together they
 * (a) restore previously persisted snapshots and (b) take the
 * `auto-open` baseline when there isn't one. The service has
 * defensive de-dup so re-firing is safe.
 *
 * **A11y**: `role="list"` on container, `role="listitem"` on rows.
 * Each row is `tabindex="0"` and reacts to Enter/Space (restore)
 * and F2 (rename). The "current" snapshot row carries
 * `aria-current="true"`.
 */
@Component({
  selector: 'svge-snapshots-panel',
  standalone: true,
  imports: [MatIconButton, MatIcon, MatSlideToggle, RenameAutoFocus],
  template: `
    <header class="actions-bar" role="toolbar" aria-label="Snapshot actions">
      <button
        mat-icon-button
        type="button"
        class="new-snapshot-btn"
        title="New Snapshot (Ctrl+Shift+S)"
        aria-label="New Snapshot"
        (click)="takeSnapshot()"
      >
        <mat-icon>photo_camera</mat-icon>
      </button>
      <span class="spacer"></span>
      <span class="count" [attr.aria-label]="count() + ' snapshots'"
        >{{ count() }}/{{ limits().maxCount }}</span
      >
      <button
        mat-icon-button
        type="button"
        class="settings-btn"
        title="Settings"
        aria-label="Snapshot settings"
        [attr.aria-expanded]="showSettings()"
        (click)="toggleSettings()"
      >
        <mat-icon>tune</mat-icon>
      </button>
    </header>

    @if (showSettings()) {
      <section class="settings" role="region" aria-label="Snapshot settings">
        <div class="setting-row">
          <mat-slide-toggle
            [checked]="limits().autoOnOpen"
            (change)="setAutoOnOpen($event.checked)"
            aria-label="Snapshot on open"
          ></mat-slide-toggle>
          <span class="setting-label">
            <strong>Snapshot on open</strong>
            <small>Take an &ldquo;Opened&rdquo; baseline when the document loads.</small>
          </span>
        </div>
        <div class="setting-row">
          <mat-slide-toggle
            [checked]="limits().autoOnDestructive"
            (change)="setAutoOnDestructive($event.checked)"
            aria-label="Snapshot before destructive edits"
          ></mat-slide-toggle>
          <span class="setting-label">
            <strong>Snapshot before destructive edits</strong>
            <small
              >Pathfinder, Optimize, Batch Convert to Path&hellip; — auto-captures the
              pre-state.</small
            >
          </span>
        </div>
      </section>
    }

    <div class="list" role="list" aria-label="Snapshots">
      @for (snap of snapshots(); track snap.id) {
        <div
          class="row"
          role="listitem"
          tabindex="0"
          [class.current]="currentId() === snap.id"
          [class.auto]="snap.source !== 'manual'"
          [attr.aria-current]="currentId() === snap.id"
          [attr.aria-label]="ariaLabel(snap)"
          (click)="onRowClick($event, snap)"
          (dblclick)="onRowDoubleClick($event, snap)"
          (keydown.enter)="onRowEnter($any($event), snap)"
          (keydown.space)="onRowEnter($any($event), snap)"
          (keydown.f2)="onRowF2($any($event), snap)"
        >
          <div class="thumb" [class.placeholder]="snap.thumbnail === null">
            @if (snap.thumbnail !== null) {
              <img [src]="snap.thumbnail" [alt]="snap.name" />
            } @else {
              <mat-icon aria-hidden="true">{{ sourceIcon(snap) }}</mat-icon>
            }
          </div>

          <div class="meta">
            @if (renamingId() === snap.id) {
              <input
                svgeRenameAutoFocus
                class="rename-input"
                type="text"
                [value]="snap.name"
                (click)="$event.stopPropagation()"
                (keydown.enter)="commitRename($event, snap)"
                (keydown.escape)="cancelRename()"
                (blur)="commitRename($event, snap)"
              />
            } @else {
              <span class="name" (dblclick)="startRename($event, snap.id)">{{ snap.name }}</span>
            }
            <span class="when" [title]="absoluteTime(snap.createdAt)">{{
              relativeTime(snap.createdAt)
            }}</span>
          </div>

          <div class="actions">
            <button
              mat-icon-button
              type="button"
              class="restore-btn"
              title="Restore"
              aria-label="Restore snapshot"
              (click)="onRestoreClick($event, snap)"
            >
              <mat-icon>history</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              class="delete-btn"
              title="Delete"
              aria-label="Delete snapshot"
              (click)="onDeleteClick($event, snap)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>
      } @empty {
        <p class="empty">
          No snapshots yet. Press <kbd>Ctrl+Shift+S</kbd> or click the camera icon to take one.
        </p>
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
      padding: 4px 6px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-low, #f5f5f5);
    }
    .new-snapshot-btn,
    .settings-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .new-snapshot-btn mat-icon,
    .settings-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .count {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant, #666);
      font-size: 11px;
    }
    .settings {
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      padding: 8px 10px;
      background: var(--mat-sys-surface-container, #f0f0f0);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .setting-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
    }
    .setting-label {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
    }
    .setting-label small {
      color: var(--mat-sys-on-surface-variant, #777);
      font-size: 11px;
    }
    .list {
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
      padding: 4px 0;
    }
    .empty {
      padding: 16px;
      color: var(--mat-sys-on-surface-variant, #777);
      text-align: center;
      font-style: italic;
      font-size: 12px;
    }
    .empty kbd {
      font-family: inherit;
      font-size: 11px;
      padding: 1px 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 3px;
      background: var(--mat-sys-surface, #fff);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      cursor: pointer;
      border-bottom: 1px solid var(--mat-sys-surface-container-high, #eee);
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
    .row.current .when {
      color: inherit;
    }
    .thumb {
      flex: 0 0 auto;
      width: 56px;
      height: 42px;
      background: var(--mat-sys-surface-container-high, #ddd);
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 3px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thumb img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .thumb.placeholder mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .meta {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
    .when {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-variant-numeric: tabular-nums;
    }
    .rename-input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 2px 4px;
      margin: 0;
      font: inherit;
      color: inherit;
      background: var(--mat-sys-surface, #fff);
      border: 1px solid var(--mat-sys-primary, #1976d2);
      border-radius: 3px;
      outline: none;
    }
    .actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 2px;
      opacity: 0.5;
      transition: opacity 120ms;
    }
    .row:hover .actions,
    .row:focus .actions,
    .row.current .actions {
      opacity: 1;
    }
    .restore-btn,
    .delete-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .restore-btn mat-icon,
    .delete-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnapshotsPanel {
  private readonly snapshotsService = inject(SnapshotsService);
  private readonly persistence = inject(SnapshotsPersistenceService, { optional: true });
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  protected readonly snapshots = this.snapshotsService.snapshots;
  protected readonly count = this.snapshotsService.count;
  protected readonly limits = this.snapshotsService.limits;
  protected readonly currentId = this.snapshotsService.currentSnapshotId;

  protected readonly showSettings = signal(false);
  protected readonly renamingId = signal<string | null>(null);

  /**
   * Snapshots whose `thumbnail === null` queued for async PNG render.
   * Guarded by a set so the same snapshot isn't enqueued twice
   * (effect re-fires whenever `snapshots()` changes — adding /
   * deleting any row would otherwise re-queue all pending ones).
   */
  private readonly pendingThumbnails = new Set<string>();

  constructor() {
    // Bootstrap: hydrate from storage (if any), then ensure the
    // `auto-open` baseline exists. Order matters — hydration may
    // already include a baseline, in which case bootstrap is a no-op
    // thanks to SnapshotsService's defensive check.
    this.persistence?.hydrate();
    this.snapshotsService.bootstrap(this.state.document());

    // Async thumbnail generation: watch for snapshots without a
    // thumbnail and kick off renderPng for each. Effects fire after
    // any signal change in their read-set; we guard via
    // `pendingThumbnails` to avoid duplicate work.
    effect(() => {
      const list = this.snapshots();
      for (const snap of list) {
        if (snap.thumbnail !== null) continue;
        if (this.pendingThumbnails.has(snap.id)) continue;
        this.pendingThumbnails.add(snap.id);
        this.generateThumbnail(snap.id, snap);
      }
    });
  }

  // ── Header actions ───────────────────────────────────────────────

  protected takeSnapshot(): void {
    this.snapshotsService.take(this.state.document(), { source: 'manual' });
  }

  protected toggleSettings(): void {
    this.showSettings.update((v) => !v);
  }

  protected setAutoOnOpen(checked: boolean): void {
    this.snapshotsService.setLimits({ autoOnOpen: checked });
  }

  protected setAutoOnDestructive(checked: boolean): void {
    this.snapshotsService.setLimits({ autoOnDestructive: checked });
  }

  // ── Row interactions ────────────────────────────────────────────

  protected onRowClick(event: MouseEvent, snap: Snapshot): void {
    // Ignore clicks that originated on the rename input / action
    // buttons — those handle themselves and call stopPropagation,
    // but defensive guard is cheap.
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input') !== null) return;
    if (this.renamingId() === snap.id) return;
    this.restoreSnapshot(snap);
  }

  protected onRowDoubleClick(event: MouseEvent, snap: Snapshot): void {
    event.stopPropagation();
    // Dblclick on the name span is handled by `startRename`; dblclick
    // elsewhere on the row triggers restore (same as single click —
    // dbl makes the gesture explicit for users with sticky fingers).
    this.restoreSnapshot(snap);
  }

  protected onRowEnter(event: KeyboardEvent, snap: Snapshot): void {
    event.preventDefault();
    if (this.renamingId() === snap.id) return;
    this.restoreSnapshot(snap);
  }

  protected onRowF2(event: KeyboardEvent, snap: Snapshot): void {
    event.preventDefault();
    this.renamingId.set(snap.id);
  }

  protected onRestoreClick(event: MouseEvent, snap: Snapshot): void {
    event.stopPropagation();
    this.restoreSnapshot(snap);
  }

  protected onDeleteClick(event: MouseEvent, snap: Snapshot): void {
    event.stopPropagation();
    const ok =
      typeof window === 'undefined'
        ? true
        : window.confirm(`Delete snapshot "${snap.name}"? This cannot be undone.`);
    if (!ok) return;
    this.snapshotsService.delete(snap.id);
  }

  // ── Rename ───────────────────────────────────────────────────────

  protected startRename(event: Event, id: string): void {
    event.stopPropagation();
    this.renamingId.set(id);
  }

  protected commitRename(event: Event, snap: Snapshot): void {
    if (this.renamingId() !== snap.id) return;
    const input = event.target as HTMLInputElement | null;
    const raw = input?.value ?? '';
    this.renamingId.set(null);
    this.snapshotsService.rename(snap.id, raw);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  // ── Restore (with confirm if current state diverged) ─────────────

  private restoreSnapshot(snap: Snapshot): void {
    // If the user has unsaved-since-last-snapshot changes, warn them
    // — restoring loses progress (it goes to undo stack, so they
    // can still recover via Ctrl+Z, but the prompt makes the
    // consequence explicit). Skip the prompt when there's no live
    // doc to lose (currentId already equals snap.id).
    if (this.currentId() !== snap.id && typeof window !== 'undefined') {
      const ok = window.confirm(
        `Restore snapshot "${snap.name}"?\n\nYour current changes will be moved to the undo history (Ctrl+Z to recover).`,
      );
      if (!ok) return;
    }
    this.bus.dispatch(new RestoreSnapshotCommand(snap.id, this.snapshotsService));
  }

  // ── Async thumbnail generation ───────────────────────────────────

  private async generateThumbnail(id: string, snap: Snapshot): Promise<void> {
    try {
      const blob = await renderPng(snap.document, 0.1);
      const dataUrl = await blobToDataUrl(blob);
      this.snapshotsService.attachThumbnail(id, dataUrl);
    } catch (e) {
      // Non-fatal: thumbnail stays null, panel shows placeholder
      // icon. Warn once for diagnostics.
      console.warn(`SnapshotsPanel: thumbnail generation failed for "${snap.name}" (${id}):`, e);
    } finally {
      this.pendingThumbnails.delete(id);
    }
  }

  // ── Template helpers ─────────────────────────────────────────────

  protected sourceIcon(snap: Snapshot): string {
    switch (snap.source) {
      case 'auto-open':
        return 'play_arrow';
      case 'auto-destructive':
        return 'warning';
      case 'manual':
      default:
        return 'photo_camera';
    }
  }

  protected ariaLabel(snap: Snapshot): string {
    const tail = this.currentId() === snap.id ? ', currently restored' : '';
    return `${snap.name}, ${this.relativeTime(snap.createdAt)}${tail}`;
  }

  /**
   * Format `ts` as "3 min ago" / "2 h ago" / absolute date. Reads
   * `nowTick()` so the template re-evaluates every 30 seconds —
   * Photoshop-style relative timestamps stay fresh without per-second
   * change detection thrash.
   */
  protected relativeTime(ts: number): string {
    return formatRelative(ts, this.nowTick());
  }

  protected absoluteTime(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  /**
   * Signal that ticks every 30s — drives the relative-time text
   * staying fresh ("3 min ago" auto-advances). Read inside
   * {@link relativeTime} so the template binds reactively.
   */
  private readonly nowTick = signal(Date.now());
}

/** Promise wrapper over FileReader for blob → data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader unavailable (non-browser env)'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Format `ts` as a Photoshop-style relative time ("just now", "3 min
 * ago", "2 h ago", "5 d ago"). Falls back to absolute date for
 * snapshots older than a week.
 */
function formatRelative(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} d ago`;
  return new Date(ts).toLocaleDateString();
}
