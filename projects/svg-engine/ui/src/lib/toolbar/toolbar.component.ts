import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  makeDisabledResolver,
  MenuContributionRegistry,
  runContribution,
  type MenuContribution,
} from 'svg-engine/edit';

/**
 * Renders all visible {@link MenuContribution}s for a given slot as a
 * horizontal row of Material `<mat-icon-button>`s — Fase 4 Bloco 4e.
 * Click activates the contribution's `run()`. Tooltip shows label +
 * optional shortcut hint. `disabled` signal is honored per item.
 *
 * **Why a generic component instead of one per slot**: every toolbar /
 * sub-toolbar in the editor renders the same primitive (sorted list of
 * buttons from the registry). Slot id is just an input; consumers
 * compose multiple `<svge-toolbar>`s for multi-row toolbars.
 *
 * Usage:
 * ```html
 * <svge-toolbar slot="toolbar.main" />
 * <svge-toolbar slot="toolbar.shape" />
 * ```
 *
 * Empty / unknown slots render nothing — graceful for partial UIs.
 */
@Component({
  selector: 'svge-toolbar',
  standalone: true,
  imports: [MatIconButton, MatIcon, MatTooltip],
  // role="toolbar" announces the strip semantically so assistive tech
  // knows the buttons inside belong to one logical group. The
  // `slot()` is part of the aria-label so screen readers can
  // distinguish multiple toolbars on the same page (e.g.
  // "toolbar.main" vs "toolbar.shape").
  host: {
    role: 'toolbar',
    '[attr.aria-label]': '"Toolbar " + slot()',
  },
  template: `
    @for (item of items(); track item.id) {
      <button
        mat-icon-button
        type="button"
        [attr.aria-label]="item.label"
        [attr.aria-keyshortcuts]="item.shortcut ?? null"
        [matTooltip]="tooltipFor(item)"
        matTooltipPosition="below"
        [disabled]="isDisabled(item)"
        (click)="invoke(item)"
      >
        @if (item.icon) {
          <mat-icon>{{ item.icon }}</mat-icon>
        } @else {
          <span class="text-fallback">{{ item.label }}</span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0;
    }
    .text-fallback {
      font-size: 12px;
      font-weight: 500;
      padding: 0 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeToolbar {
  private readonly registry = inject(MenuContributionRegistry);
  /**
   * D-043 fix: consumer injector — passed to `disabled` factories AND
   * to `run()` so contribution handlers resolve services from the
   * **active editor scope**, not from the plugin's install-time
   * (root) closure. In single-editor apps this is the root injector
   * anyway; in route-scoped (D-042) editors it's the per-route one.
   */
  private readonly injector = inject(Injector);
  /**
   * Memoized resolver: factory-form `disabled` signals are
   * instantiated once per (contribution × this component) instead of
   * once per change-detection cycle. See {@link makeDisabledResolver}
   * for the full contract.
   */
  private readonly disabledFor = makeDisabledResolver(this.injector);

  /** Which slot to render. See `MenuSlot` for conventions. */
  readonly slot = input.required<string>();

  /**
   * Effective list of contributions for this slot. Re-evaluates when
   * either the slot input or the registry contents (including item
   * `visible` signals) change.
   */
  protected readonly items = computed(() => this.registry.bySlot(this.slot())());

  protected isDisabled(item: MenuContribution): boolean {
    return this.disabledFor(item)();
  }

  protected invoke(item: MenuContribution): void {
    runContribution(item, this.injector);
  }

  protected tooltipFor(item: MenuContribution): string {
    const base = item.tooltip ?? item.label;
    return item.shortcut ? `${base} (${item.shortcut})` : base;
  }
}
