import { CommandBus, createEllipse, EditorStateService, InsertNodeCommand } from 'svg-engine/core';
import {
  type EditorPlugin,
  PLUGIN_API_VERSION,
  type Tool,
  type ToolContext,
  type ToolPointerEvent,
  ToolRegistry,
} from 'svg-engine/edit';
import { StampToolService } from './stamp-tool.service';
import { StampToolOptionsComponent } from './stamp-tool-options.component';

/** Stable id for activation / shortcut wiring. */
export const STAMP_TOOL_ID = 'svge.playground.tool.stamp';

/**
 * **Stamp Tool** — D-038 Phase 3 showcase.
 *
 * On pointer-down, drops a small circle (`createEllipse`) at the cursor
 * with radius + fill color chosen via the tool options bar
 * ({@link StampToolOptionsComponent}). Proves that:
 *
 * 1. A tool can declare `optionsComponent`.
 * 2. `<svge-tool-options>` mounts the component when the tool activates.
 * 3. The component shares DI with the rest of the app — its state
 *    service is read by the tool's `onPointerDown` to parameterize the
 *    insertion.
 *
 * **Activation**: keyboard shortcut `K` (Stamp), or via the tools
 * toolbar (any plugin that contributes a button).
 *
 * **Not for production** — kept in the playground because it's a demo
 * of the options-bar contract, not a feature anyone should ship.
 */
class StampTool implements Tool {
  readonly id = STAMP_TOOL_ID;
  readonly label = 'Stamp';
  readonly icon = 'radio_button_checked';
  readonly cursor = 'crosshair';
  readonly shortcut = 'k';
  readonly optionsComponent = StampToolOptionsComponent;

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const state = ctx.injector.get(StampToolService);
    const bus = ctx.injector.get(CommandBus);
    const root = ctx.injector.get(EditorStateService).document().root;

    const r = state.radius();
    const node = createEllipse(
      { cx: event.docPoint.x, cy: event.docPoint.y, rx: r, ry: r },
      { style: { fill: state.resolvedHex(), stroke: '#222', strokeWidth: 1 } },
    );
    bus.dispatch(new InsertNodeCommand(root.id, node));
  }
}

export const stampToolPlugin: EditorPlugin = {
  id: 'svge.playground.stamp-tool',
  name: 'Playground — Stamp Tool (D-038 Phase 3 showcase)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    ctx.track(ctx.injector.get(ToolRegistry).register(new StampTool()));
  },
};
