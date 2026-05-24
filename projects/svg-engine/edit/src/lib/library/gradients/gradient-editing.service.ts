import { computed, inject, Injectable, signal } from '@angular/core';
import { EditorStateService, findNodeById, type NodeId } from 'svg-engine/core';

import { SelectionService } from '../../selection/selection.service';
import { GradientLibraryService } from './gradient-library.service';

/**
 * **D-058** — per-editor state for the gradient inline editor.
 *
 * Holds two pieces of session state:
 *
 * 1. **`activeGradientId`** — derived from the selected node's `fill`
 *    (and `stroke` as fallback). When the selected node has a fill
 *    like `url(#someGradient)` AND that id resolves in
 *    `GradientLibraryService`, this signal returns the gradient id.
 *    Drives both the Inspector's "Gradient" section visibility and
 *    the inline overlay's "should I render?" gate.
 *
 * 2. **`selectedStopIndex`** — index of the stop the user clicked in
 *    the overlay (or `null`). The Inspector's color picker reads this
 *    to know which stop's color to edit; the overlay highlights this
 *    stop with a focus ring. Reset to `null` when the active gradient
 *    changes (avoids picking a stale stop after switching gradients).
 *
 * **Scoped via `provideSvgEngineEditorScope()`** — each editor instance
 * tracks its own active gradient, so multi-editor apps don't bleed
 * editing state across editors. The catalog
 * (`GradientLibraryService`) stays root-shared.
 */
@Injectable({ providedIn: 'root' })
export class GradientEditingService {
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly catalog = inject(GradientLibraryService);

  private readonly _selectedStop = signal<number | null>(null);

  /**
   * Gradient id targeted by the inline editor (resolved from the
   * selected node's fill/stroke). `null` when no gradient is active.
   */
  readonly activeGradientId = computed<string | null>(() => {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length !== 1) return null;
    const node = findNodeById(this.state.document().root, ids[0]!);
    if (node === null) return null;
    const fromFill = extractRefId(node.style.fill);
    const fromStroke = extractRefId(node.style.stroke);
    // Fill wins over stroke when both reference a gradient — matches
    // the Inspector's "fill is the primary surface" convention.
    const id = fromFill ?? fromStroke;
    if (id === null) return null;
    return this.catalog.get(id) !== null ? id : null;
  });

  /**
   * Id of the currently-selected node — exposed so the overlay can
   * resolve the node's bbox without re-doing the selection lookup.
   * `null` when the active gradient gate fails.
   */
  readonly targetNodeId = computed<NodeId | null>(() => {
    if (this.activeGradientId() === null) return null;
    const ids = Array.from(this.selection.selectedIds());
    return ids.length === 1 ? ids[0]! : null;
  });

  /** Index of the stop the overlay is "editing" (clicked or dragged). */
  readonly selectedStopIndex = this._selectedStop.asReadonly();

  /** Set the selected stop index, or `null` to clear. */
  selectStop(index: number | null): void {
    this._selectedStop.set(index);
  }
}

/**
 * Extract the `id` from a `url(#id)` value (fill/stroke). Returns
 * `null` when the value isn't a URL ref. Tolerant of whitespace.
 *
 * Shared regex with `ActiveGradientsService.collectGradientId` — kept
 * separate to avoid cross-imports for a 1-line helper.
 */
function extractRefId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const m = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value.trim());
  return m === null ? null : m[1]!;
}
