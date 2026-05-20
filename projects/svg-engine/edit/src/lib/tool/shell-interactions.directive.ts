import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, inject, type OnDestroy } from '@angular/core';
import { CommandBus, EditorStateService, RemoveNodeCommand } from 'svg-engine/core';
import { screenToDoc } from 'svg-engine/render';
import { resolveSelectableNodeId } from '../hit-testing/hit-testing';
import { isEditableTarget } from '../pointer/is-editable-target';
import { capturePointer, releasePointer } from '../pointer/capture';
import { SelectionService } from '../selection/selection.service';
import { DIRECT_SELECT_TOOL_ID, SELECT_TOOL_ID } from './builtin-tools';
import { ToolHostService } from './tool-host.service';
import type { ToolPointerEvent } from './tool';

/**
 * **`[svgeShellInteractions]`** — D-038 fix (post-Phase 4).
 *
 * Wires the **minimum interactions** that turn a shell from "decorative
 * frame" into a "usable editor". Attach to the host element that contains
 * the inner `<svge-renderer>` and the directive will:
 *
 * 1. **Route pointer events to the active tool** via `ToolHostService.
 *    routePointer*`. Tools with `onPointerDown/Move/Up` handlers
 *    (Stamp, Shape, Pen, Pencil, Text, custom) start working as expected.
 *    Select / Direct-Select tools are deliberately **bypassed** —
 *    selection is handled in (2) instead.
 *
 * 2. **Click-to-select**: when the active tool is Select (or no tool),
 *    hits on `data-node-id` elements call `SelectionService.select(id)`.
 *    Click on canvas background clears the selection.
 *
 * 3. **Keyboard Delete / Backspace**: dispatches `RemoveNodeCommand`
 *    per selected id. Skipped when an editable target has focus.
 *
 * **What's NOT included (deliberate scope)**:
 * - Marquee drag-to-select (consumer composes `<svge-marquee>` + own logic)
 * - Move-by-drag of selected shapes (requires `TransformService` gestures)
 * - Multi-select with Shift/Ctrl (kept simple — single-click replace)
 *
 * Those concerns are larger and will come in a separate D-039 sprint
 * ("shell interactions full kit"). This directive solves the **immediate**
 * Mosaicoo complaint: "shell-pro tools palette doesn't actually let me
 * draw or select anything".
 *
 * **Why a directive (not baked into `<svge-editor>`)**: keeps the wireup
 * opt-in for consumers who want a custom interaction scheme (e.g., a
 * read-only viewer that should NOT respond to clicks). `<svge-editor>`
 * and `<svge-shell-pro>` apply it by default; headless puro consumers
 * either apply it explicitly or roll their own (as `playground-home` does).
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/edit` —
 * Material-free. Just touches `/core` and `/render` utilities.
 */
@Directive({
  selector: '[svgeShellInteractions]',
  standalone: true,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerCancel($event)',
  },
})
export class SvgeShellInteractions implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly toolHost = inject(ToolHostService);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  constructor() {
    // Document-level keydown so Delete/Backspace work regardless of
    // which canvas element has focus.
    this.document.addEventListener('keydown', this.onKeyDown);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.onKeyDown);
  }

  // ── Pointer flow ────────────────────────────────────────────────

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return; // ignore middle/right — handled elsewhere
    const activeId = this.toolHost.activeId();

    // Tool routing first — drawing tools (Stamp / Shape / Pen / Text)
    // consume the event and we skip selection.
    if (activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) {
        capturePointer(event);
        this.toolHost.routePointerDown(toolEvent);
        return;
      }
    }

    // Selection mode (default tool, or no tool active).
    const root = this.state.document().root;
    const id = resolveSelectableNodeId(event, { rootId: root.id, mode: 'group' });
    if (id === null) {
      // Clicked background → clear selection.
      this.selection.clear();
      return;
    }
    // Single-click replace (Shift-add / Ctrl-toggle deferred to D-039).
    this.selection.select(id);
  }

  protected onPointerMove(event: PointerEvent): void {
    const activeId = this.toolHost.activeId();
    if (activeId === null || activeId === SELECT_TOOL_ID || activeId === DIRECT_SELECT_TOOL_ID) {
      return;
    }
    const toolEvent = this.buildToolEvent(event);
    if (toolEvent !== null) this.toolHost.routePointerMove(toolEvent);
  }

  protected onPointerUp(event: PointerEvent): void {
    const activeId = this.toolHost.activeId();
    if (activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) this.toolHost.routePointerUp(toolEvent);
    }
    releasePointer(event);
  }

  protected onPointerCancel(event: PointerEvent): void {
    const activeId = this.toolHost.activeId();
    if (activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) this.toolHost.routePointerCancel(toolEvent);
    }
    releasePointer(event);
  }

  // ── Key flow ────────────────────────────────────────────────────

  /**
   * Document-level keydown. Suppresses when focus is on a text-editing
   * element (input/textarea/contenteditable) so typing doesn't delete
   * shapes inadvertently.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = Array.from(this.selection.selectedIds());
      if (ids.length === 0) return;
      event.preventDefault();
      for (const id of ids) this.bus.dispatch(new RemoveNodeCommand(id));
      this.selection.clear();
      return;
    }
    // Forward other keys to the active tool (e.g., Esc to cancel a draft).
    this.toolHost.routeKeyDown(event);
  };

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Build the `ToolPointerEvent` envelope. Returns null when the SVG
   * isn't reachable (jsdom, SSR, mount race) — the caller no-ops.
   */
  private buildToolEvent(event: PointerEvent): ToolPointerEvent | null {
    const svg = this.host.nativeElement.querySelector<SVGSVGElement>('svg');
    const docPoint = screenToDoc(svg, event.clientX, event.clientY);
    if (docPoint === null) return null;
    return {
      raw: event,
      docPoint,
      screenX: event.clientX,
      screenY: event.clientY,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
  }
}
