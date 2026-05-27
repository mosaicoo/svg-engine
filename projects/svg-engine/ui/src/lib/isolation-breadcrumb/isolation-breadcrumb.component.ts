import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStateService, findNodeById, type NodeId } from 'svg-engine/core';
import { IsolationService } from 'svg-engine/edit';

/**
 * Single entry rendered by the breadcrumb bar. `nodeId === null`
 * marks the "exit isolation" arrow chip (no node behind it).
 */
interface Crumb {
  readonly key: string;
  readonly nodeId: NodeId | null;
  readonly label: string;
  /** `true` for the last crumb (current isolation root) — non-clickable. */
  readonly isCurrent: boolean;
}

/**
 * Isolation Mode breadcrumb bar (Affinity / Illustrator convention).
 *
 * Renders the navigation path from the document root down to the
 * current isolation root, plus an exit arrow that returns to the
 * top-level scope:
 *
 *   `[←]  Root  >  Group A  >  Group B (current)`
 *
 * **Behavior**:
 * - Hidden entirely when no isolation is active (`isActive === false`).
 *   This matches the user's chosen positioning ("entre régua e canvas,
 *   só visível quando isolado") — zero footprint at the default scope.
 * - Clicking `[←]` exits isolation entirely.
 * - Clicking a non-current crumb jumps the isolation root to that node
 *   (climbs back up one or more levels).
 * - The last crumb (the current isolation root) is rendered as a
 *   non-clickable visual emphasis — no UX value in "clicking the
 *   current level".
 *
 * **Naming**: each crumb's label is derived from the node's
 * `data.name` (when present) else falls back to a friendly default
 * per node type — `'<Group>'`, `'<Path>'`, etc. — matching how the
 * layer panel labels unnamed nodes.
 *
 * **Headless-OK**: lives in `svg-engine/ui` and uses Material design
 * tokens (`var(--mat-sys-*)`) but no Material **components** — so it
 * remains tree-shake-friendly when Material isn't imported by the
 * consumer. The `<svge-editor>` shell pulls it in automatically.
 */
@Component({
  selector: 'svge-isolation-breadcrumb',
  standalone: true,
  /**
   * **PAGES-REFACTOR follow-up #6 / shell-pro breadcrumb bug** —
   * stop pointerdown at the host so it never reaches the canvas-cell
   * underneath. The shell-interactions directive (mounted on
   * canvas-cell) interprets a pointerdown that resolves to "no svg
   * node" as "click on empty canvas" and, when isolation is active,
   * dispatches `isolation.exit()` (Affinity convention). Without this
   * guard, every click on a crumb button would:
   *   1. Trigger shell-interactions pointerdown → isolation.exit() →
   *      visible() flips to false → @if removes the <nav> from DOM.
   *   2. The (click) on the now-removed button never fires (or fires
   *      against a detached element), so setRoot() is never called.
   *   3. User sees the breadcrumb "fecha e não faz nada".
   * Stopping pointerdown at the host preserves the click chain end-
   * to-end while keeping all the normal pointer-events: auto handling
   * for the visible bar.
   */
  host: {
    '(pointerdown)': '$event.stopPropagation()',
  },
  template: `
    @if (visible()) {
      <nav class="bar" aria-label="Isolation breadcrumb">
        <button
          type="button"
          class="exit"
          (click)="exit()"
          title="Exit isolation (Esc)"
          aria-label="Exit isolation"
        >
          <span aria-hidden="true">←</span>
        </button>
        @for (c of crumbs(); track c.key; let isLast = $last) {
          <button
            type="button"
            class="crumb"
            [class.current]="c.isCurrent"
            [disabled]="c.isCurrent"
            (click)="onCrumbClick(c)"
            [attr.aria-current]="c.isCurrent ? 'true' : null"
          >
            {{ c.label }}
          </button>
          @if (!isLast) {
            <span class="separator" aria-hidden="true">›</span>
          }
        }
      </nav>
    }
  `,
  styles: `
    :host {
      display: block;
      /* Don't intercept canvas events when the bar is hidden (visible
         gates the entire <nav>, so there's literally no DOM when
         inactive — defensive double-guard anyway). */
      pointer-events: auto;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      padding: 0 8px;
      background: var(--mat-sys-surface-container-low, #f5f5f5);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #ddd);
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #555);
      user-select: none;
    }
    .exit,
    .crumb {
      appearance: none;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 2px 8px;
      font: inherit;
      color: inherit;
      cursor: pointer;
      transition:
        background 100ms ease,
        border-color 100ms ease;
    }
    .exit {
      padding: 2px 6px;
      font-size: 14px;
      line-height: 1;
      color: var(--mat-sys-on-surface, #333);
    }
    .exit:hover,
    .crumb:not(.current):hover {
      background: var(--mat-sys-surface-container-high, #e8e8e8);
      border-color: var(--mat-sys-outline-variant, #ccc);
    }
    .crumb.current {
      color: var(--mat-sys-on-surface, #333);
      font-weight: 600;
      cursor: default;
    }
    .crumb[disabled] {
      cursor: default;
    }
    .separator {
      color: var(--mat-sys-outline, #999);
      padding: 0 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeIsolationBreadcrumb {
  private readonly isolation = inject(IsolationService);
  private readonly state = inject(EditorStateService);

  protected readonly visible = this.isolation.isActive;

  protected readonly crumbs = computed<readonly Crumb[]>(() => {
    const path = this.isolation.breadcrumbPath();
    if (path.length === 0) return [];
    const root = this.state.document().root;
    const out: Crumb[] = [];
    for (let i = 0; i < path.length; i++) {
      const id = path[i]!;
      const node = findNodeById(root, id);
      out.push({
        key: `crumb-${i}-${id}`,
        nodeId: id,
        label: labelFor(node, id, i === 0),
        isCurrent: i === path.length - 1,
      });
    }
    return out;
  });

  protected exit(): void {
    this.isolation.exit();
  }

  protected onCrumbClick(c: Crumb): void {
    if (c.isCurrent || c.nodeId === null) return;
    this.isolation.setRoot(c.nodeId);
  }
}

/** Friendly label for a crumb — name attr or per-type fallback. */
function labelFor(node: ReturnType<typeof findNodeById>, id: NodeId, isRoot: boolean): string {
  if (node === null) return `‹${id.slice(0, 6)}›`;
  // Prefer an authored name. SVGEngine stores it under `data.name`
  // when present (set by importer / inspector).
  const data = (node as { readonly data?: { readonly name?: string } }).data;
  if (typeof data?.name === 'string' && data.name.length > 0) return data.name;
  if (isRoot) return 'Document';
  // Per-type defaults (mirror the layers panel convention).
  switch (node.type) {
    case 'group':
      return '‹Group›';
    case 'rect':
      return '‹Rect›';
    case 'ellipse':
      return '‹Ellipse›';
    case 'path':
      return '‹Path›';
    case 'line':
      return '‹Line›';
    case 'polygon':
      return '‹Polygon›';
    case 'polyline':
      return '‹Polyline›';
    case 'text':
      return '‹Text›';
    case 'image':
      return '‹Image›';
    default:
      return `‹${id.slice(0, 6)}›`;
  }
}
