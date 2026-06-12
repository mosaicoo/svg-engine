import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { generateNodeId } from 'svg-engine/core';
import { MarqueeService } from '../marquee/marquee.service';
import { provideSvgEngineEditorScope } from '../scope/editor-scope.providers';
import { SelectionService } from '../selection/selection.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { SvgeShellInteractions } from './shell-interactions.directive';

/**
 * Guide-deselection parity (D-039 follow-up). The custom-editor playground's
 * bespoke `onCanvasPointerDown` clears the active guide selection on every
 * canvas/shape click; that call was NOT ported when the interaction logic was
 * extracted into this shared directive, so the professional shell
 * (`svge-shell-pro`) and `svge-editor` kept the guide highlighted (orange)
 * after selecting another object. This guards the ported behaviour.
 *
 * A non-guide pointerdown reaches the directive at all (guides `stopPropagation`
 * in `GuidesOverlay`), so clearing the guide here is always correct. The host is
 * a bare `<div>` (no SVG inside): the hit-test resolves to "empty canvas", and
 * the handler runs end to end without throwing (`screenToDoc` returns null when
 * there's no SVG, and `capturePointer` is defensive about the target).
 */
@Component({
  standalone: true,
  imports: [SvgeShellInteractions],
  template: `<div svgeShellInteractions></div>`,
})
class Host {}

function mount() {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideSvgEngineEditorScope()],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const ws = TestBed.inject(WorkspaceService);
  const selection = TestBed.inject(SelectionService);
  const marquee = TestBed.inject(MarqueeService);
  const hostEl = fixture.nativeElement.firstElementChild as HTMLElement;
  return { ws, selection, marquee, hostEl };
}

/** Dispatch a real `pointerdown` on the directive host (fires the host binding). */
function firePointerDown(el: HTMLElement, button = 0): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { button, bubbles: true }));
}

/** Dispatch a real `pointermove` on the directive host (fires the host binding). */
function firePointerMove(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
}

describe('SvgeShellInteractions — guide deselection on canvas/shape click', () => {
  it('clears the selected guide on a left-button pointerdown', () => {
    const { ws, hostEl } = mount();
    const id = ws.addGuide('h', 100);
    expect(id).not.toBeNull();
    ws.selectGuide(id);
    expect(ws.selectedGuideId()).toBe(id);

    firePointerDown(hostEl, 0);

    expect(ws.selectedGuideId()).toBeNull();
  });

  it('does NOT touch the guide on a non-left button (reserved for pan/context)', () => {
    const { ws, hostEl } = mount();
    const id = ws.addGuide('v', 50);
    ws.selectGuide(id);

    firePointerDown(hostEl, 1); // middle button → early return before the clear

    expect(ws.selectedGuideId()).toBe(id); // unchanged
  });
});

/**
 * Hover-outline wiring parity. The dashed `.hover-outline` drawn by
 * `<svge-selection-overlay>` is driven by `SelectionService.hoverId`. That
 * signal was only ever fed by the custom-editor playground's inline
 * `onCanvasPointerMove`/`Leave`; the shared directive (used by svg-studio,
 * `<svge-editor>`, `<svge-shell-pro>`) never set it, so those canvases had no
 * hover feedback. These guard the ported wiring.
 *
 * The host is a bare `<div>` (no SVG): `resolveSelectableNodeId` resolves to
 * "nothing under the cursor" (null), so the *positive* "outline the hovered
 * node" path needs a rendered SVG and is covered by browser/E2E. Here we lock
 * down the deterministic parts: clear-on-leave and suppress-during-gesture.
 */
describe('SvgeShellInteractions — hover outline wiring', () => {
  it('clears the hover outline when the pointer leaves the canvas', () => {
    const { selection, hostEl } = mount();
    const id = generateNodeId();
    selection.setHover(id);
    expect(selection.hoverId()).toBe(id);

    hostEl.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));

    expect(selection.hoverId()).toBeNull();
  });

  it('suppresses hover while a marquee gesture is in progress', () => {
    const { selection, marquee, hostEl } = mount();
    const id = generateNodeId();
    selection.setHover(id);
    // Start a marquee → updateHover must clear the stale outline on the next move.
    marquee.start({ x: 0, y: 0 }, 'replace', new Set());
    expect(marquee.isActive()).toBe(true);

    firePointerMove(hostEl);

    expect(selection.hoverId()).toBeNull();
  });

  it('runs the idle hover path without throwing on empty canvas (no SVG)', () => {
    const { selection, hostEl } = mount();
    expect(() => firePointerMove(hostEl)).not.toThrow();
    // No node under the cursor (no SVG) → hover stays cleared.
    expect(selection.hoverId()).toBeNull();
  });
});
