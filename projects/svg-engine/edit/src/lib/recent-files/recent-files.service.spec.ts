import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RECENT_FILES_STORAGE_KEY } from './recent-files.config';
import { RecentFilesService } from './recent-files.service';

const KEY = 'svge:recent-files:test';

/** Fresh service instance bound to the test storage slot. */
function make(): RecentFilesService {
  TestBed.configureTestingModule({
    providers: [{ provide: RECENT_FILES_STORAGE_KEY, useValue: KEY }, RecentFilesService],
  });
  return TestBed.inject(RecentFilesService);
}

describe('RecentFilesService (D-136)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts empty', () => {
    const s = make();
    expect(s.files()).toEqual([]);
    expect(s.isEmpty()).toBe(true);
  });

  it('records newest-first', () => {
    const s = make();
    s.record('a.svg', '<svg/>');
    s.record('b.svg', '<svg/>');
    expect(s.files().map((f) => f.name)).toEqual(['b.svg', 'a.svg']);
    expect(s.isEmpty()).toBe(false);
  });

  it('de-dupes by name (case-insensitive), moving the entry to the top with fresh content', () => {
    const s = make();
    s.record('a.svg', '<svg id="1"/>');
    s.record('b.svg', '<svg/>');
    s.record('A.SVG', '<svg id="2"/>');
    expect(s.files().map((f) => f.name)).toEqual(['A.SVG', 'b.svg']);
    expect(s.files()[0]!.svg).toBe('<svg id="2"/>');
  });

  it('caps the list at 10 entries (drops the oldest)', () => {
    const s = make();
    for (let i = 0; i < 15; i++) s.record(`f${i}.svg`, '<svg/>');
    expect(s.files().length).toBe(10);
    expect(s.files()[0]!.name).toBe('f14.svg');
    expect(s.files().at(-1)!.name).toBe('f5.svg');
  });

  it('skips files larger than the per-entry cap (still nothing remembered)', () => {
    const s = make();
    s.record('big.svg', 'x'.repeat(256 * 1024 + 1));
    expect(s.files()).toEqual([]);
  });

  it('falls back to a default name for a blank file name', () => {
    const s = make();
    s.record('   ', '<svg/>');
    expect(s.files()[0]!.name).toBe('Untitled.svg');
  });

  it('clear() empties the list and the storage slot', () => {
    const s = make();
    s.record('a.svg', '<svg/>');
    s.clear();
    expect(s.files()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('persists to localStorage and reloads on a fresh instance', () => {
    make().record('keep.svg', '<svg id="k"/>');
    TestBed.resetTestingModule();
    const reloaded = make();
    expect(reloaded.files().map((f) => f.name)).toEqual(['keep.svg']);
    expect(reloaded.files()[0]!.svg).toBe('<svg id="k"/>');
  });

  it('ignores a corrupt persisted payload', () => {
    localStorage.setItem(KEY, '{not json');
    expect(make().files()).toEqual([]);
  });

  it('does not persist when the storage key is bound to null', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: RECENT_FILES_STORAGE_KEY, useValue: null }, RecentFilesService],
    });
    const s = TestBed.inject(RecentFilesService);
    s.record('a.svg', '<svg/>');
    // In-memory list still updates…
    expect(s.files().map((f) => f.name)).toEqual(['a.svg']);
    // …but nothing is written to storage.
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
