import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { BrushLibraryService, BrushSelectionService } from './brush-library.service';
import { builtinBrushesPlugin, BUILTIN_BRUSHES } from './builtin-brushes';
import { expandStrokeWithProfile, sampleProfile } from './expand-stroke';

/**
 * D-060 — Brush Library specs:
 * 1. Plugin registers 18 builtins.
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

describe('builtinBrushesPlugin — registra 18 builtins', () => {
  it('registra uniform, tapered, calligraphic', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    expect(ids).toContain('svge.builtin.brush.uniform');
    expect(ids).toContain('svge.builtin.brush.tapered');
    expect(ids).toContain('svge.builtin.brush.calligraphic');
    expect(catalog.items().length).toBe(BUILTIN_BRUSHES.length);
  });

  it('registra os 6 brushes do round 1 (brush-pen, wedge, spindle, ribbon, comet, bulge)', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    expect(ids).toContain('svge.builtin.brush.brush-pen');
    expect(ids).toContain('svge.builtin.brush.wedge');
    expect(ids).toContain('svge.builtin.brush.spindle');
    expect(ids).toContain('svge.builtin.brush.ribbon');
    expect(ids).toContain('svge.builtin.brush.comet');
    expect(ids).toContain('svge.builtin.brush.bulge');
  });

  it('registra os 9 brushes do round 2 (ramp, swell, marker, flared, swash, beads, bamboo, twin, rough)', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    expect(ids).toContain('svge.builtin.brush.ramp');
    expect(ids).toContain('svge.builtin.brush.swell');
    expect(ids).toContain('svge.builtin.brush.marker');
    expect(ids).toContain('svge.builtin.brush.flared');
    expect(ids).toContain('svge.builtin.brush.swash');
    expect(ids).toContain('svge.builtin.brush.beads');
    expect(ids).toContain('svge.builtin.brush.bamboo');
    expect(ids).toContain('svge.builtin.brush.twin');
    expect(ids).toContain('svge.builtin.brush.rough');
    expect(catalog.items().length).toBe(18);
  });

  it('todos os ids são únicos', () => {
    const ids = BUILTIN_BRUSHES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nenhum profile tem valor negativo (a expansão exige largura ≥ 0)', () => {
    const { catalog } = setup();
    for (const item of catalog.items()) {
      for (const v of item.widthProfile) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('spindle é pinçado (≈0) em ambos os endpoints e máximo no meio', () => {
    const { catalog } = setup();
    const spindle = catalog.get('svge.builtin.brush.spindle')!;
    const p = spindle.widthProfile;
    expect(p[0]!).toBeCloseTo(0, 5);
    expect(p.at(-1)!).toBeCloseTo(0, 5);
    expect(p[Math.floor(p.length / 2)]!).toBeGreaterThan(0.9);
  });

  it('bulge é exagerado (> 1) no meio e fino (não-zero) nos endpoints', () => {
    const { catalog } = setup();
    const bulge = catalog.get('svge.builtin.brush.bulge')!;
    const p = bulge.widthProfile;
    expect(p[0]!).toBeGreaterThan(0);
    expect(p[0]!).toBeLessThan(0.5);
    expect(p[Math.floor(p.length / 2)]!).toBeGreaterThan(1);
  });

  it('ramp cresce monotonicamente (thin→thick)', () => {
    const { catalog } = setup();
    const p = catalog.get('svge.builtin.brush.ramp')!.widthProfile;
    expect(p[0]!).toBeLessThan(p.at(-1)!);
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThanOrEqual(p[i - 1]!);
  });

  it('flared tem cintura invertida: grosso nas pontas, fino no meio', () => {
    const { catalog } = setup();
    const p = catalog.get('svge.builtin.brush.flared')!.widthProfile;
    const mid = p[Math.floor(p.length / 2)]!;
    expect(p[0]!).toBeGreaterThan(mid);
    expect(p.at(-1)!).toBeGreaterThan(mid);
  });

  it('twin tem dois corcovas: picos nos quartos, vales nas pontas+meio', () => {
    const { catalog } = setup();
    const p = catalog.get('svge.builtin.brush.twin')!.widthProfile;
    const q1 = p[Math.round(p.length * 0.25)]!;
    const q3 = p[Math.round(p.length * 0.75)]!;
    const mid = p[Math.floor(p.length / 2)]!;
    expect(q1).toBeGreaterThan(mid);
    expect(q3).toBeGreaterThan(mid);
    expect(q1).toBeGreaterThan(p[0]!);
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
