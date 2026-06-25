import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import {
  type BoundingBox,
  CommandBus,
  EditorStateService,
  findNodeById,
} from '@mosaicoo/svg-engine/core';
import { screenToDoc, ViewportService } from '@mosaicoo/svg-engine/render';

import { getRenderedNodeBBox } from '../../geometry/node-bbox';
import { LayersService } from '../../layers/layers.service';
import { capturePointer, releasePointer } from '../../pointer';
import {
  type GradientLibraryItem,
  type GradientStop,
  GradientLibraryService,
} from './gradient-library.service';
import { GradientEditingService } from './gradient-editing.service';
import { SetGradientCommand } from './set-gradient.command';

/** Pixel radius of each stop dot (CSS pixels, kept via 1/zoom). */
const STOP_DOT_PX = 7;
/** Click vs drag threshold in CSS px — releases under this open color picker. */
const CLICK_THRESHOLD_PX = 3;

interface DragState {
  readonly pointerId: number;
  readonly stopIndex: number;
  readonly startScreenX: number;
  readonly startScreenY: number;
  readonly stopsBefore: readonly GradientStop[];
  moved: boolean;
}

/**
 * **D-058** — inline gradient editor overlay.
 *
 * Renders direction line (linear) or circle (radial) + draggable stop
 * dots when the selected node has a gradient fill. Co-exists with
 * `SelectionOverlay` (handles + bbox) and `RotationPivot` — those
 * keep operating; the gradient overlay is purely additive.
 *
 * **Render gates** (must all be true):
 * 1. `GradientEditingService.activeGradientId() !== null` —
 *    selection has a gradient fill resolving to a known catalog item.
 * 2. The target node is visible (not hidden via Layer Panel or
 *    `metadata.visible === false`). Mirrors the visibility check in
 *    `SelectionOverlay` so overlays appear/disappear together.
 * 3. The target node has measurable bbox (rendered).
 *
 * **Interactions** (v1):
 * - **Drag stop dot** → updates that stop's `offset` reactively.
 *   Single undo entry on release via `SetGradientCommand`.
 * - **Click stop dot** (no drag) → selects the stop;
 *   `GradientEditingService.selectStop(i)`. Inspector reads this
 *   to drive its color picker.
 * - **Click on line/circle** (not on a stop) → inserts a new stop
 *   at click position with color interpolated between adjacent
 *   stops. Auto-selects the new stop.
 *
 * **Deferred for v2** (documented as future work, not stub):
 * - Endpoint handle dragging (move x1/y1/x2/y2 or cx/cy/r) — out of
 *   v1 scope to keep this overlay focused on stops. The Inspector
 *   panel exposes geometry sliders as a workaround.
 * - Focal-point (fx/fy) drag for radial gradients.
 * - Reverse-direction shortcut via context menu.
 *
 * **Coord system**: gradients use `objectBoundingBox` (SVG 2
 * default), so positions are normalized 0..1 against the rendered
 * node's bbox. The overlay reads the rendered bbox via
 * `getRenderedNodeBBox` (DOM measurement → handles node transforms
 * correctly) and converts normalized → doc coords for stop dots.
 *
 * **Headless boundary**: zero Material imports — pure SVG + signals.
 * Color picker integration lives in the Inspector panel (which IS
 * Material-bound). Clicking a stop on the overlay only SELECTS;
 * editing color is done from the Inspector.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeGradientOverlay]',
  standalone: true,
  template: `
    @if (geometry(); as g) {
      <!-- Direction line (linear) or radius circle (radial). The
           dashed style signals "guide, not content"; pointer-events
           on the line catch click-to-insert-stop. -->
      @if (g.kind === 'linear') {
        <svg:line
          class="gradient-axis"
          [attr.x1]="g.startX"
          [attr.y1]="g.startY"
          [attr.x2]="g.endX"
          [attr.y2]="g.endY"
          (pointerdown)="onAxisPointerDown($event)"
        ></svg:line>
      } @else {
        <svg:circle
          class="gradient-axis"
          [attr.cx]="g.centerX"
          [attr.cy]="g.centerY"
          [attr.r]="g.radius"
          fill="none"
          (pointerdown)="onAxisPointerDown($event)"
        ></svg:circle>
      }

      <!-- Stop dots — colored by stop, position interpolated along
           the axis. Drag changes offset, click selects for color edit. -->
      @for (s of stopDots(); track s.index) {
        <svg:circle
          class="stop-dot"
          [class.selected]="s.index === selectedIndex()"
          [attr.cx]="s.x"
          [attr.cy]="s.y"
          [attr.r]="stopRadius()"
          [attr.fill]="s.color"
          [attr.data-svge-stop-index]="s.index"
          role="button"
          tabindex="0"
          [attr.aria-label]="'Gradient stop ' + (s.index + 1) + ' at ' + s.offsetPct + ' percent'"
          (pointerdown)="onStopPointerDown($event, s.index)"
          (pointermove)="onStopPointerMove($event)"
          (pointerup)="onStopPointerUp($event)"
        ></svg:circle>
      }
    }
  `,
  styles: `
    .gradient-axis {
      stroke: #1976d2;
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      cursor: copy;
    }
    .stop-dot {
      stroke: #1976d2;
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      cursor: grab;
      touch-action: none;
    }
    .stop-dot:active {
      cursor: grabbing;
    }
    .stop-dot.selected {
      stroke: #ff6f00;
      stroke-width: 3;
      filter: drop-shadow(0 0 2px rgba(255, 111, 0, 0.7));
    }
    .stop-dot:focus-visible {
      stroke: #ff6f00;
      outline: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradientOverlay {
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly editing = inject(GradientEditingService);
  private readonly catalog = inject(GradientLibraryService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly bus = inject(CommandBus);
  private readonly layers = inject(LayersService);
  private readonly injector = inject(Injector);

  /** Rendered bbox of the target node. Re-measured every CD cycle. */
  private readonly _bbox = signal<BoundingBox | null>(null);
  private dragState: DragState | null = null;

  protected readonly selectedIndex = this.editing.selectedStopIndex;
  protected readonly stopRadius = computed(() => STOP_DOT_PX / this.viewport.zoom());

  /**
   * Resolved geometry for rendering — `null` shapes the template
   * into rendering nothing. Combines the gradient catalog item +
   * the rendered bbox into screen-space coordinates.
   */
  protected readonly geometry = computed<GradientGeometryView | null>(() => {
    const id = this.editing.activeGradientId();
    if (id === null) return null;
    const targetId = this.editing.targetNodeId();
    if (targetId === null) return null;
    // Visibility gate — same pattern as SelectionOverlay/AnchorOverlay.
    if (this.layers.hiddenIds().has(targetId)) return null;
    const node = findNodeById(this.state.document().root, targetId);
    if (node !== null && node.metadata.visible === false) return null;
    const b = this._bbox();
    if (b === null) return null;
    const item = this.catalog.get(id);
    if (item === null) return null;
    return buildGeometryView(item, b);
  });

  protected readonly stopDots = computed<StopDot[]>(() => {
    const g = this.geometry();
    if (g === null) return [];
    const id = this.editing.activeGradientId();
    if (id === null) return [];
    const item = this.catalog.get(id);
    if (item === null) return [];
    return item.stops.map((s, i) => {
      const pos = stopScreenPos(g, s.offset);
      return {
        index: i,
        x: pos.x,
        y: pos.y,
        color: s.color,
        offsetPct: Math.round(s.offset * 100),
      };
    });
  });

  constructor() {
    afterEveryRender({
      read: () => this.measure(),
    });
  }

  private measure(): void {
    const targetId = this.editing.targetNodeId();
    if (targetId === null) {
      if (this._bbox() !== null) this._bbox.set(null);
      return;
    }
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return;
    const b = getRenderedNodeBBox(svg, targetId);
    // Avoid spurious signal fires by checking ref equality first.
    const cur = this._bbox();
    if (b === null) {
      if (cur !== null) this._bbox.set(null);
      return;
    }
    if (
      cur === null ||
      cur.x !== b.x ||
      cur.y !== b.y ||
      cur.width !== b.width ||
      cur.height !== b.height
    ) {
      this._bbox.set(b);
    }
  }

  // ── Stop dot interactions ──────────────────────────────────────

  protected onStopPointerDown(event: PointerEvent, stopIndex: number): void {
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    this.dragState = {
      pointerId: event.pointerId,
      stopIndex,
      startScreenX: event.clientX,
      startScreenY: event.clientY,
      stopsBefore: item.stops,
      moved: false,
    };
    capturePointer(event);
    event.stopPropagation();
  }

  protected onStopPointerMove(event: PointerEvent): void {
    if (this.dragState === null) return;
    if (event.pointerId !== this.dragState.pointerId) return;
    const dx = event.clientX - this.dragState.startScreenX;
    const dy = event.clientY - this.dragState.startScreenY;
    if (!this.dragState.moved && Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) {
      this.dragState = { ...this.dragState, moved: true };
    }
    if (!this.dragState.moved) return;

    // Project the pointer position onto the gradient axis to derive
    // the new offset (0..1).
    const g = this.geometry();
    if (g === null) return;
    const docPt = this.screenToDoc(event.clientX, event.clientY);
    if (docPt === null) return;
    const newOffset = projectOntoAxis(g, docPt);
    const clamped = Math.max(0, Math.min(1, newOffset));

    // Preview the change live by mutating in-place. We do NOT
    // dispatch a command on every move (would flood undo history) —
    // single command on release.
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    const nextStops = item.stops.map((s, i) =>
      i === this.dragState!.stopIndex ? { ...s, offset: clamped } : s,
    );
    // In-place live preview — replace the item without going through
    // the command bus. On release, we'll dispatch a proper command
    // with stopsBefore as the undo target.
    this.catalog.update(id, { ...item, stops: nextStops });
  }

  protected onStopPointerUp(event: PointerEvent): void {
    if (this.dragState === null) return;
    if (event.pointerId !== this.dragState.pointerId) return;
    const wasMove = this.dragState.moved;
    const stopIndex = this.dragState.stopIndex;
    const stopsBefore = this.dragState.stopsBefore;
    this.dragState = null;
    releasePointer(event);

    if (wasMove) {
      // Commit via command — restores stopsBefore on undo.
      const id = this.editing.activeGradientId();
      if (id === null) return;
      const item = this.catalog.get(id);
      if (item === null) return;
      // Step 1: revert to before state (so command's snapshot is correct).
      this.catalog.update(id, { ...item, stops: stopsBefore });
      // Step 2: dispatch the command (re-applies the new stops + undo).
      this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops: item.stops }));
    } else {
      // Plain click → select for color editing.
      this.editing.selectStop(stopIndex);
    }
  }

  // ── Axis click → insert stop ──────────────────────────────────

  protected onAxisPointerDown(event: PointerEvent): void {
    // Don't capture pointer — this is an instantaneous "insert stop"
    // gesture, not a drag. Single click commits.
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    const g = this.geometry();
    if (g === null) return;

    const docPt = this.screenToDoc(event.clientX, event.clientY);
    if (docPt === null) return;
    const offset = Math.max(0, Math.min(1, projectOntoAxis(g, docPt)));

    // Interpolate color from adjacent stops.
    const color = interpolateStopColor(item.stops, offset);
    const newStops = insertStopSorted(item.stops, { offset, color });
    const newIndex = newStops.findIndex((s) => s === newStops.find((x) => x.offset === offset));

    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops: newStops }));
    this.editing.selectStop(newIndex);
    event.stopPropagation();
  }

  // ── Helpers ───────────────────────────────────────────────────

  private screenToDoc(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return null;
    return screenToDoc(svg, clientX, clientY);
  }
}

// ── Geometry helpers ────────────────────────────────────────────────

interface GradientGeometryView {
  readonly kind: 'linear' | 'radial';
  // Linear: start + end in DOC coords.
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  // Radial: center + radius in DOC coords.
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
}

interface StopDot {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly offsetPct: number;
}

function buildGeometryView(item: GradientLibraryItem, bbox: BoundingBox): GradientGeometryView {
  const g = item.geometry ?? {};
  if (item.kind === 'linear') {
    const x1 = g.x1 ?? 0;
    const y1 = g.y1 ?? 0;
    const x2 = g.x2 ?? 1;
    const y2 = g.y2 ?? 0;
    return {
      kind: 'linear',
      startX: bbox.x + x1 * bbox.width,
      startY: bbox.y + y1 * bbox.height,
      endX: bbox.x + x2 * bbox.width,
      endY: bbox.y + y2 * bbox.height,
      centerX: 0,
      centerY: 0,
      radius: 0,
    };
  }
  const cx = g.cx ?? 0.5;
  const cy = g.cy ?? 0.5;
  const r = g.r ?? 0.5;
  // For radial bbox conversion, use the average of width/height
  // for radius — matches SVG's objectBoundingBox normalization
  // (which uses the bbox's "diagonal" for the radius unit).
  const radiusPx = r * Math.sqrt((bbox.width * bbox.width + bbox.height * bbox.height) / 2);
  return {
    kind: 'radial',
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    centerX: bbox.x + cx * bbox.width,
    centerY: bbox.y + cy * bbox.height,
    radius: radiusPx,
  };
}

function stopScreenPos(g: GradientGeometryView, offset: number): { x: number; y: number } {
  if (g.kind === 'linear') {
    return {
      x: g.startX + (g.endX - g.startX) * offset,
      y: g.startY + (g.endY - g.startY) * offset,
    };
  }
  // Radial — stops project radially from center outward.
  // We render them along the positive-x axis from center (most
  // intuitive in the absence of a chosen direction). Future
  // improvement: allow user to choose direction.
  return {
    x: g.centerX + g.radius * offset,
    y: g.centerY,
  };
}

function projectOntoAxis(g: GradientGeometryView, pt: { x: number; y: number }): number {
  if (g.kind === 'linear') {
    const dx = g.endX - g.startX;
    const dy = g.endY - g.startY;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) return 0;
    const px = pt.x - g.startX;
    const py = pt.y - g.startY;
    return (px * dx + py * dy) / lenSq;
  }
  // Radial — distance from center / radius.
  const dist = Math.hypot(pt.x - g.centerX, pt.y - g.centerY);
  if (g.radius < 1e-9) return 0;
  return dist / g.radius;
}

/**
 * Interpolate color at a given offset between the surrounding stops.
 * v1 uses a simple RGB linear interpolation — perceptually not the
 * best but matches what users expect from "click on the line
 * between blue and red → purple".
 */
function interpolateStopColor(stops: readonly GradientStop[], offset: number): string {
  if (stops.length === 0) return '#808080';
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (offset <= sorted[0]!.offset) return sorted[0]!.color;
  if (offset >= sorted.at(-1)!.offset) return sorted.at(-1)!.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (offset >= a.offset && offset <= b.offset) {
      const t = (offset - a.offset) / (b.offset - a.offset);
      return mixRgbHex(a.color, b.color, t);
    }
  }
  return sorted[0]!.color;
}

function insertStopSorted(
  stops: readonly GradientStop[],
  newStop: GradientStop,
): readonly GradientStop[] {
  return [...stops, newStop].sort((a, b) => a.offset - b.offset);
}

function mixRgbHex(a: string, b: string, t: number): string {
  const pa = parseColorToRgb(a);
  const pb = parseColorToRgb(b);
  if (pa === null || pb === null) return a;
  const r = Math.round(pa.r * (1 - t) + pb.r * t);
  const g = Math.round(pa.g * (1 - t) + pb.g * t);
  const blu = Math.round(pa.b * (1 - t) + pb.b * t);
  return `#${[r, g, blu].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function parseColorToRgb(c: string): { r: number; g: number; b: number } | null {
  // Hex 3 / 6 (with or without #)
  const hex = c.startsWith('#') ? c.slice(1) : c;
  if (hex.length === 3) {
    const r = parseInt(hex[0]!.repeat(2), 16);
    const g = parseInt(hex[1]!.repeat(2), 16);
    const b = parseInt(hex[2]!.repeat(2), 16);
    if ([r, g, b].every((v) => !Number.isNaN(v))) return { r, g, b };
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((v) => !Number.isNaN(v))) return { r, g, b };
  }
  // rgb(...)
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (m !== null) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return null;
}

// ── Re-export gradient geometry type for callers that need it ──────
export type { GradientGeometryView };
