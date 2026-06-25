import {
  AUTO_PARENT,
  CommandBus,
  createText,
  EditorStateService,
  findNodeById,
  InsertNodeCommand,
} from '@mosaicoo/svg-engine/core';
import { resolveNodeIdFromEvent } from '../hit-testing/hit-testing';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import { InlineTextEditorService } from './text-tool.service';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/** Stable id of the builtin Text tool. */
export const TEXT_TOOL_ID = 'com.svge.tool.text';

/**
 * Placeholder text inserted on a fresh click. Acts as a visible hint
 * the user types over immediately. Esc on a placeholder removes the
 * node (handled by {@link InlineTextEditor}); typing anything replaces
 * the placeholder via natural text input.
 */
const PLACEHOLDER_TEXT = 'Type here';

/**
 * Default font size (CSS pixels equivalent in SVG user units). Matches
 * Material body typography baseline so freshly-typed text reads at a
 * comfortable size on the default-zoom canvas.
 */
const DEFAULT_FONT_SIZE = 16;

/**
 * Builtin Text tool — click on the canvas to insert a text node at the
 * cursor position and immediately enter inline-edit mode.
 *
 * **Interaction model** (Illustrator/Figma convention):
 *
 * - **Click**: insert a placeholder text node at the cursor + open the
 *   inline editor (see {@link InlineTextEditor}). Typing replaces the
 *   placeholder content.
 * - **Enter / Blur** in the editor: commit current content. Empty
 *   content + placeholder origin → node is removed.
 * - **Esc**: cancel edit. Fresh placeholder is removed; pre-existing
 *   text reverts to its prior content.
 * - **Shift+Enter** in the editor: insert a literal newline (not
 *   currently rendered as a multi-line `<text>` due to SVG spec
 *   limitations on plain `<text>`; multi-line support is future
 *   polish via `<tspan>` rows).
 *
 * **Style of created text**: default font-size (16 user units), fill
 * black, no stroke. Matches the existing `createText` defaults so the
 * Inspector can edit style normally afterwards.
 *
 * The tool delegates actual edit rendering to {@link InlineTextEditor}
 * via {@link InlineTextEditorService.beginEdit}. Cross-cutting via
 * service avoids coupling the tool to the editor's render strategy
 * (foreignObject + contentEditable in v1).
 */
class TextTool implements Tool {
  readonly id = TEXT_TOOL_ID;
  readonly label = 'Text';
  readonly icon = 'title';
  readonly cursor = 'text';
  readonly shortcut = 't';

  onActivate(ctx: ToolContext): void {
    ctx.injector.get(SelectionService).clear();
  }

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    // Only the LEFT button creates / edits — right-click is reserved
    // for context menus (future polish).
    if (event.raw.button !== 0) return;

    const state = ctx.injector.get(EditorStateService);
    const editorSvc = ctx.injector.get(InlineTextEditorService);

    // **Edit existing text under cursor** (Bug fix #1 — user reported
    // "não é possível editar o texto"): walking the DOM via the
    // hit-test helper. When the click hits a text node, open the
    // inline editor on it instead of creating a yet another placeholder
    // on top — matches Illustrator/Figma convention (Text tool over
    // existing text → edit it).
    const hitId = resolveNodeIdFromEvent(event.raw);
    if (hitId !== null) {
      const hitNode = findNodeById(state.document().root, hitId);
      if (hitNode !== null && hitNode.type === 'text') {
        // Existing text — open editor with placeholder=false so Esc
        // doesn't remove the (user-authored) node on cancel.
        editorSvc.beginEdit(hitId, false);
        return;
      }
    }

    // **PAGES-REFACTOR Fase 1**: CommandBus resolves AUTO_PARENT to
    // the active page id via the editor scope's InsertParentResolver.
    // TOOL-OPT-C: pull defaults from InlineTextEditorService so the
    // tool-options bar drives the next placeholder. Fall back to the
    // original constants (font-size + black fill) when the user hasn't
    // tweaked anything.
    const fontSize = editorSvc.fontSize() ?? DEFAULT_FONT_SIZE;
    const node = createText(
      {
        x: event.docPoint.x,
        y: event.docPoint.y + fontSize * 0.8, // baseline ≈ 80% of font-size
        content: PLACEHOLDER_TEXT,
        fontSize,
      },
      {
        style: { fill: editorSvc.fill() },
      },
    );
    // Apply any optional typography prefs that aren't first-class
    // factory params (D-053 fields live directly on the TextNode).
    const ff = editorSvc.fontFamily();
    if (ff !== null) (node as { fontFamily?: string }).fontFamily = ff;
    const fw = editorSvc.fontWeight();
    if (fw !== null) (node as { fontWeight?: number }).fontWeight = fw;
    const fs = editorSvc.fontStyle();
    if (fs !== null) (node as { fontStyle?: 'italic' }).fontStyle = fs;
    const ta = editorSvc.textAnchor();
    if (ta !== 'start') (node as { textAnchor?: 'start' | 'middle' | 'end' }).textAnchor = ta;
    ctx.injector.get(CommandBus).dispatch(new InsertNodeCommand(AUTO_PARENT, node));
    // Open the inline editor on the freshly-created node. The
    // `placeholder=true` flag tells the editor: "if the user cancels
    // without typing, remove this node entirely (it was never real
    // content)".
    editorSvc.beginEdit(node.id, true);
  }
}

/**
 * Builtin Text tool plugin. Registers the Text tool only — the
 * {@link InlineTextEditor} component is opt-in (consumer adds the
 * `svgeInlineTextEditor` attribute to their renderer projection).
 */
export const textToolPlugin: EditorPlugin = {
  id: 'com.svge.tools.text',
  name: 'Text Tool (builtin)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new TextTool()));
  },
};

/** Re-export for external integrations + tests. */
export { PLACEHOLDER_TEXT };
