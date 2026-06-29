import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  type NodeId,
  SetStylePropertyOnManyCommand,
} from '@mosaicoo/svg-engine/core';
import {
  type Effect,
  type EffectInstance,
  type EffectParam,
  type EffectParams,
  type EffectParamValue,
  type EffectPreset,
  EffectRegistry,
  effectDefaults,
  encodeEffectFilterId,
  extractChainFilterId,
  extractEffectFilterId,
  makeChainFilterId,
  nonDefaultParams,
  parseChainFilterId,
  parseEffectFilterId,
  resolveEffectParams,
  SelectionService,
} from '@mosaicoo/svg-engine/edit';

/** Resolved control descriptor for one param of a pipeline stage. */
interface ParamControl {
  readonly param: EffectParam;
  /** `'number'` covers number/percent/angle; others map 1:1. */
  readonly kind: 'number' | 'color' | 'select' | 'boolean';
  readonly value: EffectParamValue;
}

/** A resolved pipeline stage (one applied effect + its editable controls). */
interface PipelineItem {
  readonly effectId: string;
  readonly name: string;
  readonly category: string | undefined;
  /** Custom param values currently applied (resolved over defaults). */
  readonly controls: readonly ParamControl[];
  readonly presets: readonly EffectPreset[];
  /** True when any param differs from its default (enables "Reset"). */
  readonly customized: boolean;
  /** Non-destructive mute state (D-146): false = skipped when rendering. */
  readonly enabled: boolean;
  /** Effect is missing from the registry (broken reference). */
  readonly broken: boolean;
}

/**
 * Effects pipeline editor — Fase 6d (D-023 cat 7), chains em D-047,
 * **parâmetros editáveis + presets em D-144**, **UX acordeão + mute em D-146**.
 *
 * **UX (D-146)** — divulgação progressiva para escalar com vários efeitos:
 * - Cada estágio é um **cartão recolhível** (accordion): o cabeçalho mostra
 *   nº · nome · categoria e os controles (reordenar/mute/remover); o corpo
 *   (presets + parâmetros) abre só no estágio em foco. Adicionar um efeito o
 *   expande automaticamente.
 * - **Mute** por efeito (ícone de olho): não-destrutivo — mantém o efeito no
 *   pipeline mas o pula na composição (encoding `x:0`, ver `effect-instance`).
 * - **Picker compacto**: "Add effect" abre/fecha as categorias sob demanda,
 *   em vez de ocupar o painel inteiro.
 *
 * **Storage stateless** (`style.filter`):
 * - vazio → `undefined`
 * - 1 efeito ativo sem params custom → `url(#effectId)` (compat v1)
 * - 2+ efeitos sem params/mute → `url(#svge-chain-a__b)` (compat D-047)
 * - qualquer params custom **ou** mute → `url(#svge-fx-<base64url>)` (D-144/146)
 *
 * Cada efeito aparece no máximo uma vez no pipeline (para variar o mesmo
 * efeito, ajuste os parâmetros). Multi-seleção aplica a todos os nós.
 *
 * **Headless boundary**: só `MatIcon` + `MatIconButton`; controles de
 * parâmetro usam inputs nativos (range/number/color/select/checkbox).
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
          <div class="pipeline-head">
            <h4>Active pipeline ({{ pipelineItems().length }})</h4>
            <button type="button" class="link-btn" title="Remove all effects" (click)="clearAll()">
              <mat-icon aria-hidden="true">delete_sweep</mat-icon>
              Clear all
            </button>
          </div>
          <ol class="pipeline-list">
            @for (item of pipelineItems(); track item.effectId; let i = $index) {
              <li
                class="pipeline-item"
                [class.expanded]="isExpanded(item.effectId)"
                [class.muted]="!item.enabled"
              >
                <div class="step-head">
                  <button
                    type="button"
                    class="step-summary"
                    [attr.aria-expanded]="isExpanded(item.effectId)"
                    [title]="(isExpanded(item.effectId) ? 'Collapse ' : 'Expand ') + item.name"
                    (click)="toggleExpand(item.effectId)"
                  >
                    <mat-icon class="chevron" aria-hidden="true">
                      {{ isExpanded(item.effectId) ? 'expand_more' : 'chevron_right' }}
                    </mat-icon>
                    <span class="step-num" aria-hidden="true">{{ i + 1 }}</span>
                    <span class="step-name">{{ item.name }}</span>
                    @if (item.customized) {
                      <span class="edited-dot" title="Customized" aria-label="Customized"></span>
                    }
                  </button>
                  <span class="step-actions">
                    <button
                      mat-icon-button
                      type="button"
                      class="step-btn"
                      [attr.aria-label]="(item.enabled ? 'Disable ' : 'Enable ') + item.name"
                      [attr.aria-pressed]="!item.enabled"
                      [title]="item.enabled ? 'Disable effect' : 'Enable effect'"
                      (click)="toggleEnabled(item.effectId)"
                    >
                      <mat-icon>{{ item.enabled ? 'visibility' : 'visibility_off' }}</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      class="step-btn"
                      [disabled]="i === 0"
                      [attr.aria-label]="'Move ' + item.name + ' up'"
                      title="Move up"
                      (click)="moveUp(item.effectId)"
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
                      (click)="moveDown(item.effectId)"
                    >
                      <mat-icon>arrow_downward</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      class="step-btn step-btn-remove"
                      [attr.aria-label]="'Remove ' + item.name"
                      title="Remove"
                      (click)="remove(item.effectId)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </span>
                </div>

                @if (isExpanded(item.effectId)) {
                  <div class="step-body">
                    @if (item.broken) {
                      <p class="broken-note">This effect is not registered in this editor.</p>
                    }
                    @if (item.presets.length > 0) {
                      <div class="presets" role="group" [attr.aria-label]="item.name + ' presets'">
                        @for (preset of item.presets; track preset.id) {
                          <button
                            type="button"
                            class="preset-chip"
                            [title]="'Apply preset: ' + preset.name"
                            (click)="applyPreset(item.effectId, preset)"
                          >
                            {{ preset.name }}
                          </button>
                        }
                        @if (item.customized) {
                          <button
                            type="button"
                            class="preset-chip reset"
                            title="Reset to defaults"
                            (click)="resetParams(item.effectId)"
                          >
                            <mat-icon aria-hidden="true">restart_alt</mat-icon>
                            Reset
                          </button>
                        }
                      </div>
                    }

                    @if (item.controls.length > 0) {
                      <div class="params">
                        @for (ctrl of item.controls; track ctrl.param.key) {
                          <div class="param-row">
                            <span class="param-label" [title]="ctrl.param.label">
                              {{ ctrl.param.label }}
                            </span>
                            @switch (ctrl.kind) {
                              @case ('number') {
                                <input
                                  type="range"
                                  class="param-range"
                                  [min]="numMin(ctrl)"
                                  [max]="numMax(ctrl)"
                                  [step]="numStep(ctrl)"
                                  [value]="ctrl.value"
                                  [attr.aria-label]="ctrl.param.label"
                                  (input)="onParam(item.effectId, ctrl, $event)"
                                />
                                <span class="param-value">
                                  <input
                                    type="number"
                                    class="param-number"
                                    [min]="numMin(ctrl)"
                                    [max]="numMax(ctrl)"
                                    [step]="numStep(ctrl)"
                                    [value]="ctrl.value"
                                    [attr.aria-label]="ctrl.param.label + ' value'"
                                    (change)="onParam(item.effectId, ctrl, $event)"
                                  />
                                  @if (unit(ctrl)) {
                                    <span class="param-unit">{{ unit(ctrl) }}</span>
                                  }
                                </span>
                              }
                              @case ('color') {
                                <input
                                  type="color"
                                  class="param-color"
                                  [value]="ctrl.value"
                                  [attr.aria-label]="ctrl.param.label"
                                  (change)="onParam(item.effectId, ctrl, $event)"
                                />
                              }
                              @case ('select') {
                                <select
                                  class="param-select"
                                  [value]="ctrl.value"
                                  [attr.aria-label]="ctrl.param.label"
                                  (change)="onParam(item.effectId, ctrl, $event)"
                                >
                                  @for (opt of selectOptions(ctrl); track opt.value) {
                                    <option
                                      [value]="opt.value"
                                      [selected]="opt.value === ctrl.value"
                                    >
                                      {{ opt.label }}
                                    </option>
                                  }
                                </select>
                              }
                              @case ('boolean') {
                                <input
                                  type="checkbox"
                                  class="param-checkbox"
                                  [checked]="ctrl.value === true"
                                  [attr.aria-label]="ctrl.param.label"
                                  (change)="onParam(item.effectId, ctrl, $event)"
                                />
                              }
                            }
                          </div>
                        }
                      </div>
                    } @else if (!item.broken && item.presets.length === 0) {
                      <p class="no-params">No adjustable parameters.</p>
                    }
                  </div>
                }
              </li>
            }
          </ol>
        </section>
      }

      <section class="add-section">
        <button
          type="button"
          class="add-toggle"
          [class.open]="pickerOpen()"
          [attr.aria-expanded]="pickerOpen()"
          (click)="togglePicker()"
        >
          <mat-icon aria-hidden="true">{{ pickerOpen() ? 'expand_more' : 'add' }}</mat-icon>
          <span>{{ pipelineItems().length > 0 ? 'Add another effect' : 'Add effect' }}</span>
        </button>
        @if (pickerOpen()) {
          <div class="picker">
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
      margin-top: 4px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }
    .pipeline-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .pipeline-head h4,
    .group h5 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
      margin: 0;
      font-weight: 500;
    }
    .link-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border: none;
      background: transparent;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
      font-size: 11px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .link-btn:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.05));
      color: var(--mat-sys-error, #b3261e);
    }
    .link-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .pipeline-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pipeline-item {
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 6px;
      background: var(--mat-sys-surface-container-low, rgba(0, 0, 0, 0.02));
      overflow: hidden;
    }
    .pipeline-item.expanded {
      border-color: var(--mat-sys-primary, #1976d2);
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.03));
    }
    .pipeline-item.muted .step-name {
      text-decoration: line-through;
      opacity: 0.6;
    }
    .pipeline-item.muted .step-num {
      opacity: 0.5;
    }
    .step-head {
      display: flex;
      align-items: center;
    }
    .step-summary {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      padding: 5px 4px 5px 2px;
      cursor: pointer;
    }
    .step-summary:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
      border-radius: 4px;
    }
    .chevron {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
    }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--mat-sys-primary-container, #cce0ff);
      color: var(--mat-sys-on-primary-container, #001b3d);
      font-size: 10px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .step-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .edited-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--mat-sys-primary, #1976d2);
      flex-shrink: 0;
    }
    .step-actions {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      padding-right: 2px;
    }
    .step-btn {
      width: 26px !important;
      height: 26px !important;
      line-height: 26px !important;
      padding: 0 !important;
    }
    .step-btn mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }
    .step-btn-remove mat-icon {
      color: var(--mat-sys-error, #b3261e);
    }
    .step-btn:disabled mat-icon {
      opacity: 0.3;
    }
    .step-body {
      padding: 2px 8px 8px 24px;
    }
    .broken-note,
    .no-params {
      font-size: 11px;
      font-style: italic;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
      margin: 4px 0;
    }
    .broken-note {
      color: var(--mat-sys-error, #b3261e);
    }
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 4px 0 8px;
    }
    .preset-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 8px;
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      background: transparent;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.7));
      font-size: 11px;
      cursor: pointer;
    }
    .preset-chip:hover {
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
    }
    .preset-chip mat-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
    }
    .params {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .param-row {
      display: grid;
      grid-template-columns: 76px 1fr auto;
      align-items: center;
      gap: 8px;
    }
    .param-label {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.7));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .param-range {
      width: 100%;
      accent-color: var(--mat-sys-primary, #1976d2);
      min-width: 0;
    }
    .param-value {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .param-number {
      width: 50px;
      font-size: 12px;
      padding: 2px 4px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    .param-unit {
      font-size: 10px;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.5));
      width: 14px;
    }
    .param-color {
      grid-column: 2 / 4;
      justify-self: start;
      width: 44px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 4px;
      background: none;
      cursor: pointer;
    }
    .param-select {
      grid-column: 2 / 4;
      font-size: 12px;
      padding: 2px 4px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    .param-checkbox {
      grid-column: 2 / 4;
      justify-self: start;
      accent-color: var(--mat-sys-primary, #1976d2);
    }
    .add-section {
      margin-top: 10px;
    }
    .add-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px dashed var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.3));
      background: transparent;
      color: var(--mat-sys-on-surface, inherit);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .add-toggle:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .add-toggle.open {
      border-style: solid;
    }
    .add-toggle mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .picker {
      margin-top: 8px;
    }
    .group {
      margin-top: 8px;
    }
    .group:first-child {
      margin-top: 0;
    }
    .group h5 {
      margin: 0 0 4px;
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

  /** Effect id of the single expanded accordion stage (null = all collapsed). */
  private readonly _expandedId = signal<string | null>(null);
  /** Whether the "Add effect" picker is open. */
  private readonly _pickerOpen = signal(false);
  protected readonly pickerOpen = this._pickerOpen.asReadonly();

  /** All registered effects (reactive). */
  protected readonly effects = this.registry.effects;

  /** Focused single node (or first selected) — null when nothing is selected. */
  protected readonly focusNode = computed(() => {
    const id = this.selection.focusId();
    if (id === null) return null;
    return findNodeById(this.state.document().root, id);
  });

  /**
   * Applied pipeline on the focus node as an ordered list of
   * {@link EffectInstance}s. Reads `style.filter`, supporting:
   * - parametric `url(#svge-fx-...)` → instances with params / mute
   * - chain `url(#svge-chain-a__b)` → instances (no params)
   * - single `url(#effectId)` → one instance (no params)
   */
  protected readonly currentInstances = computed<readonly EffectInstance[]>(() => {
    const node = this.focusNode();
    if (node === null) return [];
    const filter = node.style.filter;
    if (filter === undefined) return [];

    const fxId = extractEffectFilterId(filter);
    if (fxId !== null) return parseEffectFilterId(fxId) ?? [];

    const chainId = extractChainFilterId(filter);
    if (chainId !== null) {
      return (parseChainFilterId(chainId) ?? []).map((effectId) => ({ effectId }));
    }

    const m = /^url\(#(.+)\)$/.exec(filter.trim());
    if (m === null) return [];
    return [{ effectId: m[1]! }];
  });

  /** Effect IDs currently in the pipeline (for the picker's "active" state). */
  protected readonly currentEffectIds = computed<readonly string[]>(() =>
    this.currentInstances().map((i) => i.effectId),
  );

  /** Resolved pipeline stages with controls + presets ready to render. */
  protected readonly pipelineItems = computed<readonly PipelineItem[]>(() =>
    this.currentInstances().map((inst) => this.toPipelineItem(inst)),
  );

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
    return Array.from(byCat.entries()).map(([category, effects]) => ({ category, effects }));
  });

  protected isInPipeline(id: string): boolean {
    return this.currentEffectIds().includes(id);
  }

  protected isExpanded(id: string): boolean {
    return this._expandedId() === id;
  }

  protected toggleExpand(id: string): void {
    this._expandedId.update((cur) => (cur === id ? null : id));
  }

  protected togglePicker(): void {
    this._pickerOpen.update((v) => !v);
  }

  // ── template helpers (avoid type-narrowing in the template) ──────────
  protected numMin(c: ParamControl): number | null {
    return c.param.type === 'number' || c.param.type === 'percent' || c.param.type === 'angle'
      ? (c.param.min ?? null)
      : null;
  }
  protected numMax(c: ParamControl): number | null {
    return c.param.type === 'number' || c.param.type === 'percent' || c.param.type === 'angle'
      ? (c.param.max ?? null)
      : null;
  }
  protected numStep(c: ParamControl): number | null {
    return c.param.type === 'number' || c.param.type === 'percent' || c.param.type === 'angle'
      ? (c.param.step ?? null)
      : null;
  }
  protected selectOptions(
    c: ParamControl,
  ): readonly { readonly value: string; readonly label: string }[] {
    return c.param.type === 'select' ? c.param.options : [];
  }
  /** Unit suffix shown after a numeric value (e.g. `px`, `°`); '' when none. */
  protected unit(c: ParamControl): string {
    const p = c.param;
    return p.type === 'number' || p.type === 'percent' || p.type === 'angle' ? (p.unit ?? '') : '';
  }

  // ── pipeline mutations ───────────────────────────────────────────────

  /** Add an effect to the END of the pipeline (default params) and expand it. */
  protected add(id: string): void {
    if (this.isInPipeline(id)) return;
    this._expandedId.set(id);
    this.applyInstances([...this.currentInstances(), { effectId: id }], `Add ${id}`);
  }

  protected remove(id: string): void {
    if (this._expandedId() === id) this._expandedId.set(null);
    this.applyInstances(
      this.currentInstances().filter((i) => i.effectId !== id),
      `Remove ${id}`,
    );
  }

  protected moveUp(id: string): void {
    const list = [...this.currentInstances()];
    const idx = list.findIndex((i) => i.effectId === id);
    if (idx <= 0) return;
    [list[idx - 1], list[idx]] = [list[idx]!, list[idx - 1]!];
    this.applyInstances(list, `Reorder ${id} up`);
  }

  protected moveDown(id: string): void {
    const list = [...this.currentInstances()];
    const idx = list.findIndex((i) => i.effectId === id);
    if (idx < 0 || idx >= list.length - 1) return;
    [list[idx], list[idx + 1]] = [list[idx + 1]!, list[idx]!];
    this.applyInstances(list, `Reorder ${id} down`);
  }

  /** Non-destructive mute/unmute (D-146) — keeps the stage, toggles render. */
  protected toggleEnabled(id: string): void {
    const wasMuted = this.currentInstances().find((i) => i.effectId === id)?.enabled === false;
    const next = this.currentInstances().map<EffectInstance>((i) =>
      i.effectId !== id
        ? i
        : {
            effectId: i.effectId,
            ...(i.params ? { params: i.params } : {}),
            ...(wasMuted ? {} : { enabled: false }), // was active → mute
          },
    );
    this.applyInstances(next, `${wasMuted ? 'Enable' : 'Disable'} ${id}`);
  }

  protected clearAll(): void {
    this._expandedId.set(null);
    this.applyInstances([], 'Clear filter');
  }

  /** Handle a param control change → merge the new value into the instance. */
  protected onParam(effectId: string, ctrl: ParamControl, event: Event): void {
    const effect = this.registry.get(effectId);
    if (effect === null) return;
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const raw: EffectParamValue =
      ctrl.kind === 'boolean'
        ? (target as HTMLInputElement).checked
        : ctrl.kind === 'number'
          ? Number(target.value)
          : target.value;
    this.setParam(effectId, effect, ctrl.param.key, raw);
  }

  /** Apply a named preset's params to a pipeline stage. */
  protected applyPreset(effectId: string, preset: EffectPreset): void {
    const effect = this.registry.get(effectId);
    if (effect === null) return;
    const merged = resolveEffectParams(effect, {
      ...this.instanceParams(effectId),
      ...preset.params,
    });
    this.commitParams(effectId, effect, merged, `Preset ${preset.name}`);
  }

  /** Reset a stage's params back to the effect defaults (plain reference). */
  protected resetParams(effectId: string): void {
    this.commitParams(effectId, this.registry.get(effectId)!, {}, `Reset ${effectId}`);
  }

  // ── internals ────────────────────────────────────────────────────────

  private setParam(effectId: string, effect: Effect, key: string, value: EffectParamValue): void {
    const next = resolveEffectParams(effect, { ...this.instanceParams(effectId), [key]: value });
    this.commitParams(effectId, effect, next, `Set ${effect.name} ${key}`);
  }

  /** Current custom params for a stage (empty object when none). */
  private instanceParams(effectId: string): EffectParams {
    return this.currentInstances().find((i) => i.effectId === effectId)?.params ?? {};
  }

  /** Replace one stage's params (stored as non-default only) and re-apply. */
  private commitParams(
    effectId: string,
    effect: Effect,
    resolved: EffectParams,
    label: string,
  ): void {
    const custom = nonDefaultParams(effect, resolved);
    const next = this.currentInstances().map<EffectInstance>((i) =>
      i.effectId !== effectId
        ? i
        : {
            effectId,
            ...(Object.keys(custom).length > 0 ? { params: custom } : {}),
            ...(i.enabled === false ? { enabled: false } : {}), // preserve mute through edits
          },
    );
    this.applyInstances(next, label);
  }

  private toPipelineItem(inst: EffectInstance): PipelineItem {
    const effect = this.registry.get(inst.effectId);
    if (effect === null) {
      return {
        effectId: inst.effectId,
        name: '(unknown effect)',
        category: undefined,
        controls: [],
        presets: [],
        customized: false,
        enabled: inst.enabled !== false,
        broken: true,
      };
    }
    const resolved = resolveEffectParams(effect, inst.params);
    const controls: ParamControl[] = (effect.params ?? []).map((param) => ({
      param,
      kind:
        param.type === 'number' || param.type === 'percent' || param.type === 'angle'
          ? 'number'
          : param.type,
      value: resolved[param.key]!,
    }));
    return {
      effectId: inst.effectId,
      name: effect.name,
      category: effect.category,
      controls,
      presets: effect.presets ?? [],
      customized: Object.keys(nonDefaultParams(effect, resolved)).length > 0,
      enabled: inst.enabled !== false,
      broken: false,
    };
  }

  /**
   * Apply a new pipeline to every selected node via a single
   * `SetStylePropertyOnManyCommand` (one undo entry). Computes the
   * stateless `style.filter` URL (plain / chain / parametric).
   */
  private applyInstances(instances: readonly EffectInstance[], label: string): void {
    const selected = Array.from(this.selection.selectedIds()) as NodeId[];
    if (selected.length === 0) return;
    this.bus.dispatch(
      new SetStylePropertyOnManyCommand(selected, 'filter', this.buildFilterUrl(instances), label),
    );
  }

  /**
   * Build the `style.filter` value for a pipeline:
   * - empty → `undefined`
   * - no custom params and no mute: 1 → `url(#effectId)`; 2+ → `url(#svge-chain-...)`
   * - any custom params OR any muted effect → `url(#svge-fx-<encoded>)` (D-144/146)
   */
  private buildFilterUrl(instances: readonly EffectInstance[]): string | undefined {
    if (instances.length === 0) return undefined;
    const needsParametric = instances.some(
      (i) => (i.params && Object.keys(i.params).length > 0) || i.enabled === false,
    );
    if (!needsParametric) {
      const ids = instances.map((i) => i.effectId);
      return ids.length === 1 ? `url(#${ids[0]!})` : `url(#${makeChainFilterId(ids)})`;
    }
    return `url(#${encodeEffectFilterId(instances)})`;
  }
}

/** Re-exported so consumers/tests can reference `effectDefaults` if needed. */
export { effectDefaults };
