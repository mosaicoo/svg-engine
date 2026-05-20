/**
 * Pointer / keyboard input helpers shared across editor primitives.
 *
 * Lives in `svg-engine/edit` (not `/core`) because every consumer is
 * an editor surface (overlays, gestures, panels) — `/core` stays
 * DOM-free except for the SVG transform parser.
 */
export { capturePointer, releasePointer } from './capture';
export { isEditableTarget } from './is-editable-target';
