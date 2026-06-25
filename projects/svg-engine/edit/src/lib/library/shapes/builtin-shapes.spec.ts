import { TestBed } from '@angular/core/testing';
import type { PathNode } from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { BUILTIN_SHAPES } from './builtin-shapes';
import { builtinShapesPlugin } from './builtin-shapes.plugin';
import { ShapeLibraryService } from './shape-library.service';

/**
 * D-048 — Shape Library specs:
 * 1. Plugin registers all 24 builtins (12 originais + 12 do round 2).
 * 2. Cada `build()` produz um PathNode válido (`d` fechado com `Z`).
 * 3. `build()` é uma factory: cada chamada gera um id fresco.
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(builtinShapesPlugin)],
  });
  return { catalog: TestBed.inject(ShapeLibraryService) };
}

describe('builtinShapesPlugin — registra 24 builtins', () => {
  it('registra os 12 shapes originais', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    for (const id of [
      'triangle',
      'diamond',
      'hexagon',
      'cross',
      'arrow',
      'balloon',
      'star',
      'heart',
      'lightning',
      'cloud',
      'gear',
      'checkmark',
    ]) {
      expect(ids).toContain(`svge.builtin.shape.${id}`);
    }
    expect(catalog.items().length).toBe(BUILTIN_SHAPES.length);
  });

  it('registra os 12 shapes do round 2', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    for (const id of [
      'pentagon',
      'octagon',
      'parallelogram',
      'trapezoid',
      'right-triangle',
      'rounded-rect',
      'double-arrow',
      'up-arrow',
      'chevron',
      'crescent-moon',
      'sparkle',
      'hexagram',
    ]) {
      expect(ids).toContain(`svge.builtin.shape.${id}`);
    }
    expect(catalog.items().length).toBe(24);
  });

  it('todos os ids são únicos e prefixados com svge.builtin.shape.', () => {
    const ids = BUILTIN_SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('svge.builtin.shape.')).toBe(true);
  });

  it('cada build() retorna um PathNode com d fechado (M…Z)', () => {
    for (const shape of BUILTIN_SHAPES) {
      const node = shape.build() as PathNode;
      expect(node.type).toBe('path');
      const d = node.d.trim();
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      expect(d).not.toContain('NaN');
    }
  });

  it('build() é factory: cada chamada gera um id novo (sem reuso de node)', () => {
    for (const shape of BUILTIN_SHAPES) {
      const a = shape.build();
      const b = shape.build();
      expect(a.id).not.toBe(b.id);
    }
  });
});
