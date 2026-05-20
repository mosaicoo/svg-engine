import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ToolHostService, ToolRegistry } from 'svg-engine/edit';

/**
 * Context-sensitive **tool options bar** — Sprint Pro-Editor Phase 3.
 *
 * Renders the active tool's `optionsComponent` (if any) via Angular's
 * `*ngComponentOutlet`, matching the "tool options" bar that
 * Illustrator / Affinity / Inkscape show under the menu bar / above
 * the canvas. The bar's content changes whenever the active tool
 * changes — driven by `ToolHostService.activeId()`.
 *
 * **What appears here**:
 *
 * - Rectangle tool active → `<svge-rectangle-options>` (corner radius,
 *   constrain to square checkbox, etc.).
 * - Pen tool active → `<svge-pen-options>` (stroke width, cap style,
 *   default fill).
 * - Select tool active → no options component → empty bar (or "No
 *   options" placeholder when `[showPlaceholder]=true`).
 *
 * **Tool authoring**: tools declare their options UI via the optional
 * `optionsComponent?: Type<unknown>` field on the `Tool` interface
 * (D-038 phase 3 extension). The component lives in `svg-engine/ui`
 * (Material) or in the consumer's app — the registry holds only the
 * class reference, no rendering happens until the tool activates.
 *
 * **Layout** (default):
 *
 * - Compact horizontal strip, ~36px tall, padded.
 * - When no options component, hidden by default (no visual placeholder)
 *   so tool-less tools don't push canvas down. Pass `[showPlaceholder]
 *   ="true"` to show "No options" instead — useful in editor shells
 *   that want consistent layout across tools.
 *
 * **Headless boundary**: lives in `svg-engine/ui` — Material-bound.
 * Consumers wanting their own bar layout can build a custom component
 * that does the same `ToolHostService + ToolRegistry.get(id) + ngComponentOutlet`
 * dance and skip this entirely.
 *
 * **Standalone**: usable inside `<svge-shell-pro>`, inside `<svge-editor>`
 * via `[showToolOptions]`, or completely on its own in a custom layout.
 */
@Component({
  selector: 'svge-tool-options',
  standalone: true,
  imports: [NgComponentOutlet, MatIcon],
  host: {
    role: 'toolbar',
    '[attr.aria-label]': '"Tool options for " + activeLabel()',
  },
  template: `
    @if (activeOptionsComponent(); as cmp) {
      <div class="bar">
        @if (activeIcon()) {
          <span class="tool-icon" aria-hidden="true">
            <mat-icon>{{ activeIcon() }}</mat-icon>
          </span>
        }
        <span class="tool-label">{{ activeLabel() }}</span>
        <span class="separator" aria-hidden="true">|</span>
        <span class="options">
          <ng-container *ngComponentOutlet="cmp" />
        </span>
      </div>
    } @else if (showPlaceholder()) {
      <div class="bar placeholder">
        @if (activeIcon()) {
          <span class="tool-icon" aria-hidden="true">
            <mat-icon>{{ activeIcon() }}</mat-icon>
          </span>
        }
        <span class="tool-label">{{ activeLabel() }}</span>
        <span class="separator" aria-hidden="true">|</span>
        <span class="empty">No options for this tool</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      background: var(--mat-sys-surface, transparent);
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 4px 0.75rem;
      min-height: 32px;
      font-size: 12px;
      color: var(--mat-sys-on-surface, inherit);
    }
    .tool-icon {
      display: inline-flex;
      align-items: center;
      opacity: 0.7;
    }
    .tool-icon mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .tool-label {
      font-weight: 500;
      opacity: 0.85;
    }
    .separator {
      opacity: 0.4;
      padding: 0 4px;
    }
    .options {
      flex: 1 1 auto;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .placeholder .empty {
      opacity: 0.55;
      font-style: italic;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeToolOptions {
  private readonly toolHost = inject(ToolHostService);
  private readonly tools = inject(ToolRegistry);

  /**
   * When `true`, render a "No options" placeholder strip when the active
   * tool doesn't declare an `optionsComponent`. Default: `false` —
   * the bar collapses entirely so the canvas isn't pushed down for tools
   * that have no params (Select, Hand, etc.).
   *
   * Useful in `<svge-shell-pro>` where consistent layout matters more
   * than collapsing chrome.
   */
  readonly showPlaceholder = input<boolean>(false);

  /** Active tool reactive lookups — re-derive when tool host or registry change. */
  private readonly activeTool = computed(() => {
    const id = this.toolHost.activeId();
    return id === null ? null : this.tools.get(id);
  });

  protected readonly activeOptionsComponent = computed(
    () => this.activeTool()?.optionsComponent ?? null,
  );

  protected readonly activeLabel = computed(() => this.activeTool()?.label ?? '—');

  protected readonly activeIcon = computed(() => this.activeTool()?.icon ?? null);
}
