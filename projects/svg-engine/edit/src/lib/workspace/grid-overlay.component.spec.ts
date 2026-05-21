import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GridOverlay } from './grid-overlay.component';

/**
 * Minimal SVG harness — the GridOverlay component's selector is
 * `g[svgeGridOverlay]` so we mount it inside an `<svg:g>` inside `<svg>`.
 */
@Component({
  standalone: true,
  imports: [GridOverlay],
  template: `<svg xmlns="http://www.w3.org/2000/svg">
    <svg:g svgeGridOverlay></svg:g>
  </svg>`,
})
class TestHost {}

describe('GridOverlay — regression guard for commit a20635b (z-order)', () => {
  it('host element carries the svgeBehind attribute so the renderer projects it under content', () => {
    // Grid is a reference overlay — putting it in front would obscure
    // shapes. Auto-tagging via host attr means consumers can drop
    // <svg:g svgeGridOverlay></svg:g> anywhere and get correct z-order
    // without needing to remember the svgeBehind attribute (the bug
    // that surfaced in svge-editor + svge-shell-pro after their
    // creation in D-034 and D-038 Phase 4 respectively).
    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const gEl = fixture.nativeElement.querySelector('g[svgegridoverlay]');
    expect(gEl).not.toBeNull();
    expect(gEl?.hasAttribute('svgeBehind')).toBe(true);
  });
});
