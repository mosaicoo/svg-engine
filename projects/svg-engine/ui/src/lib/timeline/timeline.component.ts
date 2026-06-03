import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  type AnimatablePropertyDef,
  type AnimatablePropertyKind,
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
  /** Pointer X (client space) at pointerdown — the drag-threshold origin. */
  readonly startClientX: number;
  /** Becomes true once the pointer crosses {@link DRAG_THRESHOLD_PX}. */
  moved: boolean;
}

/**
 * Pixels the pointer must travel before a keyframe press is treated as a
 * *drag* rather than a *click*. Below this, pointerup selects the keyframe
 * (enabling the footer value/easing/Delete editor) instead of committing a
 * micro-move — so a plain click reliably selects, and Delete becomes usable.
 */
const DRAG_THRESHOLD_PX = 4;

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
        <!-- F6 — live transport. -->
        <div class="tl-transport" role="group" aria-label="Playback transport">
          <button type="button" title="Go to start" aria-label="Go to start" (click)="toStart()">
            ⏮
          </button>
          <button type="button" title="Step back" aria-label="Step back" (click)="stepBack()">
            ◀
          </button>
          <button
            type="button"
            class="tl-play"
            [title]="isPlaying() ? 'Pause' : 'Play'"
            [attr.aria-label]="isPlaying() ? 'Pause' : 'Play'"
            (click)="togglePlay()"
          >
            {{ isPlaying() ? '⏸' : '▶' }}
          </button>
          <button type="button" title="Step forward" aria-label="Step forward" (click)="stepFwd()">
            ▶
          </button>
          <button type="button" title="Go to end" aria-label="Go to end" (click)="toEnd()">
            ⏭
          </button>
          <button
            type="button"
            class="tl-loop"
            [class.tl-loop--on]="loopOn()"
            [attr.aria-pressed]="loopOn()"
            title="Loop"
            aria-label="Toggle loop"
            (click)="toggleLoop()"
          >
            ⟳
          </button>
          <select
            class="tl-speed"
            aria-label="Playback speed"
            title="Playback speed"
            (change)="onSpeedChange($event)"
          >
            @for (s of speedOptions; track s) {
              <option [value]="s" [selected]="s === speed()">{{ s }}×</option>
            }
          </select>
        </div>
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
                  <button
                    type="button"
                    class="tl-track-del-btn"
                    title="Remove this track"
                    aria-label="Remove this track"
                    (click)="removeTrack(row.nodeId, row.property)"
                  >
                    ×
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
                      tabindex="0"
                      role="button"
                      [attr.aria-label]="kf.title"
                      [class.tl-kf--selected]="isSelectedKf(row.nodeId, row.property, kf.time)"
                      [style.left.%]="kfLeftPct(row.nodeId, row.property, kf)"
                      [title]="kf.title"
                      (pointerdown)="onKfDown($event, row.nodeId, row.property, kf.time)"
                      (pointermove)="onKfMove($event)"
                      (pointerup)="onKfUp($event)"
                      (pointercancel)="onKfUp($event)"
                      (keydown)="onKfKey($event)"
                    ></span>
                  }
                }
              </div>
            }
            <div class="tl-playhead" [style.left.%]="playheadPct()" aria-hidden="true"></div>
          </div>
        </div>
      }

      <!--
        Footer: the keyframe editor and the "Animate <shape>" add-track row are
        INDEPENDENT (not mutually exclusive). The add-track row stays available
        even while a keyframe is selected, so you can keep adding properties and
        switch shapes (select another shape → its addable properties appear)
        without first deselecting the current keyframe.
      -->
      @if (selectedKfView() !== null || addableProperties().length > 0) {
        <div class="tl-footer">
          @if (selectedKfView(); as sel) {
            <div class="tl-foot-row">
              <span class="tl-foot-info">Keyframe {{ formatTimeLabel(sel.time) }}</span>
              <!-- A <span> (not <label>) wraps the caption: the conditional
                   input can't be statically associated to a <label for>, and the
                   input already carries its own aria-label. -->
              <span class="tl-foot-value">
                Value
                @if (sel.kind === 'color') {
                  <input
                    type="color"
                    class="tl-value-color"
                    [value]="colorInputValue(sel.value)"
                    (change)="onKfValueChange($event)"
                    aria-label="Keyframe value"
                  />
                } @else {
                  <input
                    type="number"
                    class="tl-value-num"
                    [value]="sel.value"
                    (change)="onKfValueChange($event)"
                    aria-label="Keyframe value"
                  />
                }
              </span>
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
          }
          @if (addableProperties().length > 0) {
            <div class="tl-foot-row">
              <span class="tl-foot-info">Animate {{ focusLabel() }}</span>
              <select
                [value]="addProperty()"
                (change)="onAddPropertyChange($event)"
                aria-label="Property to animate"
              >
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
    .tl-transport {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .tl-transport button {
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 3px 5px;
      border-radius: 3px;
      opacity: 0.75;
    }
    .tl-transport button:hover {
      opacity: 1;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
    }
    .tl-transport .tl-play {
      color: var(--mat-sys-primary, #1976d2);
      font-size: 14px;
    }
    .tl-transport .tl-loop--on {
      opacity: 1;
      color: var(--mat-sys-primary, #1976d2);
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
    }
    .tl-speed {
      font: inherit;
      margin-left: 2px;
      padding: 1px 2px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      border-radius: 2px;
      background: var(--mat-sys-surface, #fff);
      color: inherit;
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
    .tl-track-del-btn {
      flex: 0 0 auto;
      border: 0;
      background: transparent;
      color: var(--mat-sys-error, #d32f2f);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0 2px;
      border-radius: 2px;
      opacity: 0.55;
    }
    .tl-track-del-btn:hover {
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
    .tl-kf:focus-visible {
      outline: 2px solid var(--mat-sys-tertiary, #7b1fa2);
      outline-offset: 1px;
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
      flex-direction: column;
      gap: 4px;
      padding: 4px 8px;
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-foot-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .tl-foot-info {
      font-variant-numeric: tabular-nums;
      opacity: 0.85;
    }
    .tl-foot-ease,
    .tl-foot-value,
    .tl-footer select {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .tl-footer select,
    .tl-value-num {
      font: inherit;
      padding: 1px 4px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      border-radius: 2px;
      background: var(--mat-sys-surface, #fff);
      color: inherit;
    }
    .tl-value-num {
      width: 72px;
    }
    .tl-value-color {
      width: 32px;
      height: 22px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      border-radius: 2px;
      background: var(--mat-sys-surface, #fff);
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
  /** Playback-speed presets for the transport dropdown. */
  protected readonly speedOptions: readonly number[] = [0.25, 0.5, 1, 2, 4];

  // ── F6 — transport (delegates to the editor-scoped PlaybackService) ──
  protected readonly isPlaying = computed<boolean>(() => this.playback.isPlaying());
  protected readonly loopOn = computed<boolean>(() => this.playback.loop());
  protected readonly speed = computed<number>(() => this.playback.speed());

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
    value: number | string;
    valueLabel: string;
    kind: AnimatablePropertyKind;
    easingKind: EasingSpec['kind'];
  } | null>(() => {
    const sel = this.selected();
    if (sel === null) return null;
    const track = this.anim
      .tracks()
      .find((t) => t.nodeId === sel.nodeId && t.property === sel.property);
    const kf = track?.keyframes.find((k) => Math.abs(k.time - sel.time) < 1e-6);
    if (kf === undefined) return null;
    // The value kind (number/angle/scale/color) drives which input the footer
    // shows. Falls back to 'number' when the node/property can't be resolved.
    const node = findNodeById(this.state.document().root, sel.nodeId);
    const kind =
      (node !== null ? findAnimatableProperty(node, sel.property)?.kind : undefined) ?? 'number';
    return {
      nodeId: sel.nodeId,
      property: sel.property,
      time: kf.time,
      value: kf.value,
      valueLabel: this.valueLabel(kf.value),
      kind,
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

  /**
   * Remove an entire track `(nodeId, property)` — every keyframe at once — in a
   * single undoable step. Clears the selection when the removed track owned it,
   * so the footer editor doesn't dangle on a keyframe that no longer exists.
   */
  protected removeTrack(nodeId: NodeId, property: string): void {
    this.anim.removeTrack(nodeId, property);
    const s = this.selected();
    if (s !== null && s.nodeId === nodeId && s.property === property) {
      this.selected.set(null);
    }
  }

  protected onEasingChange(event: Event): void {
    const s = this.selected();
    if (s === null) return;
    const kind = (event.target as HTMLSelectElement).value as EasingSpec['kind'];
    this.anim.setKeyframeEasing(s.nodeId, s.property, s.time, this.easingForKind(kind));
  }

  /**
   * Set the **value** the selected keyframe holds (footer value input). Routed
   * through `moveKeyframe(time, time, newValue)` — a same-time move replaces the
   * value while preserving the easing — so it's an undoable CommandBus edit like
   * everything else. Non-numeric input on a numeric kind is ignored.
   */
  protected onKfValueChange(event: Event): void {
    const view = this.selectedKfView();
    if (view === null) return;
    const raw = (event.target as HTMLInputElement).value;
    const next: number | string = view.kind === 'color' ? raw : Number(raw);
    if (view.kind !== 'color' && !Number.isFinite(next as number)) return;
    if (next === view.value) return; // no-op
    this.anim.moveKeyframe(view.nodeId, view.property, view.time, view.time, next);
  }

  /** Coerce a stored color value to a `#rrggbb` for `<input type="color">`. */
  protected colorInputValue(value: number | string): string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  }

  protected onDurationChange(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    this.anim.setDuration(Math.max(1, Math.round(raw)));
  }

  // ── F6 — transport ────────────────────────────────────────────────

  protected togglePlay(): void {
    this.playback.toggle();
  }
  protected stepBack(): void {
    this.playback.stepBackward();
  }
  protected stepFwd(): void {
    this.playback.stepForward();
  }
  protected toStart(): void {
    this.playback.goToStart();
  }
  protected toEnd(): void {
    this.playback.goToEnd();
  }
  protected toggleLoop(): void {
    this.playback.setLoop(!this.playback.loop());
  }
  protected onSpeedChange(event: Event): void {
    this.playback.setSpeed(Number((event.target as HTMLSelectElement).value));
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
    // Selecting a keyframe moves the playhead to it, so the canvas (preview)
    // immediately reflects the value this keyframe holds.
    this.playback.seek(time);
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
      startClientX: event.clientX,
      moved: false,
    });
    diamond.setPointerCapture?.(event.pointerId);
    // Move DOM focus to the diamond so a subsequent Delete/Backspace is handled
    // here (onKfKey) instead of bubbling to the shell's document-level handler,
    // which would delete the *canvas shape* rather than the keyframe.
    diamond.focus?.();
  }

  protected onKfMove(event: PointerEvent): void {
    const d = this.drag();
    if (d === null) return;
    // Ignore sub-threshold jitter so a plain click stays a click (and selects
    // the keyframe) rather than committing a one-pixel move.
    if (!d.moved && Math.abs(event.clientX - d.startClientX) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
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
    // Never crossed the drag threshold → a click: the keyframe is already
    // selected (onKfDown), so the footer editor/Delete is live. Don't move it.
    if (!d.moved) return;
    this.anim.moveKeyframe(d.nodeId, d.property, d.fromTime, d.currentTime);
    this.selected.set({ nodeId: d.nodeId, property: d.property, time: d.currentTime });
    // Follow the moved keyframe with the playhead so the canvas keeps showing it.
    this.playback.seek(d.currentTime);
  }

  /**
   * Keyboard on a focused keyframe diamond. **Delete/Backspace removes the
   * selected keyframe**, not the canvas shape — we `stopPropagation()` so the
   * shell's document-level Delete handler never fires (it's bubble-phase, so
   * stopping here is enough). **Escape** clears the keyframe selection. This is
   * what makes per-keyframe deletion work with the keyboard: clicking a diamond
   * focuses it (onKfDown), so these keys are routed here first.
   */
  protected onKfKey(event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      this.deleteSelectedKf();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.selected.set(null);
    }
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
