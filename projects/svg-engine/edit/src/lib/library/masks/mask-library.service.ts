import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService, type SvgNode, walk } from '@mosaicoo/svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * A `<mask>` entry — registered SVG `<mask>` markup that can be
 * referenced from `style.mask` as `url(#id)`. D-049 (Item 4 —
 * Composição / Recorte).
 *
 * **Mask vs clipPath**: a clipPath is BINARY (a pixel is either
 * inside or outside the mask). A mask uses the alpha or luminance
 * channel of its contents to ATTENUATE the painted pixels — so you
 * get smooth gradients, partial transparency, edge softening.
 *
 * **`buildMarkup()` contract**: must return a complete `<mask>`
 * element with `id="${this.id}"`. Children are typically:
 * - Shapes filled with white (= fully visible) and black (= hidden)
 * - Shapes filled with a `<linearGradient>` for soft edges
 * - Image content for photo-based masking
 *
 * Conventionally use `maskUnits="userSpaceOnUse"` so coordinates are
 * interpreted in the parent document's coordinate system.
 */
export interface MaskLibraryItem extends LibraryItem {
  /** Build the `<mask>` markup. Must include `id="${this.id}"`. */
  buildMarkup(): string;
}

/**
 * **Catalog** of `MaskLibraryItem`s — D-049. Root-scoped registry.
 */
@Injectable({ providedIn: 'root' })
export class MaskLibraryService extends LibraryRegistry<MaskLibraryItem> {}

/**
 * **Active masks derivation** — route-scoped service that walks the
 * current document, collects mask IDs referenced via `style.mask`,
 * and emits the corresponding `<mask>` markup for `<defs>`.
 */
@Injectable({ providedIn: 'root' })
export class ActiveMasksService {
  private readonly state = inject(EditorStateService);
  private readonly catalog = inject(MaskLibraryService);

  /** Mask IDs actively referenced in the current document. */
  readonly activeMaskIds = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      collectId(node.style.mask, seen);
    });
    return [...seen].filter((id) => this.catalog.get(id) !== null);
  });

  /** Concatenated `<mask>` markup for every active mask. */
  buildAllActiveMasksMarkup(): string {
    const ids = this.activeMaskIds();
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
