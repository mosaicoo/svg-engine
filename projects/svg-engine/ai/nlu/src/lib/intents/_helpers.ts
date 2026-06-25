/**
 * **Intent helpers** — D-046 review-10 (Sprint 1.C / H1).
 *
 * Helpers compartilhados pelos arquivos de intents profissionais.
 * Extraídos de `professional-intents.ts` quando esse atingiu 1194 linhas
 * e o padrão `if (ids.length === 0) { warn(...); return; }` apareceu
 * em 7+ handlers diferentes.
 *
 * **Tudo é puro/funcional** — recebe `NluContext.injector`, resolve
 * services via DI scope ativo (D-042 multi-editor), dispatcha commands.
 * Nenhum estado mantido em closure (handlers chamam helpers cada vez).
 */
import {
  CommandBus,
  DivideCommand,
  EditorStateService,
  ExcludeCommand,
  findNodeById,
  IntersectCommand,
  MoveNodeCommand,
  ReorderNodeCommand,
  ResizeNodeCommand,
  SetStylePropertyOnManyCommand,
  SubtractCommand,
  UnionCommand,
  type NodeId,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { SelectionService } from '@mosaicoo/svg-engine/edit';

import { POLYGON_SIDES } from '../dictionaries/shapes-canonical';
import type { NluContext } from '../types';

/** Re-export pra que arquivos de intents usem mesmo nome interno. */
export type RunCtx = NluContext;

/**
 * Log padronizado de warning — namespace `[svge.nlu]`. Defensivo:
 * silenciado quando `console` não disponível (test env raras).
 */
export function warn(msg: string): void {
  if (typeof console !== 'undefined') {
    console.warn(`[svge.nlu] ${msg}`);
  }
}

/**
 * Helper canônico: pega seleção atual, log warn + early return se vazia.
 * Retorna lista de IDs prontos para uso. Compartilhado por TODOS os
 * handlers que operam em selection (~15 intents).
 */
export function selectedIdsOrWarn(runCtx: RunCtx, label: string): readonly NodeId[] | null {
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()] as readonly NodeId[];
  if (ids.length === 0) {
    warn(`${label}: nada selecionado`);
    return null;
  }
  return ids;
}

/**
 * Aplica uma propriedade de style em todos os nós selecionados via
 * `SetStylePropertyOnManyCommand` (single undo step).
 *
 * **Usado por**: set-stroke, set-stroke-width, set-opacity,
 * remove-fill, remove-stroke, show, hide. (set-fill vive em
 * builtin-nlu.plugin.ts e dispatcha SetStylePropertyOnManyCommand
 * direto sem passar por este helper.)
 */
export function setStyleOnSelected(
  runCtx: RunCtx,
  key: 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'visibility',
  value: string | number,
  label: string,
): void {
  const ids = selectedIdsOrWarn(runCtx, label);
  if (ids === null) return;
  const bus = runCtx.injector.get(CommandBus);
  bus.dispatch(new SetStylePropertyOnManyCommand(ids, key, value));
}

/**
 * Espelha (flip) selecionados em torno do centro do viewBox.
 *
 * **Limitação D-017 headless**: usa centro do viewBox como anchor pq
 * não tem acesso ao bbox renderizado. Plugins com acesso ao SVG ref
 * podem registrar flip customizado em torno do bbox real.
 */
export function flipSelected(runCtx: RunCtx, axis: 'horizontal' | 'vertical'): void {
  const ids = selectedIdsOrWarn(runCtx, `flip-${axis}`);
  if (ids === null) return;
  const bus = runCtx.injector.get(CommandBus);
  const state = runCtx.injector.get(EditorStateService);
  const vb = state.document().viewBox;
  const anchor = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
  const sx = axis === 'horizontal' ? -1 : 1;
  const sy = axis === 'vertical' ? -1 : 1;
  for (const id of ids) {
    bus.dispatch(new ResizeNodeCommand(id, anchor, sx, sy));
  }
}

/**
 * Reordena selecionados via `ReorderNodeCommand`. Usado por
 * bring-to-front, send-to-back, bring-forward, send-backward.
 */
export function reorderSelected(
  runCtx: RunCtx,
  direction: 'forward' | 'backward' | 'toFront' | 'toBack',
): void {
  const ids = selectedIdsOrWarn(runCtx, `reorder-${direction}`);
  if (ids === null) return;
  const bus = runCtx.injector.get(CommandBus);
  for (const id of ids) {
    bus.dispatch(new ReorderNodeCommand(id, direction));
  }
}

/**
 * Roda boolean op do Pathfinder (union/intersect/subtract/exclude/divide).
 * Requer ≥ 2 nós selecionados.
 */
export function runPathfinder(
  runCtx: RunCtx,
  op: 'union' | 'intersect' | 'subtract' | 'exclude' | 'divide',
): void {
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()] as readonly NodeId[];
  if (ids.length < 2) {
    warn(`pathfinder-${op}: requer ≥ 2 nós selecionados`);
    return;
  }
  const bus = runCtx.injector.get(CommandBus);
  switch (op) {
    case 'union':
      bus.dispatch(new UnionCommand(ids));
      break;
    case 'intersect':
      bus.dispatch(new IntersectCommand(ids));
      break;
    case 'subtract':
      bus.dispatch(new SubtractCommand(ids));
      break;
    case 'exclude':
      bus.dispatch(new ExcludeCommand(ids));
      break;
    case 'divide':
      bus.dispatch(new DivideCommand(ids));
      break;
  }
}

/**
 * **`nodeMatchesShape`** (D-046 review-7) — testa se um nó SVG
 * corresponde a um shape kind NLU.
 *
 * Resolve a discrepância entre vocabulário NLU (que tem 'hexagon',
 * 'star', 'triangle' etc) e os tipos REAIS de `SvgNode` (que só tem
 * 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'path', 'text',
 * 'image', 'group'). Polígonos específicos viram todos `<polygon>`
 * no DOM — discriminados aqui pelo `points.length`.
 */
export function nodeMatchesShape(node: SvgNode, shape: string): boolean {
  // Mapeamento direto pra tipos SvgNode universais
  if (shape === 'rect') return node.type === 'rect';
  if (shape === 'ellipse') return node.type === 'ellipse';
  if (shape === 'circle') return node.type === 'ellipse'; // NLU agnostic
  if (shape === 'line') return node.type === 'line';
  if (shape === 'path') return node.type === 'path';
  if (shape === 'polyline') return node.type === 'polyline';
  if (shape === 'text') return node.type === 'text';
  if (shape === 'image') return node.type === 'image';
  if (shape === 'group') return node.type === 'group';

  // Polígonos: discrimina por vertex count
  if (node.type !== 'polygon') return false;
  if (shape === 'polygon') return true; // genérico — qualquer polygon
  if (shape === 'star') return node.points.length === 10; // 5 pontas
  const expectedSides = POLYGON_SIDES[shape];
  if (expectedSides === undefined) return false;
  return node.points.length === expectedSides;
}

/**
 * **Origin aproximado do nó em coordenadas do documento** — combina
 * geometria intrínseca + componente translate do transform.
 *
 * **Headless por design (D-017)**: NÃO usa bbox renderizado. Compute
 * direto dos campos do nó (rect.x, ellipse.cx-rx, etc) + transform.e/f.
 *
 * **Retorna `null`** pra tipos sem origin computável SEM bbox:
 * `path` (precisa parsear d-string), `group` (recursivo).
 */
export function getNodeApproxOrigin(node: SvgNode): { x: number; y: number } | null {
  // Transform: [a, b, c, d, e, f] — e=tx, f=ty
  const tx = node.transform[4];
  const ty = node.transform[5];

  switch (node.type) {
    case 'rect':
      return { x: node.x + tx, y: node.y + ty };
    case 'ellipse':
      return { x: node.cx - node.rx + tx, y: node.cy - node.ry + ty };
    case 'line':
      return { x: Math.min(node.x1, node.x2) + tx, y: Math.min(node.y1, node.y2) + ty };
    case 'polygon':
    case 'polyline': {
      if (node.points.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      for (const p of node.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
      return { x: minX + tx, y: minY + ty };
    }
    case 'text':
      return { x: node.x + tx, y: node.y + ty };
    case 'image':
      return { x: node.x + tx, y: node.y + ty };
    case 'path':
    case 'group':
      return null;
    default:
      return null;
  }
}

/**
 * **Move os nós selecionados pra posição absoluta** (x, y).
 *
 * Quando `targetX` ou `targetY` é `null`, esse eixo não é alterado
 * (move-to-x não toca em y; move-to-y não toca em x).
 *
 * Nós sem origin computável (`path`/`group`) são SKIP com warn.
 */
export function moveToAbsolute(
  runCtx: RunCtx,
  targetX: number | null,
  targetY: number | null,
): void {
  const ids = selectedIdsOrWarn(runCtx, 'move-to-absolute');
  if (ids === null) return;
  const bus = runCtx.injector.get(CommandBus);
  const state = runCtx.injector.get(EditorStateService);
  const root = state.document().root;
  let movedCount = 0;
  let skippedCount = 0;
  for (const id of ids) {
    const node = findNodeById(root, id);
    if (node === null) {
      skippedCount++;
      continue;
    }
    const origin = getNodeApproxOrigin(node);
    if (origin === null) {
      warn(`move-to-absolute: nó ${node.type} (id=${id}) sem origin computável headless — skip`);
      skippedCount++;
      continue;
    }
    const dx = targetX !== null ? targetX - origin.x : 0;
    const dy = targetY !== null ? targetY - origin.y : 0;
    if (dx === 0 && dy === 0) continue;
    bus.dispatch(new MoveNodeCommand(id, dx, dy));
    movedCount++;
  }
  if (movedCount === 0 && skippedCount > 0) {
    warn(`move-to-absolute: ${skippedCount} nó(s) skip; nada movido`);
  }
}
