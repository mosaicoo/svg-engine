import { computed, inject, Injectable, signal } from '@angular/core';
import {
  EditorStateService,
  findNodeById,
  findParent,
  isGroupNode,
  isLayer,
  isPage,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';

/**
 * Isolation Mode state (Affinity / Illustrator convention).
 *
 * **What it is**: when a group is "isolated", the editor scopes pointer
 * interactions to that group's subtree. Visually, descendants render
 * normally while nodes outside the isolation root are dimmed and made
 * non-interactive (see `IsolationFilter` directive). The breadcrumb
 * bar (`<svge-isolation-breadcrumb>`) shows the navigation path from
 * the document root down to the current isolation root.
 *
 * **Why a separate service** (instead of folding into SelectionService):
 * isolation is **interaction scope**, not selection. The user can have
 * an active isolation root with zero items selected (e.g., right after
 * entering isolation via double-click — selection then collapses to the
 * group being isolated). Keeping it separate also lets non-selection
 * concerns (hit-testing, dim overlay) consume only what they need.
 *
 * **Default state**: `isolationRootId = null` — meaning "no isolation,
 * canvas behaves at the document-root scope" (the original SVGEngine
 * behavior).
 */
@Injectable({ providedIn: 'root' })
export class IsolationService {
  private readonly state = inject(EditorStateService);

  /**
   * The id of the node currently acting as the isolation root, or
   * `null` when no isolation is active. Only group nodes are valid
   * isolation roots — `enter()` enforces this.
   */
  private readonly _isolationRootId = signal<NodeId | null>(null);

  /** Reactive snapshot of the current isolation root id (or null). */
  readonly isolationRootId = this._isolationRootId.asReadonly();

  /** Convenience computed: `true` when any isolation is active. */
  readonly isActive = computed(() => this._isolationRootId() !== null);

  /**
   * Ordered breadcrumb path from the **document root** (inclusive) down
   * to the **isolation root** (inclusive). When no isolation is active,
   * returns an empty array — consumers (the breadcrumb bar) typically
   * hide themselves on empty.
   *
   * Each entry is a `NodeId`; consumers resolve names on-demand via
   * `findNodeById` (keeps this computed cheap and decouples names from
   * the path math).
   *
   * Example: document root `R` → group `A` → group `B` (isolated):
   *   `[R, A, B]`
   *
   * Stale-target handling: if the isolation root is deleted (id no
   * longer in the tree), the walk fails to reach the document root and
   * this computed returns `[]` — so the breadcrumb hides itself even
   * though `_isolationRootId` still points at the stale id. Consumers
   * that care about a still-valid isolation should observe
   * `breadcrumbPath().length > 0` rather than `isActive()`.
   */
  readonly breadcrumbPath = computed<readonly NodeId[]>(() => {
    const target = this._isolationRootId();
    if (target === null) return [];
    const root = this.state.document().root;
    // Walk from `target` up to root via repeated findParent. Cost is
    // O(depth × tree-size) because findParent re-traverses each call;
    // depth is tipically < 10 and the path is computed only on isolation
    // change, so it's not a hot path.
    const reversed: NodeId[] = [];
    let currentId: NodeId | null = target;
    let safety = 1000;
    while (currentId !== null && safety > 0) {
      reversed.push(currentId);
      if (currentId === root.id) break;
      const parent = findParent(root, currentId);
      currentId = parent === null ? null : parent.id;
      safety -= 1;
    }
    if (reversed[reversed.length - 1] !== root.id) {
      // The target was not reachable from the current document root —
      // tree was mutated out from under us (target was deleted or
      // reparented). Bail with empty path; consumers checking
      // `breadcrumbPath().length > 0` will hide the breadcrumb.
      // We intentionally do NOT auto-clear `_isolationRootId` here
      // because computeds can't have side-effects — that would also
      // create a reactive loop. Cleanup is the caller's responsibility
      // (e.g., the playground's auto-exit-isolation effect).
      return [];
    }
    // Displayed path = the document root + **real Groups only**. Pages
    // and Layers are organizational containers, not Group navigation, so
    // they're dropped from the breadcrumb (e.g. `root → Page → Layer →
    // Group` renders as `Document › Group`). The isolation root itself is
    // always a real group — `enter()` guarantees it — so it's kept.
    return reversed.reverse().filter((id) => {
      if (id === root.id) return true; // always keep the Document crumb
      return isIsolatableGroup(findNodeById(root, id));
    });
  });

  /**
   * Enter isolation on a group node. Returns `true` when isolation
   * actually changed; `false` for no-ops (already isolated on that
   * node) or invalid input (id not found / not a group).
   *
   * Only **real groups** can be isolated — leaves have no semantic
   * "inside" to scope edits to, and Layers / Pages are organizational
   * containers (not group navigation), so they're rejected too. Callers
   * that want to "drill down" past a leaf should walk to the leaf's
   * parent group via the layer panel and isolate that group instead.
   */
  enter(nodeId: NodeId): boolean {
    if (this._isolationRootId() === nodeId) return false;
    const node = findNodeById(this.state.document().root, nodeId);
    // Only **real Groups** can be isolated. Layers and Pages are
    // organizational containers (navigated via the Layers / Pages
    // panels), never isolation roots — isolation Mode and its
    // breadcrumb are exclusive to Group navigation. Double-clicking a
    // shape that lives directly in a layer therefore does NOT enter
    // isolation (the breadcrumb stays hidden).
    if (!isIsolatableGroup(node)) return false;
    this._isolationRootId.set(nodeId);
    return true;
  }

  /** Exit any active isolation (back to document-root scope). */
  exit(): void {
    if (this._isolationRootId() === null) return;
    this._isolationRootId.set(null);
  }

  /**
   * Drill **up** one isolation level — Affinity/Illustrator Esc
   * convention. Moves the isolation root to the parent of the current
   * one. When the current isolation root is a direct child of the
   * document root, calls {@link exit} (so the user reaches the top
   * with a final Esc). No-op when no isolation is active.
   *
   * Example with structure `Doc › GroupA › GroupB`:
   * - Esc from `GroupB` → isolation = `GroupA`
   * - Esc from `GroupA` → isolation = `null` (back to document scope)
   */
  exitOne(): void {
    const current = this._isolationRootId();
    if (current === null) return;
    const docRoot = this.state.document().root;
    // Climb to the nearest **real Group** ancestor, skipping the
    // organizational containers (Pages / Layers) that are never isolation
    // roots. When none remains before the document root, fully exit (a
    // final Esc returns to the top-level scope).
    let parent = findParent(docRoot, current);
    while (parent !== null && parent.id !== docRoot.id && !isIsolatableGroup(parent)) {
      parent = findParent(docRoot, parent.id);
    }
    if (parent === null || parent.id === docRoot.id) {
      this.exit();
      return;
    }
    this._isolationRootId.set(parent.id);
  }

  /**
   * Imperatively set the isolation root (or clear with `null`). Used
   * by the breadcrumb bar so clicking a parent crumb jumps directly
   * to that level instead of climbing one at a time.
   *
   * Validation matches `enter()` for non-null ids; `null` always
   * succeeds (= clear).
   */
  setRoot(nodeId: NodeId | null): void {
    if (nodeId === null) {
      this.exit();
      return;
    }
    this.enter(nodeId);
  }

  /**
   * True if `nodeId` is the isolation root itself OR a descendant of
   * it. Used by `IsolationFilter` to decide which nodes render at full
   * opacity vs. dimmed.
   *
   * When no isolation is active, every node is "in scope" so this
   * returns `true` unconditionally — callers can use this as the sole
   * check without an outer `isActive()` guard.
   */
  isInScope(nodeId: NodeId): boolean {
    const root = this._isolationRootId();
    if (root === null) return true;
    if (nodeId === root) return true;
    const docRoot = this.state.document().root;
    const target = findNodeById(docRoot, root);
    if (target === null || !isGroupNode(target)) return true;
    return containsDescendant(target, nodeId);
  }
}

/**
 * A node that may act as an isolation root: a **real Group** — i.e. a
 * group that is NOT a Layer and NOT a Page. Layers and Pages are
 * organizational containers (navigated via their own panels), so
 * isolation Mode and its breadcrumb deliberately exclude them. `null`
 * (node not found) is never isolatable.
 *
 * Returns a plain `boolean` (NOT a `node is GroupNode` type guard): a
 * Layer/Page IS structurally a `GroupNode`, so narrowing to `GroupNode`
 * would be wrong — `!isIsolatableGroup(x)` must not strip the `GroupNode`
 * type from `x`.
 */
function isIsolatableGroup(node: SvgNode | null): boolean {
  return node !== null && isGroupNode(node) && !isLayer(node) && !isPage(node);
}

/**
 * Local recursive descendant check. Kept here (not in core) because no
 * other consumer needed it yet — promote to `tree-ops.ts` if a second
 * use-site appears.
 */
function containsDescendant(parent: SvgNode, id: NodeId): boolean {
  if (!isGroupNode(parent)) return false;
  for (const child of parent.children) {
    if (child.id === id) return true;
    if (isGroupNode(child) && containsDescendant(child, id)) return true;
  }
  return false;
}
