import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AssetExportRegistry } from './asset-export-registry.service';

/**
 * **D-077 — AssetExportRegistry specs.**
 *
 * The registry is pure data + signals — no DOM, no async. Easy to
 * unit-test exhaustively. The runner (file downloads, exporter
 * dispatch) is covered by integration testing in the playground;
 * here we focus on the data semantics that future regressions are
 * likely to break.
 */

function setup(): AssetExportRegistry {
  TestBed.configureTestingModule({});
  return TestBed.inject(AssetExportRegistry);
}

describe('AssetExportRegistry — add / update / remove / clear', () => {
  it('starts empty', () => {
    const reg = setup();
    expect(reg.count()).toBe(0);
    expect(reg.slots()).toEqual([]);
  });

  it('adds a slot with a generated id and defaults', () => {
    const reg = setup();
    const inserted = reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.svg',
      scale: 1,
      filename: 'logo',
    });
    expect(inserted).not.toBeNull();
    expect(inserted!.id.length).toBeGreaterThan(0);
    expect(reg.count()).toBe(1);
    expect(reg.slots()[0]!.filename).toBe('logo');
  });

  it('rejects add with empty exporterId (returns null, no insertion)', () => {
    const reg = setup();
    const result = reg.add({
      target: 'document',
      exporterId: '',
      scale: 1,
      filename: 'x',
    });
    expect(result).toBeNull();
    expect(reg.count()).toBe(0);
  });

  it('clamps non-finite or non-positive scale to 1', () => {
    const reg = setup();
    const a = reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.png',
      scale: Number.NaN,
      filename: 'a',
    });
    const b = reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.png',
      scale: -5,
      filename: 'b',
    });
    expect(a!.scale).toBe(1);
    expect(b!.scale).toBe(1);
  });

  it('update patches existing slot by id and returns true', () => {
    const reg = setup();
    const inserted = reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.png',
      scale: 1,
      filename: 'logo',
    })!;
    const ok = reg.update(inserted.id, { filename: 'logo-renamed', scale: 3 });
    expect(ok).toBe(true);
    expect(reg.slots()[0]!.filename).toBe('logo-renamed');
    expect(reg.slots()[0]!.scale).toBe(3);
  });

  it('update returns false for unknown id (defensive no-op)', () => {
    const reg = setup();
    expect(reg.update('unknown-id', { scale: 2 })).toBe(false);
  });

  it('remove drops the slot; remove of unknown id is no-op', () => {
    const reg = setup();
    const a = reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.svg',
      scale: 1,
      filename: 'a',
    })!;
    reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.png',
      scale: 1,
      filename: 'b',
    });
    expect(reg.count()).toBe(2);
    reg.remove(a.id);
    expect(reg.count()).toBe(1);
    expect(reg.slots()[0]!.filename).toBe('b');
    reg.remove('unknown'); // no-op
    expect(reg.count()).toBe(1);
  });

  it('clear empties the list (idempotent)', () => {
    const reg = setup();
    reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.svg',
      scale: 1,
      filename: 'a',
    });
    reg.add({
      target: 'document',
      exporterId: 'svge.builtin.exporter.png',
      scale: 1,
      filename: 'b',
    });
    expect(reg.count()).toBe(2);
    reg.clear();
    expect(reg.count()).toBe(0);
    reg.clear(); // idempotent
    expect(reg.count()).toBe(0);
  });

  it('setAll replaces the list (with id uniqueness validation)', () => {
    const reg = setup();
    reg.setAll([
      {
        id: 's1',
        target: 'document',
        exporterId: 'svge.builtin.exporter.svg',
        scale: 1,
        filename: 'a',
      },
      {
        id: 's2',
        target: 'document',
        exporterId: 'svge.builtin.exporter.png',
        scale: 2,
        filename: 'b',
      },
    ]);
    expect(reg.count()).toBe(2);
    // Duplicate ids → setAll silently rejects (count unchanged).
    reg.setAll([
      {
        id: 'dup',
        target: 'document',
        exporterId: 'svge.builtin.exporter.svg',
        scale: 1,
        filename: 'x',
      },
      {
        id: 'dup',
        target: 'document',
        exporterId: 'svge.builtin.exporter.png',
        scale: 1,
        filename: 'y',
      },
    ]);
    expect(reg.count()).toBe(2);
    expect(reg.slots()[0]!.id).toBe('s1');
  });
});

describe('AssetExportRegistry — resolveUniqueName', () => {
  it('returns base.ext when name has no collision', () => {
    const reg = setup();
    const name = reg.resolveUniqueName('logo', 'svg', new Set());
    expect(name).toBe('logo.svg');
  });

  it('handles extension with or without leading dot identically', () => {
    const reg = setup();
    expect(reg.resolveUniqueName('logo', 'svg', new Set())).toBe('logo.svg');
    expect(reg.resolveUniqueName('logo', '.svg', new Set())).toBe('logo.svg');
  });

  it('falls back to "untitled" when filename is empty / whitespace', () => {
    const reg = setup();
    expect(reg.resolveUniqueName('', 'png', new Set())).toBe('untitled.png');
    expect(reg.resolveUniqueName('   ', 'png', new Set())).toBe('untitled.png');
  });

  it('appends " (1)" when base.ext already used (Finder/Explorer convention)', () => {
    const reg = setup();
    const used = new Set(['logo.svg']);
    expect(reg.resolveUniqueName('logo', 'svg', used)).toBe('logo (1).svg');
  });

  it('increments suffix across multiple collisions', () => {
    const reg = setup();
    const used = new Set(['logo.svg', 'logo (1).svg', 'logo (2).svg']);
    expect(reg.resolveUniqueName('logo', 'svg', used)).toBe('logo (3).svg');
  });

  it('is case-insensitive when comparing collisions', () => {
    const reg = setup();
    const used = new Set(['Logo.SVG']);
    expect(reg.resolveUniqueName('logo', 'svg', used)).toBe('logo (1).svg');
  });

  it('returns a unique name even across formats (svg + png coexist as distinct)', () => {
    const reg = setup();
    const used = new Set(['logo.svg']);
    expect(reg.resolveUniqueName('logo', 'png', used)).toBe('logo.png');
  });
});
