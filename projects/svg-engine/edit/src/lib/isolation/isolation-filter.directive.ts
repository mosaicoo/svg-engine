import { Directive, effect, ElementRef, inject, type OnDestroy } from '@angular/core';
import {
  EditorStateService,
  findNodeById,
  findParent,
  isGroupNode,
  type NodeId,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { IsolationService } from './isolation.service';

/** Sentinel attribute marking elements we've dimmed (for clean restore). */
const DIM_MARKER_ATTR = 'data-svge-isolation-dimmed';
/** Inline opacity applied to out-of-scope elements (Affinity-equivalent). */
const DIM_OPACITY = '0.35';

/**
 * Visual + interaction dimming for nodes outside the current isolation
 * scope (sibling of {@link IsolationService}).
 *
 * **Behavior**:
 * - When `IsolationService.isolationRootId` is `null` → no-op (every
 *   node renders normally).
 * - When isolation is active → walks `[data-node-id]` descendants of
 *   the host; nodes that are NOT in scope (i.e., not the isolation
 *   root and not a descendant of it) get `opacity: DIM_OPACITY` +
 *   `pointer-events: none`. Nodes in scope stay untouched.
 *
 * **Restore policy**: only properties we set are reverted (via a
 * marker attribute). Consumer-set inline opacity / pointer-events on
 * elements we never dimmed are preserved untouched.
 *
 * **Why opt-in directive (like LayersFilter)**:
 * - Multiple SVG canvases can have independent isolation state
 * - Headless consumers (no UI) don't pay the DOM-walk cost
 * - Keeps `IsolationService` pure state — DOM mutation lives here
 *
 * **Cost**: O(n) DOM scan per isolation change (n = data-node-id count
 * under the host). Same order as `LayersFilter`. Negligible for ≤ 1k
 * nodes; future perf path is the same (rAF batching + diff snapshots).
 *
 * **Usage**:
 * ```html
 * <svge-renderer svgeLayersFilter svgeIsolationFilter [tree]="tree()">
 *   <svg:g svgeSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 */
@Directive({
  selector: '[svgeIsolationFilter]',
  standalone: true,
})
export class IsolationFilter implements OnDestroy {
  private readonly elRef = inject(ElementRef<Element>);
  private readonly isolation = inject(IsolationService);
  private readonly state = inject(EditorStateService);

  /** Snapshot of node ids we've dimmed — needed for clean restore. */
  private readonly currentlyDimmed = new Set<string>();

  constructor() {
    effect(() => {
      // Re-fire on isolation change AND on document edits (so newly-
      // inserted nodes outside an active scope get dimmed promptly).
      // Reading both signals up-front locks the dependency set.
      this.isolation.isolationRootId();
      this.state.document();
      this.apply();
    });
  }

  ngOnDestroy(): void {
    // Restore everything we dimmed so the DOM doesn't keep our overrides.
    for (const id of this.currentlyDimmed) {
      this.restoreOne(id);
    }
    this.currentlyDimmed.clear();
  }

  private apply(): void {
    const rootId = this.isolation.isolationRootId();
    const hostEl = this.elRef.nativeElement;

    if (rootId === null) {
      // No isolation — restore anything we previously dimmed.
      for (const id of this.currentlyDimmed) {
        this.restoreOne(id);
      }
      this.currentlyDimmed.clear();
      return;
    }

    // Build the in-scope id set from the MODEL (cheap O(subtree size))
    // rather than from the DOM (would need a per-element ancestor walk).
    const inScope = new Set<string>();
    inScope.add(rootId);
    const docRoot = this.state.document().root;
    const isolationNode = findNodeById(docRoot, rootId);
    if (isolationNode !== null && isGroupNode(isolationNode)) {
      collectDescendantIds(isolationNode, inScope);
    }

    // **Ancestors of the isolation root must NOT be dimmed**: they
    // wrap the isolation root in the DOM, so applying `pointer-events:
    // none` or opacity to them would propagate to the isolation root
    // and its descendants — breaking interaction (the user reported:
    // double-clicking a nested group never enters the inner isolation
    // because clicks no longer reach it).
    //
    // We walk the model parent chain from `rootId` up to the document
    // root and mark every ancestor as "transparent zone" (no dim, no
    // pe-block). Visual responsibility for "dimming" what's outside
    // the isolation now falls entirely on siblings of the ancestor
    // chain — which is the correct Illustrator/Affinity behavior.
    const ancestorPath = collectAncestorIds(docRoot, rootId as NodeId);

    // Walk all marked nodes once. Anything in `inScope` should be
    // restored (if we dimmed it earlier); ancestors are also kept
    // pristine (transparent); everything else (true siblings) gets
    // dimmed.
    const all = hostEl.querySelectorAll('[data-node-id]') as NodeListOf<HTMLElement>;
    const seen = new Set<string>();
    for (const el of all) {
      const id = el.getAttribute('data-node-id');
      if (id === null) continue;
      seen.add(id);
      const keepNormal = inScope.has(id) || ancestorPath.has(id);
      if (keepNormal) {
        // In scope OR an ancestor — restore if we previously dimmed.
        if (this.currentlyDimmed.has(id)) {
          this.restoreOne(id);
          this.currentlyDimmed.delete(id);
        }
      } else {
        // Out of scope sibling — dim if not already.
        if (!this.currentlyDimmed.has(id)) {
          this.dimOne(id, el);
          this.currentlyDimmed.add(id);
        }
      }
    }

    // Restore ids that no longer exist in the DOM (e.g., node deleted
    // while it was dimmed) — defensive cleanup of orphaned state.
    for (const id of [...this.currentlyDimmed]) {
      if (!seen.has(id)) {
        this.currentlyDimmed.delete(id);
      }
    }
  }

  private dimOne(id: string, el: HTMLElement): void {
    // The element passed in is one match; there may be more (rare —
    // typically one DOM node per logical id). Apply to all to be safe.
    const root = this.elRef.nativeElement;
    const all = root.querySelectorAll(
      `[data-node-id="${cssEscape(id)}"]`,
    ) as NodeListOf<HTMLElement>;
    for (const target of all.length > 0 ? all : [el]) {
      target.setAttribute(DIM_MARKER_ATTR, '1');
      target.style.opacity = DIM_OPACITY;
      target.style.pointerEvents = 'none';
    }
  }

  private restoreOne(id: string): void {
    const root = this.elRef.nativeElement;
    const all = root.querySelectorAll(
      `[data-node-id="${cssEscape(id)}"]`,
    ) as NodeListOf<HTMLElement>;
    for (const target of all) {
      if (!target.hasAttribute(DIM_MARKER_ATTR)) continue;
      target.removeAttribute(DIM_MARKER_ATTR);
      target.style.removeProperty('opacity');
      target.style.removeProperty('pointer-events');
    }
  }
}

/** Collect every descendant node id (excluding the parent itself). */
function collectDescendantIds(parent: SvgNode, out: Set<string>): void {
  if (!isGroupNode(parent)) return;
  for (const child of parent.children) {
    out.add(child.id);
    if (isGroupNode(child)) collectDescendantIds(child, out);
  }
}

/**
 * Walk the parent chain from `targetId` up to (and including) the
 * document root, returning every ancestor id encountered. Does NOT
 * include `targetId` itself. Used by `IsolationFilter` to mark which
 * elements wrap the isolation root in the DOM so they're never dimmed
 * or click-blocked (which would propagate to their descendants — the
 * isolation root itself).
 *
 * Safety: bails after 1000 iterations to avoid an infinite loop in
 * the impossible case of a malformed cyclic tree.
 */
function collectAncestorIds(
  docRoot: { readonly id: NodeId } & SvgNode,
  targetId: NodeId,
): Set<string> {
  const out = new Set<string>();
  let currentId: NodeId | null = targetId;
  let safety = 1000;
  while (currentId !== null && safety > 0) {
    if (currentId === docRoot.id) {
      out.add(docRoot.id);
      return out;
    }
    const parent = findParent(docRoot as unknown as Parameters<typeof findParent>[0], currentId);
    if (parent === null) return out;
    out.add(parent.id);
    currentId = parent.id;
    safety -= 1;
  }
  return out;
}

/**
 * Quote a node id for safe inclusion in a CSS attribute selector.
 * `CSS.escape` exists in modern browsers + jsdom; fall back to a
 * minimal hand-roll for SSR / very old environments. NodeIds are
 * generally UUID-like so the fallback is rarely exercised.
 */
function cssEscape(id: string): string {
  const css = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS;
  if (css?.escape) return css.escape(id);
  return id.replace(/["\\]/g, '\\$&');
}
