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

  it('cycle on a rect-converted path: cusp → smooth → symmetric → cusp all produce visible changes', () => {
    const { state, ctx } = setup();
    // Convert a rect to path → all 4 corners are bare `L`-style cusps
    // with handles collapsed to the anchor point. The full 3-step
    // cycle must produce VISIBLE changes at each step — that's the
    // user-facing contract of the dblclick gesture.
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    new InsertNodeCommand(state.document().root.id, rect).execute(ctx);
    new ConvertNodeToPathCommand(rect.id).execute(ctx);

    const ref = { nodeId: rect.id, subpathIndex: 0, anchorIndex: 1 };

    // Step 0: cusp with handles collapsed.
    const step0 = midAnchor(state, rect.id);
    expect(step0.kind).toBe('cusp');
    expect(step0.handleIn).toEqual(step0.point);
    expect(step0.handleOut).toEqual(step0.point);

    // Step 1: cusp → smooth. synthesizeHandles uses ASYMMETRIC ratios
    // (0.4 in, 0.3 out) on purpose so the result classifies as smooth
    // (not symmetric) — this preserves the next cycle step's
    // visibility. Handles must be non-flat (user sees a curve).
    new ConvertAnchorTypeCommand(ref, 'smooth').execute(ctx);
    const step1 = midAnchor(state, rect.id);
    expect(step1.kind).toBe('smooth');
    const inDist1 = Math.hypot(step1.handleIn.x - step1.point.x, step1.handleIn.y - step1.point.y);
    const outDist1 = Math.hypot(
      step1.handleOut.x - step1.point.x,
      step1.handleOut.y - step1.point.y,
    );
    expect(inDist1).toBeGreaterThan(10);
    expect(outDist1).toBeGreaterThan(10);
    expect(inDist1).not.toBeCloseTo(outDist1, 1); // asymmetric on purpose

    // Step 2: smooth → symmetric. enforceKind equalises handle lengths.
    // User sees the curve become perfectly round.
    new ConvertAnchorTypeCommand(ref, 'symmetric').execute(ctx);
    const step2 = midAnchor(state, rect.id);
    expect(step2.kind).toBe('symmetric');
    const inDist2 = Math.hypot(step2.handleIn.x - step2.point.x, step2.handleIn.y - step2.point.y);
    const outDist2 = Math.hypot(
      step2.handleOut.x - step2.point.x,
      step2.handleOut.y - step2.point.y,
    );
    expect(inDist2).toBeCloseTo(outDist2, 4); // now equal

    // Step 3: symmetric → cusp. enforceKind COLLAPSES handles into the
    // anchor point (Illustrator "Convert Anchor Point" semantic).
    // User sees the curve flatten back to a corner. This is the only
    // way to make the cycle produce a visible change at every step,
    // since the d-string doesn't carry kind metadata and the classifier
    // would otherwise keep reading the symmetric handles as symmetric.
    new ConvertAnchorTypeCommand(ref, 'cusp').execute(ctx);
    const step3 = midAnchor(state, rect.id);
    expect(step3.kind).toBe('cusp');
    expect(step3.handleIn).toEqual(step3.point);
    expect(step3.handleOut).toEqual(step3.point);
  });

  it('cycle on a Pencil-like smooth path: smooth → symmetric is visibly equalising', () => {
    const { state, ctx } = setup();
    // Realistic Pencil output: every anchor is smooth (colinear-opposite
    // handles, slightly different lengths). The user's report was that
    // smooth → symmetric "doesn't work" — this proves it does, and the
    // d-string actually changes.
    // Anchor 1 at (50,30) has handleIn (25,25) and handleOut (100,40):
    // both colinear-opposite through the anchor (ratio -2 on each axis)
    // but with DIFFERENT lengths (25.5 vs 51) — textbook smooth, not
    // symmetric. The classifier must read `smooth`, and the command
    // must equalise the lengths to produce `symmetric`.
    const path = createPath(
      'M0 0 C 10 20 25 25 50 30 C 100 40 90 15 100 0 C 110 -15 95 -30 80 -25',
    );
    new InsertNodeCommand(state.document().root.id, path).execute(ctx);

    const ref = { nodeId: path.id, subpathIndex: 0, anchorIndex: 1 };

    const before = midAnchor(state, path.id);
    expect(before.kind).toBe('smooth');
    const inDistBefore = Math.hypot(
      before.handleIn.x - before.point.x,
      before.handleIn.y - before.point.y,
    );
    const outDistBefore = Math.hypot(
      before.handleOut.x - before.point.x,
      before.handleOut.y - before.point.y,
    );
    expect(inDistBefore).not.toBeCloseTo(outDistBefore, 1);

    new ConvertAnchorTypeCommand(ref, 'symmetric').execute(ctx);

    const after = midAnchor(state, path.id);
    expect(after.kind).toBe('symmetric');
    const inDistAfter = Math.hypot(
      after.handleIn.x - after.point.x,
      after.handleIn.y - after.point.y,
    );
    const outDistAfter = Math.hypot(
      after.handleOut.x - after.point.x,
      after.handleOut.y - after.point.y,
    );
    expect(inDistAfter).toBeCloseTo(outDistAfter, 4);
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
