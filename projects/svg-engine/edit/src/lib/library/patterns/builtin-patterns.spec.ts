import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { BUILTIN_PATTERNS } from './builtin-patterns';
import { builtinPatternsPlugin } from './builtin-patterns.plugin';
import { PatternLibraryService } from './pattern-library.service';

/**
 * D-048 — Pattern Library specs:
 * 1. Plugin registers all 30 builtins (5 originais + 25 do round 2).
 * 2. Cada buildMarkup() é um <pattern> auto-contido que embute o id.
 * 3. ids únicos e prefixados.
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(builtinPatternsPlugin)],
  });
  return { catalog: TestBed.inject(PatternLibraryService) };
}

const ROUND2_IDS = [
  'lines-vertical',
  'cross-hatch',
  'grid-fine',
  'graph-paper',
  'dots-large',
  'dots-dense',
  'dots-offset',
  'circles',
  'zigzag',
  'chevron',
  'waves',
  'scales',
  'bricks',
  'triangles',
  'diamonds',
  'octagons',
  'crosses',
  'stars',
  'hearts',
  'stripes-vertical',
  'stripes-diagonal',
  'checkerboard-small',
  'confetti',
  'basketweave',
  'plaid',
];

describe('builtinPatternsPlugin — registra 30 builtins', () => {
  it('registra os 5 patterns originais', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    for (const id of ['dots', 'lines-horizontal', 'lines-diagonal', 'grid', 'checkerboard']) {
      expect(ids).toContain(`svge.builtin.pattern.${id}`);
    }
    expect(catalog.items().length).toBe(BUILTIN_PATTERNS.length);
  });

  it('registra os 25 patterns do round 2', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    for (const id of ROUND2_IDS) {
      expect(ids).toContain(`svge.builtin.pattern.${id}`);
    }
    expect(catalog.items().length).toBe(30);
  });

  it('todos os ids são únicos e prefixados com svge.builtin.pattern.', () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('svge.builtin.pattern.')).toBe(true);
  });

  it('cada buildMarkup() é um <pattern> que embute o próprio id', () => {
    for (const p of BUILTIN_PATTERNS) {
      const markup = p.buildMarkup();
      expect(markup).toContain('<pattern');
      expect(markup).toContain(`id="${p.id}"`);
      expect(markup).toContain('</pattern>');
      expect(markup).toContain('patternUnits="userSpaceOnUse"');
    }
  });
});
