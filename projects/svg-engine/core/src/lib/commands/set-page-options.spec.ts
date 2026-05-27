import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup } from '../model';
import { getPageOptions, withPageFlag } from '../model/page';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { SetPageOptionsCommand } from './page.commands';

/**
 * **PAGES-REFACTOR Fase 3** specs — `SetPageOptionsCommand`.
 * Covers basic patch, partial merge, undo round-trip, no-op
 * short-circuit, and the page-only validation.
 */
describe('PAGES-REFACTOR Fase 3 — SetPageOptionsCommand', () => {
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

  it('patches a single field on a page', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(new SetPageOptionsCommand(page.id, { orientation: 'portrait' }));
    const after = findNodeById(state.document().root, page.id);
    expect(after).not.toBeNull();
    expect(getPageOptions(after!).orientation).toBe('portrait');
  });

  it('preserves fields that are NOT in the patch', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(
      new SetPageOptionsCommand(page.id, {
        background: { kind: 'solid', color: '#abcdef' },
        format: 'a4',
      }),
    );
    bus.dispatch(new SetPageOptionsCommand(page.id, { orientation: 'portrait' }));
    const opts = getPageOptions(findNodeById(state.document().root, page.id)!);
    expect(opts.background).toEqual({ kind: 'solid', color: '#abcdef' });
    expect(opts.format).toBe('a4');
    expect(opts.orientation).toBe('portrait');
  });

  it('undo restores the prior options', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(new SetPageOptionsCommand(page.id, { format: 'letter' }));
    expect(getPageOptions(findNodeById(state.document().root, page.id)!).format).toBe('letter');
    bus.undo();
    expect(getPageOptions(findNodeById(state.document().root, page.id)!).format).toBe('custom');
  });

  it('no-op short-circuit: dispatching the same value twice leaves state unchanged across undos', () => {
    const { state, bus } = setup();
    const page = seedPage(state);
    bus.dispatch(new SetPageOptionsCommand(page.id, { orientation: 'portrait' }));
    // Second dispatch with identical orientation must be a no-op
    // (execute short-circuits AND its undo is silent), so the user
    // can undo back to landscape with two undos: first peels off the
    // silent no-op, second restores the real change.
    bus.dispatch(new SetPageOptionsCommand(page.id, { orientation: 'portrait' }));
    bus.undo(); // peels off the no-op
    expect(getPageOptions(findNodeById(state.document().root, page.id)!).orientation).toBe(
      'portrait',
    );
    bus.undo(); // restores the real change
    expect(getPageOptions(findNodeById(state.document().root, page.id)!).orientation).toBe(
      'landscape',
    );
  });

  it('fails when target is not a page', () => {
    const { state, bus } = setup();
    const plain = createGroup([], {});
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [plain] },
    });
    const result = bus.dispatch(new SetPageOptionsCommand(plain.id, { orientation: 'portrait' }));
    expect(result.ok).toBe(false);
  });
});
