import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService, type SvgNode, walk } from 'svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * A `<clipPath>` entry — registered SVG `<clipPath>` markup that can
 * be referenced from `style.clipPath` as `url(#id)`. D-049 (Item 4 —
 * Composição / Recorte).
 *
 * **Why integrate with the document, not the registry**: same rationale
 * as gradients/patterns — clipPaths referenced by `style.clipPath` are
 * the source of truth. The catalog supplies markup when the document
 * asks for it via the defs pipeline.
 *
 * **`buildMarkup()` contract**: must return a complete `<clipPath>`
 * element with `id="${this.id}"`. The clipPath's children define the
 * mask geometry — anything inside (paths, rects, shapes) is the
 * INCLUSION region. Conventionally use `clipPathUnits="userSpaceOnUse"`
 * so coordinates are interpreted in the parent document's coord system
 * (matches user expectations when drawing the clipPath via a tool).
 */
export interface ClipPathLibraryItem extends LibraryItem {
  /**
   * Build the `<clipPath>` element markup. Must include
   * `id="${this.id}"`. Inner geometry defines the clip region.
   */
  buildMarkup(): string;
}

/**
 * **Catalog** of `ClipPathLibraryItem`s — D-049. Root-scoped registry
 * for plugin registration. See {@link GradientLibraryService} for the
 * full rationale of the split.
 */
@Injectable({ providedIn: 'root' })
export class ClipPathLibraryService extends LibraryRegistry<ClipPathLibraryItem> {}

/**
 * **Active clipPaths derivation** — route-scoped service that walks
 * the current document, collects clipPath IDs referenced via
 * `style.clipPath`, and emits the corresponding `<clipPath>` markup
 * for the renderer's `<defs>` block.
 *
 * Pairs with {@link ActiveGradientsService} / {@link ActivePatternsService}.
 */
@Injectable({ providedIn: 'root' })
export class ActiveClipPathsService {
  private readonly state = inject(EditorStateService);
  private readonly catalog = inject(ClipPathLibraryService);

  /** ClipPath IDs actively referenced in the current document. */
  readonly activeClipPathIds = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      collectId(node.style.clipPath, seen);
    });
    return [...seen].filter((id) => this.catalog.get(id) !== null);
  });

  /** Concatenated `<clipPath>` markup for every active clip path. */
  buildAllActiveClipPathsMarkup(): string {
    const ids = this.activeClipPathIds();
    if (ids.length === 0) return '';
    return ids
      .map((id) => this.catalog.get(id)?.buildMarkup() ?? '')
      .filter((s) => s.length > 0)
      .join('\n');
  }
}

/**
 * Extract a clipPath ID from a `url(#id)` style value. Adds to `out`
 * if found. Mirror of `collectGradientId` in gradient-library.service.
 */
function collectId(value: string | undefined, out: Set<string>): void {
  if (value === undefined) return;
  const m = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value.trim());
  if (m === null) return;
  out.add(m[1]!);
}
