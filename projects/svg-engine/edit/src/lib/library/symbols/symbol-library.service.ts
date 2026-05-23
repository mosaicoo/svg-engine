import { Injectable } from '@angular/core';
import type { SvgNode } from 'svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * Symbol Library entry — D-048 (stub for v1, full impl deferred).
 *
 * **Vision** (Illustrator-style symbols + Figma components):
 * - A "symbol" is a reusable master node + N instances.
 * - Editing the master propagates to all instances.
 * - Instances stored as `<use href="#symbolId">` referencing a
 *   `<symbol>` definition in `<defs>`.
 *
 * **Current status (D-048)**: this registry exists so consumers can
 * already collect "symbol-like" entries (saved templates, often-used
 * snippets) and apply them via straight `InsertNodeCommand`. The
 * full master-instance propagation (requires `SymbolNode` in the
 * core model + `<use>` rendering) is deferred to **D-049**.
 *
 * **Why ship the stub anyway**: the registry shape mirrors
 * `ShapeLibraryService` exactly — consumers can already use it for
 * "saved shapes" workflow without waiting for the deep instance
 * tracking. The future model upgrade is purely additive
 * (`SymbolNode` extends, doesn't replace, `GroupNode`).
 */
export interface SymbolLibraryItem extends LibraryItem {
  /** Build a fresh `SvgNode` to insert. Stub semantics — see service docs. */
  build(): SvgNode;
}

/**
 * Registry of `SymbolLibraryItem`s (D-048 stub). Functional registry
 * — the deferral is only the master-instance propagation logic, not
 * the registry itself.
 */
@Injectable({ providedIn: 'root' })
export class SymbolLibraryService extends LibraryRegistry<SymbolLibraryItem> {}
