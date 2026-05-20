import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ToolHostService, ToolRegistry } from 'svg-engine/edit';

/**
 * Vertical **tools palette** — Sprint Pro-Editor Phase 4.
 *
 * Reads every tool registered with `ToolRegistry` and renders one
 * Material icon button per tool, vertically stacked. Mirrors the left-
 * column tools palette of Illustrator / Affinity / Inkscape (Select,
 * Hand, Pen, Pencil, Shapes, Text, etc.). Clicking a button activates
 * the tool via `ToolHostService.activate(id)`. The currently active
 * tool's button is highlighted.
 *
 * **Why a dedicated component (vs reusing `<svge-toolbar>`)**: the
 * toolbar reads `MenuContributionRegistry` (one-off command buttons);
 * this palette reads `ToolRegistry` (persistent interaction modes).
 * Two registries, two visual surfaces, two components — keeps each
 * concern obvious. Consumers can render either, both, or neither.
 *
 * **Layout**: vertical strip with ~36px-wide buttons. The host element
 * defaults to `display: flex; flex-direction: column` so dropping it
 * into a `<aside>` works without additional CSS.
 *
 * **Accessibility**:
 * - Host `role="toolbar"` + `aria-orientation="vertical"`.
 * - Each button: `aria-pressed` true when its tool is active.
 * - Tooltip combines label + shortcut hint.
 *
 * **Headless boundary**: lives in `svg-engine/ui` — Material-bound.
 * Consumers in headless puro can iterate `ToolRegistry.tools()` and
 * render their own palette using any UI library.
 */
@Component({
  selector: 'svge-tools-palette',
  standalone: true,
  imports: [MatIconButton, MatIcon, MatTooltip],
  host: {
    role: 'toolbar',
    'aria-orientation': 'vertical',
    'aria-label': 'Tools palette',
  },
  template: `
    @for (t of tools(); track t.id) {
      <button
        mat-icon-button
        type="button"
        class="tool-btn"
        [class.active]="t.id === activeId()"
        [attr.aria-pressed]="t.id === activeId()"
        [matTooltip]="tooltipFor(t)"
        matTooltipPosition="right"
        (click)="activate(t.id)"
      >
        <mat-icon>{{ t.icon ?? 'build' }}</mat-icon>
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 2px;
      background: var(--mat-sys-surface, transparent);
      border-right: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .tool-btn {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      color: var(--mat-sys-on-surface-variant, inherit);
    }
    .tool-btn.active {
      background: var(--mat-sys-primary-container, #cce4ff);
      color: var(--mat-sys-on-primary-container, #001a3a);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeToolsPalette {
  private readonly registry = inject(ToolRegistry);
  private readonly toolHost = inject(ToolHostService);

  /** All registered tools in insertion order (matches registry contract). */
  protected readonly tools = computed(() => this.registry.tools());

  /** Active tool id — drives the active highlight on the button. */
  protected readonly activeId = computed(() => this.toolHost.activeId());

  protected tooltipFor(tool: { label: string; shortcut?: string }): string {
    return tool.shortcut ? `${tool.label} (${tool.shortcut.toUpperCase()})` : tool.label;
  }

  protected activate(id: string): void {
    this.toolHost.activate(id);
  }
}
