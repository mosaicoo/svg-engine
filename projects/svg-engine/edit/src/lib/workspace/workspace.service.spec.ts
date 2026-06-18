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

describe('WorkspaceService — timeline (D-082 F6 follow-up)', () => {
  it('starts disabled (opt-in)', () => {
    expect(setup().timeline()).toBe(false);
  });

  it('toggleTimeline / setTimelineEnabled', () => {
    const ws = setup();
    ws.toggleTimeline();
    expect(ws.timeline()).toBe(true);
    ws.setTimelineEnabled(false);
    expect(ws.timeline()).toBe(false);
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

describe('WorkspaceService — guides locked (D-121)', () => {
  it('starts unlocked', () => {
    expect(setup().guidesLocked()).toBe(false);
  });

  it('toggleGuidesLocked flips the state', () => {
    const ws = setup();
    ws.toggleGuidesLocked();
    expect(ws.guidesLocked()).toBe(true);
    ws.toggleGuidesLocked();
    expect(ws.guidesLocked()).toBe(false);
  });

  it('setGuidesLocked(true) clears any guide selection', () => {
    const ws = setup();
    const id = ws.addGuide('h', 100)!;
    ws.selectGuide(id);
    expect(ws.selectedGuideId()).toBe(id);
    ws.setGuidesLocked(true);
    expect(ws.guidesLocked()).toBe(true);
    expect(ws.selectedGuideId()).toBeNull();
  });

  it('setGuidesLocked is idempotent (no-op when already in the requested state)', () => {
    const ws = setup();
    ws.setGuidesLocked(false); // already false → no-op
    expect(ws.guidesLocked()).toBe(false);
    ws.setGuidesLocked(true);
    ws.setGuidesLocked(true); // no-op
    expect(ws.guidesLocked()).toBe(true);
  });

  it('clearGuides resets the lock back to default/unlocked (D-122)', () => {
    const ws = setup();
    ws.addGuide('h', 10);
    ws.setGuidesLocked(true);
    expect(ws.guidesLocked()).toBe(true);
    ws.clearGuides();
    expect(ws.guides()).toEqual([]);
    expect(ws.guidesLocked()).toBe(false); // cleared → back to default
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

describe('pageBoundsIn (helper)', () => {
  const defaultPage = {
    width: 800,
    height: 600,
    orientation: 'landscape' as const,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  it('always anchors at doc origin (0, 0) regardless of contentBox size', async () => {
    const { pageBoundsIn } = await import('./workspace.service');
    // contentBox much larger than page → still (0, 0)
    const out = pageBoundsIn(
      { width: 2000, height: 1500 },
      { ...defaultPage, width: 400, height: 300 },
    );
    expect(out).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('contentBox dims are ignored (page anchored at ruler 0)', async () => {
    const { pageBoundsIn } = await import('./workspace.service');
    const a = pageBoundsIn({ width: 100, height: 100 }, defaultPage);
    const b = pageBoundsIn({ width: 5000, height: 5000 }, defaultPage);
    expect(a).toEqual(b); // contentBox doesn't affect the result
  });

  it('orientation swap: portrait + landscape-shaped dims → swap', async () => {
    const { pageBoundsIn } = await import('./workspace.service');
    const out = pageBoundsIn(
      { width: 1000, height: 1000 },
      { ...defaultPage, width: 800, height: 400, orientation: 'portrait' },
    );
    // Effective dims = 400×800 (swapped); anchored at (0,0)
    expect(out.width).toBe(400);
    expect(out.height).toBe(800);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('orientation swap: landscape + portrait-shaped dims → swap', async () => {
    const { pageBoundsIn } = await import('./workspace.service');
    const out = pageBoundsIn(
      { width: 1000, height: 1000 },
      { ...defaultPage, width: 400, height: 800, orientation: 'landscape' },
    );
    expect(out.width).toBe(800);
    expect(out.height).toBe(400);
  });

  it('orientation matches authored shape: no swap', async () => {
    const { pageBoundsIn } = await import('./workspace.service');
    const out = pageBoundsIn(
      { width: 1000, height: 1000 },
      { ...defaultPage, width: 800, height: 600, orientation: 'landscape' },
    );
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });
});

// **Grid-anchor fix** — the page paper (PageOverlay) and the grid (GridOverlay)
// now resolve their rectangle through this single helper, so they can never
// disagree (the bug where the grid stayed at the legacy origin while the page
// followed the active D-079 page) and the grid adapts to Page-tool resizes.
describe('resolvePageBounds (helper) — grid/page anchor precedence', () => {
  const legacy = {
    width: 800,
    height: 600,
    orientation: 'landscape' as const,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const contentBox = { width: 1000, height: 1000 };

  it('drag preview wins over active viewBox and legacy (live Page-tool resize)', async () => {
    const { resolvePageBounds } = await import('./workspace.service');
    const out = resolvePageBounds(
      { x: 10, y: 20, width: 300, height: 400 }, // active viewBox
      { x: 5, y: 6, width: 333, height: 222 }, // live drag preview
      legacy,
      contentBox,
    );
    expect(out).toEqual({ x: 5, y: 6, width: 333, height: 222 });
  });

  it('active page viewBox wins over legacy — grid follows the page position AND size', async () => {
    const { resolvePageBounds } = await import('./workspace.service');
    const out = resolvePageBounds(
      { x: 100, y: 50, width: 250, height: 175 }, // page moved + resized
      null,
      legacy,
      contentBox,
    );
    // NOT the legacy {0,0,800,600}: the grid anchors to the active page.
    expect(out).toEqual({ x: 100, y: 50, width: 250, height: 175 });
  });

  it('falls back to the legacy origin-anchored page when there is no active page', async () => {
    const { resolvePageBounds, pageBoundsIn } = await import('./workspace.service');
    const out = resolvePageBounds(null, null, legacy, contentBox);
    expect(out).toEqual(pageBoundsIn(contentBox, legacy)); // {0,0,800,600}
  });

  it('ignores a zero-size drag preview and uses the active viewBox', async () => {
    const { resolvePageBounds } = await import('./workspace.service');
    const out = resolvePageBounds(
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 0, y: 0, width: 0, height: 50 }, // invalid preview
      legacy,
      contentBox,
    );
    expect(out).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it('returns null when nothing has positive dimensions', async () => {
    const { resolvePageBounds } = await import('./workspace.service');
    expect(resolvePageBounds(null, null, { ...legacy, width: 0 }, contentBox)).toBeNull();
    expect(resolvePageBounds(null, null, null, contentBox)).toBeNull();
  });
});

describe('WorkspaceService — rulerCursor tracking', () => {
  it('starts as null', () => {
    const ws = setup();
    expect(ws.rulerCursor()).toBeNull();
  });

  it('setRulerCursor stores a finite point as-is', () => {
    const ws = setup();
    ws.setRulerCursor({ x: 123.4, y: -50 });
    expect(ws.rulerCursor()).toEqual({ x: 123.4, y: -50 });
  });

  it('setRulerCursor(null) clears the position', () => {
    const ws = setup();
    ws.setRulerCursor({ x: 1, y: 2 });
    ws.setRulerCursor(null);
    expect(ws.rulerCursor()).toBeNull();
  });

  it('coerces non-finite coordinates to null', () => {
    const ws = setup();
    ws.setRulerCursor({ x: Number.NaN, y: 10 });
    expect(ws.rulerCursor()).toBeNull();
    ws.setRulerCursor({ x: 10, y: Number.POSITIVE_INFINITY });
    expect(ws.rulerCursor()).toBeNull();
  });

  it('is a no-op when the new value matches the current one', () => {
    const ws = setup();
    ws.setRulerCursor({ x: 5, y: 5 });
    const ref = ws.rulerCursor();
    ws.setRulerCursor({ x: 5, y: 5 });
    // Same object reference proves the signal didn't fire (dedup).
    expect(ws.rulerCursor()).toBe(ref);
  });

  it('is a no-op when clearing an already-null cursor', () => {
    const ws = setup();
    // Force-set null first to flush any test setup state.
    ws.setRulerCursor(null);
    expect(ws.rulerCursor()).toBeNull();
    ws.setRulerCursor(null);
    expect(ws.rulerCursor()).toBeNull();
  });
});

describe('WorkspaceService — presentation mode (D-128)', () => {
  it('defaults to off', () => {
    const ws = setup();
    expect(ws.presentationMode()).toBe(false);
  });

  it('setPresentationMode flips the signal', () => {
    const ws = setup();
    ws.setPresentationMode(true);
    expect(ws.presentationMode()).toBe(true);
    ws.setPresentationMode(false);
    expect(ws.presentationMode()).toBe(false);
  });

  it('togglePresentationMode flips back and forth', () => {
    const ws = setup();
    ws.togglePresentationMode();
    expect(ws.presentationMode()).toBe(true);
    ws.togglePresentationMode();
    expect(ws.presentationMode()).toBe(false);
  });

  it('is independent of outlineMode (orthogonal display states)', () => {
    const ws = setup();
    ws.setOutlineMode(true);
    ws.setPresentationMode(true);
    expect(ws.outlineMode()).toBe(true);
    expect(ws.presentationMode()).toBe(true);
    ws.setPresentationMode(false);
    // Leaving presentation must not touch outline.
    expect(ws.outlineMode()).toBe(true);
  });
});

describe('WorkspaceService — pixel preview (D-130)', () => {
  it('defaults to off', () => {
    expect(setup().pixelPreview()).toBe(false);
  });

  it('setPixelPreview flips the signal', () => {
    const ws = setup();
    ws.setPixelPreview(true);
    expect(ws.pixelPreview()).toBe(true);
    ws.setPixelPreview(false);
    expect(ws.pixelPreview()).toBe(false);
  });

  it('togglePixelPreview flips back and forth', () => {
    const ws = setup();
    ws.togglePixelPreview();
    expect(ws.pixelPreview()).toBe(true);
    ws.togglePixelPreview();
    expect(ws.pixelPreview()).toBe(false);
  });

  it('is independent of outlineMode and presentationMode (orthogonal display states)', () => {
    const ws = setup();
    ws.setOutlineMode(true);
    ws.setPresentationMode(true);
    ws.setPixelPreview(true);
    expect(ws.pixelPreview()).toBe(true);
    ws.setPixelPreview(false);
    // Leaving pixel preview must not touch the other two.
    expect(ws.outlineMode()).toBe(true);
    expect(ws.presentationMode()).toBe(true);
  });
});

describe('WorkspaceService — pixel preview raster (D-131)', () => {
  it('toggle + ready default off and flip independently', () => {
    const ws = setup();
    expect(ws.pixelPreviewRaster()).toBe(false);
    expect(ws.pixelPreviewRasterReady()).toBe(false);

    ws.togglePixelPreviewRaster();
    expect(ws.pixelPreviewRaster()).toBe(true);
    // Toggling the user intent does NOT imply a bitmap is painted yet.
    expect(ws.pixelPreviewRasterReady()).toBe(false);

    ws.setPixelPreviewRasterReady(true);
    expect(ws.pixelPreviewRasterReady()).toBe(true);

    ws.setPixelPreviewRaster(false);
    expect(ws.pixelPreviewRaster()).toBe(false);
    // Ready is render-coordination state owned by the overlay — it persists
    // until explicitly cleared (the overlay clears it on off/destroy).
    expect(ws.pixelPreviewRasterReady()).toBe(true);
  });

  it('is independent of the CSS pixelPreview (D-130) and other display modes', () => {
    const ws = setup();
    ws.setPixelPreview(true); // D-130 fast mode
    ws.setPixelPreviewRaster(true); // D-131 raster mode
    expect(ws.pixelPreview()).toBe(true);
    expect(ws.pixelPreviewRaster()).toBe(true);
    ws.setPixelPreviewRaster(false);
    expect(ws.pixelPreview()).toBe(true); // untouched
  });
});
