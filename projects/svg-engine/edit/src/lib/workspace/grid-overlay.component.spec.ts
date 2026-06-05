import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createEmptyDocument, type SvgDocument } from 'svg-engine/core';
import { SvgeRenderer } from 'svg-engine/render';
import { describe, expect, it } from 'vitest';
import { buildGridLines, GridOverlay } from './grid-overlay.component';

/**
 * Regression guards for commit a20635b (z-order). Grid is a reference
 * overlay — putting it in front would obscure shapes. The fix relies
 * on the consumer writing `<svg:g svgeGridOverlay svgeBehind>`
 * literally — Angular content projection is compile-time, so the
 * `svgeBehind` attribute MUST be in the template (host bindings on
 * GridOverlay don't affect SvgeRenderer's `<ng-content select="...">`
 * slot resolution).
 *
 * These specs verify actual DOM ordering by mounting a real
 * SvgeRenderer with content projection — the previous version of
 * these tests only checked attribute presence and missed the bug
 * where svge-editor + svge-shell-pro projected the page overlay
 * into the front slot.
 */

@Component({
  standalone: true,
  imports: [SvgeRenderer, GridOverlay],
  template: `<svge-renderer [tree]="doc.root" [viewBox]="doc.viewBox">
    <svg:g svgeGridOverlay svgeBehind></svg:g>
  </svge-renderer>`,
})
class WithBehindHost {
  readonly doc: SvgDocument = createEmptyDocument();
}

@Component({
  standalone: true,
  imports: [SvgeRenderer, GridOverlay],
  template: `<svge-renderer [tree]="doc.root" [viewBox]="doc.viewBox">
    <svg:g svgeGridOverlay></svg:g>
  </svge-renderer>`,
})
class WithoutBehindHost {
  readonly doc: SvgDocument = createEmptyDocument();
}

describe('GridOverlay × SvgeRenderer — actual DOM projection slot (regression guard a20635b)', () => {
  it('WITH svgeBehind: grid-overlay <g> renders BEFORE the content <g svgeNode>', () => {
    TestBed.configureTestingModule({ imports: [WithBehindHost] });
    const fixture = TestBed.createComponent(WithBehindHost);
    fixture.detectChanges();
    const svgEl: SVGSVGElement | null = fixture.nativeElement.querySelector('svg');
    expect(svgEl).not.toBeNull();
    const gridG = svgEl!.querySelector('g[svgegridoverlay]');
    const contentG = svgEl!.querySelector('g[svgenode]');
    expect(gridG).not.toBeNull();
    expect(contentG).not.toBeNull();
    const pos = gridG!.compareDocumentPosition(contentG!);
    expect((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('WITHOUT svgeBehind (control case — the bug condition): grid-overlay <g> renders AFTER content', () => {
    TestBed.configureTestingModule({ imports: [WithoutBehindHost] });
    const fixture = TestBed.createComponent(WithoutBehindHost);
    fixture.detectChanges();
    const svgEl: SVGSVGElement | null = fixture.nativeElement.querySelector('svg');
    const gridG = svgEl!.querySelector('g[svgegridoverlay]');
    const contentG = svgEl!.querySelector('g[svgenode]');
    expect(gridG).not.toBeNull();
    expect(contentG).not.toBeNull();
    const pos = gridG!.compareDocumentPosition(contentG!);
    expect((pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0).toBe(true);
  });
});

describe('buildGridLines (pure) — full-page coverage independent of viewport', () => {
  const page = { x: 0, y: 0, width: 400, height: 200 };

  it('covers the ENTIRE page: (cols+1) verticals + (rows+1) horizontals', () => {
    const lines = buildGridLines(page, 50, 5);
    // 400/50 = 8 cols → 9 vertical lines; 200/50 = 4 rows → 5 horizontal lines.
    const verticals = lines.filter((l) => l.key.startsWith('v'));
    const horizontals = lines.filter((l) => l.key.startsWith('h'));
    expect(verticals).toHaveLength(9);
    expect(horizontals).toHaveLength(5);
  });

  it('each line spans the page edge-to-edge (no viewport windowing)', () => {
    const lines = buildGridLines(page, 50, 5);
    const v = lines.find((l) => l.key === 'v3')!; // x = 150
    expect(v).toMatchObject({ x1: 150, y1: 0, x2: 150, y2: 200 }); // full height
    const h = lines.find((l) => l.key === 'h2')!; // y = 100
    expect(h).toMatchObject({ x1: 0, y1: 100, x2: 400, y2: 100 }); // full width
  });

  it('anchors at the page origin (non-zero x/y page)', () => {
    const moved = buildGridLines({ x: 120, y: 60, width: 100, height: 100 }, 50, 4);
    const v0 = moved.find((l) => l.key === 'v0')!;
    expect(v0).toMatchObject({ x1: 120, y1: 60, x2: 120, y2: 160 });
  });

  it('flags every majorEvery-th line as major', () => {
    const lines = buildGridLines(page, 50, 4);
    expect(lines.find((l) => l.key === 'v0')!.major).toBe(true);
    expect(lines.find((l) => l.key === 'v4')!.major).toBe(true);
    expect(lines.find((l) => l.key === 'v3')!.major).toBe(false);
  });

  it('returns [] for non-positive spacing / page and for a pathological count', () => {
    expect(buildGridLines(page, 0, 5)).toEqual([]);
    expect(buildGridLines({ x: 0, y: 0, width: 0, height: 200 }, 50, 5)).toEqual([]);
    // spacing 1 on a 10000×10000 page → ~20000 lines → guard kicks in.
    expect(buildGridLines({ x: 0, y: 0, width: 10000, height: 10000 }, 1, 10)).toEqual([]);
  });
});
