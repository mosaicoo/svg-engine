import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { SvgDocument } from '../document/svg-document';
import type { NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { FlipNodeCommand, composePivotFlip } from './flip-node.command';
import { IDENTITY_TRANSFORM, type Transform } from '../types/transform';

/**
 * **D-078** — FlipNodeCommand specs.
 *
 * Covers:
 * - `composePivotFlip` pure math (no DI required)
 * - `FlipNodeCommand` execute + undo round-trip through a real
 *   {@link CommandBus} / {@link EditorStateService}
 *
 * Why mix the pure helper specs in: the helper is exported alongside
 * the command (parity with `composePivotRotation` from RotateNodeCommand);
 * easier to validate the matrix math in isolation than to assert on
 * Transform tuples through the command surface.
 */

function setup(): { state: EditorStateService; bus: CommandBus } {
  TestBed.configureTestingModule({});
  return {
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
  };
}

function seedRect(state: EditorStateService): NodeId {
  const rect = createRect({ x: 0, y: 0, width: 100, height: 40 });
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 200, height: 200 },
    root: createGroup([rect], { id: 'root' as NodeId }),
  };
  state.resetDocument(doc);
  return rect.id;
}

describe('D-078 — composePivotFlip (pure helper)', () => {
  it('horizontal flip around origin negates X-related coefficients', () => {
    // T(pivot=0) ⋅ S(-1, 1) ⋅ T(-0) ⋅ I = S(-1, 1)
    const result = composePivotFlip(IDENTITY_TRANSFORM, 'horizontal', { x: 0, y: 0 });
    // Transform tuple = [a, b, c, d, e, f]; horizontal flip → a=-1, d=1.
    expect(result[0]).toBe(-1);
    expect(result[3]).toBe(1);
    expect(result[4]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it('vertical flip around origin negates Y-related coefficients', () => {
    const result = composePivotFlip(IDENTITY_TRANSFORM, 'vertical', { x: 0, y: 0 });
    expect(result[0]).toBe(1);
    expect(result[3]).toBe(-1);
    expect(result[4]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it('horizontal flip around pivot (px, 0) preserves pivot point', () => {
    // For T(px, 0) ⋅ S(-1, 1) ⋅ T(-px, 0), the point (px, y) maps to itself.
    const px = 50;
    const m = composePivotFlip(IDENTITY_TRANSFORM, 'horizontal', { x: px, y: 0 });
    // Apply matrix to (px, 0): x' = a*px + c*0 + e; y' = b*px + d*0 + f.
    const [a, b, c, d, e, f] = m;
    const x0 = a * px + c * 0 + e;
    const y0 = b * px + d * 0 + f;
    expect(x0).toBeCloseTo(px);
    expect(y0).toBeCloseTo(0);
  });

  it('applies AFTER existing transform (pre-multiplies)', () => {
    // Existing translate(10, 0). Flip horizontal around (0,0) should
    // yield S(-1,1) ⋅ T(10,0) — i.e., a translated point (10, 0)
    // becomes (-10, 0).
    const existing: Transform = [1, 0, 0, 1, 10, 0];
    const m = composePivotFlip(existing, 'horizontal', { x: 0, y: 0 });
    const [, , , , e] = m;
    expect(e).toBe(-10);
  });
});

describe('D-078 — FlipNodeCommand', () => {
  it('flips a rect horizontally around its bbox centre (transform changes)', () => {
    const { state, bus } = setup();
    const id = seedRect(state);
    const pivot: Point = { x: 50, y: 20 }; // centre of 100×40 rect at origin

    const beforeXf = findNodeById(state.document().root, id)!.transform;
    bus.dispatch(new FlipNodeCommand(id, 'horizontal', pivot));
    const afterXf = findNodeById(state.document().root, id)!.transform;

    // After horizontal flip, the matrix's a-coefficient must be -1
    // (mirror) and translation tx must equal 2 * pivot.x to keep the
    // shape in place (math: T(50) ⋅ S(-1) ⋅ T(-50) = T(100) ⋅ S(-1)).
    expect(afterXf).not.toEqual(beforeXf);
    expect(afterXf[0]).toBe(-1);
    expect(afterXf[4]).toBeCloseTo(100);
  });

  it('flips vertically around bbox centre', () => {
    const { state, bus } = setup();
    const id = seedRect(state);
    const pivot: Point = { x: 50, y: 20 };

    bus.dispatch(new FlipNodeCommand(id, 'vertical', pivot));
    const afterXf = findNodeById(state.document().root, id)!.transform;

    // Vertical flip → d=-1, ty = 2 * pivot.y = 40.
    expect(afterXf[3]).toBe(-1);
    expect(afterXf[5]).toBeCloseTo(40);
  });

  it('two horizontal flips around the same pivot return to identity', () => {
    const { state, bus } = setup();
    const id = seedRect(state);
    const pivot: Point = { x: 50, y: 20 };

    const before = findNodeById(state.document().root, id)!.transform;
    bus.dispatch(new FlipNodeCommand(id, 'horizontal', pivot));
    bus.dispatch(new FlipNodeCommand(id, 'horizontal', pivot));
    const after = findNodeById(state.document().root, id)!.transform;

    for (let i = 0; i < 6; i++) {
      expect(after[i]).toBeCloseTo(before[i]!);
    }
  });

  it('undo restores the previous transform exactly', () => {
    const { state, bus } = setup();
    const id = seedRect(state);
    const pivot: Point = { x: 50, y: 20 };
    const before = findNodeById(state.document().root, id)!.transform;

    bus.dispatch(new FlipNodeCommand(id, 'horizontal', pivot));
    expect(findNodeById(state.document().root, id)!.transform).not.toEqual(before);

    bus.undo();
    expect(findNodeById(state.document().root, id)!.transform).toEqual(before);
  });

  it('fails gracefully on a non-existent node id', () => {
    const { state, bus } = setup();
    seedRect(state);
    const before = state.document().root;
    bus.dispatch(new FlipNodeCommand('does-not-exist' as NodeId, 'horizontal', { x: 0, y: 0 }));
    // Tree unchanged — command returns fail without mutating state.
    expect(state.document().root).toBe(before);
  });
});
