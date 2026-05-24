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
  imports: [NgTemplateOutlet, MatIcon],
  template: `
    @if (tabs().length > 0) {
      @if (orientation() === 'vertical' && tabs().length > 1) {
        <!--
          Vertical layout (Photoshop/Affinity-style side rail): tab
          strip is a thin column to the LEFT of the body. Used when a
          panel has many tabs and the rail is too narrow for them to
          fit horizontally. Title (when present) sits above the body
          and aligns with the active tab.
        -->
        <div class="pg-vertical">
          <div
            class="pg-tabs pg-tabs--vertical"
            role="tablist"
            [attr.aria-orientation]="'vertical'"
            [attr.aria-label]="title() ?? 'Panels'"
          >
            @for (tab of tabs(); track tab.id()) {
              <button
                type="button"
                class="pg-tab pg-tab--vertical"
                [class.pg-tab--compact]="compact() && tab.icon()"
                role="tab"
                [class.pg-tab--active]="tab.id() === resolvedActiveId()"
                [attr.aria-selected]="tab.id() === resolvedActiveId()"
                [attr.aria-controls]="bodyId()"
                [id]="tabButtonId(tab.id())"
                [title]="tab.tooltip() ?? tab.label() ?? tab.id()"
                (click)="selectTab(tab.id())"
              >
                @if (tab.icon()) {
                  <mat-icon class="pg-tab-icon">{{ tab.icon() }}</mat-icon>
                }
                @if (!compact() || !tab.icon()) {
                  <span class="pg-tab-label">{{ tab.label() ?? tab.id() }}</span>
                }
              </button>
            }
          </div>
          <div class="pg-vertical-content">
            @if (title()) {
              <header class="pg-header pg-header--titled pg-header--vertical">
                <h3 class="pg-title">{{ activeTabLabel() ?? title() }}</h3>
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
      } @else {
        <!--
          Horizontal layout (Illustrator-style): tab strip across the
          top, body below. Also used when there's exactly 1 tab —
          the strip is hidden and only the title shows.
        -->
        <header class="pg-header" [class.pg-header--titled]="!!title()">
          @if (title()) {
            <h3 class="pg-title">{{ title() }}</h3>
          }
          @if (tabs().length > 1) {
            <div class="pg-tabs" role="tablist" [attr.aria-label]="title() ?? 'Panels'">
              @for (tab of tabs(); track tab.id()) {
                <button
                  type="button"
                  class="pg-tab"
                  [class.pg-tab--compact]="compact() && tab.icon()"
                  role="tab"
                  [class.pg-tab--active]="tab.id() === resolvedActiveId()"
                  [attr.aria-selected]="tab.id() === resolvedActiveId()"
                  [attr.aria-controls]="bodyId()"
                  [id]="tabButtonId(tab.id())"
                  [title]="tab.tooltip() ?? tab.label() ?? tab.id()"
                  (click)="selectTab(tab.id())"
                >
                  @if (tab.icon()) {
                    <mat-icon class="pg-tab-icon">{{ tab.icon() }}</mat-icon>
                  }
                  @if (!compact() || !tab.icon()) {
                    <span class="pg-tab-label">{{ tab.label() ?? tab.id() }}</span>
                  }
                </button>
              }
            </div>
          }
        </header>
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
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--mat-sys-surface, transparent);
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
      flex: 0 0 auto;
      align-self: center;
      margin: 0;
      padding: 0 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.65;
      white-space: nowrap;
    }
    .pg-tabs {
      flex: 1 1 auto;
      display: flex;
      align-items: stretch;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .pg-tab {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 10px;
      border: 0;
      background: transparent;
      color: inherit;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      opacity: 0.6;
      border-bottom: 2px solid transparent;
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
      border-bottom-color: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-primary, #1976d2);
    }
    .pg-tab-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .pg-tab--compact {
      /* When parent enables compact mode AND the tab has an icon, the
         label is hidden in the strip (tooltip still shows the label on
         hover). Keep enough padding for a comfortable click target. */
      padding: 0 8px;
    }
    /* Vertical orientation (Photoshop/Affinity-style side rail).
       Strip becomes a thin column to the left of the body. Active
       indicator moves from bottom border to LEFT border. */
    .pg-vertical {
      flex: 1 1 auto;
      display: flex;
      flex-direction: row;
      min-height: 0;
      min-width: 0;
    }
    .pg-tabs--vertical {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--mat-sys-surface-container-low, transparent);
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      /* ~36px wide chip column — wide enough for a 16px icon + comfy
         click target without eating into the body. */
      min-width: 36px;
    }
    .pg-tab--vertical {
      justify-content: center;
      padding: 8px 6px;
      border-bottom: 0;
      /* Active indicator slides to the LEFT edge (matches Photoshop /
         Affinity convention for vertical side rails). */
      border-left: 2px solid transparent;
    }
    .pg-tab--vertical.pg-tab--active {
      border-bottom-color: transparent;
      border-left-color: var(--mat-sys-primary, #1976d2);
    }
    .pg-tab--vertical .pg-tab-label {
      /* When labels DO show in vertical mode (non-compact or no icon),
         allow them to wrap so long names don't break the layout. */
      white-space: normal;
      text-align: center;
    }
    .pg-vertical-content {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .pg-header--vertical {
      /* In vertical mode the title is INFORMATIONAL — it shows the
         active tab's label (or panel-group title as fallback). Saves
         the user from having to hover the tab icon to know what's
         on screen. */
      min-height: 28px;
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
   * Tab strip orientation:
   * - `'horizontal'` (default): strip across the top, body below.
   *   Illustrator/Inkscape convention; best for 2-4 tabs in a wide
   *   dock.
   * - `'vertical'`: thin strip on the LEFT, body to the right.
   *   Photoshop/Affinity convention; best for many tabs in a narrow
   *   rail (e.g. 8 library categories in a 220px sidebar). When
   *   `vertical`, the body header (if `title` is set) automatically
   *   reflects the active tab's label so the user always knows what
   *   they're looking at without hovering icons.
   */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');

  /** Emitted when the user clicks a tab. */
  readonly activeTabChange = output<string>();

  /** All tabs declared by the host via `<ng-template svgePanelGroupTab>`. */
  protected readonly tabs = contentChildren(SvgePanelGroupTab);

  /** Internal active-tab id (used when no controlled input is given). */
  private readonly internalActiveId = signal<string | null>(null);

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
}
