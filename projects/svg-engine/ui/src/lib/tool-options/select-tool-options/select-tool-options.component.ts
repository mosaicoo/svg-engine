import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  BatchConvertToPathCommand,
  CommandBus,
  ConvertNodeToPathCommand,
  DivideCommand,
  EditorStateService,
  ExcludeCommand,
  type FlipAxis,
  findNodeById,
  FlipNodeCommand,
  IntersectCommand,
  type NodeId,
  type Point,
  SubtractCommand,
  UnionCommand,
} from 'svg-engine/core';
import {
  ActivePageService,
  type AlignAxis,
  AlignmentService,
  type DistributeAxis,
  getRenderedNodeBBox,
  KeyObjectService,
  LayersService,
  type NodeBBox,
  resolveAlignReference,
  SelectionService,
} from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-SELECT-ACTIONS** — options bar for the Select (V) tool.
 *
 * Surfaces the manipulation actions most used while moving / arranging
 * shapes, grouped by subject and rendered **icon-only** (no group
 * labels — the icons + tooltips identify each function and the bar
 * stays compact):
 *
 * - **Align** — 6 ops (left/center-h/right + top/center-v/bottom).
 * - **Distribute** — 2 ops (horizontal / vertical centers).
 * - **Flip** — horizontal / vertical (mirror around each shape centre).
 * - **Pathfinder** — Union / Intersect / Subtract / Divide / Exclude.
 * - **Convert** — Convert to Path (batch).
 *
 * **Snap is intentionally NOT here**: the status bar already owns the
 * snap mode control (kept as the single source for snap UI), so
 * duplicating it in the Select options bar would be redundant.
 *
 * **Icon + handler parity with the menu bar**: every icon here is the
 * exact Material symbol the corresponding `menu.object` contribution
 * uses (`align_horizontal_left`, `join_inner`, `flip`, …), and every
 * action dispatches the SAME command / service call as the menu and
 * the Inspector — single source of truth for behaviour, just a faster
 * surface. Group dividers (`.opt-divider`) separate subjects visually.
 *
 * **Enablement** mirrors the menu's disabled factories so the bar
 * shows constraints up-front instead of failing silently:
 * - Align needs ≥ 2 selected; Distribute needs ≥ 3.
 * - Flip / Pathfinder / Convert need ≥ 1 (Pathfinder ≥ 2).
 *
 * **Headless boundary**: lives in `svg-engine/ui` (Material-bound).
 * BBox lookups read the rendered DOM exactly like the menu's
 * `dispatchFlip` / align helpers — the alignment math itself stays in
 * the pure `AlignmentService`.
 */
@Component({
  selector: 'svge-select-tool-options',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <!-- Align — 6 ops. Disabled until ≥ 2 nodes selected. -->
    <span class="opt-group" role="group" aria-label="Align">
      <button
        type="button"
        class="opt-action"
        [disabled]="!canAlign()"
        matTooltip="Align left"
        aria-label="Align left"
        (click)="align('left')"
      >
        <mat-icon>align_horizontal_left</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canAlign()"
        matTooltip="Align center (horizontal)"
        aria-label="Align center horizontal"
        (click)="align('center-x')"
      >
        <mat-icon>align_horizontal_center</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canAlign()"
        matTooltip="Align right"
        aria-label="Align right"
        (click)="align('right')"
      >
        <mat-icon>align_horizontal_right</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canAlign()"
        matTooltip="Align top"
        aria-label="Align top"
        (click)="align('top')"
      >
        <mat-icon>align_vertical_top</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canAlign()"
        matTooltip="Align center (vertical)"
        aria-label="Align center vertical"
        (click)="align('center-y')"
      >
        <mat-icon>align_vertical_center</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canAlign()"
        matTooltip="Align bottom"
        aria-label="Align bottom"
        (click)="align('bottom')"
      >
        <mat-icon>align_vertical_bottom</mat-icon>
      </button>
    </span>

    <span class="opt-divider" aria-hidden="true">|</span>

    <!-- Distribute — 2 ops. Disabled until ≥ 3 nodes selected. -->
    <span class="opt-group" role="group" aria-label="Distribute">
      <button
        type="button"
        class="opt-action"
        [disabled]="!canDistribute()"
        matTooltip="Distribute horizontally"
        aria-label="Distribute horizontally"
        (click)="distribute('horizontal')"
      >
        <mat-icon>horizontal_distribute</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canDistribute()"
        matTooltip="Distribute vertically"
        aria-label="Distribute vertically"
        (click)="distribute('vertical')"
      >
        <mat-icon>vertical_distribute</mat-icon>
      </button>
    </span>

    <span class="opt-divider" aria-hidden="true">|</span>

    <!-- Flip — H / V. Disabled until ≥ 1 node selected. -->
    <span class="opt-group" role="group" aria-label="Flip">
      <button
        type="button"
        class="opt-action"
        [disabled]="!hasSelection()"
        matTooltip="Flip horizontal"
        aria-label="Flip horizontal"
        (click)="flip('horizontal')"
      >
        <mat-icon>flip</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action flip-v"
        [disabled]="!hasSelection()"
        matTooltip="Flip vertical"
        aria-label="Flip vertical"
        (click)="flip('vertical')"
      >
        <mat-icon>flip</mat-icon>
      </button>
    </span>

    <span class="opt-divider" aria-hidden="true">|</span>

    <!-- Pathfinder — 5 boolean ops. Disabled until ≥ 2 nodes selected. -->
    <span class="opt-group" role="group" aria-label="Pathfinder">
      <button
        type="button"
        class="opt-action"
        [disabled]="!canPathfinder()"
        matTooltip="Union (merge overlapping shapes)"
        aria-label="Pathfinder union"
        (click)="pathfinder('union')"
      >
        <mat-icon>join_inner</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canPathfinder()"
        matTooltip="Intersect (keep overlap)"
        aria-label="Pathfinder intersect"
        (click)="pathfinder('intersect')"
      >
        <mat-icon>join_full</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canPathfinder()"
        matTooltip="Subtract (remove others from first)"
        aria-label="Pathfinder subtract"
        (click)="pathfinder('subtract')"
      >
        <mat-icon>join_left</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canPathfinder()"
        matTooltip="Divide (split into regions)"
        aria-label="Pathfinder divide"
        (click)="pathfinder('divide')"
      >
        <mat-icon>call_split</mat-icon>
      </button>
      <button
        type="button"
        class="opt-action"
        [disabled]="!canPathfinder()"
        matTooltip="Exclude (symmetric difference)"
        aria-label="Pathfinder exclude"
        (click)="pathfinder('exclude')"
      >
        <mat-icon>join_right</mat-icon>
      </button>
    </span>

    <span class="opt-divider" aria-hidden="true">|</span>

    <!-- Convert to Path — batch. Disabled until ≥ 1 convertible node. -->
    <span class="opt-group" role="group" aria-label="Convert">
      <button
        type="button"
        class="opt-action"
        [disabled]="!canConvertToPath()"
        matTooltip="Convert to Path"
        aria-label="Convert to path"
        (click)="convertToPath()"
      >
        <mat-icon>polyline</mat-icon>
      </button>
    </span>

    <span class="opt-spacer"></span>
  `,
  // Single concatenated string (NOT an array) — the AOT static
  // evaluator resolves an imported const interpolated into a template
  // literal, but the array form `[CONST, '...']` fails to resolve here.
  // Matches the `styles: TOOL_OPT_SHARED_STYLES` shape every other
  // tool-option component uses.
  styles: `
    ${TOOL_OPT_SHARED_STYLES}
    /* Flip Vertical reuses the single flip glyph (the menu bar uses the
       same icon for both axes); rotate 90deg so the mirror axis reads as
       vertical, distinguishing it from Flip Horizontal. */
    .flip-v mat-icon {
      transform: rotate(90deg);
    }
    .opt-action:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .opt-action:disabled:hover {
      background: transparent;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeSelectToolOptions {
  private readonly selection = inject(SelectionService);
  private readonly layers = inject(LayersService);
  private readonly alignment = inject(AlignmentService);
  private readonly state = inject(EditorStateService);
  private readonly activePage = inject(ActivePageService);
  // D-094 — "Align to Key Object" state, honored via resolveAlignReference.
  private readonly keyObject = inject(KeyObjectService);
  private readonly bus = inject(CommandBus);

  /** Convertible leaf types — same set the Inspector + Pathfinder use. */
  private static readonly CONVERTIBLE = new Set(['rect', 'ellipse', 'line', 'polygon', 'polyline']);

  // ── Enablement (mirrors menu disabled factories) ─────────────────

  protected readonly hasSelection = computed(() => this.selection.selectedIds().size >= 1);
  // Align is enabled with ≥ 1 node: a single node aligns to the active
  // page; ≥ 2 align relative to the selection. (Distribute/Pathfinder
  // still need ≥ 3 / ≥ 2.)
  protected readonly canAlign = computed(() => this.selection.selectedIds().size >= 1);
  protected readonly canDistribute = computed(() => this.selection.selectedIds().size >= 3);
  protected readonly canPathfinder = computed(() => this.selection.selectedIds().size >= 2);
  protected readonly canConvertToPath = computed(() => this.convertibleIds().length > 0);

  /** Selected, unlocked, convertible node ids (Convert to Path targets). */
  private readonly convertibleIds = computed<readonly NodeId[]>(() => {
    const root = this.state.document().root;
    const out: NodeId[] = [];
    for (const id of this.selection.selectedIds()) {
      if (this.layers.isLocked(id)) continue;
      const node = findNodeById(root, id);
      if (node !== null && SvgeSelectToolOptions.CONVERTIBLE.has(node.type)) {
        out.push(id);
      }
    }
    return out;
  });

  // ── Align / Distribute (delegates to AlignmentService) ───────────

  protected align(axis: AlignAxis): void {
    const items = this.collectSelectedBBoxes();
    if (items.length === 0) return;
    // D-094 — centralized reference resolution (key object ▸ page ▸ union),
    // identical to the menu + Inspector path.
    const page = this.activePage.activePageViewBox() ?? this.state.document().viewBox;
    const reference = resolveAlignReference(items, this.keyObject.keyObjectId(), page);
    if (reference !== null) {
      this.alignment.alignToReference(items, axis, reference);
    } else {
      this.alignment.align(items, axis);
    }
  }

  protected distribute(axis: DistributeAxis): void {
    const items = this.collectSelectedBBoxes();
    if (items.length < 3) return;
    this.alignment.distribute(items, axis);
  }

  /**
   * Resolve `NodeBBox` pairs from the rendered DOM for every selected
   * id. Same approach as the Inspector + the menu's align/distribute
   * helpers (the alignment math needs rendered geometry, which lives
   * in the DOM, not the model). Skips ids without a rendered bbox.
   */
  private collectSelectedBBoxes(): readonly NodeBBox[] {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return [];
    const out: NodeBBox[] = [];
    for (const id of this.selection.selectedIds()) {
      const bbox = getRenderedNodeBBox(svg, id);
      if (bbox === null) continue;
      out.push({ id, bbox });
    }
    return out;
  }

  // ── Flip (one FlipNodeCommand per node, pivot = own bbox centre) ──

  protected flip(axis: FlipAxis): void {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return;
    for (const id of this.selection.selectedIds()) {
      if (this.layers.isLocked(id)) continue;
      const bbox = getRenderedNodeBBox(svg, id);
      if (bbox === null) continue;
      const pivot: Point = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
      this.bus.dispatch(new FlipNodeCommand(id, axis, pivot));
    }
  }

  // ── Pathfinder (auto-convert leaves, then boolean op) ────────────

  protected pathfinder(op: 'union' | 'intersect' | 'subtract' | 'divide' | 'exclude'): void {
    const ids = Array.from(this.selection.selectedIds()) as NodeId[];
    if (ids.length < 2) return;
    const root = this.state.document().root;
    // Auto-upgrade rect/ellipse/line/polygon/polyline to paths first —
    // matches the menu's dispatchPathfinder behaviour exactly.
    for (const id of ids) {
      const node = findNodeById(root, id);
      if (node !== null && SvgeSelectToolOptions.CONVERTIBLE.has(node.type)) {
        this.bus.dispatch(new ConvertNodeToPathCommand(id));
      }
    }
    const Ctor = PATHFINDER_CTORS[op];
    this.bus.dispatch(new Ctor(ids));
    // Operand A keeps its id; re-select for visual confirmation.
    this.selection.select(ids[0]!);
  }

  // ── Convert to Path (batch, single undo) ─────────────────────────

  protected convertToPath(): void {
    const ids = this.convertibleIds();
    if (ids.length === 0) return;
    this.bus.dispatch(new BatchConvertToPathCommand([...ids]));
  }
}

/** Boolean-op constructor lookup — mirrors the menu's Ctor mapping. */
const PATHFINDER_CTORS = {
  union: UnionCommand,
  intersect: IntersectCommand,
  subtract: SubtractCommand,
  divide: DivideCommand,
  exclude: ExcludeCommand,
} as const;
