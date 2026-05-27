import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import { isPage, withPageFlag } from '../model/page';
import type { SvgNode } from '../model/svg-node';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, ok } from './command';

/**
 * **D-079 / PAGES-FIX-2** — bootstrap a default `Page 1` for shells
 * that want the multi-page workflow active from the start (Pages Panel
 * always visible in `<svge-shell-pro>`).
 *
 * **Behaviour**:
 *
 * 1. If the document already has at least one page → no-op (returns
 *    `ok()` without mutating; the command also avoids producing a
 *    history entry by leaving the snapshot untouched).
 * 2. Otherwise creates a fresh `Page 1` with `doc.viewBox` and
 *    **migrates all current top-level non-page children into it**.
 *    Loose shapes the user drew before opting into pages move INTO
 *    Page 1 so they remain visible (otherwise the renderer's page-
 *    filter would hide them as siblings of the new page).
 *
 * **Why migrate**: without it, users who draw shapes BEFORE creating
 * the first page would see the canvas go blank the moment a page is
 * created (page-filter renders only the active page's children;
 * pre-page shapes become invisible siblings). Migrating preserves
 * the user's mental model that pages "contain everything".
 *
 * **Why a dedicated command** (vs CreatePageCommand): this one is
 * idempotent + migration-aware. CreatePageCommand assumes "user
 * explicitly added a new empty page". `EnsureDefaultPage` is the
 * bootstrap path called from shell mount — different intent, same
 * undo semantics.
 *
 * Undo restores the prior root verbatim.
 */
export class EnsureDefaultPageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Bootstrap Page 1';

  private previousRoot: GroupNode | null = null;
  private createdPageId: NodeId | null = null;

  /** Page id created by this command, or `null` (no-op or pre-execute). */
  getCreatedPageId(): NodeId | null {
    return this.createdPageId;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    // Idempotent: if any page already exists, do nothing + no history entry.
    for (const child of doc.root.children) {
      if (isPage(child)) return ok();
    }
    this.previousRoot = doc.root;
    // Build Page 1 carrying the document's viewBox; absorb the existing
    // top-level children as its content (preserving their order).
    const orphanChildren: SvgNode[] = [...doc.root.children];
    const baseGroup = createGroup(orphanChildren, {
      metadata: { name: 'Page 1' },
    });
    const page = withPageFlag(baseGroup, doc.viewBox, 'Page 1');
    this.createdPageId = page.id;
    // Replace the root's children with just the new page.
    const nextRoot: GroupNode = {
      ...doc.root,
      children: [page],
    };
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRoot === null) {
      // No-op execute → no-op undo.
      return ok();
    }
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: this.previousRoot });
    return ok();
  }
}
