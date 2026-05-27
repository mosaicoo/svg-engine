import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type Signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { EditorStateService } from 'svg-engine/core';
import {
  ActivePageService,
  IsolationService,
  PagesService,
  SelectionService,
  type SnapMode,
  SnapService,
  ToolHostService,
  ToolRegistry,
  TraceProgressService,
  WorkspaceService,
} from 'svg-engine/edit';
import { ViewportService } from 'svg-engine/render';

/**
 * Discrete sections the status bar can show. Each section maps to a
 * single visual segment in the bar; consumers control which sections
 * are visible via the `[sections]` input. Default = all sections on.
 *
 * **Why an array of strings, not individual booleans**: lets consumers
 * also control **order** (the array iteration order is the render
 * order). A future visual refactor can also bind to this for
 * responsive collapsing (hide low-priority sections on narrow viewports).
 */
export const STATUS_BAR_SECTIONS = [
  'tool',
  'page',
  'selection',
  'cursor',
  'zoom',
  'snap',
  'isolation',
  'tracing',
  'dirty',
] as const;
export type StatusBarSection = (typeof STATUS_BAR_SECTIONS)[number];

/**
 * Editor status bar — Fase 6 shell-refinement (D-035). Reads signals
 * from every relevant service and renders a compact horizontal strip
 * with the document/selection/tool/viewport state.
 *
 * **Standalone**: usable inside or outside `<svge-editor>`. Headless
 * consumers who want their own UI can compose just this component for
 * status display while building everything else themselves.
 *
 * **Sections** (toggleable via `[sections]` input):
 *
 * - `tool` — active tool label (e.g., "Select", "Pen", "Rectangle")
 * - `selection` — selected count + focus id (short)
 * - `cursor` — doc-coords of the cursor (from `WorkspaceService.rulerCursor`)
 * - `zoom` — viewport zoom percentage
 * - `snap` — snap enabled flag + mode (grid / objects / both)
 * - `isolation` — current isolation breadcrumb when active
 * - `tracing` — D-066e: animated pill while one or more Trace Image
 *   commands are running (`TraceProgressService.running()`). Hidden
 *   when idle so it never takes layout space during normal editing.
 * - `dirty` — document dirty indicator (`●` glyph)
 *
 * All sections are **passive** — they only read state, never mutate.
 * To act on status (e.g., toggle snap from the bar), wrap in your own
 * UI or contribute a button to the toolbar via `MenuContributionRegistry`.
 *
 * **Headless guarantee**: this component lives in `svg-engine/ui` —
 * the headless entry points (`core`, `render`, `edit`, `io`, `optimize`)
 * remain untouched by its existence. Consumers who never import
 * `svg-engine/ui` never see Material/CDK in their bundle (D-017).
 *
 * Usage:
 * ```html
 * <!-- default: all sections -->
 * <svge-status-bar />
 *
 * <!-- only zoom + selection -->
 * <svge-status-bar [sections]="['selection', 'zoom']" />
 * ```
 */
@Component({
  selector: 'svge-status-bar',
  standalone: true,
  imports: [MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip],
  host: {
    role: 'status',
    'aria-label': 'Editor status bar',
    'aria-live': 'polite',
  },
  template: `
    @if (showSection('tool')) {
      <span class="section section-tool" matTooltip="Active tool">
        <mat-icon class="icon" aria-hidden="true">{{ toolIcon() }}</mat-icon>
        <span class="value">{{ toolLabel() }}</span>
      </span>
    }
    @if (showSection('page') && hasPages()) {
      <!-- **AUDIT FIX U4** — page index/name indicator. After
           PAGES-REFACTOR follow-up #8 moved the pages strip into the
           canvas overlay, the status bar lost any persistent "which
           page" signal. This section closes that gap with a compact
           "Page N/M — Name" pill. Auto-hides when the document has
           zero pages (legacy single-root flow). -->
      <span class="section section-page" [matTooltip]="pageTooltip()">
        <mat-icon class="icon" aria-hidden="true">crop_landscape</mat-icon>
        <span class="value">{{ pageLabel() }}</span>
      </span>
    }
    @if (showSection('selection')) {
      <span class="section section-selection" matTooltip="Selection">
        <mat-icon class="icon" aria-hidden="true">select_all</mat-icon>
        <span class="value">{{ selectionLabel() }}</span>
      </span>
    }
    @if (showSection('cursor')) {
      <span class="section section-cursor" matTooltip="Cursor position (document coordinates)">
        <mat-icon class="icon" aria-hidden="true">my_location</mat-icon>
        <span class="value mono">{{ cursorLabel() }}</span>
      </span>
    }
    @if (showSection('zoom')) {
      <span class="section section-zoom" matTooltip="Zoom level">
        <mat-icon class="icon" aria-hidden="true">zoom_in</mat-icon>
        <span class="value mono">{{ zoomLabel() }}</span>
      </span>
    }
    @if (showSection('snap')) {
      <!-- D-073-fix: dropdown menu exposing all 4 snap states (Off /
           Grid only / Objects only / Both) — parallel surface to the
           View ▸ Snap submenu. Was a binary on/off toggle pre-fix;
           upgraded so users can pick the snap MODE from the bar
           without opening the menu bar. Active state shown via the
           pill label and via a checkmark in the dropdown.
           Photoshop / Illustrator / Affinity all expose mode in their
           status bar equivalent — convergent UX. -->
      <button
        type="button"
        class="section section-snap section-toggle"
        [class.is-off]="!snapEnabled()"
        [matTooltip]="snapTooltip() + ' — click to change'"
        [matMenuTriggerFor]="snapMenu"
        [attr.aria-haspopup]="'menu'"
        [attr.aria-pressed]="snapEnabled()"
      >
        <mat-icon class="icon" [class.muted]="!snapEnabled()" aria-hidden="true">grid_3x3</mat-icon>
        <span class="value">{{ snapLabel() }}</span>
        <mat-icon class="caret" aria-hidden="true">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #snapMenu="matMenu" xPosition="before">
        <button
          mat-menu-item
          type="button"
          (click)="setSnap('off')"
          [attr.aria-checked]="!snapEnabled()"
        >
          <mat-icon>{{ !snapEnabled() ? 'check' : 'remove' }}</mat-icon>
          <span>Off</span>
        </button>
        <button
          mat-menu-item
          type="button"
          (click)="setSnap('grid')"
          [attr.aria-checked]="snapEnabled() && snapMode() === 'grid'"
        >
          <mat-icon>{{ snapEnabled() && snapMode() === 'grid' ? 'check' : 'grid_4x4' }}</mat-icon>
          <span>Grid only</span>
        </button>
        <button
          mat-menu-item
          type="button"
          (click)="setSnap('objects')"
          [attr.aria-checked]="snapEnabled() && snapMode() === 'objects'"
        >
          <mat-icon>{{
            snapEnabled() && snapMode() === 'objects' ? 'check' : 'category'
          }}</mat-icon>
          <span>Objects only</span>
        </button>
        <button
          mat-menu-item
          type="button"
          (click)="setSnap('both')"
          [attr.aria-checked]="snapEnabled() && snapMode() === 'both'"
        >
          <mat-icon>{{ snapEnabled() && snapMode() === 'both' ? 'check' : 'apps' }}</mat-icon>
          <span>Both</span>
        </button>
      </mat-menu>
    }
    @if (showSection('isolation') && isolationActive()) {
      <span class="section section-isolation" matTooltip="Isolation mode active">
        <mat-icon class="icon" aria-hidden="true">filter_center_focus</mat-icon>
        <span class="value">{{ isolationLabel() }}</span>
      </span>
    }
    @if (showSection('tracing') && isTracing()) {
      <span
        class="section section-tracing"
        role="status"
        aria-live="polite"
        [matTooltip]="tracingTooltip()"
      >
        <mat-icon class="icon spin" aria-hidden="true">progress_activity</mat-icon>
        <span class="value">{{ tracingLabel() }}</span>
      </span>
    }
    @if (showSection('dirty') && isDirty()) {
      <span class="section section-dirty" matTooltip="Unsaved changes" aria-label="Unsaved changes">
        <span class="dirty-dot" aria-hidden="true">●</span>
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0;
      font-size: 12px;
      line-height: 1;
      color: var(--mat-sys-on-surface, inherit);
      background: var(--mat-sys-surface-container, transparent);
      padding: 0 0.5rem;
      min-height: 28px;
      user-select: none;
    }
    .section {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 0.6rem;
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      height: 100%;
    }
    .section:last-child {
      border-right: none;
    }
    .icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      opacity: 0.65;
    }
    .icon.muted {
      opacity: 0.35;
    }
    .value {
      white-space: nowrap;
    }
    .mono {
      font-variant-numeric: tabular-nums;
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, Menlo, monospace;
      font-size: 11px;
    }
    .dirty-dot {
      color: var(--mat-sys-tertiary, #ff6f00);
      font-size: 12px;
      line-height: 1;
    }
    /* D-066e: Tracing pill — accented background + spinning icon so the
       user sees clearly that a background task is in flight. Auto-hides
       when idle (the @if wraps the whole section), so the rule below
       only applies during active traces. */
    .section-tracing {
      background: var(--mat-sys-secondary-container, rgba(25, 118, 210, 0.08));
      color: var(--mat-sys-on-secondary-container, inherit);
      border-radius: 999px;
      padding-left: 0.5rem;
      padding-right: 0.6rem;
      margin: 0 0.25rem;
      border-right-color: transparent;
    }
    .section-tracing .icon {
      opacity: 1;
      color: var(--mat-sys-primary, #1976d2);
    }
    .icon.spin {
      animation: svge-status-spin 1s linear infinite;
      transform-origin: 50% 50%;
    }
    @keyframes svge-status-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .icon.spin {
        animation: none;
      }
    }
    /* D-044: snap section as a button. Reset native button styles so it
       blends with the surrounding info-bar look + add hover/active
       affordances since this section is interactive (others are display
       only). */
    button.section-toggle {
      background: transparent;
      border: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      user-select: none;
    }
    button.section-toggle:hover {
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
    }
    button.section-toggle.is-off {
      opacity: 0.7;
    }
    button.section-toggle:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
    }
    /* D-073-fix: caret hint next to the snap value, signalling the
       dropdown affordance. Smaller than the leading icon so it reads
       as decoration, not a primary glyph. */
    button.section-toggle .caret {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-left: -2px;
      opacity: 0.6;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeStatusBar {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly viewport = inject(ViewportService);
  private readonly ws = inject(WorkspaceService);
  private readonly toolHost = inject(ToolHostService);
  private readonly tools = inject(ToolRegistry);
  private readonly snap = inject(SnapService);
  private readonly isolation = inject(IsolationService);
  private readonly traceProgress = inject(TraceProgressService);
  // **AUDIT FIX U4** — pages indicator data sources. Optional inject
  // so headless consumers that don't provide pages services in scope
  // (raw `<svge-renderer>` users) still get a working status bar —
  // the page section just auto-hides via the `hasPages()` guard.
  private readonly pagesService = inject(PagesService, { optional: true });
  private readonly activePage = inject(ActivePageService, { optional: true });

  /**
   * Which sections to render. Order in the array = render order.
   * Default = all sections, in the canonical order from {@link STATUS_BAR_SECTIONS}.
   */
  readonly sections = input<readonly StatusBarSection[]>(STATUS_BAR_SECTIONS);

  /**
   * Memoize the section set so the per-section `showSection()` check
   * doesn't re-allocate every render. Recomputes only when the input
   * array changes.
   */
  private readonly sectionSet: Signal<Set<StatusBarSection>> = computed(
    () => new Set(this.sections()),
  );

  protected showSection(section: StatusBarSection): boolean {
    return this.sectionSet().has(section);
  }

  // ── Tool section ────────────────────────────────────────────────

  protected readonly toolLabel = computed(() => {
    const id = this.toolHost.activeId();
    if (id === null) return '—';
    return this.tools.get(id)?.label ?? id;
  });

  protected readonly toolIcon = computed(() => {
    const id = this.toolHost.activeId();
    if (id === null) return 'help_outline';
    return this.tools.get(id)?.icon ?? 'build';
  });

  // ── Page section (AUDIT FIX U4) ─────────────────────────────────

  /**
   * `true` when there is at least one D-079 page in the document.
   * Used by the template `@if` to auto-hide the section on legacy
   * single-root docs (parity with the pages-panel's own auto-hide).
   */
  protected readonly hasPages = computed(() => this.pagesService?.hasPages() ?? false);

  /**
   * Compact "Page N/M — Name" label. N is 1-based for human readability;
   * Name is truncated to 24 chars to keep the section narrow. Falls
   * back to "— · ?" when the active page id is stale (shouldn't happen
   * but defensive).
   */
  protected readonly pageLabel = computed(() => {
    const pages = this.pagesService?.pages() ?? [];
    if (pages.length === 0) return '—';
    const activeId = this.activePage?.activePageId() ?? null;
    const idx = activeId !== null ? pages.findIndex((p) => p.id === activeId) : -1;
    const total = pages.length;
    if (idx < 0) return `?/${total}`;
    const name = this.pagesService?.nameOf(pages[idx]!.id) ?? '';
    const shortName = name.length > 24 ? `${name.slice(0, 23)}…` : name;
    return `${idx + 1}/${total}${shortName ? ` · ${shortName}` : ''}`;
  });

  protected readonly pageTooltip = computed(() => {
    const total = this.pagesService?.count() ?? 0;
    return `Active page (${total} in document)`;
  });

  // ── Selection section ───────────────────────────────────────────

  protected readonly selectionLabel = computed(() => {
    const n = this.selection.count();
    if (n === 0) return 'none';
    if (n === 1) {
      const focus = this.selection.focusId();
      // Show short id (first 8 chars) — full UUID is noise in the bar.
      return focus !== null ? `1 · ${focus.slice(0, 8)}` : '1';
    }
    return `${n} selected`;
  });

  // ── Cursor section ──────────────────────────────────────────────

  protected readonly cursorLabel = computed(() => {
    const cursor = this.ws.rulerCursor();
    if (cursor === null) return '—';
    // 1-decimal precision keeps the section narrow even at high zoom.
    return `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}`;
  });

  // ── Zoom section ────────────────────────────────────────────────

  protected readonly zoomLabel = computed(() => `${Math.round(this.viewport.zoom() * 100)}%`);

  // ── Snap section ────────────────────────────────────────────────

  protected readonly snapEnabled = computed(() => this.snap.enabled());
  protected readonly snapMode = computed(() => this.snap.mode());

  protected readonly snapLabel = computed(() => {
    if (!this.snap.enabled()) return 'off';
    const mode = this.snap.mode();
    // Mode values are 'grid' | 'objects' | 'both' per SnapService API.
    return mode;
  });

  protected readonly snapTooltip = computed(() =>
    this.snap.enabled() ? `Snap on (${this.snap.mode()})` : 'Snap off',
  );

  /**
   * **D-073-fix**: pick snap state from the bar's dropdown.
   *
   * Four values mapped:
   * - `'off'` → `setEnabled(false)` (mode preserved for next on)
   * - `'grid' | 'objects' | 'both'` → `setMode(...)` + `setEnabled(true)`
   *   (selecting a mode auto-enables — saves the user from a 2-click
   *   "enable + pick mode" sequence; matches Photoshop convention).
   *
   * Replaces the pre-fix `toggleSnap()` which only flipped enabled —
   * the same dropdown now serves as both on/off AND mode picker.
   */
  protected setSnap(target: SnapMode | 'off'): void {
    if (target === 'off') {
      if (this.snap.enabled()) this.snap.setEnabled(false);
      return;
    }
    if (this.snap.mode() !== target) this.snap.setMode(target);
    if (!this.snap.enabled()) this.snap.setEnabled(true);
  }

  // ── Isolation section ───────────────────────────────────────────

  protected readonly isolationActive = computed(() => this.isolation.isActive());

  /**
   * Compact isolation indicator — depth + short id of the focused group.
   * The full breadcrumb path belongs in `<svge-isolation-breadcrumb>`;
   * this section just signals "isolation is on, level N, focused on X".
   */
  protected readonly isolationLabel = computed(() => {
    const path = this.isolation.breadcrumbPath();
    if (path.length === 0) return 'isolated';
    const depth = path.length - 1; // root counts as depth 0
    const focusId = path[path.length - 1];
    return focusId !== undefined ? `L${depth} · ${focusId.slice(0, 6)}` : `L${depth}`;
  });

  // ── Tracing section (D-066e) ────────────────────────────────────

  /**
   * Reflects {@link TraceProgressService.running} — `true` while one or
   * more Trace Image commands are in flight. Drives the conditional
   * render of the tracing pill so the section is invisible when idle
   * (no layout shift, no animated icon stealing attention).
   */
  protected readonly isTracing = computed(() => this.traceProgress.running());

  /**
   * Pluralized label so a parallel multi-trace scenario stays readable.
   * The current trigger paths (menu + Ctrl+Alt+T) start one at a time
   * but plugins could fire concurrent traces, so we already support it.
   */
  protected readonly tracingLabel = computed(() => {
    const n = this.traceProgress.count();
    return n <= 1 ? 'Tracing…' : `Tracing ${n}…`;
  });

  protected readonly tracingTooltip = computed(() => {
    const n = this.traceProgress.count();
    return n <= 1 ? 'Converting image to vector paths' : `Converting ${n} images to vector paths`;
  });

  // ── Dirty section ───────────────────────────────────────────────

  protected readonly isDirty = computed(() => this.state.dirty());
}
