import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ASSET_EXPORT_STORAGE_KEY } from './asset-export.config';
import { AssetExportPersistenceService } from './asset-export-persistence.service';
import { AssetExportRegistry } from './asset-export-registry.service';
import type { ExportSlot } from './asset-export.types';

/**
 * **D-077 follow-up — AssetExportPersistenceService specs.**
 *
 * Mirror of the SnapshotsPersistenceService coverage shape (D-073):
 * round-trip (save → hydrate → assert), schema-version gate, graceful
 * degradation on bad payloads, per-editor storage key isolation, and
 * the auto-save effect that fires on every slots() mutation.
 *
 * Each test uses a unique storage key to avoid cross-pollution — and
 * `afterEach` wipes the key from the real `localStorage` so reruns
 * stay deterministic.
 */

const KEYS_USED: string[] = [];
let counter = 0;
function freshKey(): string {
  counter++;
  const key = `svge:test:assetExport:${counter}-${Math.random().toString(36).slice(2, 8)}`;
  KEYS_USED.push(key);
  return key;
}

function setup(storageKey: string): {
  registry: AssetExportRegistry;
  persist: AssetExportPersistenceService;
} {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ASSET_EXPORT_STORAGE_KEY, useValue: storageKey },
      AssetExportRegistry,
      AssetExportPersistenceService,
    ],
  });
  return {
    registry: TestBed.inject(AssetExportRegistry),
    persist: TestBed.inject(AssetExportPersistenceService),
  };
}

const SAMPLE_SLOT: ExportSlot = {
  id: 'slot-1',
  target: 'document',
  exporterId: 'svge.builtin.exporter.svg',
  scale: 1,
  filename: 'logo',
};

afterEach(() => {
  for (const key of KEYS_USED) {
    try {
      localStorage.removeItem(key);
    } catch {
      // SSR / privacy mode — irrelevant for cleanup.
    }
  }
  KEYS_USED.length = 0;
});

describe('AssetExportPersistenceService — save / hydrate round-trip', () => {
  it('saveNow writes the current slots and hydrate reads them back', () => {
    const key = freshKey();
    const { registry, persist } = setup(key);
    registry.add(SAMPLE_SLOT);
    persist.saveNow();

    // Tear down, set up fresh, verify hydrate populates.
    TestBed.resetTestingModule();
    const fresh = setup(key);
    expect(fresh.registry.slots()).toHaveLength(1);
    expect(fresh.registry.slots()[0]!.filename).toBe('logo');
  });

  it('preserves all fields verbatim across the round-trip', () => {
    const key = freshKey();
    const { registry, persist } = setup(key);
    registry.add({ ...SAMPLE_SLOT, id: 'a', filename: 'a', scale: 1 });
    registry.add({ ...SAMPLE_SLOT, id: 'b', filename: 'b', scale: 2 });
    registry.add({ ...SAMPLE_SLOT, id: 'c', filename: 'c', scale: 3 });
    persist.saveNow();

    TestBed.resetTestingModule();
    const fresh = setup(key);
    const restored = fresh.registry.slots();
    expect(restored.map((s) => s.filename)).toEqual(['a', 'b', 'c']);
    expect(restored.map((s) => s.scale)).toEqual([1, 2, 3]);
  });

  it('constructor auto-hydrates so the user sees saved slots on first paint', () => {
    const key = freshKey();
    // Pre-seed storage manually (simulates a prior session).
    localStorage.setItem(key, JSON.stringify({ v: 1, slots: [SAMPLE_SLOT] }));
    const { registry } = setup(key);
    expect(registry.slots()).toHaveLength(1);
    expect(registry.slots()[0]!.id).toBe('slot-1');
  });
});

describe('AssetExportPersistenceService — schema + graceful degradation', () => {
  it('hydrate ignores payloads with unknown schema version', () => {
    const key = freshKey();
    localStorage.setItem(key, JSON.stringify({ v: 999, slots: [SAMPLE_SLOT] }));
    const { registry } = setup(key);
    // Auto-hydrate in ctor: bad schema → slots stay empty
    expect(registry.slots()).toEqual([]);
  });

  it('hydrate ignores malformed JSON (returns false, slots empty)', () => {
    const key = freshKey();
    localStorage.setItem(key, '{not-json');
    const { registry, persist } = setup(key);
    expect(persist.hydrate()).toBe(false);
    expect(registry.slots()).toEqual([]);
  });

  it('hydrate filters out invalid slots but keeps the valid ones', () => {
    const key = freshKey();
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        slots: [
          SAMPLE_SLOT, // valid
          { id: '', exporterId: 'x', scale: 1, filename: 'y', target: 'document' }, // empty id
          { id: 'b', exporterId: '', scale: 1, filename: 'y', target: 'document' }, // empty exporterId
          { id: 'c', exporterId: 'x', scale: -1, filename: 'y', target: 'document' }, // bad scale
          { id: 'd', exporterId: 'x', scale: 1, filename: 'y', target: 'document' }, // valid
        ],
      }),
    );
    const { registry } = setup(key);
    expect(registry.slots()).toHaveLength(2);
    expect(registry.slots().map((s) => s.id)).toEqual(['slot-1', 'd']);
  });

  it('storage key bound to null disables persistence entirely (no-op)', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ASSET_EXPORT_STORAGE_KEY, useValue: null },
        AssetExportRegistry,
        AssetExportPersistenceService,
      ],
    });
    const registry = TestBed.inject(AssetExportRegistry);
    const persist = TestBed.inject(AssetExportPersistenceService);
    registry.add(SAMPLE_SLOT);
    persist.saveNow();
    // Nothing should be written anywhere — and hydrate is a no-op.
    expect(persist.hydrate()).toBe(false);
  });
});

describe('AssetExportPersistenceService — auto-save effect + clear', () => {
  it('saveNow persists immediately, bypassing the debounce', () => {
    const key = freshKey();
    const { registry, persist } = setup(key);
    registry.add(SAMPLE_SLOT);
    persist.saveNow();
    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { v: number; slots: ExportSlot[] };
    expect(parsed.v).toBe(1);
    expect(parsed.slots).toHaveLength(1);
  });

  it('clearStorage drops the persisted payload', () => {
    const key = freshKey();
    const { registry, persist } = setup(key);
    registry.add(SAMPLE_SLOT);
    persist.saveNow();
    expect(localStorage.getItem(key)).not.toBeNull();
    persist.clearStorage();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('two editors with different storage keys do not cross-pollinate', () => {
    const keyA = freshKey();
    const keyB = freshKey();
    // Editor A
    const setupA = setup(keyA);
    setupA.registry.add({ ...SAMPLE_SLOT, id: 'a-only' });
    setupA.persist.saveNow();
    TestBed.resetTestingModule();
    // Editor B
    const setupB = setup(keyB);
    expect(setupB.registry.slots()).toEqual([]);
    setupB.registry.add({ ...SAMPLE_SLOT, id: 'b-only' });
    setupB.persist.saveNow();
    // Re-hydrate A — must still see only its own slot
    TestBed.resetTestingModule();
    const reopenA = setup(keyA);
    expect(reopenA.registry.slots().map((s) => s.id)).toEqual(['a-only']);
  });
});
