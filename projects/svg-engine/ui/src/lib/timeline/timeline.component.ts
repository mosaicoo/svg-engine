import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  type AnimationTrack,
  EditorStateService,
  findAnimatableProperty,
  findNodeById,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';
import { AnimationService, PlaybackService } from 'svg-engine/edit';

/** One keyframe positioned along a track lane (percent of the duration). */
interface KeyframeView {
  readonly leftPct: number;
  readonly title: string;
}

/** A track row: the property label + its keyframe diamonds. */
interface TrackRowView {
  readonly kind: 'track';
  readonly key: string;
  readonly label: string;
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

/** "Nice" ruler steps (ms) — the smallest that yields ≲ 8 ticks is picked. */
const NICE_STEPS_MS: readonly number[] = [
  10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 30_000, 60_000,
];

/**
 * **D-082 (Animation Timeline) — F4.** `<svge-timeline>`: a **read-only**
 * visualization of the active page's animation — a time ruler, one lane per
 * animated `(node, property)` track with its keyframes as diamonds, and the
 * playhead indicator. **No editing** here: creating/moving/deleting keyframes
 * is F5; play/pause/scrub wiring is F6. This phase just renders the current
 * state faithfully.
 *
 * **Non-destructive / opt-in**: the component only *reads* signals from the
 * editor-scoped {@link AnimationService} (model) and {@link PlaybackService}
 * (playhead). It never dispatches a command and never mutates the document.
 * It renders nothing but an empty-state hint when the page has no animation,
 * so mounting it has zero visual cost until the user adds a keyframe (F5).
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui`; the model + engine
 * live in `core` + `edit`. This is the visual shell on top.
 *
 * **Layout**: a fixed-width label column on the left and a flexible lane area
 * on the right, both iterating the same flat {@link rows} list so row heights
 * stay aligned. Keyframes and the playhead are positioned as a **percent of
 * the duration** (`time / durationMs`), so the view is resolution-independent
 * and needs no pixel measuring.
 */
@Component({
  selector: 'svge-timeline',
  standalone: true,
  imports: [],
  template: `
    <div class="tl">
      <div class="tl-header">
        <span class="tl-title">Timeline</span>
        <span class="tl-time" aria-label="Playhead and duration">
          {{ playheadLabel() }} / {{ durationLabel() }}
        </span>
      </div>

      @if (rows().length === 0) {
        <div class="tl-empty">No animation on this page yet.</div>
      } @else {
        <div class="tl-body">
          <!-- Left: row labels (ruler corner + node/track labels). -->
          <div class="tl-labels">
            <div class="tl-ruler-corner"></div>
            @for (row of rows(); track row.key) {
              <div
                class="tl-label"
                [class.tl-label--node]="row.kind === 'node'"
                [class.tl-label--track]="row.kind === 'track'"
                [title]="row.label"
              >
                {{ row.label }}
              </div>
            }
          </div>

          <!-- Right: time ruler + lanes + playhead overlay. -->
          <div class="tl-lanes">
            <div class="tl-ruler">
              @for (tick of ticks(); track tick.leftPct) {
                <span class="tl-tick" [style.left.%]="tick.leftPct">{{ tick.label }}</span>
              }
            </div>
            @for (row of rows(); track row.key) {
              <div class="tl-lane" [class.tl-lane--node]="row.kind === 'node'">
                @if (row.kind === 'track') {
                  @for (kf of row.keyframes; track $index) {
                    <span class="tl-kf" [style.left.%]="kf.leftPct" [title]="kf.title"></span>
                  }
                }
              </div>
            }
            <!-- Playhead spans the ruler + every lane. -->
            <div class="tl-playhead" [style.left.%]="playheadPct()" aria-hidden="true"></div>
          </div>
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
      justify-content: space-between;
      padding: 4px 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-title {
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .tl-time {
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
      flex: 0 0 160px;
      width: 160px;
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tl-lanes {
      position: relative;
      flex: 1 1 auto;
      overflow: hidden;
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
      padding: 0 8px;
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
      width: 9px;
      height: 9px;
      transform: translate(-50%, -50%) rotate(45deg);
      background: var(--mat-sys-primary, #1976d2);
      border: 1px solid var(--mat-sys-surface, #fff);
      border-radius: 1px;
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeTimeline {
  private readonly anim = inject(AnimationService);
  private readonly playback = inject(PlaybackService);
  private readonly state = inject(EditorStateService);

  /** The timeline duration (ms), from the active animation. */
  protected readonly durationMs = computed<number>(() => this.anim.durationMs());

  /**
   * Flat, ordered list of rows: each animated node becomes a header row
   * followed by one track row per animated property. Tracks are grouped by
   * `nodeId` (first-appearance order); the node label reuses the same
   * "authored name → `type id`" convention as the Layers Panel.
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
          keyframes: track.keyframes.map((k) => ({
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

  /** Readout of the current playhead time. */
  protected readonly playheadLabel = computed<string>(() =>
    this.formatTime(this.playback.playhead()),
  );

  /** Readout of the total duration. */
  protected readonly durationLabel = computed<string>(() => this.formatTime(this.durationMs()));

  // ── label / formatting helpers ────────────────────────────────────

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

  /** Format milliseconds as seconds with up to 2 decimals (trailing-trimmed). */
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
