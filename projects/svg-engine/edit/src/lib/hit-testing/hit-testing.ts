import {
  findNodeById,
  type GroupNode,
  isLayer,
  isPage,
  toNodeId,
  type NodeId,
} from 'svg-engine/core';

/** Attribute name set by the renderer's dispatcher on each node `<g>`. */
const NODE_ID_ATTR = 'data-node-id';

/**
 * Resolution mode for {@link resolveSelectableNodeId}:
 * - `deep`: pick the deepest (leaf-most) node carrying `data-node-id`.
 *   Original SVGEngine behavior — equivalent to Illustrator's Direct
 *   Selection Tool (A, white arrow).
 * - `group`: walk up the DOM until we reach the **direct child of the
 *   isolation root** (or of the document root when no isolation is
 *   active). Equivalent to Illustrator's Selection Tool (V, black
 *   arrow): clicking a leaf inside a `<g>` selects the group, not the
 *   leaf — *unless* you've isolated that group, in which case the
 *   leaf becomes the topmost selectable.
 */
export type SelectionResolutionMode = 'deep' | 'group';

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

/**
 * Resolve the selectable `NodeId` for a pointer event, honoring the
 * caller's resolution {@link SelectionResolutionMode} and the current
 * isolation scope.
 *
 * **Modes**:
 *
 * - `mode: 'deep'` — returns the deepest node with `data-node-id` under
 *   the event target (same as {@link resolveNodeIdFromEvent}).
 *
 * - `mode: 'group'` — walks the ancestor chain of `data-node-id` nodes
 *   and returns the topmost ancestor that is **a direct child of the
 *   scope root**. The scope root is `isolationRootId` when provided,
 *   else the document root id (`rootId`). This is the Illustrator/
 *   Affinity behavior: clicking inside a group selects the group;
 *   entering isolation on that group makes its children selectable.
 *
 * **Why `rootId` is required for group mode**: without it we couldn't
 * distinguish "node directly under the document root" (= selectable
 * top-level) from "node deep inside a group" (= should bubble up to
 * a group ancestor). Callers pass `state.document().root.id` for the
 * document root.
 *
 * Returns `null` when the event target isn't an `Element`, when no
 * ancestor carries `data-node-id`, or when the chain doesn't include
 * a child of the scope root (defensive — shouldn't happen with a
 * well-formed renderer output).
 */
/** Options shared by the event- and element-based selectable resolvers. */
export interface SelectableResolveOptions {
  readonly mode: SelectionResolutionMode;
  readonly rootId: NodeId;
  readonly isolationRootId?: NodeId | null;
  /**
   * Predicate marking a node id as a **transparent container** — one
   * that group mode should NOT select but instead "see through". Used
   * to skip **Layers / Pages**, which are organizational containers, not
   * functional groups: clicking a shape that lives directly in a layer
   * selects the *shape*, and a shape inside a group inside a layer
   * selects the *group*. When omitted, group mode keeps its original
   * behavior (returns the direct child of the scope root).
   */
  readonly isTransparentContainer?: (id: NodeId) => boolean;
}

export function resolveSelectableNodeId(
  event: Event,
  options: SelectableResolveOptions,
): NodeId | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return resolveSelectableNodeIdFromElement(target, options);
}

/**
 * Element-based twin of {@link resolveSelectableNodeId}: resolves the
 * selectable `NodeId` for an arbitrary DOM element (rather than an
 * event's target). Same group/deep + isolation-scope + transparent-
 * container logic.
 *
 * **Why a separate entry point**: the geometric hit-test fallback
 * (D-091) finds a shape's element by *coordinates* (not by an event
 * target), then needs the IDENTICAL resolution the click path uses —
 * so unfilled-shape selection lands on the same group/leaf a painted
 * click would. Both callers funnel through this one function.
 */
export function resolveSelectableNodeIdFromElement(
  target: Element | null,
  options: SelectableResolveOptions,
): NodeId | null {
  if (target === null) return null;
  if (options.mode === 'deep') return findOwningNodeId(target);
  // Group mode: collect ancestor chain top-down and find the entry
  // immediately under the scope root.
  const scopeRootId = options.isolationRootId ?? options.rootId;
  const chain = collectNodeAncestorIds(target);
  if (chain.length === 0) return null;
  // The renderer marks the document root with NODE_ID_ATTR too (the
  // root <svg:g svgeNode>), so the chain typically looks like:
  //   [leafId, ..., docRootId]
  // We want the entry **before** the scope root (i.e., the direct
  // child of it in the chain). For the document root case this is
  // chain[chain.length - 2] when isolation is null; for an isolated
  // group it's the entry one position before scopeRootId.
  const scopeIdx = chain.indexOf(scopeRootId);
  if (scopeIdx === -1) {
    // Scope root isn't an ancestor of the click target — means the
    // user clicked outside the isolated subtree. Caller decides what
    // to do (typically: ignore click + exit isolation).
    return null;
  }
  if (scopeIdx === 0) {
    // Clicked directly on the scope root element itself (its own
    // group <g>, not a child). Treat as "click on the scope root"
    // — caller can decide (typically: clear selection).
    return scopeRootId;
  }
  // Topmost selectable ancestor below the scope root. Layers/Pages are
  // organizational containers — transparent to selection (see
  // `isTransparentContainer`) — so we skip them and return the topmost
  // REAL node beneath (a group, or the clicked leaf when no group sits
  // between it and the scope). The leaf (`chain[0]`) is never transparent,
  // so the loop always resolves. Without the predicate, the original
  // behavior (the direct child of the scope root) is preserved.
  const isTransparent = options.isTransparentContainer;
  if (isTransparent === undefined) {
    return chain[scopeIdx - 1] ?? null;
  }
  for (let i = scopeIdx - 1; i >= 0; i--) {
    const id = chain[i]!;
    if (!isTransparent(id)) return id;
  }
  return chain[0] ?? null;
}

/**
 * Collect the `NodeId` chain from `target` upward to the document
 * root, in deepest-first order. Internal helper for
 * {@link resolveSelectableNodeId}; exported for testability.
 */
export function collectNodeAncestorIds(target: Element): NodeId[] {
  const ids: NodeId[] = [];
  let el: Element | null = target;
  while (el !== null) {
    const id = el.getAttribute(NODE_ID_ATTR);
    if (id !== null) ids.push(toNodeId(id));
    el = el.parentElement;
  }
  return ids;
}

/**
 * Build the `isTransparentContainer` predicate for {@link resolveSelectableNodeId}
 * group mode from the current document `root`. A node id is "transparent"
 * when it resolves to a **Layer** or a **Page** — organizational containers
 * that exist for structure, not functional composition. Group-mode canvas
 * selection sees through them: clicking a shape that lives directly in a
 * layer selects the *shape* (not the layer), while a shape inside a group
 * inside a layer still selects the *group*.
 *
 * Capture this once per pointer event (it closes over the passed `root`) so
 * the lookup reflects the document at event time.
 */
export function organizationalContainerPredicate(root: GroupNode): (id: NodeId) => boolean {
  return (id: NodeId): boolean => {
    const node = findNodeById(root, id);
    return node !== null && (isLayer(node) || isPage(node));
  };
}
