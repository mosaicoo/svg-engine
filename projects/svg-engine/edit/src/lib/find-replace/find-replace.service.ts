import { Injectable } from '@angular/core';
import { type NodeId, type SvgNode, type TextNode, walk } from 'svg-engine/core';

/**
 * **D-070** — Discriminated union describing what to search for. Each
 * variant tells the {@link FindReplaceService} which field to inspect
 * and what to compare against.
 *
 * - `fill` / `stroke` — look at `node.style.<field>`. Comparison is
 *   string-equality after trimming + lower-casing (CSS colors are
 *   case-insensitive). Normalized comparison (hex vs rgb) is OUT OF
 *   SCOPE for v1 — keeps the service deterministic without pulling
 *   in a color parser; if the user typed `#ff0000` and the node has
 *   `rgb(255,0,0)`, those don't match (documented for the dialog UI).
 *
 * - `fontFamily` — `node.fontFamily` (TextNode only). `match: 'exact'`
 *   compares string-equality; `match: 'contains'` does case-insensitive
 *   substring (covers users who type "Arial" and want to hit
 *   `"Arial, Helvetica, sans-serif"`).
 *
 * - `attribute` — generic escape hatch. Reads `node[key]` (top-level
 *   field, NOT style) and compares string-equality with the value
 *   coerced to string. Handles `fontSize`, `fontWeight`, `x`, `y`,
 *   etc. The `key` is `string` (not `keyof SvgNode`) because the union
 *   of node-type-specific keys can't be statically narrowed here —
 *   safe because the service treats missing fields as "no match".
 */
export type FindCriteria =
  | { readonly kind: 'fill'; readonly value: string }
  | { readonly kind: 'stroke'; readonly value: string }
  | { readonly kind: 'fontFamily'; readonly value: string; readonly match?: 'exact' | 'contains' }
  | { readonly kind: 'attribute'; readonly key: string; readonly value: string };

/**
 * **D-070** — Where the matched value lives on the node. The dialog
 * uses this when dispatching the right batch command:
 * - `'style'` → `SetStylePropertyOnManyCommand` with `field === styleField`
 * - `'top'`   → `SetPropertyOnManyCommand` with `property === topField`
 */
export interface FindMatch {
  readonly id: NodeId;
  readonly bucket: 'style' | 'top';
  readonly field: string;
  /** Current value of the field at find-time (for displaying in the dialog list). */
  readonly currentValue: string;
}

/**
 * **D-070** — Pure logic for find & replace. No DI on commands here —
 * the service exposes find helpers, and the consumer (dialog) is
 * responsible for building / dispatching the appropriate batch
 * command via the `CommandBus`. Keeps the service trivially testable
 * (no `EditorStateService` needed beyond reading the document signal).
 *
 * **Why a service** (not a free function): the dialog reactively
 * re-runs `findAll` when the user edits the search input — having a
 * single injectable point lets future features (recent searches,
 * saved presets) hang on without changing the call sites. For now the
 * methods are stateless.
 *
 * **Scope-safety**: the service reads no editor state by itself —
 * callers pass in the `SvgDocument.root`. This sidesteps the
 * multi-editor scope problem (D-042): each route's dialog passes its
 * own `EditorStateService.document().root` and gets results scoped to
 * that document.
 */
@Injectable({ providedIn: 'root' })
export class FindReplaceService {
  /**
   * Walk the tree and return every node that matches the criteria,
   * plus enough metadata for the dialog to render a row and the
   * caller to build the batch command.
   *
   * Pure / sync / order-stable: pre-order traversal, never re-orders
   * results. Empty array on no-match — never throws.
   */
  findAll(root: import('svg-engine/core').GroupNode, criteria: FindCriteria): readonly FindMatch[] {
    const out: FindMatch[] = [];
    walk(root, (n) => {
      const m = matchNode(n, criteria);
      if (m !== null) out.push(m);
    });
    return out;
  }
}

/**
 * Match a single node against the criteria. Returned `FindMatch`
 * records which bucket (style vs top-level) and which field hit, so
 * the caller can pick the right batch command without re-inspecting
 * the criteria.
 */
function matchNode(node: SvgNode, criteria: FindCriteria): FindMatch | null {
  switch (criteria.kind) {
    case 'fill': {
      const current = node.style.fill;
      if (typeof current !== 'string') return null;
      if (normalizeColor(current) !== normalizeColor(criteria.value)) return null;
      return { id: node.id, bucket: 'style', field: 'fill', currentValue: current };
    }
    case 'stroke': {
      const current = node.style.stroke;
      if (typeof current !== 'string') return null;
      if (normalizeColor(current) !== normalizeColor(criteria.value)) return null;
      return { id: node.id, bucket: 'style', field: 'stroke', currentValue: current };
    }
    case 'fontFamily': {
      if (node.type !== 'text') return null;
      const current = (node as TextNode).fontFamily;
      if (typeof current !== 'string') return null;
      const wanted = criteria.value;
      const mode = criteria.match ?? 'contains';
      if (mode === 'exact') {
        if (current !== wanted) return null;
      } else {
        if (!current.toLowerCase().includes(wanted.toLowerCase())) return null;
      }
      return { id: node.id, bucket: 'top', field: 'fontFamily', currentValue: current };
    }
    case 'attribute': {
      // Generic top-level field lookup. Reads via index; nodes that
      // don't have the key (`undefined`) never match a non-empty value.
      const current = (node as unknown as Record<string, unknown>)[criteria.key];
      if (current === undefined || current === null) return null;
      const asString = String(current);
      if (asString !== criteria.value) return null;
      return {
        id: node.id,
        bucket: 'top',
        field: criteria.key,
        currentValue: asString,
      };
    }
  }
}

/**
 * Cheap color normalization for comparison: trim + lower-case. Does
 * NOT convert between formats (hex vs rgb vs hsl vs named) — the
 * dialog documents this limitation so users typing `red` get `red`
 * matches but not `#ff0000` matches. A full color parser would
 * over-spec v1; the inspector already exposes a hex picker so
 * authored colors tend to be hex.
 */
function normalizeColor(c: string): string {
  return c.trim().toLowerCase();
}
