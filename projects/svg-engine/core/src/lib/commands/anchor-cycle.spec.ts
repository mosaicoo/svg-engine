import { TestBed } from '@angular/core/testing';
import { createEmptyDocument } from '../document/document-factory';
import { parsePathToAnchors } from '../geometry/path-anchors';
import { createPath, createRect } from '../model/node-factory';
import type { PathNode } from '../model/path-node';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { ConvertAnchorTypeCommand } from './anchor.commands';
import { ConvertNodeToPathCommand } from './convert-to-path.command';
import { InsertNodeCommand } from './insert-node.command';

/**
 * Regression coverage for the "dblclick cycle kind" bug reported by
 * the user: cusp → smooth → symmetric → cusp was stuck at cusp ↔
 * smooth, never reaching symmetric, because `parsePathToAnchors`
 * classified every `C` segment endpoint as `cusp` (the classifier
 * received `handleOut: null` since it ran during the segment walk).
 *
 * These specs exercise the cycle end-to-end via the real command
 * (no mocking) and the real parser to prove the round-trip preserves
 * the requested kind.
 */
function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state } };
}

/** Read the middle anchor of the only path in the tree. */
function midAnchor(state: EditorStateService, pathId: NodeId) {
  const node = findNodeById(state.document().root, pathId) as PathNode;
  const subpaths = parsePathToAnchors(node.d);
  return subpaths[0]!.anchors[1]!;
}

describe('Path Editor — anchor kind cycle (dblclick gesture)', () => {
  it('cycle on a cusp curve: cusp → smooth → symmetric persists across re-parse', () => {
    const { state, ctx } = setup();
    // 3-anchor path crafted so the middle anchor (20,20) is genuinely
    // `cusp`: handleIn (10,0) and handleOut (30,30) are NOT colinear
    // through the point. The BUG was: after `ConvertAnchorTypeCommand`,
    // the re-parse classified the anchor as cusp again (because the
    // parser passed `handleOut: null` to classifyAnchorKind), so the
    // cycle was stuck at cusp ↔ smooth and never reached symmetric.
    const path = createPath('M0 0 C 5 0 10 0 20 20 C 30 30 50 50 50 0');
    new InsertNodeCommand(state.document().root.id, path).execute(ctx);

    const ref = { nodeId: path.id, subpathIndex: 0, anchorIndex: 1 };

    expect(midAnchor(state, path.id).kind).toBe('cusp');

    // Cycle #1: cusp → smooth. enforceKind reflects handleOut along
    // handleIn's direction while keeping handleOut's length. Re-parse
    // must read `smooth` (colinear, different lengths).
    new ConvertAnchorTypeCommand(ref, 'smooth').execute(ctx);
    expect(midAnchor(state, path.id).kind).toBe('smooth');

    // Cycle #2: smooth → symmetric. enforceKind equalises handle
    // lengths. Re-parse must read `symmetric` (the headline bug fix).
    new ConvertAnchorTypeCommand(ref, 'symmetric').execute(ctx);
    expect(midAnchor(state, path.id).kind).toBe('symmetric');
  });

  it('cycle on a rect-converted path: cusp → smooth synthesizes handles + auto-promotes to symmetric', () => {
    const { state, ctx } = setup();
    // Convert a rect to path → all 4 corners are bare `L`-style cusps
    // with handles collapsed to the anchor point. Without the
    // handle-synthesis fix, the cycle would be a silent no-op on these
    // (most common in real editing). With it, synthesizeHandles draws
    // handles along the chord from prev→next at length 1/3·min(d).
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    new InsertNodeCommand(state.document().root.id, rect).execute(ctx);
    new ConvertNodeToPathCommand(rect.id).execute(ctx);

    const ref = { nodeId: rect.id, subpathIndex: 0, anchorIndex: 1 };

    // Sanity: starts as cusp with handles collapsed.
    const before = midAnchor(state, rect.id);
    expect(before.kind).toBe('cusp');
    expect(before.handleIn).toEqual(before.point);
    expect(before.handleOut).toEqual(before.point);

    new ConvertAnchorTypeCommand(ref, 'smooth').execute(ctx);
    const after = midAnchor(state, rect.id);

    // Handles must no longer be flat — that's the user-visible "I see
    // a curve now" feedback. Distance ~ 33.3 (1/3 of 100, the side
    // length) on each side.
    const inDist = Math.hypot(after.handleIn.x - after.point.x, after.handleIn.y - after.point.y);
    const outDist = Math.hypot(
      after.handleOut.x - after.point.x,
      after.handleOut.y - after.point.y,
    );
    expect(inDist).toBeGreaterThan(10);
    expect(outDist).toBeGreaterThan(10);

    // Because synthesizeHandles places mirrored handles along the
    // prev→next chord, the resulting geometry IS symmetric — so the
    // classifier auto-promotes to `symmetric`. This matches Illustrator
    // behaviour: a fresh smoothing of a corner produces a perfectly
    // round handle pair, not an asymmetric one. The user sees one
    // dblclick = curve; second dblclick (symmetric→cusp) relaxes
    // the constraint without changing geometry.
    expect(after.kind).toBe('symmetric');
  });

  it('undo restores the previous d after a kind change', () => {
    const { state, ctx } = setup();
    const path = createPath('M0 0 C 5 10 10 10 20 20 C 30 30 40 20 50 0');
    new InsertNodeCommand(state.document().root.id, path).execute(ctx);

    const ref = { nodeId: path.id, subpathIndex: 0, anchorIndex: 1 };
    const dBefore = (findNodeById(state.document().root, path.id) as PathNode).d;

    const cmd = new ConvertAnchorTypeCommand(ref, 'smooth');
    cmd.execute(ctx);
    expect((findNodeById(state.document().root, path.id) as PathNode).d).not.toBe(dBefore);

    cmd.undo(ctx);
    expect((findNodeById(state.document().root, path.id) as PathNode).d).toBe(dBefore);
  });
});
