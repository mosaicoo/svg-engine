import type { ProviderToken } from '@angular/core';
import {
  type EditorPlugin,
  MENU_SLOT,
  MenuContributionRegistry,
  PLUGIN_API_VERSION,
  type MenuContributionContext,
} from 'svg-engine/edit';

import { SvgeSvgSourceDialogService } from '../svg-source-dialog';
import { SvgeWorkspaceSettingsDialogService } from '../workspace-settings';

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
 * | Slot         | Item                  | Action                                                  |
 * | ------------ | --------------------- | ------------------------------------------------------- |
 * | `menu.file`  | View Source…          | Opens `<svge-svg-source-dialog>` via MatDialog          |
 * | `menu.file`  | Workspace Settings…   | Opens `<svge-workspace-settings>` via MatDialog         |
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
          // Delegate to SvgeSvgSourceDialogService — single source of
          // truth for "how to open the source dialog" (config +
          // injector wiring). Custom routes use the same service so
          // both paths stay aligned automatically.
          const service = fromCtx(SvgeSvgSourceDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── File ▸ Workspace Settings… ───────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.file.workspace-settings',
        slot: MENU_SLOT.FILE,
        label: 'Workspace Settings…',
        icon: 'tune',
        // Lowest order in File group so it sits at the bottom — settings
        // are global / cross-cutting, distinct from the document-scoped
        // actions above.
        order: 90,
        run(runCtx) {
          // Delegate to SvgeWorkspaceSettingsDialogService — same
          // centralization rationale as View Source: dialog config +
          // scope-aware injector wiring live in one place so every
          // call site stays aligned automatically.
          const service = fromCtx(SvgeWorkspaceSettingsDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );
  },
};
