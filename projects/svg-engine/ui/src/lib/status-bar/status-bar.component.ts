import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type Signal,
} from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import {
  EditorStateService,
  getNodeBBox,
  getNodesWorldBBox,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
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
} from '@mosaicoo/svg-engine/edit';
import { ViewportService } from '@mosaicoo/svg-engine/render';

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
 * - `zoom` — viewport zoom % as a **dropdown** (D-135): editable input +
 *   preset list (25–400%) + Fit to Screen / Fit Selection / Actual Size
 * - `snap` — snap enabled flag + mode (grid / objects / both) as a dropdown
 * - `isolation` — current isolation breadcrumb when active
 * - `tracing` — D-066e: animated pill while one or more Trace Image
 *   commands are running (`TraceProgressService.running()`). Hidden
 *   when idle so it never takes layout space during normal editing.
 * - `dirty` — document dirty indicator (`●` glyph)
 *
 * Most sections are **passive** (read-only display). The exceptions are the
 * interactive **snap** (D-044/D-073) and **zoom** (D-135) sections, whose
 * dropdowns let the user change snap mode / zoom level directly from the bar
 * — a convenience parallel to the View ▸ Snap / View ▸ Zoom menus. Everything
 * else only reads state; to make another section actionable, wrap it in your
 * own UI or contribute a button via `MenuContributionRegistry`.
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
  imports: [MatDivider, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip],
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
      <!-- D-135: zoom dropdown — parallel surface to the snap one. The
           value pill opens a mat-menu offering THREE ways to set zoom
           (Illustrator / Figma / Affinity convergent UX):
           (1) type a % in the editable input + Enter (free value, clamped
               to the viewport's min/max),
           (2) pick a preset from the list (active one highlighted),
           (3) smart actions — Fit to Screen / Fit Selection / Actual Size,
               which reuse the SAME logic as the View ▸ Zoom submenu
               (D-118/D-119) so the bar shortcut never diverges from the menu.
           Was a passive read-only span pre-D-135. -->
      <button
        #zoomTrigger="matMenuTrigger"
        type="button"
        class="section section-zoom section-toggle"
        matTooltip="Zoom level — click to change"
        [matMenuTriggerFor]="zoomMenu"
        [attr.aria-haspopup]="'menu'"
        (menuOpened)="onZoomMenuOpened()"
      >
        <mat-icon class="icon" aria-hidden="true">zoom_in</mat-icon>
        <span class="value mono">{{ zoomLabel() }}</span>
        <mat-icon class="caret" aria-hidden="true">arrow_drop_down</mat-icon>
      </button>
      <mat-menu #zoomMenu="matMenu" xPosition="before" panelClass="svge-zoom-menu">
        <!-- Editable % input. stopPropagation on keydown (except Enter/Escape)
             keeps the menu's typeahead / arrow-nav from stealing the digits;
             Enter applies + closes, Escape closes (menu handles it). Clicking
             inside a mat-menu panel never closes it, so no click handler is
             needed on the row (and a non-interactive div mustn't carry one). -->
        <div class="svge-zoom-row">
          <input
            type="text"
            inputmode="numeric"
            class="svge-zoom-input"
            [value]="zoomDraft()"
            (input)="zoomDraft.set($any($event.target).value)"
            (keydown)="onZoomInputKeydown($any($event), zoomTrigger)"
            aria-label="Zoom level in percent"
          />
          <span class="svge-zoom-unit" aria-hidden="true">%</span>
          <span class="svge-zoom-hint" aria-hidden="true">↵</span>
        </div>
        <mat-divider />
        @for (p of zoomPresets; track p) {
          <button
            mat-menu-item
            type="button"
            class="svge-zoom-preset"
            [class.active-item]="zoomPercent() === p"
            (click)="setZoomPercent(p)"
            [attr.aria-checked]="zoomPercent() === p"
          >
            <span>{{ p }}%</span>
          </button>
        }
        <mat-divider />
        <button mat-menu-item type="button" (click)="fitToScreen()">
          <mat-icon>fit_screen</mat-icon>
          <span>Fit to Screen</span>
        </button>
        <button mat-menu-item type="button" [disabled]="!hasSelection()" (click)="fitToSelection()">
          <mat-icon>center_focus_strong</mat-icon>
          <span>Fit Selection</span>
        </button>
        <button mat-menu-item type="button" (click)="actualSize()">
          <mat-icon>crop_free</mat-icon>
          <span>Actual Size (100%)</span>
        </button>
      </mat-menu>
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
      <!-- Icons standardized to match the View ▸ Snap submenu in the
           menu bar: Enabled = power_settings_new, Grid only = grid_4x4,
           Objects only = category, Both = apps. The icons stay FIXED
           (no swap-to-check on the active item, mirroring the menu bar);
           the currently-active state is signalled with the .active-item
           class (accent + bold) plus aria-checked for screen readers. -->
      <mat-menu #snapMenu="matMenu" xPosition="before" panelClass="svge-snap-menu">
        <button
          mat-menu-item
          type="button"
          [class.active-item]="!snapEnabled()"
          (click)="setSnap('off')"
          [attr.aria-checked]="!snapEnabled()"
        >
          <mat-icon>power_settings_new</mat-icon>
          <span>Off</span>
        </button>
        <button
          mat-menu-item
          type="button"
          [class.active-item]="snapEnabled() && snapMode() === 'grid'"
          (click)="setSnap('grid')"
          [attr.aria-checked]="snapEnabled() && snapMode() === 'grid'"
        >
          <mat-icon>grid_4x4</mat-icon>
          <span>Grid only</span>
        </button>
        <button
          mat-menu-item
          type="button"
          [class.active-item]="snapEnabled() && snapMode() === 'objects'"
          (click)="setSnap('objects')"
          [attr.aria-checked]="snapEnabled() && snapMode() === 'objects'"
        >
          <mat-icon>category</mat-icon>
          <span>Objects only</span>
        </button>
        <button
          mat-menu-item
          type="button"
          [class.active-item]="snapEnabled() && snapMode() === 'both'"
          (click)="setSnap('both')"
          [attr.aria-checked]="snapEnabled() && snapMode() === 'both'"
        >
          <mat-icon>apps</mat-icon>
          <span>Both</span>
        </button>
        <!-- **D-126** — independent "Snap to Guides" toggle, additive on top
             of the Off/Grid/Objects/Both mode above (mirrors View ▸ Snap ▸
             Snap to Guides). Highlighted when the toggle is on. -->
        <button
          mat-menu-item
          type="button"
          [class.active-item]="snapEnabled() && snapToGuides()"
          (click)="toggleSnapGuides()"
          [attr.aria-checked]="snapEnabled() && snapToGuides()"
          matTooltip="Also snap to your guide lines. Independent toggle layered on top of the active mode — it adds guides, it does not replace Grid / Objects / Both."
          matTooltipPosition="left"
        >
          <mat-icon>straighten</mat-icon>
          <span>Snap to Guides</span>
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
    /* Active snap mode in the dropdown. The mat-menu panel renders in the
       CDK overlay (outside this component's view), so target it via the
       panelClass (svge-snap-menu) with ::ng-deep. Icons are now FIXED
       (menu-bar parity) — the active item is flagged by accent colour +
       bold weight instead of a swap-to-check glyph. */
    ::ng-deep .svge-snap-menu .active-item {
      color: var(--mat-sys-primary, #1976d2);
      font-weight: 600;
    }
    ::ng-deep .svge-snap-menu .active-item .mat-icon,
    ::ng-deep .svge-snap-menu .active-item .mdc-list-item__primary-text {
      color: var(--mat-sys-primary, #1976d2);
    }
    /* D-135: zoom dropdown. The menu panel renders in the CDK overlay; the
       mat-menu \`panelClass\` is NOT reliably applied to the panel in this
       Material build (verified — same for the snap menu), so we DON'T scope by
       it. Instead each rule keys on the unique element class we control
       (\`svge-zoom-*\`), which \`::ng-deep\` emits globally and matches wherever
       the panel mounts. Active preset = accent + bold, mirroring the snap item. */
    ::ng-deep .svge-zoom-preset.active-item,
    ::ng-deep .svge-zoom-preset.active-item .mdc-list-item__primary-text {
      color: var(--mat-sys-primary, #1976d2);
      font-weight: 600;
    }
    ::ng-deep .svge-zoom-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px 10px;
    }
    ::ng-deep .svge-zoom-input {
      width: 72px;
      height: 30px;
      text-align: right;
      font: inherit;
      font-variant-numeric: tabular-nums;
      padding: 0 8px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    ::ng-deep .svge-zoom-input:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -1px;
      border-color: transparent;
    }
    ::ng-deep .svge-zoom-unit {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    ::ng-deep .svge-zoom-hint {
      margin-left: auto;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #999);
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

  // ── Zoom section (D-135 — dropdown: input + presets + fit actions) ─

  // **D-106** — the percent shown is the TRUE on-screen scale (1 doc unit =
  // 1 CSS px at 100%), not the internal `zoom` (which is relative to the
  // content box / "fit"). `displayScale` falls back to `zoom` when the canvas
  // size is unknown (headless), so this stays correct everywhere.
  protected readonly zoomLabel = computed(
    () => `${Math.round(this.viewport.displayScale() * 100)}%`,
  );

  /** Current on-screen scale as an integer percent — drives preset active-state. */
  protected readonly zoomPercent = computed(() => Math.round(this.viewport.displayScale() * 100));

  /** `true` when ≥1 node is selected — gates the "Fit Selection" item. */
  protected readonly hasSelection = computed(() => this.selection.hasSelection());

  /**
   * Market-standard zoom presets (Illustrator / Figma / Affinity). Span
   * thumbnail → pixel-peeping without an overwhelming list; the editable
   * input covers any value in between (clamped to the viewport's limits).
   */
  protected readonly zoomPresets: readonly number[] = [25, 50, 75, 100, 150, 200, 400];

  /**
   * Editable draft for the % input. Re-seeded from the live zoom every time
   * the menu opens (so a typed-but-unapplied value never sticks) and applied
   * on Enter. A string (not number) to allow a transiently-empty field.
   */
  protected readonly zoomDraft = signal('100');

  /** Seed the input with the current zoom, then focus + select it. */
  protected onZoomMenuOpened(): void {
    this.zoomDraft.set(String(this.zoomPercent()));
    // The panel renders in the CDK overlay (outside this view), so the input
    // isn't reachable via a view query — grab it from the document after the
    // panel paints. Best-effort: on failure the user just clicks the field.
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      try {
        // Only the open menu's input is in the DOM (mat-menu content is lazy),
        // so the bare class resolves to the single live field.
        const el = document.querySelector<HTMLInputElement>('input.svge-zoom-input');
        el?.focus();
        el?.select();
      } catch {
        // focus is a nicety, never essential — swallow (e.g. jsdom).
      }
    });
  }

  protected onZoomInputKeydown(event: KeyboardEvent, trigger: MatMenuTrigger): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.applyZoomDraft();
      trigger.closeMenu();
      return;
    }
    // Let the menu handle Escape (it closes the panel); swallow every other
    // key so the menu's typeahead / arrow-nav can't hijack the field's input.
    if (event.key !== 'Escape') event.stopPropagation();
  }

  /**
   * Parse the draft "%" and apply it as a TRUE on-screen scale (D-106): e.g.
   * 100 → real 1:1. The viewport clamps the resulting internal zoom to min/max.
   */
  private applyZoomDraft(): void {
    const pct = Number.parseFloat(this.zoomDraft().trim().replace('%', ''));
    if (Number.isFinite(pct) && pct > 0) this.viewport.setDisplayScale(pct / 100);
  }

  protected setZoomPercent(percent: number): void {
    this.viewport.setDisplayScale(percent / 100);
  }

  /** **Actual Size** — pin the on-screen scale to true 1:1 (100%). */
  protected actualSize(): void {
    this.viewport.actualSize();
  }

  /**
   * **Fit to Screen** — frame all drawn content (active page in pages mode,
   * else the document root). Mirrors `View ▸ Zoom ▸ Fit Canvas` (D-119),
   * including its empty-canvas fallback: frame the page/document viewBox so a
   * blank page still fits the artboard instead of zooming into a point.
   */
  protected fitToScreen(): void {
    const page = this.activePage?.activePage() ?? null;
    const tree: SvgNode = page !== null ? (page as unknown as SvgNode) : this.state.document().root;
    const content = getNodeBBox(tree);
    if (content.width > 0 && content.height > 0) {
      this.viewport.fitBox(content);
      return;
    }
    const frame = this.activePage?.activePageViewBox() ?? this.state.document().viewBox;
    this.viewport.fitBox(frame, 0);
  }

  /**
   * **Fit Selection** — frame the current selection's world bbox. Mirrors
   * `View ▸ Zoom ▸ Fit Selection` (D-118); no-op when nothing is selected
   * (the item is also disabled via `hasSelection`).
   */
  protected fitToSelection(): void {
    const ids = this.selection.selectedIds();
    if (ids.size === 0) return;
    const box = getNodesWorldBBox(this.state.document().root, ids);
    if (box !== null) this.viewport.fitBox(box);
  }

  // ── Snap section ────────────────────────────────────────────────

  protected readonly snapEnabled = computed(() => this.snap.enabled());
  protected readonly snapMode = computed(() => this.snap.mode());
  /** **D-126** — additive snap-to-guides toggle (independent of `mode`). */
  protected readonly snapToGuides = computed(() => this.snap.snapToGuides());

  protected readonly snapLabel = computed(() => {
    if (!this.snap.enabled()) return 'off';
    // Mode values are 'grid' | 'objects' | 'both' per SnapService API; the
    // D-126 guides toggle is additive, appended as "+guides" when on.
    const mode = this.snap.mode();
    return this.snap.snapToGuides() ? `${mode}+guides` : mode;
  });

  protected readonly snapTooltip = computed(() =>
    this.snap.enabled() ? `Snap on (${this.snapLabel()})` : 'Snap off',
  );

  /**
   * **D-126** — flip the additive snap-to-guides toggle from the bar's
   * dropdown. Turning it on also enables snap (saves a 2-step "enable +
   * pick"); it composes with whatever Grid/Objects/Both mode is active.
   */
  protected toggleSnapGuides(): void {
    this.snap.toggleSnapToGuides();
    if (this.snap.snapToGuides() && !this.snap.enabled()) this.snap.setEnabled(true);
  }

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
      // **D-112** — "off" is a HARD reset: also clear the additive
      // snap-to-guides flag. Otherwise a leftover `snapToGuides=true` would let
      // the next `toggleSnapGuides()` silently `setEnabled(true)` (the "I turned
      // Snap off but it still snapped" trap the user hit). After "off", snapping
      // only returns when the user explicitly picks a mode or re-enables guides.
      if (this.snap.snapToGuides()) this.snap.setSnapToGuides(false);
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
