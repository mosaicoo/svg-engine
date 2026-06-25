import { Component, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  bbox,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  IDENTITY_TRANSFORM,
} from '@mosaicoo/svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { TransformService } from '../transform/transform.service';
import { RotationPivot } from './rotation-pivot.component';

/**
 * Host harness — mounts `<svg>` with `<g svgeRotationPivot>` inside,
 * exactly like the playground's renderer does. We attach `<svg>` to
 * `document.body` so window-level capture-phase listeners actually
 * see events bubbling/capturing through the DOM.
 */
@Component({
  standalone: true,
  imports: [RotationPivot],
  template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <svg:g svgeRotationPivot></svg:g>
  </svg>`,
})
class TestHost {
  @ViewChild(RotationPivot, { static: true }) readonly pivot!: RotationPivot;
}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  // Attach to body so DOM events propagate to window listeners.
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();

  const state = TestBed.inject(EditorStateService);
  const selection = TestBed.inject(SelectionService);
  const transform = TestBed.inject(TransformService);

  state.resetDocument(createEmptyDocument());
  transform.clearAllPivots();
  selection.clear();

  return { fixture, state, selection, transform };
}

function findHostG(fixture: { nativeElement: HTMLElement }): SVGGElement {
  const g = fixture.nativeElement.querySelector('g[svgeRotationPivot]');
  if (g === null) throw new Error('Test host did not render <g svgeRotationPivot>');
  return g as unknown as SVGGElement;
}

/**
 * Inject a popover-dot directly into the host `<g>`. We bypass the
 * directive's own template (which is gated on `pivotPos()`/`popoverOpen()`
 * and does not render reliably under jsdom + `afterEveryRender`). The
 * point of these tests is the **window capture listener behavior**:
 * given a real DOM element with the right class + data-attribute, the
 * listener must intercept its pointerdown and route the pivot pick.
 */
function injectPopoverDot(
  host: SVGGElement,
  anchor: string,
  cx: number,
  cy: number,
): SVGCircleElement {
  const ns = 'http://www.w3.org/2000/svg';
  const wrapper = document.createElementNS(ns, 'g');
  wrapper.setAttribute('class', 'popover');
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('class', 'popover-dot');
  circle.setAttribute('data-svge-anchor', anchor);
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', '5');
  wrapper.appendChild(circle);
  host.appendChild(wrapper);
  return circle;
}

function dispatchPointerDown(target: Element): PointerEvent {
  const ev = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
  });
  target.dispatchEvent(ev);
  return ev;
}

/**
 * Force the directive's private oriented-box signal (`_obb`) so the
 * single-selection `frame()` computed resolves non-null without a real
 * `getRenderedNodeOBB` measurement (jsdom has no SVG layout). The tests
 * here exercise the **window capture listener**, not OBB computation, so
 * we inject an identity-matrix box matching the focused node's geometry.
 * (D-142: single selection drives the chrome off `_obb`, not `_bbox`.)
 */
function forceBBox(
  pivot: RotationPivot,
  box: { x: number; y: number; width: number; height: number },
): void {
  // Access private via cast — test-only escape hatch.
  const setter = (pivot as unknown as { _obb: { set(v: unknown): void } })._obb;
  setter.set({ localBBox: box, matrix: IDENTITY_TRANSFORM });
}

describe('RotationPivot — popover-dot click delegation (D-022)', () => {
  it('attaches a window-level capture pointerdown listener on construction', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    const { fixture } = setup();
    const calls = spy.mock.calls.filter(([type, , opts]) => {
      return type === 'pointerdown' && opts === true;
    });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    spy.mockRestore();
    fixture.destroy();
  });

  it('removes the window listener on destroy', () => {
    const { fixture } = setup();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    fixture.destroy();
    const calls = removeSpy.mock.calls.filter(([type, , opts]) => {
      return type === 'pointerdown' && opts === true;
    });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    removeSpy.mockRestore();
  });

  it("a pointerdown on a popover-dot updates the focused node's custom pivot", () => {
    const { fixture, selection, transform } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const state = TestBed.inject(EditorStateService);
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    selection.select(rect.id);

    const host = findHostG(fixture);
    forceBBox(fixture.componentInstance.pivot, bbox(0, 0, 100, 100));

    const dot = injectPopoverDot(host, 'br', 100, 100);
    dispatchPointerDown(dot);

    // Pivot should be stored in node-local coords for 'br' = (1, 1)
    const stored = transform.customPivots().get(rect.id);
    expect(stored).toEqual({ x: 1, y: 1 });
  });

  it('stops propagation so a canvas pointerdown listener never sees the event', () => {
    const { fixture, selection } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const state = TestBed.inject(EditorStateService);
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    selection.select(rect.id);

    const host = findHostG(fixture);
    forceBBox(fixture.componentInstance.pivot, bbox(0, 0, 100, 100));

    // Canvas-style listener at body level (analog to playground's
    // <section class="canvas"> pointerdown).
    const canvasSpy = vi.fn();
    document.body.addEventListener('pointerdown', canvasSpy);

    const dot = injectPopoverDot(host, 'tl', 0, 0);
    dispatchPointerDown(dot);

    expect(canvasSpy).not.toHaveBeenCalled();
    document.body.removeEventListener('pointerdown', canvasSpy);
  });

  it("ignores pointerdowns on elements outside this directive's host", () => {
    const { fixture, selection, transform } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const state = TestBed.inject(EditorStateService);
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    selection.select(rect.id);
    forceBBox(fixture.componentInstance.pivot, bbox(0, 0, 100, 100));

    // A "popover-dot" lookalike OUTSIDE the host — must not affect the pivot.
    const stray = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    stray.setAttribute('class', 'popover-dot');
    stray.setAttribute('data-svge-anchor', 'tl');
    document.body.appendChild(stray);

    dispatchPointerDown(stray);

    expect(transform.customPivots().has(rect.id)).toBe(false);
    document.body.removeChild(stray);
  });

  it('still suppresses propagation for popover-dots inside our host even when no node is focused', () => {
    const { fixture, selection } = setup();
    selection.clear();
    forceBBox(fixture.componentInstance.pivot, bbox(0, 0, 100, 100));

    const host = findHostG(fixture);
    const canvasSpy = vi.fn();
    document.body.addEventListener('pointerdown', canvasSpy);

    const dot = injectPopoverDot(host, 'mc', 50, 50);
    dispatchPointerDown(dot);

    // No focus → no pivot write, but propagation must still be stopped
    // (otherwise the canvas would clear selection and unmount everything).
    expect(canvasSpy).not.toHaveBeenCalled();
    document.body.removeEventListener('pointerdown', canvasSpy);
  });
});
