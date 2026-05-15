import { toNodeId, type NodeId } from 'svg-engine/core';

/** Attribute name set by the renderer's dispatcher on each node `<g>`. */
const NODE_ID_ATTR = 'data-node-id';

/**
 * Walk up from `target` and return the closest ancestor that carries a
 * `data-node-id` attribute, or `null` when none exists in the chain
 * (e.g., a click on the SVG background).
 *
 * Walks via `parentElement` (HTML/SVG parent chain) so it works for any
 * descendant of the renderer — `<rect>`, `<g>`, even nested groups: the
 * **closest** ancestor wins, which gives natural hit-testing for both
 * leaf shapes and group containers.
 *
 * Pure function: no DOM mutation, no Angular dependency.
 */
export function findOwningNodeId(target: Element | null): NodeId | null {
  let el: Element | null = target;
  while (el !== null) {
    const id = el.getAttribute(NODE_ID_ATTR);
    if (id !== null) return toNodeId(id);
    el = el.parentElement;
  }
  return null;
}

/**
 * Resolve the `NodeId` corresponding to the {@link Event#target} of a
 * pointer/mouse event. Returns `null` for events whose target is not an
 * `Element` (rare) or that do not occur over any node.
 *
 * Use this in click/pointerdown handlers on the canvas:
 * ```ts
 * onPointerDown(e: PointerEvent) {
 *   const id = resolveNodeIdFromEvent(e);
 *   if (id) selection.select(id);
 *   else selection.clear();
 * }
 * ```
 */
export function resolveNodeIdFromEvent(event: Event): NodeId | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return findOwningNodeId(target);
}
