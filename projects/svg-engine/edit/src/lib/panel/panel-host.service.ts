import { Injectable, signal } from '@angular/core';

/**
 * **D-098** — Stable, **layout-independent** identifiers for the editor's
 * dockable panels.
 *
 * These are the *contract* between the menu (Window ▸ Panels) and whatever
 * shell currently hosts the panels. A menu item asks to reveal a panel by
 * its logical id (`PANEL_ID.LAYERS`); the shell maps that id to wherever
 * the panel physically lives **today** (which panel-group, which tab,
 * collapsed or not, a floating window tomorrow). When the layout changes,
 * only the shell's mapping changes — the ids, the menu, and the panels
 * themselves are untouched.
 *
 * The values intentionally match the `<svge-panel-group>` tab ids used by
 * `<svge-shell-pro>`'s right rail, so the shell's reveal handler is a
 * straight pass-through for in-rail panels. Keep them in sync: if a tab id
 * changes in the shell, update the matching constant here (or add a mapping
 * step in the shell).
 */
export const PANEL_ID = {
  LAYERS: 'layers',
  HISTORY: 'history',
  PROPERTIES: 'properties',
  APPEARANCE: 'appearance',
  EXPORT: 'export',
  GRADIENT: 'gradient',
} as const;

/** Union of the known logical panel ids. */
export type PanelId = (typeof PANEL_ID)[keyof typeof PANEL_ID];

/**
 * A reveal request emitted by {@link PanelHostService.reveal}.
 *
 * `nonce` is a monotonically increasing counter so that revealing the
 * **same** panel twice in a row still produces a distinct signal value —
 * otherwise an `effect()` watching the request wouldn't re-run (signals
 * dedupe by value), and clicking "Window ▸ Panels ▸ Layers" a second time
 * (e.g. to un-collapse the rail) would be a silent no-op.
 */
export interface PanelRevealRequest {
  /** Logical id of the panel to reveal — typically a {@link PanelId}. */
  readonly panelId: string;
  /** Distinguishes repeated reveals of the same panel. */
  readonly nonce: number;
}

/**
 * **D-098** — editor-scoped indirection between "user asked to open a
 * panel" and "the shell shows it". Headless (lives in `svg-engine/edit`)
 * so the edit-side menu plugin can call {@link reveal}; the UI shell
 * (`svg-engine/ui`) watches {@link revealRequest} and resolves the id to
 * its current layout.
 *
 * **Why a service and not a direct call**: the menu contribution (a plain
 * object registered at bootstrap) has no reference to the shell component
 * instance, the shell's layout is free to change, and multi-editor hosts
 * need each editor to route to its own shell. A scoped intent bus solves
 * all three — the menu emits an id, the active editor's shell reacts.
 *
 * **Scope**: per-editor (listed in `provideSvgEngineEditorScope`). Two
 * editors mounted side-by-side keep independent reveal requests + active
 * panel, exactly like {@link SelectionService} et al. The menu handler
 * resolves *this* service from `runCtx.injector` (the firing editor's
 * scope), so a reveal never leaks across editors.
 */
@Injectable({ providedIn: 'root' })
export class PanelHostService {
  private nonce = 0;

  private readonly _revealRequest = signal<PanelRevealRequest | null>(null);
  /**
   * The most recent reveal request (or `null` before any). Shells watch
   * this via an `effect()` and switch to / un-collapse the matching panel.
   */
  readonly revealRequest = this._revealRequest.asReadonly();

  private readonly _activePanelId = signal<string | null>(null);
  /**
   * The panel the host currently shows (reported by the shell). Lets the
   * menu reflect which panel is open — e.g. a future check mark. `null`
   * when no host is mounted or nothing is reported yet.
   */
  readonly activePanelId = this._activePanelId.asReadonly();

  /**
   * Ask the active shell to reveal the panel with this logical id. No-op
   * from the service's side if no shell is listening (headless mode, or a
   * minimal shell without that panel) — reveal is a request, not a
   * guarantee.
   */
  reveal(panelId: string): void {
    this._revealRequest.set({ panelId, nonce: ++this.nonce });
  }

  /**
   * Reported by the shell when its visible panel changes (tab click or a
   * reveal it honored). Drives {@link activePanelId}. Pass `null` to clear
   * (e.g. the panel rail is fully collapsed).
   */
  setActivePanel(panelId: string | null): void {
    this._activePanelId.set(panelId);
  }
}
