import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

/**
 * **D-088** — central authority for **Reset Workspace** (Window ▸ Workspace
 * ▸ Reset Workspace). Reverts the **workspace LAYOUT** to its defaults.
 *
 * "Workspace layout" = the user-customizable **panel arrangement** the
 * shells persist to `localStorage`:
 *
 * - panel-group **tab side** (D-081, key `svge-panel-group-tabside-<id>`)
 * - shell-pro **rail collapse** (`svge-shell-pro-libraries-collapsed`,
 *   `svge-shell-pro-right-rail-collapsed`)
 *
 * This is intentionally **distinct** from:
 * - Workspace **Settings** (background / page / grid / rulers / guides) —
 *   reset by the Workspace Settings dialog's "Reset defaults" button.
 * - The **document** itself — never touched here.
 *
 * **Why an epoch signal**: clearing `localStorage` alone wouldn't change the
 * running session — the panel-groups + shell already read their state into
 * signals at construction. So {@link reset} ALSO bumps {@link resetEpoch};
 * the layout-owning components watch it and revert their **live** state to
 * defaults, so the reset is visible immediately (no page reload).
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceLayoutService {
  private readonly document = inject(DOCUMENT);

  private readonly _resetEpoch = signal(0);
  /**
   * Bumped on every {@link reset}. Layout-owning components (panel-group,
   * shell-pro) watch this to revert their live tab-side / collapse state.
   */
  readonly resetEpoch = this._resetEpoch.asReadonly();

  /** Exact `localStorage` keys that hold workspace-layout state. */
  private static readonly LAYOUT_KEYS: readonly string[] = [
    'svge-shell-pro-libraries-collapsed',
    'svge-shell-pro-right-rail-collapsed',
  ];
  /** Key-prefix families (one key per `groupId`) that hold layout state. */
  private static readonly LAYOUT_KEY_PREFIXES: readonly string[] = ['svge-panel-group-tabside-'];

  /**
   * Reset the workspace layout: clear the persisted layout keys and notify
   * live components (via {@link resetEpoch}) to revert to defaults.
   * Idempotent and safe when storage is unavailable (SSR / private mode).
   */
  reset(): void {
    this.clearLayoutStorage();
    this._resetEpoch.update((n) => n + 1);
  }

  private clearLayoutStorage(): void {
    const win = this.document.defaultView;
    if (win === null) return;
    let store: Storage;
    try {
      store = win.localStorage;
    } catch {
      return;
    }
    try {
      // Collect first, remove after — removing during iteration shifts the
      // index and would skip keys.
      const remove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key === null) continue;
        if (
          WorkspaceLayoutService.LAYOUT_KEYS.includes(key) ||
          WorkspaceLayoutService.LAYOUT_KEY_PREFIXES.some((p) => key.startsWith(p))
        ) {
          remove.push(key);
        }
      }
      for (const k of remove) store.removeItem(k);
    } catch {
      /* iteration / removal failed — non-fatal */
    }
  }
}
