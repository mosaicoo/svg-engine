/**
 * Visual effect — categoria 7 do D-023 (`EffectRegistry`).
 *
 * Each effect contributes a self-contained SVG `<filter>` element that
 * gets injected into the renderer's `<defs>` block. Nodes opt into an
 * effect by setting `style.filter = 'url(#<effect-id>)'` via the normal
 * command flow (no separate "applied effect" model — filter is a CSS/SVG
 * presentation attribute like fill/stroke).
 *
 * **Field semantics**:
 *
 * - `id`: globally unique. Convention: reverse-DNS + kebab (e.g.,
 *   `svge.builtin.effect.blur`). The id is what consumers will reference
 *   via `url(#id)` when the effect is applied with its **default** params.
 * - `name`: human-readable label shown in effect pickers.
 * - `category`: optional grouping (`'blur'`, `'shadow'`, `'color'`,
 *   `'distortion'`). UIs organize the picker by category; unknown
 *   categories are treated as `'other'`.
 * - `params`: optional schema of editable knobs (D-144). When present the
 *   `<svge-effects-panel>` renders a control per param and re-encodes the
 *   chosen values into the node's `style.filter` URL — keeping the whole
 *   thing stateless (see `effect-instance.ts`). Effects without `params`
 *   are fixed visuals (e.g. grayscale/sepia/invert are toggles).
 * - `presets`: optional named param sets (e.g. Blur → soft/medium/strong)
 *   shown as one-click chips in the panel.
 * - `buildFilterMarkup(params?)`: returns the **complete**
 *   `<filter ...>…</filter>` XML string. Called with no argument it MUST
 *   reproduce the default visual (so a plain `url(#id)` reference keeps
 *   working and existing documents render unchanged). The filter `id`
 *   embedded in the returned markup is the caller's responsibility — for
 *   the default (param-less) markup use {@link Effect.id}; for a
 *   parametric instance the registry passes a derived id (it rewrites the
 *   wrapper), so the factory can keep emitting `id="${this.id}"`.
 *
 * **Why `buildFilterMarkup` instead of a structured representation**:
 * SVG filters have ~20 primitive elements (`<feGaussianBlur>`,
 * `<feOffset>`, `<feMerge>`, …) plus `result` chaining. Modelling them
 * as TypeScript types reproduces the entire filter algebra in the
 * editor — significant surface for very little gain. A raw markup
 * factory parametrized by a small typed `params` schema is what plugin
 * authors actually want.
 *
 * **D-144 (params)**: parametric effects are **stateless** — the chosen
 * values are encoded into the `style.filter` URL id (see
 * `effect-instance.ts`), exactly like effect chains encode their member
 * ids. No new per-node model, so undo/redo, IO round-trip and per-editor
 * scope keep working for free. Backwards compatible: a `buildFilterMarkup()`
 * with no args still yields the v1 default filter.
 */
export interface Effect {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  /** Editable parameters (D-144). Absent = fixed visual (no controls). */
  readonly params?: readonly EffectParam[];
  /** Named one-click param presets (D-144), shown as chips in the panel. */
  readonly presets?: readonly EffectPreset[];
  /**
   * Build the full `<filter>` element markup for this effect. The
   * returned XML MUST include the filter element with `id="<effect.id>"`
   * so that consumer nodes referencing `url(#id)` resolve correctly.
   *
   * @param params optional partial param overrides; missing keys fall
   *   back to each param's `default` (and out-of-range numbers are
   *   clamped) via {@link resolveEffectParams}. With no argument the
   *   method reproduces the default v1 visual.
   */
  buildFilterMarkup(params?: EffectParams): string;
}

/** A concrete value an effect param can hold. */
export type EffectParamValue = number | string | boolean;

/** A resolved bag of param values (key → value), ready to render. */
export type EffectParams = Readonly<Record<string, EffectParamValue>>;

/** Discriminator for how the panel renders + validates a param. */
export type EffectParamType = 'number' | 'percent' | 'angle' | 'color' | 'select' | 'boolean';

interface EffectParamCommon {
  /** Stable key, unique within the effect. Used in the encoded URL. */
  readonly key: string;
  /** Human-readable label for the control. */
  readonly label: string;
  readonly type: EffectParamType;
}

/** Numeric param (`number`/`percent`/`angle`) — rendered as slider + input. */
export interface EffectNumberParam extends EffectParamCommon {
  readonly type: 'number' | 'percent' | 'angle';
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Display-only unit hint (`px`, `°`, `%`). */
  readonly unit?: string;
}

/** Color param — rendered with the advanced color picker. */
export interface EffectColorParam extends EffectParamCommon {
  readonly type: 'color';
  readonly default: string;
}

/** Enumerated choice — rendered as a `mat-select`. */
export interface EffectSelectParam extends EffectParamCommon {
  readonly type: 'select';
  readonly default: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

/** On/off param — rendered as a checkbox/toggle. */
export interface EffectBooleanParam extends EffectParamCommon {
  readonly type: 'boolean';
  readonly default: boolean;
}

/** Union of all param descriptor shapes. */
export type EffectParam =
  | EffectNumberParam
  | EffectColorParam
  | EffectSelectParam
  | EffectBooleanParam;

/** A named, one-click set of param overrides for an effect. */
export interface EffectPreset {
  /** Stable id, unique within the effect (kebab-case). */
  readonly id: string;
  /** Human-readable label shown on the preset chip. */
  readonly name: string;
  /** Param overrides applied on top of the effect defaults. */
  readonly params: EffectParams;
}

/** True when `e` is a numeric param (`number`/`percent`/`angle`). */
export function isNumberParam(p: EffectParam): p is EffectNumberParam {
  return p.type === 'number' || p.type === 'percent' || p.type === 'angle';
}

/**
 * The default value bag for an effect (every param at its `default`).
 * Empty object for effects without params.
 */
export function effectDefaults(effect: Effect): EffectParams {
  const out: Record<string, EffectParamValue> = {};
  for (const p of effect.params ?? []) out[p.key] = p.default;
  return out;
}

/**
 * Merge `partial` over the effect defaults, dropping unknown keys and
 * coercing/clamping each value to its param descriptor:
 * - numbers are clamped to `[min, max]` when defined; non-finite falls
 *   back to the default;
 * - selects fall back to the default when the value isn't an option;
 * - booleans/colors are taken as-is when the primitive type matches.
 *
 * The result is a complete bag (one entry per declared param), so
 * `buildFilterMarkup` can read every key without optional-chaining.
 */
export function resolveEffectParams(effect: Effect, partial?: EffectParams): EffectParams {
  const out: Record<string, EffectParamValue> = {};
  for (const p of effect.params ?? []) {
    const raw = partial?.[p.key];
    if (isNumberParam(p)) {
      let n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) n = p.default;
      if (typeof p.min === 'number') n = Math.max(p.min, n);
      if (typeof p.max === 'number') n = Math.min(p.max, n);
      out[p.key] = n;
    } else if (p.type === 'color') {
      out[p.key] = typeof raw === 'string' && raw.length > 0 ? raw : p.default;
    } else if (p.type === 'select') {
      out[p.key] = p.options.some((o) => o.value === raw) ? (raw as string) : p.default;
    } else {
      out[p.key] = typeof raw === 'boolean' ? raw : p.default;
    }
  }
  return out;
}

/**
 * Subset of `params` whose values differ from the effect defaults.
 * Used by the URL encoder so the common "all defaults" case produces a
 * clean `url(#id)` rather than redundantly serialising every knob.
 */
export function nonDefaultParams(effect: Effect, params: EffectParams): EffectParams {
  const out: Record<string, EffectParamValue> = {};
  for (const p of effect.params ?? []) {
    const v = params[p.key];
    if (v !== undefined && v !== p.default) out[p.key] = v;
  }
  return out;
}
