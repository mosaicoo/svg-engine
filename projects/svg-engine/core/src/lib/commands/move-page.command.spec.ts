import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup } from '../model';
import { getPageViewBox, withPageFlag } from '../model/page';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { MovePageCommand } from './page.commands';

/**
 * **PAGES-REFACTOR Fase 6** specs — `MovePageCommand`. Covers the
 * happy path (origin updates, size preserved), undo round-trip, the
 * no-op short-circuit + silent-undo (mirrors SetPageOptionsCommand
 * pattern), and the page-only / has-viewBox validation.
 */
describe('PAGES-REFACTOR Fase 6 — MovePageCommand', () => {
  function setup() {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const bus = TestBed.inject(CommandBus);
    return { state, bus };
  }

  function seedPage(state: EditorStateService) {
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const page = withPageFlag(createGroup([], {}), vb, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });
    return page;
  }

  it('updates pageViewBox.x and .y while preserving width/height', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(new MovePageCommand(page.id, { x: 100, y: 50 }));
    const vb = getPageViewBox(findNodeById(state.document().root, page.id)!);
    expect(vb).toEqual({ x: 100, y: 50, width: 800, height: 600 });
  });

  it('undo restores the prior origin', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(new MovePageCommand(page.id, { x: 100, y: 50 }));
    expect(getPageViewBox(findNodeById(state.document().root, page.id)!)).toEqual({
      x: 100,
      y: 50,
      width: 800,
      height: 600,
    });
    bus.undo();
    expect(getPageViewBox(findNodeById(state.document().root, page.id)!)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('no-op when origin is unchanged: silent undo + state stays identical across undos', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(new MovePageCommand(page.id, { x: 100, y: 50 }));
    // Same origin twice — must short-circuit AND silent-undo so the
    // user can rewind back to (0,0) with two undos: first peels off
    // the silent no-op, second restores the real move.
    bus.dispatch(new MovePageCommand(page.id, { x: 100, y: 50 }));
    bus.undo(); // peels off the no-op
    expect(getPageViewBox(findNodeById(state.document().root, page.id)!)).toEqual({
      x: 100,
      y: 50,
      width: 800,
      height: 600,
    });
    bus.undo(); // restores the real move
    expect(getPageViewBox(findNodeById(state.document().root, page.id)!)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('fails when the target is not a page', () => {
    const { state, bus } = setup();
    const plain = createGroup([], {});
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [plain] },
    });
    const result = bus.dispatch(new MovePageCommand(plain.id, { x: 10, y: 10 }));
    expect(result.ok).toBe(false);
  });

  it('fails when the page has no pageViewBox metadata (defensive)', () => {
    const { state, bus } = setup();
    // Build a page-flagged group but strip the viewBox slot to mimic a
    // malformed import; the command must reject rather than silently
    // synthesise a viewBox out of thin air.
    const page = withPageFlag(createGroup([], {}), { x: 0, y: 0, width: 800, height: 600 }, 'X');
    const cd = { ...(page.metadata.customData ?? {}) } as Record<string, unknown>;
    delete cd['svgePageViewBox'];
    const tampered = { ...page, metadata: { ...page.metadata, customData: cd } };
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [tampered] },
    });
    const result = bus.dispatch(new MovePageCommand(tampered.id, { x: 5, y: 5 }));
    expect(result.ok).toBe(false);
  });
});
