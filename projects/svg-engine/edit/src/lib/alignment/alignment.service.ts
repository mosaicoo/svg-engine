import { inject, Injectable } from '@angular/core';
import {
  type BoundingBox,
  CommandBus,
  type NodeId,
  type Point,
  TranslateManyCommand,
} from '@mosaicoo/svg-engine/core';
import {
  type AlignAxis,
  computeAlignDeltas,
  computeAlignToReferenceDeltas,
  computeDistributeDeltas,
  computeDistributeSpacingDeltas,
  type DistributeAxis,
  type NodeBBox,
} from './alignment-math';

/**
 * Editor-side façade for alignment + distribution operations. Delegates
 * the math to the pure helpers in {@link computeAlignDeltas} /
 * {@link computeDistributeDeltas} and dispatches a single
 * {@link TranslateManyCommand} per call so the whole operation lands
 * as **one** undo entry.
 *
 * **Why bboxes flow in (not pulled by the service)**: the service has
 * no access to the rendered DOM by design (D-017 headless boundary
 * alignment + testability). The caller (typically the playground or a
 * UI toolbar component) reads bboxes via
 * `getRenderedNodeBBox(svgRoot, id)` and passes them in. This keeps the
 * service trivially testable in jsdom and reusable in non-DOM contexts
 * (server-side rendering, headless tooling).
 *
 * **Behaviour on edge cases**:
 * - `align` with fewer than 2 items → no-op (returns `false`, nothing
 *   dispatched).
 * - `distribute` with fewer than 3 items → no-op (returns `false`).
 * - All items already aligned/distributed → no-op (the math helper
 *   omits zero-deltas, the resulting empty map produces a no-op
 *   command which is suppressed here).
 *
 * Returns `true` when a command was dispatched (caller can update UI),
 * `false` when the operation was a no-op.
 */
@Injectable({ providedIn: 'root' })
export class AlignmentService {
  private readonly bus = inject(CommandBus);

  /**
   * Align `items` on the given axis. See {@link AlignAxis} for the 6
   * standard operations. Anchored on the union bbox of the selection
   * (Affinity / Figma default).
   */
  align(items: readonly NodeBBox[], axis: AlignAxis): boolean {
    const deltas = computeAlignDeltas(items, axis);
    return this.dispatch(deltas, `Align ${axis}`);
  }

  /**
   * Align `items` to a fixed `reference` bbox rather than to the
   * selection's union — the "Align to Page / Artboard" mode. The
   * canonical caller passes a single selected node + the active page's
   * viewBox, so e.g. `center-x` centres the object on the page and
   * `left` snaps it to the page's left edge.
   *
   * Works for any non-empty `items` (single-object align to page is the
   * primary use; ≥ 2 items aligns each to the reference). No-op (returns
   * `false`) when nothing would move.
   */
  alignToReference(items: readonly NodeBBox[], axis: AlignAxis, reference: BoundingBox): boolean {
    const deltas = computeAlignToReferenceDeltas(items, axis, reference);
    return this.dispatch(deltas, `Align ${axis} to page`);
  }

  /**
   * Distribute `items` evenly along the given axis. See
   * {@link DistributeAxis} — we use "distribute centers" semantics
   * (sort by center, evenly partition between leftmost and rightmost
   * centers; edges keep their position).
   */
  distribute(items: readonly NodeBBox[], axis: DistributeAxis): boolean {
    const deltas = computeDistributeDeltas(items, axis);
    return this.dispatch(deltas, `Distribute ${axis}`);
  }

  /**
   * **D-095** — Distribute `items` with an EQUAL edge-to-edge `gap` along
   * the axis ("Distribute Spacing"). Unlike {@link distribute} (which
   * equalizes centers), this equalizes the GAPS, so different-sized objects
   * end up with identical visual spacing. The first item on the axis stays
   * put; the rest shift to honour the gap. No-op (`false`) when nothing
   * would move. See {@link computeDistributeSpacingDeltas}.
   */
  distributeSpacing(items: readonly NodeBBox[], axis: DistributeAxis, gap: number): boolean {
    const deltas = computeDistributeSpacingDeltas(items, axis, gap);
    return this.dispatch(deltas, `Distribute ${axis} spacing`);
  }

  private dispatch(deltas: ReadonlyMap<NodeId, Point>, label: string): boolean {
    if (deltas.size === 0) return false;
    this.bus.dispatch(new TranslateManyCommand(deltas, label));
    return true;
  }
}
