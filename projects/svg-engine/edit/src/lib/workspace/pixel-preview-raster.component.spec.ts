import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type SvgNode } from 'svg-engine/core';
import { SvgePixelPreviewRaster } from './pixel-preview-raster.component';
import { WorkspaceService } from './workspace.service';

// Minimal group node — enough to satisfy the required [tree] input. In jsdom
// the raster bails at the missing 2D context before the tree is serialized,
// so its contents never matter here.
const MINIMAL_GROUP = { type: 'group', id: 'root', children: [] } as unknown as SvgNode;

@Component({
  standalone: true,
  imports: [SvgePixelPreviewRaster],
  template: `<svg>
    <svg:g svgePixelPreviewRaster [tree]="tree()" [viewBox]="vb"></svg:g>
  </svg>`,
})
class HostComponent {
  readonly tree = signal<SvgNode>(MINIMAL_GROUP);
  readonly vb = { x: 0, y: 0, width: 100, height: 100 };
}

function setup(): {
  fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  host: HostComponent;
  ws: WorkspaceService;
} {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  const ws = TestBed.inject(WorkspaceService);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, ws };
}

describe('SvgePixelPreviewRaster (D-131)', () => {
  it('renders no <image> while the raster toggle is off (self-gated)', () => {
    const { fixture } = setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('image')).toBeNull();
  });

  it('degrades gracefully when enabled without a 2D canvas (jsdom)', () => {
    const { fixture, ws } = setup();
    expect(() => {
      ws.setPixelPreviewRaster(true);
      fixture.detectChanges();
    }).not.toThrow();
    // No Canvas 2D context in jsdom → no bitmap painted, readiness stays false,
    // so the shell would keep the live art visible (never a blank canvas).
    expect((fixture.nativeElement as HTMLElement).querySelector('image')).toBeNull();
    expect(ws.pixelPreviewRasterReady()).toBe(false);
  });

  it('reveals the live art (clears ready) on any source change while on — undo/redo safety', () => {
    const { fixture, host, ws } = setup();
    ws.setPixelPreviewRaster(true);
    fixture.detectChanges();
    // Simulate a previously-painted bitmap state (a real browser would have set
    // this true after a raster completed).
    ws.setPixelPreviewRasterReady(true);
    // A document change (edit / undo / redo) flips the [tree] input...
    host.tree.set({ type: 'group', id: 'root2', children: [] } as unknown as SvgNode);
    fixture.detectChanges();
    // ...which must reveal the live art again (ready=false) until a fresh bitmap
    // paints — guaranteeing we never get stuck showing a stale raster over
    // hidden art (the undo/redo failure this fix addresses).
    expect(ws.pixelPreviewRasterReady()).toBe(false);
  });
});
