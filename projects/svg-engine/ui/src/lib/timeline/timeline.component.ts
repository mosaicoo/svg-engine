import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  type AnimatablePropertyDef,
  type AnimationTrack,
  DEFAULT_EASING,
  type EasingSpec,
  EditorStateService,
  findAnimatableProperty,
  findNodeById,
  type NodeId,
  readAnimatableValue,
  type SvgNode,
} from 'svg-engine/core';
import { AnimationService, PlaybackService, SelectionService } from 'svg-engine/edit';

/** One keyframe positioned along a track lane (percent of the duration). */
interface KeyframeView {
  readonly time: number;
  readonly leftPct: number;
  readonly title: string;
}

/** A track row: the animated property + its keyframe diamonds. */
interface TrackRowView {
  readonly kind: 'track';
  readonly key: string;
  readonly label: string;
  readonly nodeId: NodeId;
  readonly property: string;
  readonly keyframes: readonly KeyframeView[];
}

/** A node header row that groups the property tracks below it. */
interface NodeRowView {
  readonly kind: 'node';
  readonly key: string;
  readonly label: string;
}

type RowView = NodeRowView | TrackRowView;

/** A time-ruler tick (label + position). */
interface TickView {
  readonly leftPct: number;
  readonly label: string;
}

/** The currently-selected keyframe (target for easing/delete). */
interface SelectedKf {
  readonly nodeId: NodeId;
  readonly property: string;
  readonly time: number;
}

/** In-flight keyframe drag (move). */
interface DragState {
  readonly nodeId: NodeId;
  readonly property: string;
  readonly fromTime: number;
  readonly laneLeft: number;
  readonly laneWidth: number;
  readonly currentTime: number;
}

/** "Nice" ruler steps (ms) — the smallest that yields ≲ 8 ticks is picked. */
const NICE_STEPS_MS: readonly number[] = [
  10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 30_000, 60_000,
];

/** The easing presets offered for a selected keyframe (cubic-Bézier custom = F9+). */
const EASING_OPTIONS: readonly { readonly kind: EasingSpec['kind']; readonly label: string }[] = [
  { kind: 'linear', label: 'Linear' },
  { kind: 'easeIn', label: 'Ease In' },
  { kind: 'easeOut', label: 'Ease Out' },
  { kind: 'easeInOut', label: 'Ease In-Out' },
];

/**
 * **Pure** — map a pointer's clientX onto a time within `[0, duration]`, given
 * the lane's bounding box. Returns `0` for a degenerate lane/duration. Extracted
 * so the scrub/drag math is unit-testable without a real DOM (jsdom's
 * `getBoundingClientRect` returns zeros).
 */
export function clientXToTime(
  clientX: number,
  rect: { readonly left: number; readonly width: number },
  duration: number,
): number {
  if (rect.width <= 0 || duration <= 0) return 0;
  const t = ((clientX - rect.left) / rect.width) * duration;
  if (t < 0) return 0;
  if (t > duration) return duration;
  return t;
}

/**
 * **D-082 (Animation Timeline) — F4 + F5.** `<svge-timeline>`: the dock that
 * renders **and edits** the active page's animation. F4 gave the read-only
 * view (ruler + per-track keyframe diamonds + playhead). **F5 makes it
 * interactive**:
 *
 * - **Scrub** — drag anywhere in the lane area to move the playhead
 *   ({@link PlaybackService.seek}).
 * - **Create** — a "key" button per track sets/replaces a keyframe at the
 *   playhead, capturing the shape's current value (F3 `readAnimatableValue`);
 *   the "Animate …" row starts a brand-new track for any animatable property
 *   of the selected shape.
 * - **Move** — drag a keyframe diamond horizontally.
 * - **Select / Delete / Easing** — click a diamond to select it; the footer
 *   strip shows its time/value, an easing picker, and a delete button.
 * - **Duration** — a number input in the header.
 *
 * **Non-destructive**: every edit goes through the editor-scoped
 * {@link AnimationService}, i.e. an **undoable** `CommandBus` command — Ctrl+Z
 * is unified with the rest of the editor and the base document is never
 * mutated directly. Playback still derives the displayed tree (F6 wires the
 * canvas preview).
 */
@Component({
  selector: 'svge-timeline',
  standalone: true,
  imports: [],
  template: `
    <div class="tl">
      <div class="tl-header">
        <span class="tl-title">Timeline</span>
        <label class="tl-duration">
          Duration
          <input
            type="number"
            min="1"
            step="100"
            [value]="durationMs()"
            (change)="onDurationChange($event)"
            aria-label="Animation duration in milliseconds"
          />
          ms
        </label>
        <span class="tl-time" aria-label="Playhead and duration">
          {{ playheadLabel() }} / {{ durationLabel() }}
        </span>
      </div>

      @if (rows().length === 0) {
        <div class="tl-empty">No animation on this page yet.</div>
      } @else {
        <div class="tl-body">
          <!-- Left: row labels (ruler corner + node/track labels + key button). -->
          <div class="tl-labels">
            <div class="tl-ruler-corner"></div>
            @for (row of rows(); track row.key) {
              <div
                class="tl-label"
                [class.tl-label--node]="row.kind === 'node'"
                [class.tl-label--track]="row.kind === 'track'"
                [title]="row.label"
              >
                <span class="tl-label-text">{{ row.label }}</span>
                @if (row.kind === 'track') {
                  <button
                    type="button"
                    class="tl-key-btn"
                    title="Set keyframe at playhead"
                    aria-label="Set keyframe at playhead"
                    (click)="addKeyframeAtPlayhead(row.nodeId, row.property)"
                  >
                    ◆
                  </button>
                }
              </div>
            }
          </div>

          <!-- Right: time ruler + lanes + playhead overlay. Scrub anywhere. -->

          <div
            class="tl-lanes"
            (pointerdown)="onScrubDown($event)"
            (pointermove)="onScrubMove($event)"
            (pointerup)="onScrubUp($event)"
            (pointercancel)="onScrubUp($event)"
          >
            <div class="tl-ruler">
              @for (tick of ticks(); track tick.leftPct) {
                <span class="tl-tick" [style.left.%]="tick.leftPct">{{ tick.label }}</span>
              }
            </div>
            @for (row of rows(); track row.key) {
              <div class="tl-lane" [class.tl-lane--node]="row.kind === 'node'">
                @if (row.kind === 'track') {
                  @for (kf of row.keyframes; track kf.time) {
                    <span
                      class="tl-kf"
                      [class.tl-kf--selected]="isSelectedKf(row.nodeId, row.property, kf.time)"
                      [style.left.%]="kfLeftPct(row.nodeId, row.property, kf)"
                      [title]="kf.title"
                      (pointerdown)="onKfDown($event, row.nodeId, row.property, kf.time)"
                      (pointermove)="onKfMove($event)"
                      (pointerup)="onKfUp($event)"
                      (pointercancel)="onKfUp($event)"
                    ></span>
                  }
                }
              </div>
            }
            <div class="tl-playhead" [style.left.%]="playheadPct()" aria-hidden="true"></div>
          </div>
        </div>
      }

      <!-- Footer: selected-keyframe strip, else "Animate <selected shape>". -->
      @if (selectedKfView(); as sel) {
        <div class="tl-footer">
          <span class="tl-foot-info"
            >Keyframe {{ formatTimeLabel(sel.time) }} = {{ sel.valueLabel }}</span
          >
          <label class="tl-foot-ease">
            Easing
            <select (change)="onEasingChange($event)" aria-label="Keyframe easing">
              @for (opt of easingOptions; track opt.kind) {
                <option [value]="opt.kind" [selected]="opt.kind === sel.easingKind">
                  {{ opt.label }}
                </option>
              }
            </select>
          </label>
          <button type="button" class="tl-del-btn" (click)="deleteSelectedKf()">Delete</button>
        </div>
      } @else if (addableProperties().length > 0) {
        <div class="tl-footer">
          <span class="tl-foot-info">Animate {{ focusLabel() }}</span>
          <select (change)="onAddPropertyChange($event)" aria-label="Property to animate">
            <option value="">Property…</option>
            @for (p of addableProperties(); track p.property) {
              <option [value]="p.property">{{ p.label }}</option>
            }
          </select>
          <button
            type="button"
            class="tl-add-btn"
            [disabled]="addProperty() === ''"
            (click)="addTrack()"
          >
            + Add track
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      font-size: 12px;
      color: var(--mat-sys-on-surface, #1a1a1a);
      user-select: none;
      -webkit-user-select: none;
    }
    .tl {
      display: flex;
      flex-direction: column;
      background: var(--mat-sys-surface-container-low, #f6f6f6);
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-title {
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .tl-duration {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      opacity: 0.85;
    }
    .tl-duration input {
      width: 64px;
      font: inherit;
      padding: 1px 4px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      border-radius: 2px;
      background: var(--mat-sys-surface, #fff);
      color: inherit;
    }
    .tl-time {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
      opacity: 0.7;
    }
    .tl-empty {
      padding: 12px 8px;
      opacity: 0.6;
      font-style: italic;
    }
    .tl-body {
      display: flex;
      align-items: stretch;
      max-height: 220px;
      overflow-y: auto;
      scrollbar-width: thin;
    }
    .tl-labels {
      flex: 0 0 170px;
      width: 170px;
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-lanes {
      position: relative;
      flex: 1 1 auto;
      overflow: hidden;
      touch-action: none;
      cursor: crosshair;
    }
    .tl-ruler-corner,
    .tl-ruler {
      height: 22px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.03));
    }
    .tl-ruler {
      position: relative;
    }
    .tl-tick {
      position: absolute;
      top: 4px;
      transform: translateX(-50%);
      font-size: 9px;
      opacity: 0.6;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;
    }
    .tl-tick::before {
      content: '';
      position: absolute;
      left: 50%;
      top: 14px;
      width: 1px;
      height: 6px;
      background: var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.25));
    }
    .tl-label {
      height: 20px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 4px 0 8px;
    }
    .tl-label-text {
      flex: 1 1 auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tl-label--node {
      font-weight: 600;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.03));
    }
    .tl-label--track {
      padding-left: 20px;
      opacity: 0.85;
    }
    .tl-key-btn {
      flex: 0 0 auto;
      border: 0;
      background: transparent;
      color: var(--mat-sys-primary, #1976d2);
      cursor: pointer;
      font-size: 11px;
      line-height: 1;
      padding: 2px;
      border-radius: 2px;
      opacity: 0.6;
    }
    .tl-key-btn:hover {
      opacity: 1;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
    }
    .tl-lane {
      position: relative;
      height: 20px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.06));
    }
    .tl-lane--node {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.03));
    }
    .tl-kf {
      position: absolute;
      top: 50%;
      width: 10px;
      height: 10px;
      transform: translate(-50%, -50%) rotate(45deg);
      background: var(--mat-sys-primary, #1976d2);
      border: 1px solid var(--mat-sys-surface, #fff);
      border-radius: 1px;
      cursor: ew-resize;
    }
    .tl-kf--selected {
      background: var(--mat-sys-tertiary, #7b1fa2);
      box-shadow: 0 0 0 2px var(--mat-sys-tertiary, #7b1fa2);
    }
    .tl-playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      margin-left: -1px;
      background: var(--mat-sys-error, #d32f2f);
      pointer-events: none;
    }
    .tl-playhead::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid var(--mat-sys-error, #d32f2f);
    }
    .tl-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px;
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-foot-info {
      font-variant-numeric: tabular-nums;
      opacity: 0.85;
    }
    .tl-foot-ease,
    .tl-footer select {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .tl-footer select {
      font: inherit;
      padding: 1px 4px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      border-radius: 2px;
      background: var(--mat-sys-surface, #fff);
      color: inherit;
    }
    .tl-del-btn,
    .tl-add-btn {
      font: inherit;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      background: var(--mat-sys-surface, #fff);
      color: inherit;
    }
    .tl-del-btn:hover {
      border-color: var(--mat-sys-error, #d32f2f);
      color: var(--mat-sys-error, #d32f2f);
    }
    .tl-add-btn {
      color: var(--mat-sys-primary, #1976d2);
    }
    .tl-add-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeTimeline {
  private readonly anim = inject(AnimationService);
  private readonly playback = inject(PlaybackService);
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);

  protected readonly easingOptions = EASING_OPTIONS;

  /** The currently-selected keyframe (footer target), or `null`. */
  private readonly selected = signal<SelectedKf | null>(null);
  /** In-flight keyframe drag, or `null`. */
  private readonly drag = signal<DragState | null>(null);
  /** Chosen property in the "Animate …" dropdown. */
  protected readonly addProperty = signal<string>('');

  /** Captured lane box for an active scrub gesture. */
  private scrubRect: { left: number; width: number } | null = null;

  /** The timeline duration (ms), from the active animation. */
  protected readonly durationMs = computed<number>(() => this.anim.durationMs());

  /**
   * Flat, ordered list of rows: each animated node becomes a header row
   * followed by one track row per animated property (first-appearance order).
   */
  protected readonly rows = computed<readonly RowView[]>(() => {
    const tracks = this.anim.tracks();
    if (tracks.length === 0) return [];
    const duration = this.durationMs();
    const root = this.state.document().root;

    const order: NodeId[] = [];
    const byNode = new Map<NodeId, AnimationTrack[]>();
    for (const t of tracks) {
      let list = byNode.get(t.nodeId);
      if (list === undefined) {
        list = [];
        byNode.set(t.nodeId, list);
        order.push(t.nodeId);
      }
      list.push(t);
    }

    const out: RowView[] = [];
    for (const nodeId of order) {
      const node = findNodeById(root, nodeId);
      out.push({ kind: 'node', key: `n:${nodeId}`, label: this.nodeLabel(node, nodeId) });
      for (const track of byNode.get(nodeId)!) {
        out.push({
          kind: 'track',
          key: `t:${nodeId}:${track.property}`,
          label: this.propertyLabel(node, track.property),
          nodeId,
          property: track.property,
          keyframes: track.keyframes.map((k) => ({
            time: k.time,
            leftPct: this.toPct(k.time, duration),
            title: `${this.formatTime(k.time)} = ${this.valueLabel(k.value)}`,
          })),
        });
      }
    }
    return out;
  });

  /** Ruler ticks at "nice" intervals across the duration. */
  protected readonly ticks = computed<readonly TickView[]>(() => {
    const duration = this.durationMs();
    if (duration <= 0) return [{ leftPct: 0, label: this.formatTime(0) }];
    const step = this.niceStep(duration / 8);
    const out: TickView[] = [];
    for (let t = 0; t <= duration + 1e-6 && out.length < 64; t += step) {
      out.push({ leftPct: this.toPct(t, duration), label: this.formatTime(t) });
    }
    return out;
  });

  /** Playhead position as a percent of the duration (clamped 0–100). */
  protected readonly playheadPct = computed<number>(() =>
    this.toPct(this.playback.playhead(), this.durationMs()),
  );

  protected readonly playheadLabel = computed<string>(() =>
    this.formatTime(this.playback.playhead()),
  );
  protected readonly durationLabel = computed<string>(() => this.formatTime(this.durationMs()));

  /**
   * Live view of the selected keyframe (value + easing), or `null` when the
   * selection no longer exists (e.g., after delete/move). Derives from the
   * document so it stays in sync with undo/redo.
   */
  protected readonly selectedKfView = computed<{
    nodeId: NodeId;
    property: string;
    time: number;
    valueLabel: string;
    easingKind: EasingSpec['kind'];
  } | null>(() => {
    const sel = this.selected();
    if (sel === null) return null;
    const track = this.anim
      .tracks()
      .find((t) => t.nodeId === sel.nodeId && t.property === sel.property);
    const kf = track?.keyframes.find((k) => Math.abs(k.time - sel.time) < 1e-6);
    if (kf === undefined) return null;
    return {
      nodeId: sel.nodeId,
      property: sel.property,
      time: kf.time,
      valueLabel: this.valueLabel(kf.value),
      easingKind: kf.easing.kind,
    };
  });

  /** The focused shape's animatable properties NOT yet animated (addable). */
  protected readonly addableProperties = computed<readonly AnimatablePropertyDef[]>(() => {
    const focus = this.selection.focusId();
    if (focus === null) return [];
    const all = this.anim.animatablePropertiesFor(focus);
    if (all.length === 0) return [];
    const animated = new Set(
      this.anim
        .tracks()
        .filter((t) => t.nodeId === focus)
        .map((t) => t.property),
    );
    return all.filter((p) => !animated.has(p.property));
  });

  /** Label of the focused shape (for the "Animate …" row). */
  protected readonly focusLabel = computed<string>(() => {
    const focus = this.selection.focusId();
    if (focus === null) return '';
    return this.nodeLabel(findNodeById(this.state.document().root, focus), focus);
  });

  // ── keyframe selection / position ─────────────────────────────────

  protected isSelectedKf(nodeId: NodeId, property: string, time: number): boolean {
    const s = this.selected();
    return (
      s !== null && s.nodeId === nodeId && s.property === property && Math.abs(s.time - time) < 1e-6
    );
  }

  /** Diamond position — follows the live drag for the dragged keyframe. */
  protected kfLeftPct(nodeId: NodeId, property: string, kf: KeyframeView): number {
    const d = this.drag();
    if (
      d !== null &&
      d.nodeId === nodeId &&
      d.property === property &&
      Math.abs(d.fromTime - kf.time) < 1e-6
    ) {
      return this.toPct(d.currentTime, this.durationMs());
    }
    return kf.leftPct;
  }

  // ── create ────────────────────────────────────────────────────────

  /** Set (or replace) a keyframe for `(nodeId, property)` at the playhead. */
  protected addKeyframeAtPlayhead(nodeId: NodeId, property: string): void {
    const time = this.playback.playhead();
    const value = this.captureValue(nodeId, property);
    this.anim.addKeyframe(nodeId, property, { time, value, easing: DEFAULT_EASING });
    this.selected.set({ nodeId, property, time });
  }

  protected onAddPropertyChange(event: Event): void {
    this.addProperty.set((event.target as HTMLSelectElement).value);
  }

  /** Start a new track on the focused shape for the chosen property. */
  protected addTrack(): void {
    const focus = this.selection.focusId();
    const property = this.addProperty();
    if (focus === null || property === '') return;
    this.addKeyframeAtPlayhead(focus, property);
    this.addProperty.set('');
  }

  // ── delete / easing / duration ────────────────────────────────────

  protected deleteSelectedKf(): void {
    const s = this.selected();
    if (s === null) return;
    this.anim.removeKeyframe(s.nodeId, s.property, s.time);
    this.selected.set(null);
  }

  protected onEasingChange(event: Event): void {
    const s = this.selected();
    if (s === null) return;
    const kind = (event.target as HTMLSelectElement).value as EasingSpec['kind'];
    this.anim.setKeyframeEasing(s.nodeId, s.property, s.time, this.easingForKind(kind));
  }

  protected onDurationChange(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    this.anim.setDuration(Math.max(1, Math.round(raw)));
  }

  // ── scrub (playhead) ──────────────────────────────────────────────

  protected onScrubDown(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    this.scrubRect = { left: r.left, width: r.width };
    el.setPointerCapture?.(event.pointerId);
    this.playback.seek(clientXToTime(event.clientX, this.scrubRect, this.durationMs()));
  }

  protected onScrubMove(event: PointerEvent): void {
    if (this.scrubRect === null) return;
    this.playback.seek(clientXToTime(event.clientX, this.scrubRect, this.durationMs()));
  }

  protected onScrubUp(event: PointerEvent): void {
    this.scrubRect = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  // ── move (keyframe drag) ──────────────────────────────────────────

  protected onKfDown(event: PointerEvent, nodeId: NodeId, property: string, time: number): void {
    // Diamonds own their gesture — don't let it bubble into the scrub handler.
    event.stopPropagation();
    this.selected.set({ nodeId, property, time });
    const diamond = event.currentTarget as HTMLElement;
    const lane = (diamond.offsetParent as HTMLElement | null) ?? diamond.parentElement;
    const r = (lane ?? diamond).getBoundingClientRect();
    this.drag.set({
      nodeId,
      property,
      fromTime: time,
      laneLeft: r.left,
      laneWidth: r.width,
      currentTime: time,
    });
    diamond.setPointerCapture?.(event.pointerId);
  }

  protected onKfMove(event: PointerEvent): void {
    const d = this.drag();
    if (d === null) return;
    const t = clientXToTime(
      event.clientX,
      { left: d.laneLeft, width: d.laneWidth },
      this.durationMs(),
    );
    this.drag.set({ ...d, currentTime: t });
  }

  protected onKfUp(event: PointerEvent): void {
    const d = this.drag();
    this.drag.set(null);
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    if (d === null) return;
    if (Math.abs(d.currentTime - d.fromTime) < 1e-6) return; // a click, not a move
    this.anim.moveKeyframe(d.nodeId, d.property, d.fromTime, d.currentTime);
    this.selected.set({ nodeId: d.nodeId, property: d.property, time: d.currentTime });
  }

  // ── label / formatting / value helpers ────────────────────────────

  protected formatTimeLabel(ms: number): string {
    return this.formatTime(ms);
  }

  private easingForKind(kind: EasingSpec['kind']): EasingSpec {
    if (kind === 'cubicBezier') return DEFAULT_EASING; // custom bezier is a future phase
    return { kind };
  }

  /** Capture a node's current value for `property`, falling back to the default. */
  private captureValue(nodeId: NodeId, property: string): number | string {
    const node = findNodeById(this.state.document().root, nodeId);
    if (node === null) return 0;
    const current = readAnimatableValue(node, property);
    if (current !== null) return current;
    return findAnimatableProperty(node, property)?.defaultValue ?? 0;
  }

  private nodeLabel(node: SvgNode | null, nodeId: NodeId): string {
    if (node === null) return nodeId.slice(0, 6);
    const authored = node.metadata?.name;
    if (typeof authored === 'string' && authored.length > 0) return authored;
    return `${node.type} ${node.id.slice(0, 6)}`;
  }

  private propertyLabel(node: SvgNode | null, property: string): string {
    if (node === null) return property;
    return findAnimatableProperty(node, property)?.label ?? property;
  }

  private valueLabel(value: number | string): string {
    if (typeof value === 'number') return String(Number.parseFloat(value.toFixed(3)));
    return value;
  }

  private formatTime(ms: number): string {
    return `${Number.parseFloat((ms / 1000).toFixed(2))}s`;
  }

  private toPct(time: number, duration: number): number {
    if (duration <= 0) return 0;
    const pct = (time / duration) * 100;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
  }

  private niceStep(raw: number): number {
    for (const c of NICE_STEPS_MS) if (c >= raw) return c;
    return NICE_STEPS_MS[NICE_STEPS_MS.length - 1]!;
  }
}
