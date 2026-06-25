import type { ProviderToken } from '@angular/core';
import {
  CommandBus,
  type NodeId,
  type Point,
  TranslateManyCommand,
} from '@mosaicoo/svg-engine/core';
import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';
import type { ShortcutContext } from '../shortcut/shortcut';
import { ShortcutRegistry } from '../shortcut/shortcut-registry.service';
import { SelectionService } from './selection.service';

/** Nudge step in document units per single arrow key press. */
const STEP_NORMAL = 1;
/** Larger step when Shift is held (matches Figma / Affinity / Illustrator). */
const STEP_LARGE = 10;

/**
 * Keyboard nudge for the active selection — Fase 6c-2 accessibility.
 *
 * Registers 8 shortcuts: `ArrowUp/Down/Left/Right` (step = 1px) and
 * `Shift+Arrow*` (step = 10px). Each press dispatches a single
 * {@link TranslateManyCommand} so the operation is one undo entry per
 * keypress (not one per selected node).
 *
 * **Why a plugin (not always-on in `SelectionService`)**: nudging is
 * an editor convention, not a model behaviour. Apps embedding the
 * library in a read-only viewer context (`svg-engine/render` alone)
 * never want to bind arrow keys. Opt-in via `provideSvgEnginePlugin`
 * keeps the lib uncoupled and testable.
 *
 * **Why arrow keys specifically**: it's the keyboard-only equivalent
 * of pointer drag — without this, users without a pointing device
 * literally cannot move selected nodes. The single biggest a11y win
 * per LOC in the library.
 *
 * **Composition with `ShortcutService`**: the shortcut handlers
 * call `event.preventDefault()` themselves so the browser doesn't
 * scroll the page on arrow press. They early-return on empty
 * selection (no work to do, lets the arrow event continue to
 * whatever has focus — e.g., scrolling a panel).
 *
 * Usage at bootstrap:
 * ```ts
 * import { selectionNudgePlugin, provideSvgEnginePlugin } from '@mosaicoo/svg-engine/edit';
 * providers: [provideSvgEnginePlugin(selectionNudgePlugin)]
 * ```
 */
export const selectionNudgePlugin: EditorPlugin = {
  id: 'svge.builtin.selection.nudge',
  version: '1.0.0',
  name: 'Selection arrow-key nudge',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const shortcuts = ctx.injector.get(ShortcutRegistry);

    // D-042: resolve services from the per-fire ShortcutContext.injector
    // (per-editor scope when active) with fallback to plugin install
    // context. Critical for multi-editor apps so nudge targets the
    // editor that received the keystroke, not a singleton root.
    const fromCtx = <T>(runCtx: ShortcutContext | undefined, token: ProviderToken<T>): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    const nudge = (runCtx: ShortcutContext | undefined, dx: number, dy: number): void => {
      const selection = fromCtx(runCtx, SelectionService);
      const ids = Array.from(selection.selectedIds());
      if (ids.length === 0) return;
      const delta: Point = { x: dx, y: dy };
      const translations = new Map<NodeId, Point>();
      for (const id of ids) translations.set(id, delta);
      fromCtx(runCtx, CommandBus).dispatch(
        new TranslateManyCommand(translations, `Nudge ${ids.length} node(s)`),
      );
    };

    // Eight bindings: 4 cardinals × 2 step sizes. Each registered with a
    // distinct id so plugin uninstall removes the specific entries
    // (ShortcutRegistry throws on duplicate id but allows duplicate
    // combo — perfect for our shift-variant overlay pattern).
    const bindings: readonly { id: string; combo: string; dx: number; dy: number }[] = [
      { id: 'svge.nudge.up', combo: 'ArrowUp', dx: 0, dy: -STEP_NORMAL },
      { id: 'svge.nudge.down', combo: 'ArrowDown', dx: 0, dy: STEP_NORMAL },
      { id: 'svge.nudge.left', combo: 'ArrowLeft', dx: -STEP_NORMAL, dy: 0 },
      { id: 'svge.nudge.right', combo: 'ArrowRight', dx: STEP_NORMAL, dy: 0 },
      { id: 'svge.nudge.up.large', combo: 'Shift+ArrowUp', dx: 0, dy: -STEP_LARGE },
      { id: 'svge.nudge.down.large', combo: 'Shift+ArrowDown', dx: 0, dy: STEP_LARGE },
      { id: 'svge.nudge.left.large', combo: 'Shift+ArrowLeft', dx: -STEP_LARGE, dy: 0 },
      { id: 'svge.nudge.right.large', combo: 'Shift+ArrowRight', dx: STEP_LARGE, dy: 0 },
    ];
    for (const b of bindings) {
      ctx.track(
        shortcuts.register({
          id: b.id,
          combo: b.combo,
          description: `Nudge selection ${b.combo}`,
          run: (event: KeyboardEvent, runCtx?: ShortcutContext): void => {
            // No-op on empty selection — but still preventDefault so the
            // browser doesn't scroll. (Matches Figma: arrows are reserved
            // for editor use whenever the canvas has focus, even when
            // nothing is selected.)
            event.preventDefault();
            nudge(runCtx, b.dx, b.dy);
          },
        }),
      );
    }
  },
};
