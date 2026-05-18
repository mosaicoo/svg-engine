import { TestBed } from '@angular/core/testing';
import { bbox } from 'svg-engine/core';
import { ViewportService } from './viewport.service';

describe('ViewportService', () => {
  let viewport: ViewportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    viewport = TestBed.inject(ViewportService);
    viewport.setContentBox(bbox(0, 0, 800, 600));
    viewport.reset();
  });

  it('starts with sensible defaults', () => {
    expect(viewport.zoom()).toBe(1);
    expect(viewport.panX()).toBe(0);
    expect(viewport.panY()).toBe(0);
    expect(viewport.viewBox()).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  describe('zoom', () => {
    it('zoom > 1 shrinks the visible window proportionally', () => {
      viewport.setZoom(2);
      const v = viewport.viewBox();
      expect(v.width).toBe(400);
      expect(v.height).toBe(300);
    });

    it('keeps the visible window centered when no pan is applied', () => {
      viewport.setZoom(2);
      const v = viewport.viewBox();
      expect(v.x).toBe(200);
      expect(v.y).toBe(150);
    });

    it('multiplyZoom composes', () => {
      viewport.setZoom(2);
      viewport.multiplyZoom(2);
      expect(viewport.zoom()).toBe(4);
    });

    it('zoomIn / zoomOut use the default step factor', () => {
      viewport.zoomIn();
      expect(viewport.zoom()).toBeCloseTo(1.2);
      viewport.zoomOut();
      expect(viewport.zoom()).toBeCloseTo(1);
    });

    it('clamps zoom to [minZoom, maxZoom]', () => {
      viewport.setZoom(1000);
      expect(viewport.zoom()).toBe(viewport.maxZoom());
      viewport.setZoom(0.0001);
      expect(viewport.zoom()).toBe(viewport.minZoom());
    });

    it('non-finite zoom resets to 1', () => {
      viewport.setZoom(Number.NaN);
      expect(viewport.zoom()).toBe(1);
    });
  });

  describe('pan', () => {
    it('setPan moves the visible window in content units', () => {
      viewport.setPan(100, 50);
      const v = viewport.viewBox();
      expect(v.x).toBe(100);
      expect(v.y).toBe(50);
    });

    it('pan accumulates translation', () => {
      viewport.pan(10, 20);
      viewport.pan(30, 40);
      expect(viewport.panX()).toBe(40);
      expect(viewport.panY()).toBe(60);
    });
  });

  describe('reset / fit', () => {
    it('reset returns to identity viewport', () => {
      viewport.setZoom(3);
      viewport.setPan(50, 50);
      viewport.reset();
      expect(viewport.zoom()).toBe(1);
      expect(viewport.panX()).toBe(0);
      expect(viewport.panY()).toBe(0);
    });

    it('fit is currently equivalent to reset', () => {
      viewport.setZoom(3);
      viewport.fit();
      expect(viewport.zoom()).toBe(1);
    });
  });

  describe('setZoomLimits', () => {
    it('rejects invalid bounds', () => {
      expect(() => viewport.setZoomLimits(-1, 5)).toThrow();
      expect(() => viewport.setZoomLimits(5, 5)).toThrow();
      expect(() => viewport.setZoomLimits(10, 5)).toThrow();
    });

    it('reclamps current zoom to the new bounds', () => {
      viewport.setZoom(10);
      viewport.setZoomLimits(0.5, 4);
      expect(viewport.zoom()).toBe(4);
    });
  });

  describe('contentBox', () => {
    it('changing contentBox updates viewBox at zoom 1', () => {
      viewport.setContentBox(bbox(10, 20, 200, 100));
      const v = viewport.viewBox();
      expect(v).toEqual({ x: 10, y: 20, width: 200, height: 100 });
    });
  });

  describe('zoomAt', () => {
    it('keeps the anchor at the same relative viewBox position after zoom-in', () => {
      // contentBox is 800×600, zoom=1 → viewBox = (0,0,800,600). Anchor
      // at doc (200, 150) sits at (200/800, 150/600) = (0.25, 0.25)
      // of the viewBox. After zooming in 2×, the same anchor should
      // still be at (0.25, 0.25) of the new viewBox.
      viewport.zoomAt(2, { x: 200, y: 150 });
      const vb = viewport.viewBox();
      expect(viewport.zoom()).toBeCloseTo(2);
      const relX = (200 - vb.x) / vb.width;
      const relY = (150 - vb.y) / vb.height;
      expect(relX).toBeCloseTo(0.25);
      expect(relY).toBeCloseTo(0.25);
    });

    it('keeps anchor at same relative position after zoom-out', () => {
      // Start zoomed in then zoom out around an off-center anchor.
      viewport.setZoom(4);
      const before = viewport.viewBox();
      const anchor = { x: before.x + before.width * 0.7, y: before.y + before.height * 0.3 };
      viewport.zoomAt(0.5, anchor);
      const after = viewport.viewBox();
      const relX = (anchor.x - after.x) / after.width;
      const relY = (anchor.y - after.y) / after.height;
      expect(relX).toBeCloseTo(0.7);
      expect(relY).toBeCloseTo(0.3);
    });

    it('no-ops cleanly at zoom limits (clamped factor keeps anchor stable)', () => {
      viewport.setZoomLimits(0.5, 4);
      viewport.setZoom(4);
      const before = viewport.viewBox();
      viewport.zoomAt(10, { x: 100, y: 100 }); // would push to 40×, clamped to 4×
      const after = viewport.viewBox();
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      expect(after.width).toBeCloseTo(before.width);
    });

    it('rejects non-finite or non-positive factors', () => {
      const before = viewport.viewBox();
      viewport.zoomAt(NaN, { x: 100, y: 100 });
      viewport.zoomAt(0, { x: 100, y: 100 });
      viewport.zoomAt(-2, { x: 100, y: 100 });
      const after = viewport.viewBox();
      expect(after).toEqual(before);
    });
  });
});
