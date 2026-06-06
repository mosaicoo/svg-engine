import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { provideSvgEngineEditorScope } from '../scope/editor-scope.providers';
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
  const hostEl = fixture.nativeElement.firstElementChild as HTMLElement;
  return { ws, hostEl };
}

/** Dispatch a real `pointerdown` on the directive host (fires the host binding). */
function firePointerDown(el: HTMLElement, button = 0): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { button, bubbles: true }));
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
