import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService, type SvgNode, walk } from 'svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * A single gradient entry (D-048 Item 3 — Gradients & Pintura).
 *
 * **`buildMarkup()` contract**: returns a complete `<linearGradient>`
 * or `<radialGradient>` SVG element with `id="${this.id}"` embedded so
 * `url(#id)` references from `style.fill`/`style.stroke` resolve. The
 * `kind` discriminator drives picker icons (linear ramp vs radial
 * burst preview).
 *
 * **Stops**: stored as a `{offset, color}[]` array — not for rendering
 * (that's `buildMarkup`'s job), but so the gradient editor can show
 * editable stops. The editor mutates the array via a custom builder
 * pattern that produces a fresh `GradientLibraryItem` with updated
 * markup.
 */
export interface GradientStop {
  /** 0..1 — position along the gradient axis. */
  readonly offset: number;
  /** Any valid CSS color (hex, rgb, named). */
  readonly color: string;
  /** Optional 0..1 stop opacity (defaults to 1). */
  readonly opacity?: number;
}

export type GradientKind = 'linear' | 'radial';

/**
 * **D-058** — explicit geometry for editable gradients.
 *
 * All values are in **objectBoundingBox** units (0..1 normalized to
 * the filled node's bbox) per SVG 2 default. This matches the
 * existing builtin gradients and works without a node-specific
 * coordinate conversion at render time — the browser handles the
 * normalization automatically.
 *
 * **Linear**: line from `(x1, y1)` to `(x2, y2)`. Defaults are
 * left-to-right horizontal sweep `(0, 0) → (1, 0)`.
 *
 * **Radial**: circle centered at `(cx, cy)` with radius `r`. Optional
 * focal point `(fx, fy)` for off-center "spotlight" effects (defaults
 * to center). Defaults are `(0.5, 0.5)` center, `0.5` radius.
 *
 * **Why optional**: backward compat with pre-D-058 builtin gradients
 * whose `buildMarkup()` hard-codes geometry. When omitted, the inline
 * editor's overlay shows the default geometry and the user can edit
 * it — the next `update()` call carries the explicit values forward.
 */
export interface GradientGeometry {
  // Linear
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  // Radial
  readonly cx?: number;
  readonly cy?: number;
  readonly r?: number;
  readonly fx?: number;
  readonly fy?: number;
}

export interface GradientLibraryItem extends LibraryItem {
  readonly kind: GradientKind;
  /** Stops in offset order. Empty array is invalid. */
  readonly stops: readonly GradientStop[];
  /**
   * Optional explicit geometry (D-058). When omitted, `buildMarkup()`
   * is fully responsible for emitting position attributes (legacy
   * pre-D-058 pattern). When present, the inline editor uses these
   * values for handle positioning and updates them on drag.
   */
  readonly geometry?: GradientGeometry;
  /**
   * Build the `<linearGradient>` / `<radialGradient>` SVG markup.
   * Must include `id="${this.id}"` so URL references resolve.
   *
   * **Convention** (post-D-058): when `geometry` is set, prefer the
   * shared {@link buildGradientMarkup} helper which honors it. Items
   * that have a custom `buildMarkup` predate the geometry field and
   * still work (the editor renders default handles for them).
   */
  buildMarkup(): string;
}

/**
 * Shared builder — emits `<linearGradient>` / `<radialGradient>` from
 * a `GradientLibraryItem`. The inline editor uses this for every
 * `update()` so freshly-edited items round-trip their geometry
 * through `buildMarkup()`.
 *
 * **Defaults** (when `geometry` field is omitted): horizontal linear
 * 0%→100%, centered radial r=50%.
 *
 * Exported so plugin authors writing custom gradient items can
 * delegate to it instead of hand-rolling markup.
 */
export function buildGradientMarkup(item: GradientLibraryItem): string {
  const stopsXml = item.stops.map(stopMarkup).join('\n    ');
  if (item.kind === 'linear') {
    const g = item.geometry ?? {};
    const x1 = pct(g.x1 ?? 0);
    const y1 = pct(g.y1 ?? 0);
    const x2 = pct(g.x2 ?? 1);
    const y2 = pct(g.y2 ?? 0);
    return `<linearGradient id="${item.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
    ${stopsXml}
  </linearGradient>`;
  }
  // radial
  const g = item.geometry ?? {};
  const cx = pct(g.cx ?? 0.5);
  const cy = pct(g.cy ?? 0.5);
  const r = pct(g.r ?? 0.5);
  // Focal point — emit only when explicit (avoids forcing the renderer
  // to recompute when the user hasn't asked for an off-center focal).
  const fxAttr = g.fx !== undefined ? ` fx="${pct(g.fx)}"` : '';
  const fyAttr = g.fy !== undefined ? ` fy="${pct(g.fy)}"` : '';
  return `<radialGradient id="${item.id}" cx="${cx}" cy="${cy}" r="${r}"${fxAttr}${fyAttr}>
    ${stopsXml}
  </radialGradient>`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function stopMarkup(stop: GradientStop): string {
  const op = stop.opacity ?? 1;
  const opAttr = op !== 1 ? ` stop-opacity="${op}"` : '';
  return `<stop offset="${(stop.offset * 100).toFixed(2).replace(/\.?0+$/, '')}%" stop-color="${stop.color}"${opAttr} />`;
}

/**
 * **Catalog** of `GradientLibraryItem`s — D-048. Root-scoped registry
 * that plugins register against (e.g., `builtinGradientsPlugin` from
 * `app.config.ts`). Pickers (`<svge-libraries-panel>`) inject this to
 * list available gradients.
 *
 * **Why root-only**: a plugin installed at app bootstrap registers
 * against the root injector. If the registry were also route-scoped,
 * the scoped instance would be empty (same trap D-043/D-048-fix1 hit).
 * The catalog is global; only the *active* defs derivation needs to
 * be scoped — that lives in {@link ActiveGradientsService}.
 */
@Injectable({ providedIn: 'root' })
export class GradientLibraryService extends LibraryRegistry<GradientLibraryItem> {}

/**
 * **Active gradients derivation** — D-048 fix follow-up (D-051 pulled
 * forward). Route-scoped service that walks the route's
 * `EditorStateService` document, collects gradient IDs referenced via
 * `style.fill`/`style.stroke`, and emits `<linearGradient>` /
 * `<radialGradient>` markup for the renderer's `<defs>` block.
 *
 * **Why split from `GradientLibraryService`**: the plugin-installed
 * catalog is global (root), but the active-defs derivation must read
 * the editor's document, which is per-editor (D-042). Same registry
 * for both would force a choice — and the previous attempt chose
 * "scoped", which broke plugin registration (catalog appeared empty
 * in the panel). The split serves both: plugins register into the
 * root catalog; the shell's `resolvedDefs` injects this scoped
 * service to derive active defs from its OWN document.
 *
 * **Bootstrap**: provided via `provideSvgEngineEditorScope()` — every
 * route that creates an editor gets its own instance.
 */
@Injectable({ providedIn: 'root' })
export class ActiveGradientsService {
  private readonly state = inject(EditorStateService);
  private readonly catalog = inject(GradientLibraryService);

  /**
   * Set of unique gradient IDs in use by the current document
   * (referenced via `style.fill` or `style.stroke` as `url(#id)`).
   * Re-derives reactively when the document changes.
   */
  readonly activeGradientIds = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      collectGradientId(node.style.fill, seen);
      collectGradientId(node.style.stroke, seen);
    });
    // Only emit IDs that are actually registered in the catalog
    // (defensive: broken refs render as no-fill rather than a phantom
    // <linearGradient>).
    return [...seen].filter((id) => this.catalog.get(id) !== null);
  });

  /**
   * Concatenated `<linearGradient>` / `<radialGradient>` markup for
   * every gradient referenced by the current document. Empty string
   * when none. The shell's `resolvedDefs` concatenates this with
   * `EffectRegistry` + `ChainFilterRegistry` outputs.
   */
  buildAllActiveGradientsMarkup(): string {
    const ids = this.activeGradientIds();
    if (ids.length === 0) return '';
    const parts: string[] = [];
    for (const id of ids) {
      const item = this.catalog.get(id);
      if (item !== null) parts.push(item.buildMarkup());
    }
    return parts.join('\n');
  }
}

/**
 * Extract a gradient ID from a `url(#id)` style value (fill/stroke).
 * Adds the ID to `out` if found. Tolerant of whitespace and quotes.
 */
function collectGradientId(value: string | undefined, out: Set<string>): void {
  if (value === undefined) return;
  const m = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value.trim());
  if (m === null) return;
  // We don't have a strict naming convention for gradient IDs (unlike
  // effect chains with the `svge-chain-` prefix), so we accept any id
  // and rely on the registry lookup downstream to filter to real
  // gradients (vs effect filters, patterns, clipPaths).
  out.add(m[1]!);
}
