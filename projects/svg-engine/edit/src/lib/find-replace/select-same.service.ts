import { inject, Injectable } from '@angular/core';
import {
  EditorStateService,
  findNodeById,
  type NodeId,
  type SvgNode,
  type TextNode,
} from 'svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { FindReplaceService, type FindCriteria } from './find-replace.service';

/**
 * **D-071a — Select Same.** Illustrator/Affinity convention: with one
 * node focused, pick every other node in the document that shares the
 * same fill / stroke / fontFamily and select them all. Pairs naturally
 * with the Inspector's multi-edit (D-044) so the next edit applies to
 * the whole homogeneous group at once.
 *
 * **Design**: thin orchestration layer over {@link FindReplaceService}
 * (criteria building + walk) and {@link SelectionService} (replacing
 * the selection set). No commands are dispatched — selection is UI
 * state, not part of the undo stack.
 *
 * **Why a separate service** (not just inline in the menu plugin):
 * - Keeps the menu plugin focused on UI wiring (factories + run)
 * - Unit-testable without TestBed of menu infrastructure
 * - Future palette / context-menu integrations import the same service
 */
@Injectable({ providedIn: 'root' })
export class SelectSameService {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly findSvc = inject(FindReplaceService);

  /**
   * Select every node whose `style.fill` matches the focused node's.
   * Returns the number of nodes selected (including the original).
   * Returns `0` (no-op) when there's no focused node or it lacks a
   * resolvable fill — never throws.
   */
  selectSameFill(): number {
    const focused = this.getFocusedNode();
    if (focused === null) return 0;
    const value = focused.style.fill;
    if (typeof value !== 'string' || value.length === 0) return 0;
    return this.applyMatches({ kind: 'fill', value });
  }

  /** Mirror of {@link selectSameFill} for `style.stroke`. */
  selectSameStroke(): number {
    const focused = this.getFocusedNode();
    if (focused === null) return 0;
    const value = focused.style.stroke;
    if (typeof value !== 'string' || value.length === 0) return 0;
    return this.applyMatches({ kind: 'stroke', value });
  }

  /**
   * Select every text node whose `fontFamily` matches the focused
   * text node's (exact equality — different from Find & Replace,
   * which defaults to contains; here the user is asking for nodes
   * with the SAME family, not just similar).
   */
  selectSameFontFamily(): number {
    const focused = this.getFocusedNode();
    if (focused === null || focused.type !== 'text') return 0;
    const value = (focused as TextNode).fontFamily;
    if (typeof value !== 'string' || value.length === 0) return 0;
    return this.applyMatches({ kind: 'fontFamily', value, match: 'exact' });
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private getFocusedNode(): SvgNode | null {
    const id = this.selection.focusId();
    if (id === null) return null;
    return findNodeById(this.state.document().root, id);
  }

  /**
   * Run the search with the assembled criteria, then replace the
   * selection with the matched ids. Returns the count for callers
   * who want to surface a status message.
   */
  private applyMatches(criteria: FindCriteria): number {
    const matches = this.findSvc.findAll(this.state.document().root, criteria);
    if (matches.length === 0) return 0;
    const ids: NodeId[] = matches.map((m) => m.id);
    this.selection.selectMany(ids);
    return ids.length;
  }
}
