import type { MatDialogConfig } from '@angular/material/dialog';

/**
 * **Dialog sizing system** — D-044 follow-up (UI consistency sprint).
 *
 * Standard width buckets matching the Material Design 3 specification
 * for adaptive dialogs. Use these instead of hand-rolled `width: '720px'`
 * configs so every SVGEngine dialog scales identically and looks
 * professionally aligned with the rest of the editor.
 *
 * **Choosing a size**:
 *
 * | Preset  | Width                 | Use case                                                          |
 * | ------- | --------------------- | ----------------------------------------------------------------- |
 * | `'sm'`  | `min(440px, 92vw)`    | Confirm prompts, alerts, single-input prompts (rename, new name)  |
 * | `'md'`  | `min(600px, 92vw)`    | Settings forms with multiple grouped fields (workspace settings)  |
 * | `'lg'`  | `min(720px, 92vw)`    | Content viewers (source code, preview, log)                       |
 * | `'xl'`  | `min(960px, 95vw)`    | Wizards, multi-pane / split layouts, large previews               |
 *
 * **maxHeight** is always `85vh` — leaves breathing room for the
 * browser chrome / dock and avoids dialogs that overflow off-screen on
 * shorter viewports (laptop, tablet landscape). Body sections inside
 * `<svge-dialog-shell>` scroll independently when content exceeds the
 * height budget; header + footer stay pinned.
 *
 * **Why `min(W, V)` and not raw px**: ensures dialogs scale down on
 * narrow viewports (mobile, embedded panels) without overflowing.
 * `92vw`/`95vw` leaves a thin margin so the dialog still reads as a
 * floating surface rather than full-bleed.
 */
export type SvgeDialogSize = 'sm' | 'md' | 'lg' | 'xl';

const WIDTH_BY_SIZE: Record<SvgeDialogSize, string> = {
  sm: 'min(440px, 92vw)',
  md: 'min(600px, 92vw)',
  lg: 'min(720px, 92vw)',
  xl: 'min(960px, 95vw)',
};

/** Canonical maxHeight — see module docstring for rationale. */
export const SVGE_DIALOG_MAX_HEIGHT = '85vh';

/**
 * Build a {@link MatDialogConfig} with SVGEngine's standardized layout
 * defaults. Accepts an `extras` object that's merged on top so callers
 * can override / extend individual fields (typically `injector` for
 * D-042 multi-editor scope wiring).
 *
 * **Defaults set**:
 *
 * - `width`: from the size bucket
 * - `maxHeight`: `85vh`
 * - `autoFocus`: `false` — content viewers and settings forms generally
 *   shouldn't auto-focus the first input on open (often jumps a field
 *   the user didn't intend). Override per-dialog when initial focus
 *   matters (e.g., a rename prompt should focus its input).
 * - `restoreFocus`: `true` — focus returns to the trigger element on
 *   close, the accessible default.
 * - `panelClass`: `'svge-dialog-panel'` — hook for any cross-dialog
 *   CSS (border-radius, elevation) without touching individual dialogs.
 *
 * **Usage**:
 *
 * ```ts
 * dialog.open(SvgeSvgSourceDialog, svgeDialogConfig('lg', { injector }));
 * dialog.open(SvgeWorkspaceSettings, svgeDialogConfig('md', { injector }));
 * dialog.open(MyConfirmDialog, svgeDialogConfig('sm', { autoFocus: 'first-tabbable' }));
 * ```
 */
export function svgeDialogConfig<T = unknown>(
  size: SvgeDialogSize,
  extras: Omit<Partial<MatDialogConfig<T>>, 'width'> = {},
): MatDialogConfig<T> {
  return {
    width: WIDTH_BY_SIZE[size],
    maxHeight: SVGE_DIALOG_MAX_HEIGHT,
    autoFocus: false,
    restoreFocus: true,
    panelClass: 'svge-dialog-panel',
    ...extras,
  };
}
