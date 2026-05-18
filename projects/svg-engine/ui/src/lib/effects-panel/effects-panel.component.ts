import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  type NodeId,
  SetStylePropertyOnManyCommand,
} from 'svg-engine/core';
import { type Effect, EffectRegistry, SelectionService } from 'svg-engine/edit';

/**
 * Picker UI for {@link EffectRegistry} contributions — Fase 6d.
 *
 * **What it shows**: list of every registered effect, grouped by
 * `category`. Each effect renders as a clickable chip that toggles the
 * effect on the **focused** selected node (single-selection focus
 * semantics — multi-selection is handled by future expansion).
 *
 * **What it dispatches**: a {@link SetStylePropertyOnManyCommand} on
 * `style.filter` — either `url(#effect-id)` to apply, or `undefined`
 * to clear. Single undo entry per toggle. Uses the "many" variant so
 * multi-selection picks up the same toggle in one go even though the
 * v1 UI shows state for the focus only.
 *
 * **Reactivity**:
 * - `EffectRegistry.effects()` drives the chip list — newly-installed
 *   plugins appear immediately
 * - `SelectionService.focusId()` drives the "active" state
 * - `EditorStateService.document()` drives the current filter readout
 *
 * **No internal state**: all state lives in core services. Component
 * is pure projection — re-mounting it shows the same view.
 *
 * **Headless boundary**: imports `MatIcon` only (one Material symbol,
 * no theming dependencies beyond what `svg-engine/ui` already pulls).
 *
 * Usage:
 * ```html
 * <svge-effects-panel></svge-effects-panel>
 * ```
 *
 * Place anywhere in the editor shell. The panel is self-sufficient
 * (no `@Input`s — selection + registry come from DI).
 */
@Component({
  selector: 'svge-effects-panel',
  standalone: true,
  imports: [MatIcon],
  template: `
    <header class="effects-header">Effects</header>
    @if (focusNode() === null) {
      <p class="empty">Select a single node to apply effects.</p>
    } @else if (effects().length === 0) {
      <p class="empty">No effects registered. Provision <code>builtinEffectsPlugin</code>.</p>
    } @else {
      @for (group of grouped(); track group.category) {
        <section class="group">
          <h4>{{ group.category }}</h4>
          <div class="chips">
            @for (e of group.effects; track e.id) {
              <button
                type="button"
                class="chip"
                [class.active]="isActive(e.id)"
                [attr.aria-pressed]="isActive(e.id)"
                [title]="isActive(e.id) ? 'Click to remove ' + e.name : 'Apply ' + e.name"
                (click)="toggle(e.id)"
              >
                @if (isActive(e.id)) {
                  <mat-icon aria-hidden="true">check</mat-icon>
                }
                <span>{{ e.name }}</span>
              </button>
            }
          </div>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
    }
    .effects-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      margin-bottom: 8px;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      font-style: italic;
      margin: 4px 0;
    }
    .empty code {
      font-style: normal;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      padding: 0 4px;
      border-radius: 3px;
    }
    .group {
      margin-top: 8px;
    }
    .group h4 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
      margin: 0 0 4px;
      font-weight: 500;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 16px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      background: var(--mat-sys-surface-container-low, #fff);
      color: var(--mat-sys-on-surface, inherit);
      font-size: 12px;
      cursor: pointer;
      outline: none;
    }
    .chip:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .chip:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: 2px;
    }
    .chip.active {
      background: var(--mat-sys-primary-container, #cce0ff);
      color: var(--mat-sys-on-primary-container, #001b3d);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .chip mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      line-height: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeEffectsPanel {
  private readonly registry = inject(EffectRegistry);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);

  /** All registered effects (reactive — registry add/remove drives re-render). */
  protected readonly effects = this.registry.effects;

  /** Focused single node (or first selected) — null when nothing is selected. */
  protected readonly focusNode = computed(() => {
    const id = this.selection.focusId();
    if (id === null) return null;
    return findNodeById(this.state.document().root, id);
  });

  /**
   * Current filter URL on the focused node. Extracts the id portion of
   * `url(#id)` so we can compare against effect ids without string
   * arithmetic in the template.
   */
  protected readonly activeEffectId = computed<string | null>(() => {
    const node = this.focusNode();
    if (node === null) return null;
    const filter = node.style.filter;
    if (filter === undefined) return null;
    const match = /^url\(#(.+)\)$/.exec(filter.trim());
    return match?.[1] ?? null;
  });

  /** Effects grouped by category (`'other'` when undefined). */
  protected readonly grouped = computed<
    readonly { category: string; effects: readonly Effect[] }[]
  >(() => {
    const byCat = new Map<string, Effect[]>();
    for (const e of this.effects()) {
      const cat = e.category ?? 'other';
      const bucket = byCat.get(cat) ?? [];
      bucket.push(e);
      byCat.set(cat, bucket);
    }
    return Array.from(byCat.entries()).map(([category, effects]) => ({
      category,
      effects,
    }));
  });

  protected isActive(id: string): boolean {
    return this.activeEffectId() === id;
  }

  /**
   * Toggle the effect on every selected node. If the effect is already
   * the active filter on the focus, clearing happens (filter set to
   * `undefined`). Otherwise the effect is applied (`url(#id)`).
   */
  protected toggle(id: string): void {
    const selected = Array.from(this.selection.selectedIds()) as NodeId[];
    if (selected.length === 0) return;
    const apply = !this.isActive(id);
    this.bus.dispatch(
      new SetStylePropertyOnManyCommand(
        selected,
        'filter',
        apply ? `url(#${id})` : undefined,
        apply ? `Apply ${id}` : `Clear filter`,
      ),
    );
  }
}
