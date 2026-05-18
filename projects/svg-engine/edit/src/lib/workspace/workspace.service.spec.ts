import { TestBed } from '@angular/core/testing';
import { WorkspaceService } from './workspace.service';

function setup() {
  TestBed.configureTestingModule({});
  const svc = TestBed.inject(WorkspaceService);
  svc.resetBackground();
  return svc;
}

describe('WorkspaceService — background', () => {
  it('starts with the transparent (checkerboard) default', () => {
    const ws = setup();
    expect(ws.background()).toEqual({ kind: 'transparent' });
    expect(ws.isTransparentBackground()).toBe(true);
  });

  it('setBackground accepts solid color and updates the signal', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#ffeebb' });
    expect(ws.background()).toEqual({ kind: 'solid', color: '#ffeebb' });
    expect(ws.isTransparentBackground()).toBe(false);
  });

  it('setBackground accepts image and updates the signal', () => {
    const ws = setup();
    ws.setBackground({ kind: 'image', href: '/grid.png' });
    expect(ws.background()).toEqual({ kind: 'image', href: '/grid.png' });
  });

  it('setBackground rejects empty solid color (silently)', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '' });
    expect(ws.background().kind).toBe('transparent');
  });

  it('setBackground rejects empty image href (silently)', () => {
    const ws = setup();
    ws.setBackground({ kind: 'image', href: '' });
    expect(ws.background().kind).toBe('transparent');
  });

  it('setBackground is a no-op when the new value is structurally identical', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#fff' });
    const ref = ws.background();
    ws.setBackground({ kind: 'solid', color: '#fff' });
    // Same object reference (signal didn't fire) — proves the dedup
    expect(ws.background()).toBe(ref);
  });

  it('setBackground does fire when the value changes', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#fff' });
    const before = ws.background();
    ws.setBackground({ kind: 'solid', color: '#000' });
    expect(ws.background()).not.toBe(before);
    expect(ws.background()).toEqual({ kind: 'solid', color: '#000' });
  });

  it('resetBackground returns to transparent', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#abc' });
    ws.resetBackground();
    expect(ws.background()).toEqual({ kind: 'transparent' });
  });

  it('isTransparentBackground reflects current variant reactively', () => {
    const ws = setup();
    expect(ws.isTransparentBackground()).toBe(true);
    ws.setBackground({ kind: 'solid', color: '#fff' });
    expect(ws.isTransparentBackground()).toBe(false);
    ws.setBackground({ kind: 'image', href: '/x.png' });
    expect(ws.isTransparentBackground()).toBe(false);
    ws.resetBackground();
    expect(ws.isTransparentBackground()).toBe(true);
  });
});

describe('WorkspaceService — page (Bloco 4f)', () => {
  it('starts with sensible defaults (800x600, landscape, zero margins)', () => {
    const ws = setup();
    expect(ws.page()).toEqual({
      width: 800,
      height: 600,
      orientation: 'landscape',
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  });

  it('patchPage updates only provided fields', () => {
    const ws = setup();
    ws.patchPage({ width: 1024 });
    expect(ws.page().width).toBe(1024);
    expect(ws.page().height).toBe(600); // unchanged
    ws.patchPage({ orientation: 'portrait' });
    expect(ws.page().orientation).toBe('portrait');
    expect(ws.page().width).toBe(1024); // still
  });

  it('patchPage rejects non-finite or non-positive dims (silent dedup)', () => {
    const ws = setup();
    ws.patchPage({ width: -10 });
    expect(ws.page().width).toBe(800);
    ws.patchPage({ height: 0 });
    expect(ws.page().height).toBe(600);
    ws.patchPage({ width: Number.NaN });
    expect(ws.page().width).toBe(800);
  });

  it('patchPage margins: missing fields preserved', () => {
    const ws = setup();
    ws.patchPage({ margins: { top: 10, right: 0, bottom: 0, left: 0 } });
    ws.patchPage({ margins: { ...ws.page().margins, bottom: 5 } });
    expect(ws.page().margins).toEqual({ top: 10, right: 0, bottom: 5, left: 0 });
  });

  it('patchPage is no-op when result is structurally identical (signal dedup)', () => {
    const ws = setup();
    ws.patchPage({ width: 1024, height: 768 });
    const ref = ws.page();
    ws.patchPage({ width: 1024 });
    expect(ws.page()).toBe(ref);
  });

  it('resetPage returns to defaults', () => {
    const ws = setup();
    ws.patchPage({ width: 1024, height: 768, orientation: 'portrait' });
    ws.resetPage();
    expect(ws.page().width).toBe(800);
  });
});

describe('WorkspaceService — grid (Bloco 4f)', () => {
  it('starts disabled with spacing 20 / majorEvery 5', () => {
    const ws = setup();
    expect(ws.grid().enabled).toBe(false);
    expect(ws.grid().spacing).toBe(20);
    expect(ws.grid().majorEvery).toBe(5);
  });

  it('toggleGrid flips the enabled flag', () => {
    const ws = setup();
    ws.toggleGrid();
    expect(ws.grid().enabled).toBe(true);
    ws.toggleGrid();
    expect(ws.grid().enabled).toBe(false);
  });

  it('patchGrid rejects non-positive spacing / non-integer majorEvery', () => {
    const ws = setup();
    ws.patchGrid({ spacing: -1 });
    expect(ws.grid().spacing).toBe(20);
    ws.patchGrid({ majorEvery: 2.5 });
    expect(ws.grid().majorEvery).toBe(5);
    ws.patchGrid({ majorEvery: 0 });
    expect(ws.grid().majorEvery).toBe(5);
  });

  it('patchGrid accepts valid updates', () => {
    const ws = setup();
    ws.patchGrid({ enabled: true, spacing: 50, majorEvery: 10, color: '#ff0000' });
    expect(ws.grid()).toEqual({
      enabled: true,
      spacing: 50,
      majorEvery: 10,
      color: '#ff0000',
    });
  });

  it('resetGrid restores defaults', () => {
    const ws = setup();
    ws.patchGrid({ enabled: true, spacing: 100 });
    ws.resetGrid();
    expect(ws.grid().enabled).toBe(false);
    expect(ws.grid().spacing).toBe(20);
  });
});

describe('WorkspaceService — rulers (Bloco 4f)', () => {
  it('starts disabled', () => {
    expect(setup().rulers().enabled).toBe(false);
  });

  it('toggleRulers / setRulersEnabled', () => {
    const ws = setup();
    ws.toggleRulers();
    expect(ws.rulers().enabled).toBe(true);
    ws.setRulersEnabled(false);
    expect(ws.rulers().enabled).toBe(false);
  });

  it('setRulersEnabled is idempotent (signal dedup)', () => {
    const ws = setup();
    const ref = ws.rulers();
    ws.setRulersEnabled(false);
    expect(ws.rulers()).toBe(ref);
  });
});

describe('WorkspaceService — guides (Bloco 4f)', () => {
  it('starts with no guides', () => {
    expect(setup().guides()).toEqual([]);
  });

  it('addGuide appends and returns a generated id', () => {
    const ws = setup();
    const id1 = ws.addGuide('h', 100);
    const id2 = ws.addGuide('v', 200);
    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id1).not.toBe(id2);
    expect(ws.guides().map((g) => g.position)).toEqual([100, 200]);
    expect(ws.guides().map((g) => g.axis)).toEqual(['h', 'v']);
  });

  it('addGuide rejects non-finite position (returns null)', () => {
    const ws = setup();
    expect(ws.addGuide('h', Number.NaN)).toBeNull();
    expect(ws.addGuide('v', Number.POSITIVE_INFINITY)).toBeNull();
    expect(ws.guides()).toEqual([]);
  });

  it('moveGuide updates an existing guide by id; no-op for missing', () => {
    const ws = setup();
    const id = ws.addGuide('h', 100)!;
    ws.moveGuide(id, 150);
    expect(ws.guides()[0]?.position).toBe(150);
    ws.moveGuide('missing-id', 999);
    expect(ws.guides()[0]?.position).toBe(150); // unchanged
  });

  it('removeGuide drops the guide; no-op for missing', () => {
    const ws = setup();
    const id = ws.addGuide('h', 100)!;
    ws.addGuide('v', 200);
    ws.removeGuide(id);
    expect(ws.guides().length).toBe(1);
    expect(ws.guides()[0]?.axis).toBe('v');
    ws.removeGuide('missing');
    expect(ws.guides().length).toBe(1);
  });

  it('clearGuides empties the list', () => {
    const ws = setup();
    ws.addGuide('h', 1);
    ws.addGuide('v', 2);
    ws.clearGuides();
    expect(ws.guides()).toEqual([]);
  });
});

describe('WorkspaceService — interaction (Fase 6 UX polish)', () => {
  it('starts with default wheelZoomSpeed = 5', () => {
    const ws = setup();
    expect(ws.interaction().wheelZoomSpeed).toBe(5);
  });

  it('patchInteraction clamps wheelZoomSpeed to [1, 10] and rounds', () => {
    const ws = setup();
    ws.patchInteraction({ wheelZoomSpeed: 100 });
    expect(ws.interaction().wheelZoomSpeed).toBe(10);
    ws.patchInteraction({ wheelZoomSpeed: -3 });
    expect(ws.interaction().wheelZoomSpeed).toBe(1);
    ws.patchInteraction({ wheelZoomSpeed: 4.7 });
    expect(ws.interaction().wheelZoomSpeed).toBe(5);
  });

  it('patchInteraction with non-finite value is silently ignored', () => {
    const ws = setup();
    ws.patchInteraction({ wheelZoomSpeed: 7 });
    ws.patchInteraction({ wheelZoomSpeed: NaN });
    expect(ws.interaction().wheelZoomSpeed).toBe(7);
  });

  it('patchInteraction with same value does not re-fire signal', () => {
    const ws = setup();
    ws.patchInteraction({ wheelZoomSpeed: 5 });
    const ref1 = ws.interaction();
    ws.patchInteraction({ wheelZoomSpeed: 5 });
    expect(ws.interaction()).toBe(ref1);
  });

  it('resetInteraction restores default speed', () => {
    const ws = setup();
    ws.patchInteraction({ wheelZoomSpeed: 1 });
    ws.resetInteraction();
    expect(ws.interaction().wheelZoomSpeed).toBe(5);
  });
});

describe('wheelZoomSensitivityFromSpeed (helper)', () => {
  it('maps default speed 5 to 0.001 sensitivity', async () => {
    const { wheelZoomSensitivityFromSpeed } = await import('./workspace.service');
    expect(wheelZoomSensitivityFromSpeed(5)).toBeCloseTo(0.001, 6);
  });

  it('clamps out-of-range speeds before mapping', async () => {
    const { wheelZoomSensitivityFromSpeed } = await import('./workspace.service');
    expect(wheelZoomSensitivityFromSpeed(100)).toBeCloseTo(0.002, 6);
    expect(wheelZoomSensitivityFromSpeed(-5)).toBeCloseTo(0.0002, 6);
  });
});
