import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

/**
 * **Persistence of the user's plugin enable/disable preference.**
 *
 * The store owns exactly one thing: the set of plugin ids the user has
 * **disabled**. Everything else (which plugins exist, which are live) is
 * derived elsewhere — `PluginCatalog` knows the universe,
 * `PluginRegistry` knows what's installed right now. Keeping this store
 * tiny is deliberate: enable/disable is the only piece that must survive
 * a reload.
 *
 * **App-wide, not per-editor.** Plugins are provided at app bootstrap
 * (`provideSvgEnginePlugin` in `app.config`), so "which plugins are on"
 * is an application-level preference — `providedIn: 'root'`. (Contrast
 * with `SnapshotsPersistenceService`, which is per-editor because it
 * persists per-document state.)
 *
 * **Encapsulated backend.** Today the backend is `localStorage`; the
 * public surface ({@link disabled} signal + {@link isDisabled} /
 * {@link setDisabled}) hides that completely, so a consumer that later
 * wants per-user/server persistence can swap the mechanism without
 * touching `PluginManagerService` or the UI.
 *
 * **Defensive by construction.** All storage access is wrapped — a
 * missing/blocked `localStorage` (SSR, privacy mode, quota) degrades to
 * an in-memory set, never throws. Boot must not break because storage
 * is unavailable.
 *
 * **Storage format** under {@link STORAGE_KEY}:
 * ```json
 * { "v": 1, "disabled": ["com.acme.foo", "com.acme.bar"] }
 * ```
 */
const STORAGE_KEY = 'svge:plugins:state';
const SCHEMA_VERSION = 1;

interface PluginStatePayload {
  readonly v: number;
  readonly disabled: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class PluginStateStore {
  private readonly document = inject(DOCUMENT);
  private readonly _disabled = signal<ReadonlySet<string>>(new Set<string>());

  /** Reactive set of disabled plugin ids — drives the manager's view. */
  readonly disabled = this._disabled.asReadonly();

  constructor() {
    this.hydrate();
  }

  /** Whether the user has disabled this plugin id. */
  isDisabled(id: string): boolean {
    return this._disabled().has(id);
  }

  /** Snapshot of disabled ids (insertion-independent — a plain array). */
  disabledIds(): readonly string[] {
    return [...this._disabled()];
  }

  /**
   * Record the user's preference for a plugin. Persists immediately.
   * Idempotent — disabling an already-disabled id (or enabling an
   * already-enabled id) is a no-op write-through.
   */
  setDisabled(id: string, disabled: boolean): void {
    const next = new Set(this._disabled());
    if (disabled) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this._disabled.set(next);
    this.persist();
  }

  /** Forget a plugin entirely (used when an external plugin is uninstalled). */
  forget(id: string): void {
    if (!this._disabled().has(id)) return;
    const next = new Set(this._disabled());
    next.delete(id);
    this._disabled.set(next);
    this.persist();
  }

  // ── Internals ────────────────────────────────────────────────────

  private hydrate(): void {
    const win = this.window();
    if (win === null) return;
    let raw: string | null;
    try {
      raw = win.localStorage.getItem(STORAGE_KEY);
    } catch {
      return; // storage blocked — stay in-memory
    }
    if (raw === null || raw.length === 0) return;
    let parsed: PluginStatePayload;
    try {
      parsed = JSON.parse(raw) as PluginStatePayload;
    } catch (e) {
      console.warn('PluginStateStore: malformed JSON in storage — ignoring.', e);
      return;
    }
    if (parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.disabled)) {
      console.warn(`PluginStateStore: unexpected payload (v=${parsed.v}) — ignoring.`);
      return;
    }
    this._disabled.set(new Set(parsed.disabled.filter((id) => typeof id === 'string')));
  }

  private persist(): void {
    const win = this.window();
    if (win === null) return;
    const payload: PluginStatePayload = {
      v: SCHEMA_VERSION,
      disabled: [...this._disabled()],
    };
    try {
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('PluginStateStore: localStorage write failed —', e);
    }
  }

  private window(): (Window & typeof globalThis) | null {
    const docWindow = this.document.defaultView;
    if (docWindow !== null) return docWindow as Window & typeof globalThis;
    if (typeof window !== 'undefined') return window;
    return null;
  }
}
