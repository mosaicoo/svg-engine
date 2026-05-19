import { computed, inject, Injectable, signal } from '@angular/core';
import {
  EditorStateService,
  findNodeById,
  findParent,
  isGroupNode,
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
   * Self-healing: if the isolation root is deleted (id no longer in the
   * tree), the path is empty and `isActive` flips back to `false` —
   * see the `effect` in the constructor.
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
      // tree was mutated out from under us. Bail with empty path; the
      // ws.document() reactive read above will have already triggered
      // self-heal via the constructor effect.
      return [];
    }
    return reversed.reverse();
  });

  /**
   * Enter isolation on a group node. Returns `true` when isolation
   * actually changed; `false` for no-ops (already isolated on that
   * node) or invalid input (id not found / not a group).
   *
   * Only **groups** can be isolated — leaves have no semantic "inside"
   * to scope edits to. Callers that want to "drill down" past a leaf
   * should walk to the leaf's parent group via the layer panel and
   * isolate that group instead.
   */
  enter(nodeId: NodeId): boolean {
    if (this._isolationRootId() === nodeId) return false;
    const node = findNodeById(this.state.document().root, nodeId);
    if (node === null || node.type !== 'group') return false;
    this._isolationRootId.set(nodeId);
    return true;
  }

  /** Exit any active isolation (back to document-root scope). */
  exit(): void {
    if (this._isolationRootId() === null) return;
    this._isolationRootId.set(null);
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
