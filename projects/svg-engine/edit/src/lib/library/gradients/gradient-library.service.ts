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

export interface GradientLibraryItem extends LibraryItem {
  readonly kind: GradientKind;
  /** Stops in offset order. Empty array is invalid. */
  readonly stops: readonly GradientStop[];
  /**
   * Build the `<linearGradient>` / `<radialGradient>` SVG markup.
   * Must include `id="${this.id}"` so URL references resolve.
   */
  buildMarkup(): string;
}

/**
 * Registry of `GradientLibraryItem`s — D-048. Doubles as a defs-
 * injection source: walks the current document, collects every
 * gradient ID referenced via `style.fill`/`style.stroke`, and emits
 * the markup for the renderer's `<defs>` block.
 *
 * **Why scan the document instead of "active set" tracking**:
 * - Zero new state to keep in sync (the document IS the truth).
 * - Undo/redo works for free (the filter URL in style is the entity).
 * - IO round-trip works for free (export/import handle `style.fill`
 *   like any string).
 *
 * **Defs injection**: callers (the shell's `resolvedDefs` computed)
 * call `buildAllActiveGradientsMarkup()` and concatenate with the
 * effect / chain filter outputs. Gradients NOT in use don't pay any
 * render cost — only the URLs that actually appear in node styles
 * are emitted.
 */
@Injectable({ providedIn: 'root' })
export class GradientLibraryService extends LibraryRegistry<GradientLibraryItem> {
  private readonly state = inject(EditorStateService);

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
    // Only emit IDs that are actually registered (defensive: broken
    // refs render as no-fill rather than a phantom <linearGradient>).
    return [...seen].filter((id) => this.get(id) !== null);
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
      const item = this.get(id);
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
