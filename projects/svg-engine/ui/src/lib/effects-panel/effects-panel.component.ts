import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  type NodeId,
  SetStylePropertyOnManyCommand,
} from 'svg-engine/core';
import {
  type Effect,
  EffectRegistry,
  extractChainFilterId,
  makeChainFilterId,
  parseChainFilterId,
  SelectionService,
} from 'svg-engine/edit';

/**
 * Effects pipeline editor — Fase 6d (D-023 cat 7) expandido em D-047
 * com suporte a **chain de múltiplos effects** (combine + reorder).
 *
 * **Two sections**:
 *
 * 1. **Active pipeline** — lista ordenada (top→bottom = primeira→última)
 *    dos effects atualmente aplicados ao nó focado. Cada item tem
 *    botões: mover ↑, mover ↓, remover. A ordem reflete a aplicação
 *    do filter chain (efeito 1 alimenta efeito 2, etc).
 * 2. **Add effect** — picker agrupado por categoria. Clicar em um
 *    chip adiciona o effect ao final do pipeline. Effects já na chain
 *    aparecem desabilitados (não há por que duplicar — para isso o
 *    user pode customizar registrando um effect parametrizado novo).
 *
 * **Storage**: o pipeline vive em `style.filter`:
 * - Vazio → `style.filter = undefined`
 * - 1 effect → `style.filter = "url(#effectId)"` (single, mantém
 *   compatibilidade com v1 do panel)
 * - 2+ effects → `style.filter = "url(#svge-chain-a__b__c)"`
 *   (a `ChainFilterRegistry` deriva o `<filter>` composto e o
 *   renderer injeta em defs)
 *
 * **Commits**: cada mudança no pipeline dispatcha um
 * {@link SetStylePropertyOnManyCommand} — single undo por edit.
 * Multi-select aplica a mesma mudança em todos os nós selecionados.
 *
 * **Reactivity**:
 * - `EffectRegistry.effects()` drives o picker
 * - `SelectionService.focusId()` drives a "active" state
 * - `EditorStateService.document()` drives o pipeline atual
 *
 * **Headless boundary**: importa `MatIcon` + `MatIconButton`, nada
 * mais. Sem dialogs, sem overlays — pure projection panel.
 */
@Component({
  selector: 'svge-effects-panel',
  standalone: true,
  imports: [MatIcon, MatIconButton],
  template: `
    <header class="effects-header">Effects</header>
    @if (focusNode() === null) {
      <p class="empty">Select a node to apply effects.</p>
    } @else if (effects().length === 0) {
      <p class="empty">No effects registered. Provision <code>builtinEffectsPlugin</code>.</p>
    } @else {
      @if (pipelineItems().length > 0) {
        <section class="pipeline">
          <h4>Active pipeline ({{ pipelineItems().length }})</h4>
          <ol class="pipeline-list">
            @for (item of pipelineItems(); track item.id; let i = $index) {
              <li class="pipeline-item">
                <span class="step-num" aria-hidden="true">{{ i + 1 }}</span>
                <span class="step-name">{{ item.name }}</span>
                <span class="step-category">{{ item.category ?? 'other' }}</span>
                <span class="spacer"></span>
                <button
                  mat-icon-button
                  type="button"
                  class="step-btn"
                  [disabled]="i === 0"
                  [attr.aria-label]="'Move ' + item.name + ' up'"
                  title="Move up"
                  (click)="moveUp(item.id)"
                >
                  <mat-icon>arrow_upward</mat-icon>
                </button>
                <button
                  mat-icon-button
                  type="button"
                  class="step-btn"
                  [disabled]="i === pipelineItems().length - 1"
                  [attr.aria-label]="'Move ' + item.name + ' down'"
                  title="Move down"
                  (click)="moveDown(item.id)"
                >
                  <mat-icon>arrow_downward</mat-icon>
                </button>
                <button
                  mat-icon-button
                  type="button"
                  class="step-btn step-btn-remove"
                  [attr.aria-label]="'Remove ' + item.name"
                  title="Remove"
                  (click)="remove(item.id)"
                >
                  <mat-icon>close</mat-icon>
                </button>
              </li>
            }
          </ol>
          <button type="button" class="clear-all" (click)="clearAll()">
            <mat-icon aria-hidden="true">delete_sweep</mat-icon>
            Clear all
          </button>
        </section>
      }

      <section class="add-section">
        <h4>{{ pipelineItems().length > 0 ? 'Add another effect' : 'Add effect' }}</h4>
        @for (group of grouped(); track group.category) {
          <div class="group">
            <h5>{{ group.category }}</h5>
            <div class="chips">
              @for (e of group.effects; track e.id) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="isInPipeline(e.id)"
                  [disabled]="isInPipeline(e.id)"
                  [attr.aria-pressed]="isInPipeline(e.id)"
                  [title]="
                    isInPipeline(e.id)
                      ? e.name + ' already in pipeline'
                      : 'Add ' + e.name + ' to pipeline'
                  "
                  (click)="add(e.id)"
                >
                  @if (isInPipeline(e.id)) {
                    <mat-icon aria-hidden="true">check</mat-icon>
                  } @else {
                    <mat-icon aria-hidden="true">add</mat-icon>
                  }
                  <span>{{ e.name }}</span>
                </button>
              }
            </div>
          </div>
        }
      </section>
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
    .pipeline {
      margin-top: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .pipeline h4,
    .add-section h4 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
      margin: 0 0 6px;
      font-weight: 500;
    }
    .pipeline-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pipeline-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border-radius: 4px;
      background: var(--mat-sys-surface-container-low, rgba(0, 0, 0, 0.02));
    }
    .pipeline-item:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--mat-sys-primary-container, #cce0ff);
      color: var(--mat-sys-on-primary-container, #001b3d);
      font-size: 10px;
      font-weight: 600;
    }
    .step-name {
      font-weight: 500;
      flex-shrink: 0;
    }
    .step-category {
      font-size: 10px;
      opacity: 0.6;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .step-btn {
      width: 28px !important;
      height: 28px !important;
      line-height: 28px !important;
      padding: 0 !important;
    }
    .step-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .step-btn-remove mat-icon {
      color: var(--mat-sys-error, #b3261e);
    }
    .step-btn:disabled mat-icon {
      opacity: 0.3;
    }
    .clear-all {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: transparent;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      font-size: 12px;
      cursor: pointer;
    }
    .clear-all:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      color: var(--mat-sys-error, #b3261e);
    }
    .clear-all mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .add-section {
      margin-top: 12px;
    }
    .group {
      margin-top: 8px;
    }
    .group h5 {
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
    .chip:hover:not(:disabled) {
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
    .chip:disabled {
      cursor: not-allowed;
      opacity: 0.7;
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

  /** All registered effects (reactive). */
  protected readonly effects = this.registry.effects;

  /** Focused single node (or first selected) — null when nothing is selected. */
  protected readonly focusNode = computed(() => {
    const id = this.selection.focusId();
    if (id === null) return null;
    return findNodeById(this.state.document().root, id);
  });

  /**
   * Current effect IDs forming the active pipeline on the focus node.
   * Reads `style.filter`, parses chain ID or single effect URL, returns
   * the ordered list. Empty array when no filter.
   */
  protected readonly currentEffectIds = computed<readonly string[]>(() => {
    const node = this.focusNode();
    if (node === null) return [];
    const filter = node.style.filter;
    if (filter === undefined) return [];

    // Chain URL: url(#svge-chain-a__b__c)
    const chainId = extractChainFilterId(filter);
    if (chainId !== null) {
      const parsed = parseChainFilterId(chainId);
      return parsed ?? [];
    }

    // Single effect URL: url(#effectId)
    const m = /^url\(#(.+)\)$/.exec(filter.trim());
    if (m === null) return [];
    return [m[1]!];
  });

  /**
   * Resolved pipeline items — each effect ID mapped to its registered
   * Effect (with `name` + `category`). IDs that aren't registered get
   * a placeholder entry so the UI still shows them (and the user can
   * remove the broken reference).
   */
  protected readonly pipelineItems = computed<
    readonly { id: string; name: string; category: string | undefined }[]
  >(() => {
    return this.currentEffectIds().map((id) => {
      const eff = this.registry.get(id);
      if (eff !== null) {
        return { id, name: eff.name, category: eff.category };
      }
      // Broken reference — show as "unknown" so user can remove it.
      return { id, name: '(unknown effect)', category: undefined };
    });
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

  protected isInPipeline(id: string): boolean {
    return this.currentEffectIds().includes(id);
  }

  /** Add an effect to the END of the pipeline. */
  protected add(id: string): void {
    if (this.isInPipeline(id)) return;
    this.applyPipeline([...this.currentEffectIds(), id], `Add ${id}`);
  }

  /** Remove an effect from the pipeline. */
  protected remove(id: string): void {
    const next = this.currentEffectIds().filter((eid) => eid !== id);
    this.applyPipeline(next, `Remove ${id}`);
  }

  /** Move an effect one position earlier (toward step 1). */
  protected moveUp(id: string): void {
    const list = [...this.currentEffectIds()];
    const idx = list.indexOf(id);
    if (idx <= 0) return;
    [list[idx - 1], list[idx]] = [list[idx]!, list[idx - 1]!];
    this.applyPipeline(list, `Reorder ${id} up`);
  }

  /** Move an effect one position later (toward step N). */
  protected moveDown(id: string): void {
    const list = [...this.currentEffectIds()];
    const idx = list.indexOf(id);
    if (idx < 0 || idx >= list.length - 1) return;
    [list[idx], list[idx + 1]] = [list[idx + 1]!, list[idx]!];
    this.applyPipeline(list, `Reorder ${id} down`);
  }

  /** Wipe the entire pipeline. */
  protected clearAll(): void {
    this.applyPipeline([], 'Clear filter');
  }

  /**
   * Apply a new pipeline to every selected node. Computes the filter
   * URL (undefined / single / chain) and dispatches a single
   * `SetStylePropertyOnManyCommand` for one undo entry.
   */
  private applyPipeline(effectIds: readonly string[], label: string): void {
    const selected = Array.from(this.selection.selectedIds()) as NodeId[];
    if (selected.length === 0) return;
    const filter = this.buildFilterUrl(effectIds);
    this.bus.dispatch(new SetStylePropertyOnManyCommand(selected, 'filter', filter, label));
  }

  /**
   * Build the `style.filter` value for a given pipeline:
   * - empty → `undefined` (clears the property)
   * - 1 effect → `url(#effectId)` (compat with v1)
   * - 2+ effects → `url(#svge-chain-...)` (composed chain)
   */
  private buildFilterUrl(effectIds: readonly string[]): string | undefined {
    if (effectIds.length === 0) return undefined;
    if (effectIds.length === 1) return `url(#${effectIds[0]!})`;
    return `url(#${makeChainFilterId(effectIds)})`;
  }
}
