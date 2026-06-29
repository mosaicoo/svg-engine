import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
  /** Effect is missing from the registry (broken reference). */
  readonly broken: boolean;
}

/**
 * Effects pipeline editor — Fase 6d (D-023 cat 7), chains em D-047,
 * **parâmetros editáveis + presets em D-144**.
 *
 * **Three things per applied effect**:
 * 1. Reorder / remove (chain order = aplicação do filtro).
 * 2. **Param controls** (D-144): slider/number/cor/select/checkbox por knob
 *    declarado em `Effect.params` — editar dispara um
 *    {@link SetStylePropertyOnManyCommand} (undo unificado).
 * 3. **Presets** (D-144): chips de configurações nomeadas (`Effect.presets`).
 *
 * **Storage stateless** (`style.filter`):
 * - vazio → `undefined`
 * - 1 effect sem params custom → `url(#effectId)` (compat v1)
 * - 2+ effects sem params custom → `url(#svge-chain-a__b)` (compat D-047)
 * - qualquer params custom → `url(#svge-fx-<base64url>)` (D-144; a
 *   `ParametricEffectRegistry` deriva o `<filter>` e o renderer injeta).
 *
 * Cada efeito aparece no máximo uma vez no pipeline (para variar o mesmo
 * efeito, ajuste seus parâmetros). Multi-select aplica a mesma mudança a
 * todos os nós selecionados.
 *
 * **Headless boundary**: só `MatIcon` + `MatIconButton`; controles de
 * parâmetro usam inputs nativos (range/number/color/select/checkbox) —
 * acessíveis e sem dependências Material extras.
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
            @for (item of pipelineItems(); track item.effectId; let i = $index) {
              <li class="pipeline-item">
                <div class="step-head">
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
                </div>

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
                        <span class="param-label">{{ ctrl.param.label }}</span>
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
                                <option [value]="opt.value" [selected]="opt.value === ctrl.value">
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
                }
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
      gap: 6px;
    }
    .pipeline-item {
      border-radius: 4px;
      background: var(--mat-sys-surface-container-low, rgba(0, 0, 0, 0.02));
      padding: 4px 6px;
    }
    .step-head {
      display: flex;
      align-items: center;
      gap: 6px;
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
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 6px 0 2px 24px;
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
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .preset-chip.reset {
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
    }
    .preset-chip mat-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
    }
    .params {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 6px 0 2px 24px;
    }
    .param-row {
      display: grid;
      grid-template-columns: 78px 1fr auto;
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
    }
    .param-number {
      width: 56px;
      font-size: 12px;
      padding: 2px 4px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
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
   * Applied pipeline on the focus node as an ordered list of
   * {@link EffectInstance}s. Reads `style.filter`, supporting:
   * - parametric `url(#svge-fx-...)` → instances with params
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

  // ── pipeline mutations ───────────────────────────────────────────────

  /** Add an effect to the END of the pipeline (default params). */
  protected add(id: string): void {
    if (this.isInPipeline(id)) return;
    this.applyInstances([...this.currentInstances(), { effectId: id }], `Add ${id}`);
  }

  protected remove(id: string): void {
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

  protected clearAll(): void {
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
    const next = this.currentInstances().map((i) =>
      i.effectId === effectId
        ? Object.keys(custom).length > 0
          ? { effectId, params: custom }
          : { effectId }
        : i,
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
   * - no custom params: 1 → `url(#effectId)`; 2+ → `url(#svge-chain-...)`
   * - any custom params → `url(#svge-fx-<encoded>)` (D-144)
   */
  private buildFilterUrl(instances: readonly EffectInstance[]): string | undefined {
    if (instances.length === 0) return undefined;
    const hasParams = instances.some((i) => i.params && Object.keys(i.params).length > 0);
    if (!hasParams) {
      const ids = instances.map((i) => i.effectId);
      return ids.length === 1 ? `url(#${ids[0]!})` : `url(#${makeChainFilterId(ids)})`;
    }
    return `url(#${encodeEffectFilterId(instances)})`;
  }
}

/** Re-exported so consumers/tests can reference `effectDefaults` if needed. */
export { effectDefaults };
