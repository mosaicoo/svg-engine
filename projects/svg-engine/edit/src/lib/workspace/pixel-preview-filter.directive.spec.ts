import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PixelPreviewFilter } from './pixel-preview-filter.directive';
import { WorkspaceService } from './workspace.service';

@Component({
  standalone: true,
  imports: [PixelPreviewFilter],
  template: `<div svgePixelPreviewFilter><svg></svg></div>`,
})
class HostComponent {}

function setup(): {
  fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  ws: WorkspaceService;
  svg: SVGSVGElement;
} {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  const ws = TestBed.inject(WorkspaceService);
  fixture.detectChanges();
  const svg = (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement;
  return { fixture, ws, svg };
}

describe('PixelPreviewFilter (D-130)', () => {
  it('leaves the svg untouched while pixel preview is off (default)', () => {
    const { svg } = setup();
    expect(svg.style.getPropertyValue('shape-rendering')).toBe('');
    expect(svg.style.getPropertyValue('image-rendering')).toBe('');
  });

  it('sets crispEdges + pixelated on the root svg when enabled', () => {
    const { fixture, ws, svg } = setup();
    ws.setPixelPreview(true);
    fixture.detectChanges();
    // jsdom lowercases the SVG keyword (`crispEdges` → `crispedges`); real
    // browsers preserve it. Compare case-insensitively — what matters is that
    // the directive set the property at all.
    expect(svg.style.getPropertyValue('shape-rendering').toLowerCase()).toBe('crispedges');
    expect(svg.style.getPropertyValue('image-rendering').toLowerCase()).toBe('pixelated');
  });

  it('restores the svg when toggled back off', () => {
    const { fixture, ws, svg } = setup();
    ws.setPixelPreview(true);
    fixture.detectChanges();
    ws.setPixelPreview(false);
    fixture.detectChanges();
    expect(svg.style.getPropertyValue('shape-rendering')).toBe('');
    expect(svg.style.getPropertyValue('image-rendering')).toBe('');
  });
});
