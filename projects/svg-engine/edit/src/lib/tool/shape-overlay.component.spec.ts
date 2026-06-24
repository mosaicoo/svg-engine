import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShapeOverlay } from './shape-overlay.component';
import { ShapeToolService } from './shape-tool.service';

/**
 * Host wrapping the attribute-selector overlay (`g[svgeShapeOverlay]`)
 * inside an `<svg>` so the SVG children render with the right
 * namespace, mirroring how the playground mounts it under
 * `<svge-renderer>`.
 */
@Component({
  standalone: true,
  imports: [ShapeOverlay],
  template: `<svg><svg:g svgeShapeOverlay></svg:g></svg>`,
})
class HostCmp {}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const shapes = TestBed.inject(ShapeToolService);
  const fixture = TestBed.createComponent(HostCmp);
  fixture.detectChanges();
  return { fixture, shapes };
}

const NOMOD = { shift: false, alt: false };

describe('ShapeOverlay — preview fidelity to Tool Options', () => {
  it('renders no shape while idle (no draft)', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.shape-draft')).toBeNull();
  });

  describe('rect corner radius', () => {
    function draftRect(
      fixture: ComponentFixture<HostCmp>,
      shapes: ShapeToolService,
    ): SVGRectElement {
      shapes.begin('rect', { x: 0, y: 0 }, NOMOD);
      shapes.update({ x: 100, y: 80 }, NOMOD);
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('rect.shape-draft');
    }

    it('omits rx/ry when cornerRadius is 0 (sharp corners, matches commit)', () => {
      const { fixture, shapes } = setup();
      const rect = draftRect(fixture, shapes);
      expect(rect).not.toBeNull();
      expect(rect.getAttribute('rx')).toBeNull();
      expect(rect.getAttribute('ry')).toBeNull();
    });

    it('reflects cornerRadius set BEFORE drawing', () => {
      const { fixture, shapes } = setup();
      shapes.setCornerRadius(12);
      const rect = draftRect(fixture, shapes);
      expect(rect.getAttribute('rx')).toBe('12');
      expect(rect.getAttribute('ry')).toBe('12');
    });

    it('updates the preview LIVE when cornerRadius changes mid-draft', () => {
      const { fixture, shapes } = setup();
      const rect = draftRect(fixture, shapes);
      expect(rect.getAttribute('rx')).toBeNull();
      shapes.setCornerRadius(20);
      fixture.detectChanges();
      expect(rect.getAttribute('rx')).toBe('20');
      expect(rect.getAttribute('ry')).toBe('20');
    });
  });

  describe('polygon sides + star mode', () => {
    function draftPolyPoints(
      fixture: ComponentFixture<HostCmp>,
      shapes: ShapeToolService,
    ): string[] {
      shapes.begin('polygon', { x: 0, y: 0 }, NOMOD);
      shapes.update({ x: 100, y: 100 }, NOMOD);
      fixture.detectChanges();
      const poly: SVGPolygonElement = fixture.nativeElement.querySelector('polygon.shape-draft');
      return (poly.getAttribute('points') ?? '').trim().split(/\s+/).filter(Boolean);
    }

    it('previews the default 6 sides', () => {
      const { fixture, shapes } = setup();
      expect(draftPolyPoints(fixture, shapes)).toHaveLength(6);
    });

    it('reflects a custom Sides value (8 → octagon preview)', () => {
      const { fixture, shapes } = setup();
      shapes.setPolygonSides(8);
      expect(draftPolyPoints(fixture, shapes)).toHaveLength(8);
    });

    it('star mode previews 2×sides vertices (outer/inner alternating)', () => {
      const { fixture, shapes } = setup();
      shapes.setPolygonSides(5);
      shapes.setStarMode(true);
      expect(draftPolyPoints(fixture, shapes)).toHaveLength(10);
    });

    it('updates the preview LIVE when Sides changes mid-draft', () => {
      const { fixture, shapes } = setup();
      shapes.begin('polygon', { x: 0, y: 0 }, NOMOD);
      shapes.update({ x: 100, y: 100 }, NOMOD);
      fixture.detectChanges();
      let poly: SVGPolygonElement = fixture.nativeElement.querySelector('polygon.shape-draft');
      expect((poly.getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(6);
      shapes.setPolygonSides(3);
      fixture.detectChanges();
      poly = fixture.nativeElement.querySelector('polygon.shape-draft');
      expect((poly.getAttribute('points') ?? '').trim().split(/\s+/)).toHaveLength(3);
    });
  });
});
