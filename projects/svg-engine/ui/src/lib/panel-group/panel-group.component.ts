import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  Directive,
  effect,
  inject,
  input,
  output,
  signal,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * **D-081 — TabSide refactor.** Position of the tab strip relative
 * to the panel body. Replaces the legacy `'horizontal' | 'vertical'`
 * orientation input with a 4-way choice the user can change at
 * runtime via the picker in the header.
 *
 * - `'top'` — strip across the top, body below (Illustrator default).
 * - `'bottom'` — strip across the bottom, body above (browser-tabs-like).
 * - `'left'` — thin column on the left, body right of it
 *   (Photoshop / Affinity / our libraries-panel convention).
 * - `'right'` — thin column on the right, body left of it (mirror of
 *   left — preferred when the panel-group docks against the right
 *   edge of the screen so the tabs face the canvas, not the wall).
 *
 * **Icon-only invariant**: when the side is `'left'` or `'right'`,
 * the strip ALWAYS renders icon-only regardless of the `compact`
 * input (per user spec: lateral tabs match the libraries-panel
 * style). Top/bottom respect the `compact` input.
 */
export type SvgePanelGroupTabSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * **D-081 — persistence key prefix.** Each panel-group with a
 * `groupId` input writes its user-chosen tab side here under
 * `<prefix>-<groupId>`. Reads on construction so a reload restores
 * the layout the user picked.
 */
const TAB_SIDE_STORAGE_PREFIX = 'svge-panel-group-tabside';

/**
 * `[svgePanelGroupTab]` — projection slot for **one tab** inside a
 * `<svge-panel-group>`. Used as a structural directive so the body
 * template is created lazily (only when the tab is active), keeping
 * tab switching cheap regardless of how heavy the panel content is.
 *
 * Required input `id`: stable identifier (used by the panel-group
 * header and by external consumers to set the active tab). Optional
 * `label` (displayed in the tab header — defaults to `id`) and
 * `icon` (Material symbol name — shown left of the label when set).
 *
 * Example:
 * ```html
 * <svge-panel-group>
 *   <ng-template svgePanelGroupTab id="layers" label="Layers" icon="layers">
 *     <svge-layers-panel />
 *   </ng-template>
 *   <ng-template svgePanelGroupTab id="symbols" label="Symbols" icon="star_outline">
 *     <svge-symbols-panel />
 *   </ng-template>
 * </svge-panel-group>
 * ```
 *
 * **Why a directive instead of a sub-component**: structural directives
 * (`*svgePanelGroupTab` / `<ng-template svgePanelGroupTab>`) give us
 * the lazy template instantiation we need without forcing each tab to
 * be a standalone component. The host can keep using arbitrary
 * children (other components, inline markup, conditionals) inside
 * each tab body.
 */
@Directive({
  selector: '[svgePanelGroupTab]',
  standalone: true,
})
export class SvgePanelGroupTab {
  /** Stable tab identifier — must be unique within the panel-group. */
  readonly id = input.required<string>({ alias: 'svgePanelGroupTabId' });

  /** Human-readable header label. Falls back to `id`. */
  readonly label = input<string | null>(null);

  /** Material icon name shown to the left of the label. Optional. */
  readonly icon = input<string | null>(null);

  /** Tooltip text shown on hover of the tab button. Optional. */
  readonly tooltip = input<string | null>(null);

  // Public reference to the template so the parent panel-group can
  // render it via <ng-template [ngTemplateOutlet]="...">.
  readonly templateRef = inject(TemplateRef<unknown>);
}

/**
 * `<svge-panel-group>` — Illustrator / Affinity-style **panel group**:
 * a single dock zone with one or more tabs in the header; only the
 * active tab's body is rendered.
 *
 * **Why panel-groups** (D-061): the prior layout stacked Layers +
 * Inspector + Effects vertically in the same right rail and each
 * panel competed for height, forcing infinite scroll. Industry
 * practice (Illustrator / Affinity Designer / Inkscape) docks
 * related panels into the same area with a tiny tab strip — the
 * user sees one at a time and switches with a click. Layers and
 * Pages live together; Properties and Transform live together;
 * Effects and Swatches live together. The structure scales as new
 * panels arrive (Pages, Symbols, Variables) without reflowing the
 * whole shell.
 *
 * **Tabs API**: pass children with `[svgePanelGroupTab]` directive.
 * The panel-group reads them via `contentChildren`, builds the tab
 * strip, and renders only the active body.
 *
 * **Tab strip visibility**: when there's exactly one tab the strip
 * hides itself (just the title is shown in the header) — this avoids
 * visual noise when a group hasn't been populated with multiple
 * panels yet but still keeps the structure ready for growth.
 *
 * **Title**: optional input that appears at the top of the panel
 * group. When the strip is visible the title sits to the LEFT of the
 * tabs; when the strip is hidden the title acts as the header.
 *
 * **Active tab control**: two modes —
 * 1. **Uncontrolled** (default): the panel-group manages `activeTabId`
 *    internally as a signal. Initial tab is the first declared.
 * 2. **Controlled**: pass `[activeTab]` + listen to `(activeTabChange)`
 *    if the parent needs to persist the selection (e.g. last-open
 *    tab survives navigation).
 *
 * **Accessibility**: `role="tablist"` on the strip, `role="tab"` on
 * each button with `aria-selected`, and the body wrapper gets
 * `role="tabpanel"` with `aria-labelledby` pointing at the active
 * tab button.
 *
 * **Headless boundary**: lives in `svg-engine/ui` and uses `MatIcon`
 * (optional, only when a tab has `icon`). No `MatTabGroup` dependency
 * — that component is heavyweight (animations, scroll, lazy-load
 * machinery) and we want a tight dock-style strip.
 */
@Component({
  selector: 'svge-panel-group',
  standalone: true,
  imports: [NgTemplateOutlet, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip],
  template: `
    @if (tabs().length > 0) {
      <!--
        **D-081** — Single layout for all 4 sides. CSS Grid + named
        areas swap the relative position of the tab strip and the
        body based on \`effectiveSide()\`. The picker (when a
        \`groupId\` is set or the user hasn't overridden tabSide
        explicitly) sits in the body header next to the title; if
        there's no body header (no title), it sits as a floating
        chip in the corner closest to the tabs.
      -->
      <div
        class="pg-container"
        [class.pg-container--top]="effectiveSide() === 'top'"
        [class.pg-container--right]="effectiveSide() === 'right'"
        [class.pg-container--bottom]="effectiveSide() === 'bottom'"
        [class.pg-container--left]="effectiveSide() === 'left'"
        [class.pg-container--icon-only]="iconOnly()"
      >
        @if (tabs().length > 1) {
          <div
            class="pg-tabs"
            [class.pg-tabs--horizontal]="isHorizontal()"
            [class.pg-tabs--vertical]="!isHorizontal()"
            role="tablist"
            [attr.aria-orientation]="isHorizontal() ? 'horizontal' : 'vertical'"
            [attr.aria-label]="title() ?? 'Panels'"
          >
            @for (tab of tabs(); track tab.id()) {
              <button
                type="button"
                class="pg-tab"
                [class.pg-tab--horizontal]="isHorizontal()"
                [class.pg-tab--vertical]="!isHorizontal()"
                [class.pg-tab--compact]="iconOnly() && tab.icon()"
                role="tab"
                [class.pg-tab--active]="tab.id() === resolvedActiveId()"
                [attr.aria-selected]="tab.id() === resolvedActiveId()"
                [attr.aria-controls]="bodyId()"
                [id]="tabButtonId(tab.id())"
                [matTooltip]="tab.tooltip() ?? tab.label() ?? tab.id()"
                [matTooltipPosition]="tooltipPosition()"
                [title]="tab.tooltip() ?? tab.label() ?? tab.id()"
                (click)="selectTab(tab.id())"
              >
                @if (tab.icon()) {
                  <mat-icon class="pg-tab-icon">{{ tab.icon() }}</mat-icon>
                }
                @if (!iconOnly() || !tab.icon()) {
                  <span class="pg-tab-label">{{ tab.label() ?? tab.id() }}</span>
                }
              </button>
            }
          </div>
        }
        <div class="pg-body-wrapper">
          @if (title() || showSidePicker()) {
            <!--
              Header strip sitting above the body — shows the title
              (or active-tab label when on a lateral side) on the
              left and the side picker on the right. Always present
              when EITHER is needed; the picker alone shows when
              there's no title (chip-style header).
            -->
            <header class="pg-header" [class.pg-header--titled]="!!title()">
              @if (title()) {
                <h3 class="pg-title">
                  {{ !isHorizontal() ? (activeTabLabel() ?? title()) : title() }}
                </h3>
              }
              @if (showSidePicker()) {
                <button
                  type="button"
                  class="pg-side-picker-btn"
                  [matMenuTriggerFor]="sideMenu"
                  [matTooltip]="'Move tabs (currently: ' + effectiveSide() + ')'"
                  aria-label="Move panel tabs"
                  [attr.aria-haspopup]="'menu'"
                >
                  <mat-icon>{{ sideIcon() }}</mat-icon>
                </button>
                <mat-menu #sideMenu="matMenu" xPosition="before">
                  <button
                    mat-menu-item
                    type="button"
                    (click)="setUserTabSide('top')"
                    [attr.aria-checked]="effectiveSide() === 'top'"
                  >
                    <mat-icon>{{ effectiveSide() === 'top' ? 'check' : 'border_top' }}</mat-icon>
                    <span>Tabs on top</span>
                  </button>
                  <button
                    mat-menu-item
                    type="button"
                    (click)="setUserTabSide('right')"
                    [attr.aria-checked]="effectiveSide() === 'right'"
                  >
                    <mat-icon>{{
                      effectiveSide() === 'right' ? 'check' : 'border_right'
                    }}</mat-icon>
                    <span>Tabs on right</span>
                  </button>
                  <button
                    mat-menu-item
                    type="button"
                    (click)="setUserTabSide('bottom')"
                    [attr.aria-checked]="effectiveSide() === 'bottom'"
                  >
                    <mat-icon>{{
                      effectiveSide() === 'bottom' ? 'check' : 'border_bottom'
                    }}</mat-icon>
                    <span>Tabs on bottom</span>
                  </button>
                  <button
                    mat-menu-item
                    type="button"
                    (click)="setUserTabSide('left')"
                    [attr.aria-checked]="effectiveSide() === 'left'"
                  >
                    <mat-icon>{{ effectiveSide() === 'left' ? 'check' : 'border_left' }}</mat-icon>
                    <span>Tabs on left</span>
                  </button>
                </mat-menu>
              }
            </header>
          }
          <div
            class="pg-body"
            role="tabpanel"
            [id]="bodyId()"
            [attr.aria-labelledby]="tabButtonId(resolvedActiveId())"
          >
            @if (activeTemplate(); as tpl) {
              <ng-container [ngTemplateOutlet]="tpl" />
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--mat-sys-surface, transparent);
      /* DBLCLICK-FIX: tabs/title são chrome — não devem permitir
         seleção de texto. O conteúdo do body (Inspector, Layers panel,
         etc.) pode reativar user-select via classe própria se precisar
         (ex: nome de layer editável). */
      user-select: none;
      -webkit-user-select: none;
    }
    /* D-081 — single grid container. Named areas swap based on
       effectiveSide() so the SAME template tree renders all 4
       positions without per-side branches. */
    .pg-container {
      flex: 1 1 auto;
      display: grid;
      min-height: 0;
      min-width: 0;
    }
    .pg-container--top {
      grid-template-rows: auto 1fr;
      grid-template-areas: 'tabs' 'body';
    }
    .pg-container--bottom {
      grid-template-rows: 1fr auto;
      grid-template-areas: 'body' 'tabs';
    }
    .pg-container--left {
      grid-template-columns: auto 1fr;
      grid-template-areas: 'tabs body';
    }
    .pg-container--right {
      grid-template-columns: 1fr auto;
      grid-template-areas: 'body tabs';
    }
    .pg-tabs {
      grid-area: tabs;
      display: flex;
      background: var(--mat-sys-surface-container-low, transparent);
    }
    .pg-tabs--horizontal {
      flex-direction: row;
      align-items: stretch;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
    }
    .pg-tabs--vertical {
      flex-direction: column;
      align-items: stretch;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-width: thin;
      /* ~36px wide chip column — wide enough for a 16px icon + comfy
         click target without eating into the body. Matches the
         libraries-panel side rail. */
      min-width: 36px;
    }
    .pg-container--top .pg-tabs {
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .pg-container--bottom .pg-tabs {
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .pg-container--left .pg-tabs {
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .pg-container--right .pg-tabs {
      border-left: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .pg-body-wrapper {
      grid-area: body;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .pg-header {
      display: flex;
      align-items: stretch;
      gap: 0;
      background: var(--mat-sys-surface-container-low, transparent);
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      min-height: 28px;
    }
    .pg-header--titled .pg-title {
      flex: 1 1 auto;
      align-self: center;
      margin: 0;
      padding: 0 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.65;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* D-081 — side picker chip in the header. Small icon button
       opening the 4-way mat-menu. Stays visible even when there's
       no title (header still renders just to host this chip). */
    .pg-side-picker-btn {
      flex: 0 0 auto;
      align-self: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      margin: 0 4px 0 auto;
      padding: 0;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: 0.45;
      transition:
        opacity 120ms ease,
        background 120ms ease;
    }
    .pg-side-picker-btn:hover {
      opacity: 0.95;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
    }
    .pg-side-picker-btn:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
      opacity: 1;
    }
    .pg-side-picker-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .pg-tab {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 0;
      background: transparent;
      color: inherit;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      opacity: 0.6;
      transition:
        opacity 120ms ease,
        border-color 120ms ease,
        background 120ms ease;
      white-space: nowrap;
    }
    .pg-tab:hover {
      opacity: 0.9;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .pg-tab:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
    }
    .pg-tab--active {
      opacity: 1;
      color: var(--mat-sys-primary, #1976d2);
    }
    .pg-tab-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .pg-tab--compact {
      /* Icon-only tab (tooltip shows label on hover). Forced on
         lateral sides (left/right); opt-in for horizontal sides via
         the compact input. */
      padding: 6px 8px;
    }
    /* HORIZONTAL tab (top or bottom side). Active indicator is a
       short coloured edge on the side ADJACENT to the body. */
    .pg-tab--horizontal {
      padding: 0 10px;
      border-bottom: 2px solid transparent;
      border-top: 2px solid transparent;
    }
    .pg-container--top .pg-tab--horizontal.pg-tab--active {
      border-bottom-color: var(--mat-sys-primary, #1976d2);
    }
    .pg-container--bottom .pg-tab--horizontal.pg-tab--active {
      border-top-color: var(--mat-sys-primary, #1976d2);
    }
    /* VERTICAL tab (left or right side). Active indicator slides to
       the edge adjacent to the body (left side → right border; right
       side → left border) — same convention Photoshop / Affinity use. */
    .pg-tab--vertical {
      justify-content: center;
      padding: 8px 6px;
      border-left: 2px solid transparent;
      border-right: 2px solid transparent;
    }
    .pg-container--left .pg-tab--vertical.pg-tab--active {
      border-right-color: var(--mat-sys-primary, #1976d2);
    }
    .pg-container--right .pg-tab--vertical.pg-tab--active {
      border-left-color: var(--mat-sys-primary, #1976d2);
    }
    .pg-tab--vertical .pg-tab-label {
      /* When labels DO show in vertical mode (only when icon is missing
         — compact is forced on lateral sides), allow wrap. */
      white-space: normal;
      text-align: center;
    }
    .pg-body {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      overflow-y: auto;
      /* Side rails are narrow (e.g. 184px after the 36px vertical
         strip). Allowing horizontal scroll inside the body produces
         a visible scrollbar at the bottom — UX-poor and signals that
         the consumer's grid is busted. Hide it; consumers should
         size their content with responsive grids (auto-fill /
         minmax) so it shrinks to fit. */
      overflow-x: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePanelGroup {
  /** Optional title displayed at the top of the header. */
  readonly title = input<string | null>(null);

  /**
   * Controlled active-tab id. When set, the panel-group reflects this
   * input and emits `activeTabChange` on user click. When `null`/unset
   * the panel-group manages state internally.
   */
  readonly activeTab = input<string | null>(null);

  /**
   * Compact mode — when true, tabs with an icon hide their text label
   * in the strip (label remains as tooltip on hover). Use when many
   * tabs need to fit in a narrow rail (e.g. 8 library categories in a
   * 220px sidebar). Defaults to false (icon + label both visible).
   */
  readonly compact = input<boolean>(false);

  /**
   * **DEPRECATED — kept for back-compat.** Use {@link tabSide}
   * instead (4 values: top/right/bottom/left). When set to
   * `'vertical'`, this input still wins over the `tabSide` default
   * of `'top'` and renders as left-side tabs (matches the pre-D-081
   * behavior). When set to `'horizontal'`, `tabSide` takes over.
   *
   * Migrated callers should drop this input and pass `tabSide`
   * directly. Removal scheduled when no in-repo consumers reference
   * it (currently still used by inspector + libraries-panel).
   */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');

  /**
   * **D-081** — Side of the panel-group where the tab strip docks.
   * Replaces {@link orientation} with a 4-way choice the user can
   * also flip at runtime via the picker chip in the header.
   *
   * Defaults to `'top'`. Lateral values (`'left'` / `'right'`)
   * force icon-only rendering regardless of {@link compact} — per
   * the user-facing requirement that lateral tabs match the
   * `<svge-libraries-panel>` icon-rail style.
   */
  readonly tabSide = input<SvgePanelGroupTabSide>('top');

  /**
   * **D-081** — Stable identifier for persistence. When set, the
   * user's chosen side (via the header picker) is saved to
   * `localStorage` under `svge-panel-group-tabside-<groupId>` and
   * restored on construction. Without a `groupId`, the picker still
   * works but the choice is lost on reload.
   *
   * Recommended: pass a unique-per-instance string like
   * `'shell-pro-right-rail'`. Two panel-groups with the SAME id will
   * share their saved side — useful for "all panels in this app
   * follow the global preference", less useful when each has its
   * own meaning.
   */
  readonly groupId = input<string | null>(null);

  /**
   * **D-081** — When `true`, the side picker chip is hidden. Useful
   * for embedded panel-groups where the layout is fixed by design
   * (e.g., a single-tab group). Defaults to `false`.
   */
  readonly hideSidePicker = input<boolean>(false);

  /** Emitted when the user clicks a tab. */
  readonly activeTabChange = output<string>();

  /**
   * **D-081** — Emitted when the user picks a different tab side
   * via the header chip. Consumers can react if they want to e.g.
   * propagate the choice to a sibling group. Not required: the
   * component handles its own persistence already.
   */
  readonly tabSideChange = output<SvgePanelGroupTabSide>();

  /** All tabs declared by the host via `<ng-template svgePanelGroupTab>`. */
  protected readonly tabs = contentChildren(SvgePanelGroupTab);

  /** Internal active-tab id (used when no controlled input is given). */
  private readonly internalActiveId = signal<string | null>(null);

  /**
   * **D-081** — user-overridden tab side. `null` until the user clicks
   * one of the 4 picker entries; once set, it wins over the `tabSide`
   * input AND the legacy `orientation` mapping. Persisted to
   * localStorage when `groupId` is set.
   */
  private readonly userTabSide = signal<SvgePanelGroupTabSide | null>(null);

  // Auto-select the first tab when none has been chosen yet — runs
  // whenever the tab set changes (e.g. tabs added/removed dynamically).
  constructor() {
    effect(() => {
      const list = this.tabs();
      if (list.length === 0) {
        this.internalActiveId.set(null);
        return;
      }
      const current = this.internalActiveId();
      const stillExists = current !== null && list.some((t) => t.id() === current);
      if (!stillExists) {
        this.internalActiveId.set(list[0]!.id());
      }
    });

    // **D-081** — restore the user's saved tab side from localStorage
    // when a `groupId` is provided. Runs once per groupId change so
    // dynamic re-keying works (rare; mostly groupId is set once at
    // template time). Defensive against SSR (no `window`) and
    // localStorage being unavailable (private-mode / disabled).
    effect(() => {
      const id = this.groupId();
      if (id === null) return;
      if (typeof localStorage === 'undefined') return;
      try {
        const stored = localStorage.getItem(`${TAB_SIDE_STORAGE_PREFIX}-${id}`);
        if (stored === null) return;
        if (stored === 'top' || stored === 'right' || stored === 'bottom' || stored === 'left') {
          this.userTabSide.set(stored);
        }
      } catch {
        // Corrupted entry or storage quota error — ignore, fall back
        // to the tabSide input's default. Don't crash the component.
      }
    });
  }

  /** Effective active tab id (controlled input wins; falls back to internal). */
  protected readonly resolvedActiveId = computed<string | null>(() => {
    const controlled = this.activeTab();
    if (controlled !== null) return controlled;
    return this.internalActiveId();
  });

  protected readonly activeTemplate = computed<TemplateRef<unknown> | null>(() => {
    const id = this.resolvedActiveId();
    if (id === null) return null;
    const match = this.tabs().find((t) => t.id() === id);
    return match?.templateRef ?? null;
  });

  /**
   * Active tab's display label (or `id` when no label set). Used by
   * the vertical layout to surface what's currently visible in the
   * panel header — since vertical strip is icon-only by default, the
   * user wouldn't otherwise see a textual label for the active panel.
   */
  protected readonly activeTabLabel = computed<string | null>(() => {
    const id = this.resolvedActiveId();
    if (id === null) return null;
    const match = this.tabs().find((t) => t.id() === id);
    return match?.label() ?? match?.id() ?? null;
  });

  // Stable ids derived from `Math.random()` would break SSR + a11y
  // hydration; use a counter that only increments at construction.
  private static instanceCounter = 0;
  private readonly instanceId = ++SvgePanelGroup.instanceCounter;

  protected bodyId(): string {
    return `svge-pg-body-${this.instanceId}`;
  }

  protected tabButtonId(tabId: string | null): string | null {
    if (tabId === null) return null;
    return `svge-pg-tab-${this.instanceId}-${tabId}`;
  }

  protected selectTab(id: string): void {
    this.internalActiveId.set(id);
    this.activeTabChange.emit(id);
  }

  /**
   * **D-081** — resolved tab side. Priority order:
   *   1. User override (via the header picker) — highest.
   *   2. Legacy `orientation === 'vertical'` → `'left'` (back-compat).
   *   3. `tabSide` input — default `'top'`.
   */
  protected readonly effectiveSide = computed<SvgePanelGroupTabSide>(() => {
    const user = this.userTabSide();
    if (user !== null) return user;
    if (this.orientation() === 'vertical') return 'left';
    return this.tabSide();
  });

  /** `true` when the strip runs across the top or bottom. */
  protected readonly isHorizontal = computed(
    () => this.effectiveSide() === 'top' || this.effectiveSide() === 'bottom',
  );

  /**
   * `true` when tabs should render icon-only (no labels in the
   * strip; tooltips still show the label). Forced on lateral sides
   * (left/right); follows the `compact` input on horizontal sides.
   */
  protected readonly iconOnly = computed(() => {
    if (!this.isHorizontal()) return true;
    return this.compact();
  });

  /**
   * `true` when the side picker chip should render. Hidden when the
   * consumer opts out via `[hideSidePicker]="true"` (e.g., a single-
   * tab embedded group where layout is fixed by design).
   */
  protected readonly showSidePicker = computed(() => {
    if (this.hideSidePicker()) return false;
    // Don't show the picker when there's only one tab — there's no
    // meaningful "rearrangement" to do.
    return this.tabs().length > 1;
  });

  /**
   * Tooltip placement that points AWAY from the body, so the tooltip
   * doesn't cover the panel content. e.g., on right-side tabs the
   * tooltip floats to the left (toward the body), but we want it on
   * the OUTER side so it stays visible. So pick the opposite cardinal.
   *
   * Material's TooltipPosition strings are 'above' | 'below' |
   * 'before' | 'after' | 'left' | 'right'. Using before/after to be
   * LTR/RTL-agnostic.
   */
  protected readonly tooltipPosition = computed<'above' | 'below' | 'before' | 'after'>(() => {
    switch (this.effectiveSide()) {
      case 'top':
        return 'below';
      case 'bottom':
        return 'above';
      case 'left':
        return 'after';
      case 'right':
        return 'before';
    }
  });

  /**
   * Icon shown on the picker chip — mirrors the current side so the
   * affordance is self-describing (the chip itself shows where the
   * tabs are now; clicking opens the 4-way menu).
   */
  protected readonly sideIcon = computed<string>(() => {
    switch (this.effectiveSide()) {
      case 'top':
        return 'border_top';
      case 'right':
        return 'border_right';
      case 'bottom':
        return 'border_bottom';
      case 'left':
        return 'border_left';
    }
  });

  /**
   * **D-081** — user picks a tab side via the header menu. Updates
   * the internal signal and persists to localStorage when `groupId`
   * is set so the choice survives a reload. Emits
   * `tabSideChange` for consumers that want to react.
   */
  protected setUserTabSide(side: SvgePanelGroupTabSide): void {
    this.userTabSide.set(side);
    const id = this.groupId();
    if (id !== null && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${TAB_SIDE_STORAGE_PREFIX}-${id}`, side);
      } catch {
        // Quota exceeded or storage disabled — fail silently. The
        // signal still updated, so the user sees the change for
        // this session; only persistence is lost.
      }
    }
    this.tabSideChange.emit(side);
  }
}
