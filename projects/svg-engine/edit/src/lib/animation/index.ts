// **D-082 (Animation Timeline) — F2.** Editor-scoped engine + transport for
// the page animation. Pairs with the headless core model (F0/F1):
//   - AnimationService — reads/edits the AnimationDoc via undoable commands.
//   - PlaybackService — owns the playhead and drives it with requestAnimationFrame.
// Both are per-editor scope (registered in provideSvgEngineEditorScope).
export { AnimationService } from './animation.service';
export { DEFAULT_STEP_MS, PlaybackService } from './playback.service';
