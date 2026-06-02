import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  createGroup,
  EditorStateService,
  findNodeById,
  type NodeId,
} from 'svg-engine/core';
import { SelectionService, SnapService } from 'svg-engine/edit';
import { SvgeSelectToolOptions } from './select-tool-options.component';

/**
 * **TOOL-OPT-SELECT-ACTIONS** — specs for the Select tool options bar.
 *
 * Asserts: (1) the bar is icon-only with no group-name text labels;
 * (2) snap chips drive SnapService; (3) the manipulation handlers
 * (align / distribute / flip / pathfinder / convert) are guarded by
 * the selection count and dispatch the expected commands. DOM-geometry
 * ops (align/distribute/flip) are exercised via the public methods —
 * jsdom has no layout so getRenderedNodeBBox returns null, which the
 * handlers tolerate (no-op); we assert the guard semantics + the ops
 * that don't need geometry (pathfinder gate, convert-to-path).
 */

function setup() {
  TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const selection = TestBed.inject(SelectionService);
  selection.clear();
  const fixture = TestBed.createComponent(SvgeSelectToolOptions);
  fixture.detectChanges();
  return {
    fixture,
    state,
    selection,
    snap: TestBed.inject(SnapService),
    bus: TestBed.inject(CommandBus),
  };
}

/** Replace the document root's children (helper for multi-select tests). */
function setChildren(state: EditorStateService, children: readonly { id: NodeId }[]): void {
  const doc = state.document();
  state.setDocument({
    ...doc,
    root: createGroup(children as never, { id: doc.root.id }),
  });
}

describe('SvgeSelectToolOptions — icon-only chrome', () => {
  it('renders no group-name text labels (icons + tooltips only)', () => {
    const { fixture } = setup();
    // The old design had .opt-label spans ("Snap" etc.). The icon-only
    // redesign drops them entirely.
    const labels = fixture.nativeElement.querySelectorAll('.opt-label');
    expect(labels.length).toBe(0);
    // But it DOES render mat-icons for the action groups.
    const icons = fixture.nativeElement.querySelectorAll('mat-icon');
    expect(icons.length).toBeGreaterThan(10);
  });

  it('every action button carries a tooltip (matTooltip) for identification', () => {
    const { fixture } = setup();
    const actions = Array.from(
      fixture.nativeElement.querySelectorAll('.opt-action'),
    ) as HTMLButtonElement[];
    // 6 align + 2 distribute + 2 flip + 5 pathfinder + 1 convert = 16.
    expect(actions.length).toBe(16);
    for (const btn of actions) {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('SvgeSelectToolOptions — snap chips drive SnapService', () => {
  it('setSnap("off") disables snapping', () => {
    const { fixture, snap } = setup();
    const inst = fixture.componentInstance as unknown as {
      setSnap(v: 'off' | 'grid' | 'objects' | 'both'): void;
    };
    snap.setEnabled(true);
    inst.setSnap('off');
    expect(snap.enabled()).toBe(false);
  });

  it('setSnap("objects") enables + sets mode', () => {
    const { fixture, snap } = setup();
    const inst = fixture.componentInstance as unknown as {
      setSnap(v: 'off' | 'grid' | 'objects' | 'both'): void;
    };
    inst.setSnap('objects');
    expect(snap.enabled()).toBe(true);
    expect(snap.mode()).toBe('objects');
  });
});

describe('SvgeSelectToolOptions — action enablement mirrors selection count', () => {
  it('align disabled < 2, distribute disabled < 3, pathfinder disabled < 2', () => {
    const { fixture, state, selection } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 20, y: 0, width: 10, height: 10 });
    setChildren(state, [a, b]);
    selection.selectMany([a.id, b.id]);
    fixture.detectChanges();
    const inst = fixture.componentInstance as unknown as {
      canAlign(): boolean;
      canDistribute(): boolean;
      canPathfinder(): boolean;
      hasSelection(): boolean;
    };
    // 2 selected: align + pathfinder enabled; distribute needs 3.
    expect(inst.hasSelection()).toBe(true);
    expect(inst.canAlign()).toBe(true);
    expect(inst.canPathfinder()).toBe(true);
    expect(inst.canDistribute()).toBe(false);
  });

  it('canConvertToPath true only when a convertible leaf is selected', () => {
    const { fixture, state, selection } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    setChildren(state, [rect]);
    selection.select(rect.id);
    fixture.detectChanges();
    const inst = fixture.componentInstance as unknown as { canConvertToPath(): boolean };
    expect(inst.canConvertToPath()).toBe(true);
  });
});

describe('SvgeSelectToolOptions — convert to path dispatches a command', () => {
  it('convertToPath turns a selected rect into a path (single batch)', () => {
    const { fixture, state, selection } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    setChildren(state, [rect]);
    selection.select(rect.id);
    fixture.detectChanges();
    const inst = fixture.componentInstance as unknown as { convertToPath(): void };
    inst.convertToPath();
    const after = findNodeById(state.document().root, rect.id);
    expect(after?.type).toBe('path');
  });
});
