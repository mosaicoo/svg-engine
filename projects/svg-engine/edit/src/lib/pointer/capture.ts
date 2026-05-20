/**
 * Pointer capture helpers — single canonical place for the
 * `setPointerCapture` / `releasePointerCapture` dance that gestures
 * across the editor (selection-overlay, canvas-gestures, anchor-overlay,
 * rotation-pivot, guides-overlay, color-picker, ...) all need.
 *
 * **Why a shared util**: before this module, every overlay/component
 * doing drag gestures had its OWN inline copy of the same pattern:
 *
 * 1. Cast `event.target` to `Element & { setPointerCapture?(...) }`
 *    (defensive: targets aren't always `Element`, and older impls
 *    don't expose the method).
 * 2. Call `setPointerCapture(event.pointerId)` inside a try/catch
 *    (some browsers/elements reject capture — Safari with disabled
 *    elements, Firefox edge cases).
 *
 * Inline drift was already visible: some callers used `?.` chaining,
 * others used `typeof === 'function'` + `if`, others used `'method' in
 * target` checks. All do the same thing; none tested the edge cases
 * uniformly. Consolidating shrinks the surface and makes the safe
 * pattern free for new gesture code.
 */

/**
 * Defensively call `setPointerCapture(event.pointerId)` on the event's
 * target. Silently no-ops when:
 *
 * - target isn't an `Element` (e.g., it's a text node, document, etc.)
 * - target lacks `setPointerCapture` (jsdom / very old browsers)
 * - the browser rejects the capture call (Safari on a disabled element,
 *   Firefox during certain re-entrant sequences)
 *
 * Returns nothing — capture is best-effort. Callers shouldn't branch
 * on whether it succeeded; the gesture works in both cases (capture
 * is a UX nicety, not a correctness requirement).
 */
export function capturePointer(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const maybe = target as Element & { setPointerCapture?(id: number): void };
  if (typeof maybe.setPointerCapture !== 'function') return;
  try {
    maybe.setPointerCapture(event.pointerId);
  } catch {
    // Some browsers/elements reject capture under specific conditions
    // (Safari on disabled, Firefox during re-entry). Best-effort by
    // contract — swallow and move on.
  }
}

/**
 * Defensively call `releasePointerCapture(event.pointerId)` on the
 * event's target. Same defensive shape as {@link capturePointer} —
 * silent no-op when target/method is missing or the browser rejects.
 *
 * Typically called from `pointerup` and `pointercancel` handlers to
 * symmetrize the capture taken on `pointerdown`.
 */
export function releasePointer(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const maybe = target as Element & { releasePointerCapture?(id: number): void };
  if (typeof maybe.releasePointerCapture !== 'function') return;
  try {
    maybe.releasePointerCapture(event.pointerId);
  } catch {
    // Same rationale as capturePointer — best-effort.
  }
}
