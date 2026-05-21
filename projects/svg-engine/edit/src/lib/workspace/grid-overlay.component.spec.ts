import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createEmptyDocument, type SvgDocument } from 'svg-engine/core';
import { SvgeRenderer } from 'svg-engine/render';
import { describe, expect, it } from 'vitest';
import { GridOverlay } from './grid-overlay.component';

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
