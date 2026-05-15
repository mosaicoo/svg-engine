import { computed, inject, Injectable, signal } from '@angular/core';
import { type NodeId, type Point } from 'svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { allAnchors, type BBoxAnchor } from '../geometry/bbox-anchors';

/**
 * Editor-side transformation state. **Bloco 2 scope**: only the rotation
 * pivot management (D-022 Affinity-grade). Drag/resize/rotate command
 * dispatch will be added in Bloco 3.
 *
 * **Pivot model (D-022)**:
 * - Default pivot for any selection = center of its bounding box.
 * - Per-node custom pivots are stored in `customPivots` keyed by
 *   `NodeId`, in **node-local** coordinates relative to the node's
 *   bounding box. This way a custom pivot follows the node when it is
 *   moved/scaled/rotated later (Affinity behaviour).
 * - For multi-selection, pivot is **transient** (relative to the
 *   composite bbox); changing the selection composition resets it.
 *   Tracked in `multiPivotLocal` keyed by a stable signature.
 *
 * **Persistence semantics**:
 * - `setPivot(point, bbox)` / `setPivotAnchor(anchor)` store the pivot
 *   in **local coordinates** so it survives subsequent transforms.
 * - `resetPivot()` removes the entry (default = center).
 * - `clearAllPivots()` clears the whole map (e.g., when loading a new
 *   document).
 *
 * **What the service does NOT do (yet)**:
 * - Compute the bounding box of the current selection — that's the
 *   overlay's job (DOM-based via `getRenderedNodeBBox`). The service
 *   takes a `bbox` argument when the caller has it.
 * - Dispatch any commands. Bloco 3 adds `startRotate`/`rotate`/`endRotate`
 *   and a `RotateNodeCommand` that consumes `pivot()`.
 */
@Injectable({ providedIn: 'root' })
export class TransformService {
  private readonly selection = inject(SelectionService);

  /**
   * Pivot custom por nó, em coordenadas LOCAIS do bbox do nó (`{x, y}`
   * onde `(0,0)` = canto superior-esquerdo do bbox local, `(1,1)` =
   * canto inferior-direito). Permite que o pivot "siga" o nó sob
   * transformações.
   */
  private readonly _customPivots = signal<ReadonlyMap<NodeId, Point>>(new Map());

  /**
   * Pivot transient para multi-seleção, em coordenadas locais relativas
   * à bbox composta. Reset automático quando a composição da seleção
   * muda — ver {@link onSelectionMaybeChanged}.
   */
  private readonly _multiPivotLocal = signal<Point | null>(null);

  /** Última assinatura de seleção observada para detectar mudança de composição. */
  private readonly _lastMultiSignature = signal<string>('');

  readonly customPivots = this._customPivots.asReadonly();

  /**
   * Computed: a chave do "modo pivot" atual. `'single'` para uma seleção
   * única, `'multi'` para seleção múltipla, `'none'` quando vazia.
   */
  readonly pivotMode = computed<'none' | 'single' | 'multi'>(() => {
    const n = this.selection.count();
    if (n === 0) return 'none';
    if (n === 1) return 'single';
    return 'multi';
  });

  /**
   * Apaga o pivot transient de multi-seleção quando a **composição** da
   * seleção muda (cardinalidade ou conjunto de IDs). Chamada interna do
   * componente quando ele observa a seleção; também pode ser invocada
   * por consumidores avançados.
   */
  syncPivotForSelection(): void {
    const ids = this.selection.selectedIds();
    const signature = computeSelectionSignature(ids);
    if (signature !== this._lastMultiSignature()) {
      this._lastMultiSignature.set(signature);
      this._multiPivotLocal.set(null);
    }
  }

  /**
   * Resolve o pivot atual em coordenadas DO DOCUMENTO, dado o `bbox`
   * atual da seleção (que o overlay computa via DOM). Quando não há
   * pivot custom registrado, devolve o **centro** do `bbox`.
   *
   * @param bbox bounding box atual da seleção em coords do documento
   *             (passado pelo chamador para evitar coupling DOM aqui).
   */
  resolvePivot(bbox: { x: number; y: number; width: number; height: number }): Point {
    const mode = this.pivotMode();
    if (mode === 'none') return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };

    const local = mode === 'single' ? this.localPivotForFocus() : this._multiPivotLocal();
    if (local === null) {
      return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    }
    return localToDoc(local, bbox);
  }

  /**
   * Define o pivot a partir de um ponto em coords do documento (free-drag).
   * O `bbox` é necessário para converter para coords locais e armazenar.
   */
  setPivot(point: Point, bbox: { x: number; y: number; width: number; height: number }): void {
    const local = docToLocal(point, bbox);
    this.storeLocalPivot(local);
  }

  /**
   * Define o pivot snapando em um dos 9 anchors do bbox (D-022.picker /
   * D-022.snap). Internamente armazena como ponto local — sem ambiguidade.
   */
  setPivotAnchor(
    anchor: BBoxAnchor,
    bbox: { x: number; y: number; width: number; height: number },
  ): void {
    const point = allAnchors(bbox)[anchor];
    this.setPivot(point, bbox);
  }

  /**
   * Reseta o pivot para o default (centro do bbox). Para single
   * selection, remove a entrada de `customPivots`. Para multi, limpa o
   * `_multiPivotLocal`.
   */
  resetPivot(): void {
    const mode = this.pivotMode();
    if (mode === 'single') {
      const focus = this.selection.focusId();
      if (focus === null) return;
      const next = new Map(this._customPivots());
      next.delete(focus);
      this._customPivots.set(next);
    } else if (mode === 'multi') {
      this._multiPivotLocal.set(null);
    }
  }

  /** Limpa **todos** os pivots custom. Use ao carregar novo documento. */
  clearAllPivots(): void {
    this._customPivots.set(new Map());
    this._multiPivotLocal.set(null);
    this._lastMultiSignature.set('');
  }

  private storeLocalPivot(local: Point): void {
    const mode = this.pivotMode();
    if (mode === 'single') {
      const focus = this.selection.focusId();
      if (focus === null) return;
      const next = new Map(this._customPivots());
      next.set(focus, local);
      this._customPivots.set(next);
    } else if (mode === 'multi') {
      this._multiPivotLocal.set(local);
    }
  }

  private localPivotForFocus(): Point | null {
    const focus = this.selection.focusId();
    if (focus === null) return null;
    return this._customPivots().get(focus) ?? null;
  }
}

/**
 * Stable string signature of a selection set, independent of insertion
 * order. Two selections with the same members produce the same signature.
 */
function computeSelectionSignature(ids: ReadonlySet<NodeId>): string {
  if (ids.size === 0) return '';
  return Array.from(ids).sort().join('|');
}

/**
 * Convert a point from document coordinates into local bbox coordinates
 * `(0,0) = top-left`, `(1,1) = bottom-right`. Survives later transforms
 * because the local coords are stable.
 */
function docToLocal(
  point: Point,
  bbox: { x: number; y: number; width: number; height: number },
): Point {
  if (bbox.width === 0 || bbox.height === 0) return { x: 0.5, y: 0.5 };
  return {
    x: (point.x - bbox.x) / bbox.width,
    y: (point.y - bbox.y) / bbox.height,
  };
}

/** Inverse of {@link docToLocal}. */
function localToDoc(
  local: Point,
  bbox: { x: number; y: number; width: number; height: number },
): Point {
  return {
    x: bbox.x + local.x * bbox.width,
    y: bbox.y + local.y * bbox.height,
  };
}
