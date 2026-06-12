import type { Injector } from '@angular/core';
import {
  CommandBus,
  type ClipMaskKind,
  EditorStateService,
  extractDefById,
  findNodeById,
  generateNodeId,
  type GroupNode,
  MakeClipMaskCommand,
  type NodeId,
  ReleaseClipMaskCommand,
  type SvgNode,
  unwrapUrlRef,
  walk,
} from 'svg-engine/core';
import { nodeToSvgMarkup, svgImporter } from 'svg-engine/io';

import { SelectionService } from '../selection/selection.service';

/**
 * **D-086 — Object ▸ Mask edit-side actions.** The io-aware glue between
 * the menu and the pure core commands (`MakeClipMaskCommand` /
 * `ReleaseClipMaskCommand`):
 *
 * - **Make** serializes the topmost selected node (the "clipper") into a
 *   `<clipPath>`/`<mask>` def via `nodeToSvgMarkup` (io), then dispatches.
 * - **Release** extracts the def markup from `document.defs`, re-parses the
 *   inner geometry back into a node via `svgImporter` (io) for Illustrator-
 *   parity shape restoration, then dispatches.
 *
 * Kept out of `svg-engine/core` because both directions need io (which
 * core may not import). Takes an `Injector` so it works from any menu
 * `run(ctx)` handler in the active editor scope.
 */

/** Pre-order (= SVG paint order) list of node ids; last id is topmost. */
function paintOrder(root: SvgNode): NodeId[] {
  const order: NodeId[] = [];
  walk(root as Parameters<typeof walk>[0], (n) => {
    order.push(n.id);
  });
  return order;
}

/**
 * The topmost (paint-order-last) node among `ids` — i.e. the one that
 * `makeClipMask` would consume as the clipper. Returns `null` when `ids`
 * is empty or the resolved id is missing. Exported as the **single source
 * of truth** for "who is the clipper", so the menu's `disabled` factory can
 * inspect the clipper (e.g. to forbid an `<image>` clipper for clipPath —
 * D-086 follow-up) without duplicating the paint-order logic.
 */
export function topmostSelected(root: GroupNode, ids: NodeId[]): SvgNode | null {
  if (ids.length === 0) return null;
  const order = paintOrder(root);
  const inOrder = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return findNodeById(root, inOrder[inOrder.length - 1]!);
}

/**
 * Make a clipping path / opacity mask from the current selection. The
 * topmost selected node becomes the clip/mask def; the rest are clipped.
 * No-op when fewer than 2 nodes are selected.
 */
export function makeClipMask(injector: Injector, kind: ClipMaskKind): void {
  const selection = injector.get(SelectionService);
  const state = injector.get(EditorStateService);
  const ids = Array.from(selection.selectedIds()) as NodeId[];
  if (ids.length < 2) return;

  const root = state.document().root;
  const clipper = topmostSelected(root, ids);
  if (clipper === null) return;
  // An `<image>` can't be a clipping path — SVG ignores it inside
  // `<clipPath>`, which would crop the targets to nothing. The menu
  // disables this combo (`cantMakeClipFactory`), but guard here too so
  // other surfaces that call `run()` directly without honouring the
  // disabled signal (NLU voice intents, context menus) can't produce a
  // broken clip. Opacity masks accept any content, images included.
  if (kind === 'clipPath' && clipper.type === 'image') return;
  const clipperId = clipper.id;
  const targetIds = ids.filter((id) => id !== clipperId);
  const inner = nodeToSvgMarkup(clipper);
  if (inner.trim().length === 0) return;

  const tag = kind === 'clipPath' ? 'clipPath' : 'mask';
  const units = kind === 'clipPath' ? 'clipPathUnits' : 'maskUnits';
  const defId = `svge-${kind === 'clipPath' ? 'clip' : 'mask'}-${generateNodeId()}`;
  const defMarkup = `<${tag} id="${defId}" ${units}="userSpaceOnUse">\n${inner}\n</${tag}>`;

  injector
    .get(CommandBus)
    .dispatch(new MakeClipMaskCommand(targetIds, clipperId, defId, defMarkup, kind));
  selection.selectMany(targetIds);
}

/**
 * Release a clipping path / mask from `nodeId`: clears the reference, drops
 * the orphan def, and restores the clip shape as an object (re-parsed from
 * the def via the importer). No-op when the node has no such reference.
 */
export function releaseClipMask(injector: Injector, nodeId: NodeId, kind: ClipMaskKind): void {
  const state = injector.get(EditorStateService);
  const node = findNodeById(state.document().root, nodeId);
  if (node === null) return;
  const defId = unwrapUrlRef(node.style[kind]);

  let restored: SvgNode | null = null;
  if (defId !== null) {
    const full = extractDefById(state.document().defs, defId);
    if (full !== null) {
      // Strip the <clipPath>/<mask> wrapper → inner geometry, then re-parse.
      const innerGeometry = full
        .replace(/^\s*<(clipPath|mask)\b[^>]*>/i, '')
        .replace(/<\/(clipPath|mask)>\s*$/i, '')
        .trim();
      const parsed = svgImporter.import(
        `<svg xmlns="http://www.w3.org/2000/svg">${innerGeometry}</svg>`,
      );
      if (parsed.ok && parsed.document.root.children.length > 0) {
        restored = parsed.document.root.children[0]!;
      }
    }
  }

  injector.get(CommandBus).dispatch(new ReleaseClipMaskCommand(nodeId, kind, restored));
}
