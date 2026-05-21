import type { ProviderToken } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  type EditorPlugin,
  MENU_SLOT,
  MenuContributionRegistry,
  PLUGIN_API_VERSION,
  type MenuContributionContext,
} from 'svg-engine/edit';

import { SvgeSvgSourceDialog } from '../svg-source-dialog';

/**
 * **`builtinUiMenuContributionsPlugin`** — D-044 (UI controls full-functionality follow-up).
 *
 * Sibling plugin to `builtinMenuContributionsPlugin` (in `svg-engine/edit`)
 * for menu items that **require Material dialog infrastructure** —
 * specifically `MatDialog` from `@angular/material/dialog`. The edit-side
 * plugin cannot import these (D-017 headless boundary). This plugin
 * lives in `svg-engine/ui` where Material is allowed.
 *
 * **What's included**:
 *
 * | Slot         | Item          | Action                                        |
 * | ------------ | ------------- | --------------------------------------------- |
 * | `menu.file`  | View Source…  | Opens `<svge-svg-source-dialog>` via MatDialog |
 *
 * **Why a separate plugin** instead of merging into the edit-side one:
 *
 * - **D-017**: `edit` is forbidden from importing `@angular/material`.
 *   `MatDialog` lives there, so any item that opens a dialog cannot
 *   live in the edit-side plugin.
 * - **Opt-in independence**: consumers in headless mode (Modo 1 D-037)
 *   never install this — they don't have Material loaded at all.
 *   Consumers using the shells install both edit + ui plugins together.
 *
 * **Multi-editor (D-042/D-043/D-044)**: `run()` handlers receive
 * `MenuContributionContext` and resolve `MatDialog` from the consumer
 * injector. **Critically**, the opened dialog is wired with
 * `MatDialogConfig.injector = runCtx.injector` so the dialog
 * component's `inject(EditorStateService)` (and any other service
 * lookup) resolves from the **active editor scope** — not from the
 * overlay's root injector. Without that wiring the dialog would show
 * the root `EditorStateService` (empty document) instead of the
 * route-scoped one (with the actual shapes), which was the symptom
 * observed when the dialog first shipped — the SVG body came back
 * empty even though the canvas had content. Same defect class as
 * `SvgeContextMenuService` before its parent-injector fix.
 *
 * **Future items** for this plugin (registered as deferred):
 * - Workspace Settings… (dialog with `<svge-workspace-settings>`)
 * - Export With Options… (dialog with format chooser + dimensions)
 * - About SVGEngine (Material-styled About box vs the alert in the
 *   edit-side plugin's Help item)
 *
 * **Opt-in**: like other built-in plugins, consumers explicitly
 * provision via `provideSvgEnginePlugin(builtinUiMenuContributionsPlugin)`.
 */
export const builtinUiMenuContributionsPlugin: EditorPlugin = {
  id: 'svge.builtin.ui-menu-contributions',
  name: 'Built-in UI menu contributions (dialogs) (D-044)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // D-042/D-043 lazy resolution — mirrors the edit-side plugin's
    // `fromCtx` pattern so handlers reach the active editor scope.
    const fromCtx = <T>(token: ProviderToken<T>, runCtx?: MenuContributionContext): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    // ── File ▸ View Source… ──────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.file.view-source',
        slot: MENU_SLOT.FILE,
        label: 'View Source…',
        icon: 'code',
        // Order higher than Export PNG (60) so it appears after exports.
        // Lower than Optimize (80) so it groups with view actions.
        order: 65,
        run(runCtx) {
          const dialog = fromCtx(MatDialog, runCtx);
          dialog.open(SvgeSvgSourceDialog, {
            width: 'min(720px, 92vw)',
            maxHeight: '90vh',
            autoFocus: false,
            restoreFocus: true,
            // D-044 follow-up fix: scope the dialog component's
            // injector to the editor's so EditorStateService resolves
            // to the active document (not the overlay-root empty one).
            // `runCtx?.injector` is the dispatching consumer's
            // injector (e.g., a route with provideSvgEngineEditorScope).
            // Falls back to ctx.injector (plugin install ctx = root)
            // for single-editor / direct-test invocations.
            injector: runCtx?.injector ?? ctx.injector,
          });
        },
      }),
    );
  },
};
