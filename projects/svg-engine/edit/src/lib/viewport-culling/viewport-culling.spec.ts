import { TestBed } from '@angular/core/testing';
import {
  bbox,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  type SvgDocument,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { ViewportCullingService } from './viewport-culling.service';

function setupWithDoc(doc: SvgDocument): {
  state: EditorStateService;
  viewport: ViewportService;
  culling: ViewportCullingService;
} {
  const state = TestBed.inject(EditorStateService);
  const viewport = TestBed.inject(ViewportService);
  state.resetDocument(doc);
  viewport.setContentBox(doc.viewBox);
  viewport.setZoom(1);
  viewport.setPan(0, 0);
  // Service has to be instantiated AFTER content box so the initial
  // computed read sees the seeded viewport.
  const culling = TestBed.inject(ViewportCullingService);
  return { state, viewport, culling };
}

describe('ViewportCullingService — basic culling', () => {
  it('empty document → no ids culled', () => {
    const { culling } = setupWithDoc(createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }));
    expect(culling.culledIds().size).toBe(0);
  });

  it('all top-level children inside viewport → none culled', () => {
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    const b = createRect({ x: 50, y: 50, width: 10, height: 10 });
    const doc: SvgDocument = {
      ...createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }),
      root: createGroup([a, b]),
    };
    const { culling } = setupWithDoc(doc);
    expect(culling.culledIds().size).toBe(0);
  });

  it('child entirely outside viewport → culled', () => {
    const visible = createRect({ x: 10, y: 10, width: 20, height: 20 });
    const offscreen = createRect({ x: 500, y: 500, width: 10, height: 10 });
    const doc: SvgDocument = {
      ...createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }),
      root: createGroup([visible, offscreen]),
    };
    const { culling } = setupWithDoc(doc);
    const culled = culling.culledIds();
    expect(culled.has(offscreen.id)).toBe(true);
    expect(culled.has(visible.id)).toBe(false);
  });

  it('child partially overlapping viewport → NOT culled (edge intersection counts)', () => {
    const overlapping = createRect({ x: 90, y: 10, width: 20, height: 20 });
    const doc: SvgDocument = {
      ...createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }),
      root: createGroup([overlapping]),
    };
    const { culling } = setupWithDoc(doc);
    expect(culling.culledIds().has(overlapping.id)).toBe(false);
  });
});

describe('ViewportCullingService — viewport reactivity', () => {
  it('zooming/panning the viewport re-runs culling', () => {
    const a = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const b = createRect({ x: 80, y: 80, width: 20, height: 20 });
    const doc: SvgDocument = {
      ...createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }),
      root: createGroup([a, b]),
    };
    const { viewport, culling } = setupWithDoc(doc);
    // Initial: both visible
    expect(culling.culledIds().size).toBe(0);
    // Zoom in 5× — visible viewBox shrinks; pan stays centered → only
    // the central area is visible. With default centered zoom, both
    // corner rects fall outside.
    viewport.setZoom(5);
    const culled = culling.culledIds();
    expect(culled.has(a.id)).toBe(true);
    expect(culled.has(b.id)).toBe(true);
  });
});

describe('ViewportCullingService — caching', () => {
  it('reusing the same node ref keeps a stable cache entry', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const doc: SvgDocument = {
      ...createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }),
      root: createGroup([a]),
    };
    const { viewport, culling } = setupWithDoc(doc);
    // Trigger multiple viewport changes — bbox should be cached after first run.
    culling.culledIds();
    viewport.setPan(5, 0);
    culling.culledIds();
    viewport.setPan(0, 5);
    culling.culledIds();
    // No direct way to inspect WeakMap, but if the cache were broken
    // we'd at least observe culling decisions remain correct — `a` at
    // (0,0,10,10) stays visible in a 100×100 viewBox under small pans.
    expect(culling.culledIds().has(a.id)).toBe(false);
  });
});

describe('ViewportCullingService — stylesheet injection', () => {
  it('injects the global culled-attr rule exactly once', () => {
    // First instantiation does the work; second call (in a fresh
    // injector) must not duplicate the <style> tag.
    setupWithDoc(createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }));
    const tagsAfterFirst = document.querySelectorAll('#svge-viewport-culling-style').length;
    // Force a second injector — a new TestBed configuration.
    TestBed.resetTestingModule();
    setupWithDoc(createEmptyDocument({ viewBox: bbox(0, 0, 100, 100) }));
    const tagsAfterSecond = document.querySelectorAll('#svge-viewport-culling-style').length;
    expect(tagsAfterFirst).toBe(1);
    expect(tagsAfterSecond).toBe(1);
  });
});
