import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import {
  type Command,
  type CommandContext,
  type CommandResult,
  fail,
  ok,
} from '../commands/command';
import { RestoreSnapshotCommand } from '../commands/restore-snapshot.command';
import type { SvgDocument } from '../document/svg-document';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { generateNodeId, type NodeId } from '../types/node-id';
import { SnapshotsService } from './snapshots.service';

function setup(): {
  state: EditorStateService;
  bus: CommandBus;
  snapshots: SnapshotsService;
} {
  TestBed.configureTestingModule({ providers: [SnapshotsService] });
  return {
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
    snapshots: TestBed.inject(SnapshotsService),
  };
}

function seed(state: EditorStateService): SvgDocument {
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
      id: 'root' as NodeId,
    }),
  };
  state.resetDocument(doc);
  return doc;
}

describe('D-073 — SnapshotsService', () => {
  describe('take + collection management', () => {
    it('starts empty and "take" returns the snapshot prepended to the list', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      expect(snapshots.count()).toBe(0);
      const snap = snapshots.take(doc, { name: 'First', source: 'manual' });
      expect(snap.name).toBe('First');
      expect(snap.source).toBe('manual');
      expect(snap.thumbnail).toBeNull();
      expect(snapshots.count()).toBe(1);
      expect(snapshots.snapshots()[0]).toBe(snap);
    });

    it('default name follows "Snapshot N" for manual snapshots', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      const a = snapshots.take(doc, { source: 'manual' });
      const b = snapshots.take(doc, { source: 'manual' });
      expect(a.name).toBe('Snapshot 1');
      expect(b.name).toBe('Snapshot 2');
    });

    it('enforces maxCount by dropping the oldest non-baseline snapshot', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      snapshots.setLimits({ maxCount: 3 });
      snapshots.take(doc, { name: 'opened', source: 'auto-open' });
      snapshots.take(doc, { name: 'A' });
      snapshots.take(doc, { name: 'B' });
      // Adding a 4th forces eviction. Newest at index 0; oldest
      // non-baseline ('A') should be dropped; baseline 'opened' stays.
      snapshots.take(doc, { name: 'C' });
      const names = snapshots.snapshots().map((s) => s.name);
      expect(names).toContain('opened');
      expect(names).toContain('C');
      expect(names).toContain('B');
      expect(names).not.toContain('A');
    });
  });

  describe('rename / delete / attachThumbnail', () => {
    it('rename updates the name and rejects empty input', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      const snap = snapshots.take(doc);
      expect(snapshots.rename(snap.id, 'Renamed')).toBe(true);
      expect(snapshots.snapshots()[0]?.name).toBe('Renamed');
      expect(snapshots.rename(snap.id, '   ')).toBe(false);
      expect(snapshots.snapshots()[0]?.name).toBe('Renamed');
    });

    it('delete removes the snapshot and clears currentId when it matched', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      const snap = snapshots.take(doc);
      snapshots.setCurrent(snap.id);
      expect(snapshots.currentSnapshotId()).toBe(snap.id);
      expect(snapshots.delete(snap.id)).toBe(true);
      expect(snapshots.count()).toBe(0);
      expect(snapshots.currentSnapshotId()).toBeNull();
    });

    it('attachThumbnail updates the snapshot reference (signal-friendly)', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      const snap = snapshots.take(doc);
      const before = snapshots.snapshots()[0];
      expect(snapshots.attachThumbnail(snap.id, 'data:image/png;base64,abc')).toBe(true);
      const after = snapshots.snapshots()[0];
      expect(after).not.toBe(before);
      expect(after?.thumbnail).toBe('data:image/png;base64,abc');
    });
  });

  describe('bootstrap', () => {
    it('takes an auto-open snapshot when autoOnOpen is enabled (default)', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      snapshots.bootstrap(doc);
      expect(snapshots.count()).toBe(1);
      expect(snapshots.snapshots()[0]?.source).toBe('auto-open');
      expect(snapshots.snapshots()[0]?.name).toBe('Opened');
    });

    it('does not duplicate baseline when called twice', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      snapshots.bootstrap(doc);
      snapshots.bootstrap(doc);
      expect(snapshots.count()).toBe(1);
    });

    it('skips baseline when autoOnOpen is disabled', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      snapshots.setLimits({ autoOnOpen: false });
      snapshots.bootstrap(doc);
      expect(snapshots.count()).toBe(0);
    });
  });

  describe('hydrate', () => {
    it('replaces the collection wholesale', () => {
      const { state, snapshots } = setup();
      const doc = seed(state);
      snapshots.take(doc, { name: 'will be replaced' });
      snapshots.hydrate([
        {
          id: 'h1',
          name: 'Restored',
          createdAt: 1,
          document: doc,
          thumbnail: null,
          source: 'manual',
        },
      ]);
      expect(snapshots.count()).toBe(1);
      expect(snapshots.snapshots()[0]?.name).toBe('Restored');
    });
  });
});

describe('D-073 — RestoreSnapshotCommand', () => {
  it('execute replaces the document with the snapshot, undo restores prior state', () => {
    const { state, bus, snapshots } = setup();
    const initial = seed(state);
    const snap = snapshots.take(initial, { name: 'Baseline' });
    // Mutate state directly (bypass commands; the test simulates a
    // batch of edits after the snapshot was taken).
    const mutated: SvgDocument = { ...initial, viewBox: { x: 1, y: 2, width: 50, height: 50 } };
    state.setDocument(mutated);
    expect(state.document().viewBox.x).toBe(1);

    const result = bus.dispatch(new RestoreSnapshotCommand(snap.id, snapshots));
    expect(result.ok).toBe(true);
    expect(state.document()).toBe(initial);
    expect(snapshots.currentSnapshotId()).toBe(snap.id);

    bus.undo();
    expect(state.document()).toBe(mutated);
    expect(snapshots.currentSnapshotId()).toBeNull();
  });

  it('execute fails when the snapshot id is unknown', () => {
    const { state, bus, snapshots } = setup();
    seed(state);
    const result = bus.dispatch(new RestoreSnapshotCommand('non-existent', snapshots));
    expect(result.ok).toBe(false);
  });
});

describe('D-073 — CommandBus auto-snapshot interceptor', () => {
  /**
   * Minimal fake "destructive" command that mutates `viewBox.x` so
   * the test can observe pre vs post state without dragging in real
   * Pathfinder / Optimize plumbing.
   */
  class FakeDestructiveCommand implements Command {
    readonly id = generateNodeId();
    readonly label = 'Fake Destructive';
    readonly isDestructive = true;
    execute(ctx: CommandContext): CommandResult {
      const doc = ctx.state.document();
      ctx.state.setDocument({ ...doc, viewBox: { ...doc.viewBox, x: 999 } });
      return ok();
    }
    undo(): CommandResult {
      return fail('not testing undo');
    }
  }

  class FakeBenignCommand implements Command {
    readonly id = generateNodeId();
    readonly label = 'Fake Benign';
    execute(ctx: CommandContext): CommandResult {
      const doc = ctx.state.document();
      ctx.state.setDocument({ ...doc, viewBox: { ...doc.viewBox, x: 5 } });
      return ok();
    }
    undo(): CommandResult {
      return fail('not testing undo');
    }
  }

  it('auto-snapshots before destructive commands when the flag is enabled', () => {
    const { state, bus, snapshots } = setup();
    const doc = seed(state);
    snapshots.setLimits({ autoOnDestructive: true });
    bus.dispatch(new FakeDestructiveCommand());
    // Pre-state captured (viewBox.x === 0) before the command's
    // mutation (which set it to 999).
    expect(snapshots.count()).toBe(1);
    const snap = snapshots.snapshots()[0]!;
    expect(snap.source).toBe('auto-destructive');
    expect(snap.name).toBe('Before Fake Destructive');
    expect(snap.document.viewBox.x).toBe(doc.viewBox.x);
    expect(snap.document.viewBox.x).not.toBe(999);
  });

  it('does NOT auto-snapshot when autoOnDestructive is false (default)', () => {
    const { state, bus, snapshots } = setup();
    seed(state);
    expect(snapshots.limits().autoOnDestructive).toBe(false);
    bus.dispatch(new FakeDestructiveCommand());
    expect(snapshots.count()).toBe(0);
  });

  it('does NOT auto-snapshot benign commands even with autoOnDestructive=true', () => {
    const { state, bus, snapshots } = setup();
    seed(state);
    snapshots.setLimits({ autoOnDestructive: true });
    bus.dispatch(new FakeBenignCommand());
    expect(snapshots.count()).toBe(0);
  });
});
