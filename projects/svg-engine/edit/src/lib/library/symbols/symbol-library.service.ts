import { computed, inject, Injectable } from '@angular/core';
import {
  type BoundingBox,
  EditorStateService,
  type SvgNode,
  type SymbolUseNode,
  walk,
} from '@mosaicoo/svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * Symbol Library entry — **D-059** (full master/instance implementation).
 *
 * **Master-instance model**:
 * - A symbol is a `master` tree (any `SvgNode`) registered in the
 *   catalog. On insertion, consumers dispatch a command that creates
 *   a `SymbolUseNode` (`type: 'symbol-use'`) referencing the symbol
 *   by id — NOT a clone of the master tree.
 * - The renderer paints each `SymbolUseNode` as `<use href="#{id}">`
 *   pointing at a `<symbol id="{id}">...master...</symbol>`
 *   contributed to `<defs>` by {@link ActiveSymbolsService}.
 * - Editing the master via `SymbolLibraryService.update(id, ...)`
 *   immediately re-paints every `<use>` referencing that id — at
 *   zero per-instance cost (the browser handles the propagation
 *   via the shadow tree mechanism).
 *
 * **Optional `build()`** (back-compat): pre-D-059 consumers used
 * `build()` to insert a CLONE of the master (no link back). Kept as
 * an optional convenience for plugins that want one-off insertions
 * without the master-instance contract. Post-D-059 consumers should
 * prefer `InsertSymbolInstanceCommand` which creates a real
 * `SymbolUseNode`.
 *
 * **Round-trip**: exporter emits both `<symbol>` (via
 * `buildMarkup()`) and `<use>` (via the `SymbolUseNode` branch). The
 * importer reconstructs a `SymbolUseNode` from `<use href="#id">`
 * (D-098) and preserves the referenced `<symbol>` def verbatim in the
 * document `<defs>`, so an exported file re-imports and renders. What
 * remains deferred: re-populating THIS editable library catalog from
 * an imported `<symbol>` master — the instance round-trips, but the
 * master isn't auto-added back as an editable library item.
 */
export interface SymbolLibraryItem extends LibraryItem {
  /**
   * The master tree — what gets emitted inside `<symbol id="...">`.
   * Any `SvgNode` is valid; groups are common for multi-element
   * masters. The master's own transform is preserved inside the
   * `<symbol>` element; each `<use>` adds its own positioning on top.
   */
  readonly master: SvgNode;
  /**
   * Optional explicit dimensions for the `<symbol viewBox>`. When
   * omitted, the symbol uses its master's natural geometry (the
   * browser computes the viewBox from the painted content). Setting
   * these explicitly is recommended for predictable scaling — the
   * `<use width height>` on the instance scales to match.
   */
  readonly viewBox?: BoundingBox;
  /**
   * Build the `<symbol id="...">...</symbol>` SVG markup. Must
   * include `id="${this.id}"` so `<use href="#id">` references
   * resolve. Default implementation is provided via
   * {@link buildSymbolMarkup} — most consumers don't need to
   * override.
   */
  buildMarkup(): string;
  /**
   * Optional convenience for legacy single-shot inserts (clones the
   * master, no master-instance link). Post-D-059 prefer
   * `InsertSymbolInstanceCommand` for real instance tracking.
   */
  build?(): SvgNode;
}

/**
 * Helper builder — emit `<symbol id="...">` for a library item by
 * serializing its master with the io exporter. Pure function;
 * delegated import to avoid a hard io dependency (consumers compose
 * their own builder if they prefer different serialization).
 *
 * **Why a helper instead of forcing every item to implement
 * buildMarkup**: builtins all use this; custom items can either
 * delegate or supply hand-rolled markup. Keeps the contract flexible
 * without per-item boilerplate.
 *
 * **Note** the master is serialized via a lightweight inline emitter
 * (not the full svgExporter — to avoid a circular io→edit→io import).
 * Coverage is sufficient for typical symbols (shapes + groups);
 * complex nested defs in a symbol master would need the consumer to
 * override `buildMarkup`.
 */
export function buildSymbolMarkup(item: SymbolLibraryItem): string {
  const inner = serializeMasterForSymbol(item.master);
  const viewBoxAttr =
    item.viewBox !== undefined
      ? ` viewBox="${item.viewBox.x} ${item.viewBox.y} ${item.viewBox.width} ${item.viewBox.height}"`
      : '';
  return `<symbol id="${item.id}"${viewBoxAttr}>${inner}</symbol>`;
}

/**
 * Minimal node serializer for use inside `<symbol>`. Mirrors the
 * svgExporter's output but doesn't apply the document-level wrapper.
 * Only covers the geometric node types — text/image/group recursion
 * works; deeply nested symbol-uses inside a symbol master are
 * out-of-scope (recursive symbols would need extra cycle detection).
 */
function serializeMasterForSymbol(node: SvgNode): string {
  const t = node.transform;
  const isIdentityT =
    t[0] === 1 && t[1] === 0 && t[2] === 0 && t[3] === 1 && t[4] === 0 && t[5] === 0;
  const transformAttr = isIdentityT ? '' : ` transform="matrix(${t.join(',')})"`;
  const s = node.style;
  const styleAttrs: string[] = [];
  if (s.fill !== undefined) styleAttrs.push(`fill="${s.fill}"`);
  if (s.stroke !== undefined) styleAttrs.push(`stroke="${s.stroke}"`);
  if (s.strokeWidth !== undefined) styleAttrs.push(`stroke-width="${s.strokeWidth}"`);
  if (s.opacity !== undefined) styleAttrs.push(`opacity="${s.opacity}"`);
  const styleAttr = styleAttrs.length > 0 ? ' ' + styleAttrs.join(' ') : '';
  switch (node.type) {
    case 'rect':
      return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${node.rx !== undefined ? ` rx="${node.rx}"` : ''}${node.ry !== undefined ? ` ry="${node.ry}"` : ''}${styleAttr}${transformAttr} />`;
    case 'ellipse':
      return `<ellipse cx="${node.cx}" cy="${node.cy}" rx="${node.rx}" ry="${node.ry}"${styleAttr}${transformAttr} />`;
    case 'line':
      return `<line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}"${styleAttr}${transformAttr} />`;
    case 'polygon':
      return `<polygon points="${node.points.map((p) => `${p.x},${p.y}`).join(' ')}"${styleAttr}${transformAttr} />`;
    case 'polyline':
      return `<polyline points="${node.points.map((p) => `${p.x},${p.y}`).join(' ')}"${styleAttr}${transformAttr} />`;
    case 'path':
      return `<path d="${node.d}"${styleAttr}${transformAttr} />`;
    case 'text':
      return `<text x="${node.x}" y="${node.y}"${styleAttr}${transformAttr}>${node.content}</text>`;
    case 'image':
      return `<image x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" href="${node.href}"${transformAttr} />`;
    case 'group':
      return `<g${styleAttr}${transformAttr}>${node.children.map(serializeMasterForSymbol).join('')}</g>`;
    case 'symbol-use':
      // Nested symbol-uses inside a master: emit as a plain <use>
      // referencing the inner symbol. Browser handles the recursion
      // up to its own depth limit (typically high).
      return `<use href="#${node.symbolId}" x="${node.x}" y="${node.y}"${node.width !== undefined ? ` width="${node.width}"` : ''}${node.height !== undefined ? ` height="${node.height}"` : ''}${transformAttr} />`;
  }
}

/**
 * **Catalog** of `SymbolLibraryItem`s — D-059. Root-scoped registry
 * that plugins register against at app bootstrap. Mirrors the
 * Gradient/Pattern catalog pattern (root for plugin registration;
 * derivation lives in the scoped {@link ActiveSymbolsService}).
 */
@Injectable({ providedIn: 'root' })
export class SymbolLibraryService extends LibraryRegistry<SymbolLibraryItem> {}

/**
 * **Active symbols derivation** — D-059. Route-scoped service that
 * walks the route's document, collects symbol ids referenced by
 * `SymbolUseNode` instances, and emits `<symbol>` markup for the
 * renderer's `<defs>` block. Identical pattern to
 * `ActiveGradientsService` / `ActivePatternsService`.
 *
 * **Why split from `SymbolLibraryService`**: same reason as the
 * other Catalog+Active splits — plugin registration goes against
 * the root catalog (single source of truth at bootstrap), but the
 * active-defs derivation reads the per-editor document so it must
 * be scoped.
 */
@Injectable({ providedIn: 'root' })
export class ActiveSymbolsService {
  private readonly state = inject(EditorStateService);
  private readonly catalog = inject(SymbolLibraryService);

  /**
   * Set of unique symbol ids referenced by `SymbolUseNode` instances
   * in the current document. Re-derives reactively when the document
   * tree changes.
   */
  readonly activeSymbolIds = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      if (node.type === 'symbol-use') {
        seen.add((node as SymbolUseNode).symbolId);
      }
    });
    // Filter to ids that resolve in the catalog — defensive against
    // dangling references after a deletion. Unknown ids render as
    // empty space (browser default for <use href="#missing">).
    return [...seen].filter((id) => this.catalog.get(id) !== null);
  });

  /**
   * Concatenated `<symbol>` markup for every symbol referenced in
   * the current document. Returned as a single string for splicing
   * into `<defs>`. Empty string when no symbols in use.
   */
  buildAllActiveSymbolsMarkup(): string {
    const ids = this.activeSymbolIds();
    if (ids.length === 0) return '';
    const parts: string[] = [];
    for (const id of ids) {
      const item = this.catalog.get(id);
      if (item !== null) parts.push(item.buildMarkup());
    }
    return parts.join('\n');
  }
}
