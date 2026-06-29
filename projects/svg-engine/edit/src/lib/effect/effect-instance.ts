import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService, type SvgNode, walk } from '@mosaicoo/svg-engine/core';
import { composeFilterMarkups, stripFilterWrapper } from './chain-filter';
import type { EffectParams } from './effect';
import { EffectRegistry } from './effect-registry.service';

/**
 * Parametric effect instances — D-144 (2026-06-28).
 *
 * Where {@link Effect}s are **definitions** (with default visuals) and
 * chains combine several of them at their defaults, a *parametric
 * instance* applies one (or more) effect with **custom param values**.
 *
 * **Stateless, like chains**: the instance is encoded INTO the
 * `style.filter` URL id, so there is no new per-node model — undo/redo,
 * IO round-trip and per-editor scope all keep working for free. The id
 * looks like:
 *
 *     url(#svge-fx-<base64url({ e: effectId, p: params }[])>)
 *
 * `base64url` keeps the id XML-safe (only `[A-Za-z0-9-_]`, prefixed so it
 * always starts with a letter). The renderer's defs injector
 * ({@link ParametricEffectRegistry}) walks the document, decodes each id
 * and rebuilds the composed `<filter>` from `effect.buildFilterMarkup(params)`.
 *
 * When every param equals its default the panel uses the plain
 * `url(#effectId)` reference instead — parametric ids only appear once a
 * value is actually customised, keeping exported markup tidy.
 */

/** One effect applied with optional custom params. */
export interface EffectInstance {
  readonly effectId: string;
  readonly params?: EffectParams;
}

/** Stable prefix for parametric instance filter IDs. */
export const PARAM_FILTER_ID_PREFIX = 'svge-fx-';

/** Compact serialised entry: `e` = effect id, `p` = (optional) params. */
interface EncodedEntry {
  readonly e: string;
  readonly p?: EffectParams;
}

/** base64 → base64url (XML-id-safe), padding stripped. */
function toBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → base64 → decoded string. */
function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

/**
 * Encode an ordered list of parametric instances into a filter id.
 * Deterministic: the same input yields the same id, so two nodes sharing
 * the exact same instance share a single composed `<filter>` in defs.
 */
export function encodeEffectFilterId(instances: readonly EffectInstance[]): string {
  const payload: EncodedEntry[] = instances.map((i) =>
    i.params && Object.keys(i.params).length > 0
      ? { e: i.effectId, p: i.params }
      : { e: i.effectId },
  );
  return PARAM_FILTER_ID_PREFIX + toBase64Url(JSON.stringify(payload));
}

/**
 * Decode a parametric instance filter id back into its instances, or
 * `null` if `id` is not a parametric id or is malformed (defensive: a
 * corrupt id falls back to "no filter" rather than throwing).
 */
export function parseEffectFilterId(id: string): readonly EffectInstance[] | null {
  if (!id.startsWith(PARAM_FILTER_ID_PREFIX)) return null;
  const body = id.slice(PARAM_FILTER_ID_PREFIX.length);
  try {
    const decoded = JSON.parse(fromBase64Url(body)) as unknown;
    if (!Array.isArray(decoded)) return null;
    const out: EffectInstance[] = [];
    for (const entry of decoded as EncodedEntry[]) {
      if (entry === null || typeof entry !== 'object' || typeof entry.e !== 'string') return null;
      out.push(entry.p ? { effectId: entry.e, params: entry.p } : { effectId: entry.e });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Extract the parametric filter id embedded in a `style.filter` value
 * like `url(#svge-fx-...)`, or `null` when the filter doesn't reference
 * a parametric instance. Tolerant of whitespace/quoting.
 */
export function extractEffectFilterId(styleFilter: string | undefined): string | null {
  if (styleFilter === undefined) return null;
  const m = /^url\(#(.+?)\)$/.exec(styleFilter.trim());
  if (m === null) return null;
  const id = m[1]!;
  return id.startsWith(PARAM_FILTER_ID_PREFIX) ? id : null;
}

/**
 * Reactive service that derives composed parametric `<filter>` markup by
 * scanning the current document for `svge-fx-` ids referenced via
 * `style.filter` — the parametric sibling of {@link ChainFilterRegistry}.
 *
 * Scoped per editor (D-042): provide via `provideSvgEngineEditorScope()`
 * so each editor composes from its own state. The defs injector
 * (`ActiveDefsService`) concatenates {@link buildAllInstancesMarkup} with
 * the registered + chain filters.
 */
@Injectable({ providedIn: 'root' })
export class ParametricEffectRegistry {
  private readonly state = inject(EditorStateService);
  private readonly effects = inject(EffectRegistry);

  /**
   * Unique parametric instance ids in use by the current document. Only
   * ids whose every referenced effect is registered are kept (a broken
   * reference falls back to "no filter" rather than an empty `<filter>`).
   */
  readonly activeInstances = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      const id = extractEffectFilterId(node.style.filter);
      if (id === null) return;
      const instances = parseEffectFilterId(id);
      if (instances === null || instances.length === 0) return;
      if (instances.every((i) => this.effects.get(i.effectId) !== null)) {
        seen.add(id);
      }
    });
    return [...seen];
  });

  /**
   * Composed `<filter>` markup for every parametric instance referenced
   * by the current document. Empty string when none are in use.
   */
  buildAllInstancesMarkup(): string {
    const ids = this.activeInstances();
    if (ids.length === 0) return '';
    const parts: string[] = [];
    for (const id of ids) {
      const instances = parseEffectFilterId(id);
      if (instances === null) continue;
      const inners: string[] = [];
      let ok = true;
      for (const inst of instances) {
        const fx = this.effects.get(inst.effectId);
        if (fx === null) {
          ok = false;
          break;
        }
        inners.push(stripFilterWrapper(fx.buildFilterMarkup(inst.params)));
      }
      if (ok) parts.push(composeFilterMarkups(inners, id));
    }
    return parts.join('\n');
  }
}
