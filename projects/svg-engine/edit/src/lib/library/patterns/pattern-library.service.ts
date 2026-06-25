import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService, type SvgNode, walk } from '@mosaicoo/svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * A pattern entry — registered SVG `<pattern>` markup that can be
 * referenced from `style.fill`/`style.stroke` as `url(#id)`.
 *
 * **Why integrate with the document, not the registry**: same
 * rationale as gradients (see {@link GradientLibraryService}) —
 * patterns referenced in `style.fill` are the source of truth. The
 * registry just provides the markup when the document asks for it
 * via defs.
 */
export interface PatternLibraryItem extends LibraryItem {
  /**
   * Build the `<pattern>` element markup. Must include
   * `id="${this.id}"`. Conventionally uses `patternUnits="userSpaceOnUse"`
   * with a fixed `width` / `height` so the tile size is stable
   * regardless of the target node size.
   */
  buildMarkup(): string;
}

/**
 * **Catalog** of `PatternLibraryItem`s — D-048. Root-scoped registry
 * for plugin registration. See {@link GradientLibraryService} for the
 * full rationale of the split.
 */
@Injectable({ providedIn: 'root' })
export class PatternLibraryService extends LibraryRegistry<PatternLibraryItem> {}

/**
 * **Active patterns derivation** — route-scoped service that walks
 * the route's `EditorStateService` document, collects pattern IDs
 * referenced via `style.fill`/`style.stroke`, and emits `<pattern>`
 * markup for the renderer's `<defs>` block.
 *
 * **Split rationale**: see {@link ActiveGradientsService} — plugins
 * register into the root catalog, route-scoped service derives the
 * active set from the route's document.
 */
@Injectable({ providedIn: 'root' })
export class ActivePatternsService {
  private readonly state = inject(EditorStateService);
  private readonly catalog = inject(PatternLibraryService);

  /** Pattern IDs actively referenced in the current document. */
  readonly activePatternIds = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      collectId(node.style.fill, seen);
      collectId(node.style.stroke, seen);
    });
    return [...seen].filter((id) => this.catalog.get(id) !== null);
  });

  /** Concatenated `<pattern>` markup for every active pattern. */
  buildAllActivePatternsMarkup(): string {
    const ids = this.activePatternIds();
    if (ids.length === 0) return '';
    return ids
      .map((id) => this.catalog.get(id)?.buildMarkup() ?? '')
      .filter((s) => s.length > 0)
      .join('\n');
  }
}

function collectId(value: string | undefined, out: Set<string>): void {
  if (value === undefined) return;
  const m = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value.trim());
  if (m === null) return;
  out.add(m[1]!);
}
