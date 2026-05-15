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
});
