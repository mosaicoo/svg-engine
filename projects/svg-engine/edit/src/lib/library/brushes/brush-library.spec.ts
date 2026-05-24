import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { BrushLibraryService, BrushSelectionService } from './brush-library.service';
import { builtinBrushesPlugin, BUILTIN_BRUSHES } from './builtin-brushes';
import { expandStrokeWithProfile, sampleProfile } from './expand-stroke';

/**
 * D-060 — Brush Library specs:
 * 1. Plugin registers 3 builtins.
 * 2. expandStrokeWithProfile produces valid closed-polygon d strings.
 * 3. sampleProfile interpolates correctly.
 * 4. BrushSelectionService manages active brush id.
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(builtinBrushesPlugin)],
  });
  return {
    catalog: TestBed.inject(BrushLibraryService),
    selection: TestBed.inject(BrushSelectionService),
  };
}

describe('builtinBrushesPlugin — registra 3 builtins', () => {
  it('registra uniform, tapered, calligraphic', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    expect(ids).toContain('svge.builtin.brush.uniform');
    expect(ids).toContain('svge.builtin.brush.tapered');
    expect(ids).toContain('svge.builtin.brush.calligraphic');
    expect(catalog.items().length).toBe(BUILTIN_BRUSHES.length);
  });

  it('cada builtin tem widthProfile não-vazio + baseWidth > 0', () => {
    const { catalog } = setup();
    for (const item of catalog.items()) {
      expect(item.widthProfile.length).toBeGreaterThan(0);
      expect(item.baseWidth ?? 0).toBeGreaterThan(0);
    }
  });

  it('uniform profile = todos 1.0 (sem modulação)', () => {
    const { catalog } = setup();
    const uniform = catalog.get('svge.builtin.brush.uniform')!;
    for (const v of uniform.widthProfile) expect(v).toBe(1);
  });

  it('tapered profile = max no meio, baixo nos endpoints', () => {
    const { catalog } = setup();
    const tapered = catalog.get('svge.builtin.brush.tapered')!;
    const profile = tapered.widthProfile;
    expect(profile[0]!).toBeLessThan(profile[Math.floor(profile.length / 2)]!);
    expect(profile.at(-1)!).toBeLessThan(profile[Math.floor(profile.length / 2)]!);
  });
});

describe('sampleProfile', () => {
  it('retorna 1 para profile vazio', () => {
    expect(sampleProfile([], 0.5)).toBe(1);
  });

  it('retorna o único sample quando length=1', () => {
    expect(sampleProfile([0.7], 0.3)).toBe(0.7);
    expect(sampleProfile([0.7], 0)).toBe(0.7);
    expect(sampleProfile([0.7], 1)).toBe(0.7);
  });

  it('interpola linearmente entre 2 samples', () => {
    expect(sampleProfile([0, 1], 0)).toBe(0);
    expect(sampleProfile([0, 1], 0.5)).toBe(0.5);
    expect(sampleProfile([0, 1], 1)).toBe(1);
  });

  it('clamp em t < 0 e t > 1', () => {
    expect(sampleProfile([0, 1], -0.5)).toBe(0);
    expect(sampleProfile([0, 1], 1.5)).toBe(1);
  });

  it('interpola corretamente em profile de 4 amostras', () => {
    const p = [0.2, 0.6, 1.0, 0.4];
    expect(sampleProfile(p, 0)).toBe(0.2);
    expect(sampleProfile(p, 1 / 3)).toBeCloseTo(0.6, 5);
    expect(sampleProfile(p, 2 / 3)).toBeCloseTo(1.0, 5);
    expect(sampleProfile(p, 1)).toBe(0.4);
  });
});

describe('expandStrokeWithProfile', () => {
  it('retorna string vazia para < 2 pontos', () => {
    expect(expandStrokeWithProfile([], 10, [1])).toBe('');
    expect(expandStrokeWithProfile([{ x: 0, y: 0 }], 10, [1])).toBe('');
  });

  it('retorna string vazia para baseWidth <= 0', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(expandStrokeWithProfile(pts, 0, [1])).toBe('');
    expect(expandStrokeWithProfile(pts, -1, [1])).toBe('');
  });

  it('linha horizontal com profile uniforme = retângulo fechado', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const d = expandStrokeWithProfile(pts, 10, [1]);
    // Retângulo = M, L, L, Z (4 vértices). Algoritmo gera 2N vértices
    // (left then right), com N=2 → 4 vértices.
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const lCount = (d.match(/L/g) ?? []).length;
    expect(lCount).toBeGreaterThanOrEqual(3);
  });

  it('todas as posições estão na vizinhança do centerline (sanity check)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const d = expandStrokeWithProfile(pts, 20, [1]);
    // Extrair todos os números do d. Para uma linha horizontal com width 20,
    // os y devem estar ±10 do centerline (y=0).
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    // Pares (x,y) — y values estão nos índices ímpares.
    const ys = nums.filter((_, i) => i % 2 === 1);
    for (const y of ys) {
      expect(Math.abs(y)).toBeLessThanOrEqual(10.5);
    }
  });

  it('profile [0, 1, 0] no meio de um polyline produz silhouette tapered', () => {
    const pts = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 0 }));
    const d = expandStrokeWithProfile(pts, 20, [0, 1, 0]);
    // A primeira e última posição (t≈0 e t≈1) têm width≈0, o meio (t=0.5)
    // tem width=20. Sanity: o output é não-vazio e fechado.
    expect(d.length).toBeGreaterThan(0);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('pontos coincidentes não geram NaN', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const d = expandStrokeWithProfile(pts, 10, [1]);
    expect(d).not.toContain('NaN');
  });
});

describe('BrushSelectionService', () => {
  it('começa sem brush selecionado', () => {
    const { selection } = setup();
    expect(selection.selectedBrushId()).toBeNull();
  });

  it('select / deselect alteram o signal', () => {
    const { selection } = setup();
    selection.select('svge.builtin.brush.tapered');
    expect(selection.selectedBrushId()).toBe('svge.builtin.brush.tapered');
    selection.select(null);
    expect(selection.selectedBrushId()).toBeNull();
  });
});
