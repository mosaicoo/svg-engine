/**
 * True when the event target is an editable element where typed
 * characters should NOT trigger global shortcuts / tool key bindings.
 *
 * **Why centralized**: this gate was independently re-implemented in
 * `ShortcutService` (was private) and in `playground-home` (was a
 * file-local function). The two copies were structurally identical
 * but lived apart, risking drift if one added a case (e.g., a future
 * `[contenteditable=plaintext-only]` quirk) and the other didn't.
 *
 * **What counts as editable**:
 * - Native form controls that accept text: `<input>`, `<textarea>`,
 *   `<select>` (Select responds to letter keys for option navigation,
 *   so we treat it as editable to avoid hijacking that).
 * - Any element with `contenteditable` enabled (catches our own inline
 *   text editor, contenteditable widgets in third-party panels, etc.).
 *
 * **What's deliberately NOT included**:
 * - `<button>` / `<a>` — they consume Enter/Space as activation, but
 *   that's the browser's default behavior, not a shortcut conflict.
 * - Elements with `role="textbox"` but no `contenteditable` — ARIA
 *   without the actual DOM hook means typed chars don't go anywhere.
 *
 * @param target Usually `event.target` from a `KeyboardEvent`.
 * @returns `true` when shortcut handlers should bail out.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
