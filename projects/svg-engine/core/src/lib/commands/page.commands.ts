import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import {
  getPageName,
  getPageOptions,
  getPageViewBox,
  isPage,
  type PageOptions,
  withPageFlag,
  withPageName,
  withPageOptions,
  withPageViewBox,
} from '../model/page';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode, updateNode } from '../tree/tree-ops';
import type { BoundingBox } from '../types/bounding-box';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-079 — Pages / Artboards**: commands to create, delete, rename,
 * and resize pages.
 *
 * **Top-level invariant**: pages live as direct children of the
 * document root (mirrors D-072 Layer rule). Commands reject illegal
 * placements at dispatch time. The UI prevents these gestures, but
 * defense-in-depth keeps programmatic callers honest.
 *
 * **Undo model**: snapshots the prior root or prior viewBox/name
 * before mutating; `undo()` restores the snapshot. Memory cost is
 * one root reference per op — page-level edits are rare enough that
 * this is fine.
 *
 * **Why a separate file** (not in `layer.commands.ts`): keeps the
 * Pages feature discoverable for grep + import. Pages and Layers
 * share the `svgeKind` slot but are different concepts at the user
 * level.
 */

// ── Defaults ─────────────────────────────────────────────────────────

/**
 * Default viewBox for a new page when caller doesn't supply one — A4
 * portrait at 96dpi (a common starting size for print + screen).
 * Callers can override via the constructor parameter.
 */
const DEFAULT_PAGE_VIEWBOX: BoundingBox = { x: 0, y: 0, width: 794, height: 1123 };

// ── Create ───────────────────────────────────────────────────────────

/**
 * Create a fresh empty Page and insert it at the END of the document
 * root's children (or at a specific index when given). The new page
 * carries a default name like "Page 3" — derived by counting existing
 * pages in the document plus one. Users can rename via the Pages
 * Panel (dblclick / F2).
 *
 * **Why insert at END (not FRONT like layers)**: Pages are read
 * left-to-right as a sequence (like tabs in a browser). Adding "Page
 * 3" should put it AFTER "Page 2", not before. Matches Illustrator
 * artboard convention.
 */
export class CreatePageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'New Page';

  /** Id of the page this command created — exposed so callers can activate it. */
  private createdPageId: NodeId | null = null;

  constructor(
    private readonly viewBox: BoundingBox = DEFAULT_PAGE_VIEWBOX,
    private readonly name?: string,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    // Count current pages for default name.
    let pageCount = 0;
    for (const child of doc.root.children) {
      if (isPage(child)) pageCount += 1;
    }
    const baseGroup = createGroup([], {
      metadata: { name: this.name ?? `Page ${pageCount + 1}` },
    });
    const page = withPageFlag(baseGroup, this.viewBox, this.name);
    this.createdPageId = page.id;
    // Insert at the END of root's children so the tabs read left→right.
    const nextRoot = insertNode(doc.root, doc.root.id, page, doc.root.children.length);
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.createdPageId === null) return fail(`${this.label} undo: nothing to remove`);
    const doc = ctx.state.document();
    const nextRoot = removeNode(doc.root, this.createdPageId);
    if (nextRoot === doc.root) {
      return fail(`${this.label} undo: created page "${this.createdPageId}" already gone`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  /** Id of the page this command created (null before execute / on failure). */
  getCreatedPageId(): NodeId | null {
    return this.createdPageId;
  }
}

// ── Delete ───────────────────────────────────────────────────────────

/**
 * Delete a Page (and its entire subtree). The target node MUST be a
 * page; deleting plain groups / layers / smart objects is handled by
 * RemoveNodeCommand. This command exists separately because the Pages
 * Panel needs a typed entry point + may invoke side-effects (e.g.
 * pick a new active page) that don't apply to arbitrary node deletion.
 *
 * Top-level invariant enforced: rejects non-top-level targets.
 */
export class DeletePageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Delete Page';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly nodeId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isPage(node)) {
      return fail(`${this.label}: node "${this.nodeId}" is not a page`);
    }
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null || parent.id !== doc.root.id) {
      return fail(
        `${this.label}: only top-level pages can be deleted via this command (node is nested)`,
      );
    }
    this.previousRootSnapshot = doc.root;
    const nextRoot = removeNode(doc.root, this.nodeId);
    if (nextRoot === doc.root) {
      return fail(`${this.label}: remove failed for "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

// ── Rename ───────────────────────────────────────────────────────────

/**
 * Rename a Page. Stores the display name in `customData.svgePageName`
 * (overrides `metadata.name`). Pass an empty string to clear the name
 * — the Pages Panel will fall back to `metadata.name` or "Untitled
 * Page".
 *
 * No-op (returns ok without history entry) when the new name matches
 * the current one — avoids pollutes the history with redundant
 * commits from accidental dblclick.
 */
export class RenamePageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Rename Page';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly newName: string,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isPage(node)) return fail(`${this.label}: node "${this.nodeId}" is not a page`);
    const currentName = getPageName(node);
    if (currentName === this.newName) return ok(); // no-op
    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) =>
      withPageName(g, this.newName),
    );
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

// ── Resize ───────────────────────────────────────────────────────────

/**
 * Resize a Page (update its `pageViewBox`). The page's children are
 * UNTOUCHED — they keep their coordinates. The renderer's "single
 * page" mode will start showing more or less of the canvas depending
 * on the new viewBox dimensions. Matches Illustrator artboard resize
 * behaviour: content stays put, the visible window changes.
 *
 * No-op when the new viewBox is structurally identical to the
 * current one.
 */
export class ResizePageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Resize Page';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly newViewBox: BoundingBox,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isPage(node)) return fail(`${this.label}: node "${this.nodeId}" is not a page`);
    const current = getPageViewBox(node);
    if (
      current !== null &&
      current.x === this.newViewBox.x &&
      current.y === this.newViewBox.y &&
      current.width === this.newViewBox.width &&
      current.height === this.newViewBox.height
    ) {
      return ok(); // no-op
    }
    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) =>
      withPageViewBox(g, this.newViewBox),
    );
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

// ── Move ─────────────────────────────────────────────────────────────

/**
 * **PAGES-REFACTOR Fase 6** — translate a Page (update its
 * `pageViewBox.x` / `.y`, keep width/height intact). The page's
 * children are UNTOUCHED — they keep their own coordinates. The
 * renderer's "single page" mode shifts which slice of the canvas
 * frames the page next time it paints.
 *
 * **Why a separate command** (instead of `ResizePageCommand` with
 * unchanged width/height): the user-facing intent is different —
 * "move the page" vs "resize the page" — and the visible bookkeeping
 * (history label, undo stack readability) is cleaner with a dedicated
 * command. The implementation is intentionally similar to
 * `ResizePageCommand` so the snapshot + undo pattern reads at a glance.
 *
 * No-op (returns `ok()` without snapshotting) when the new origin
 * equals the current one — keeps the undo stack clean for stuck-drag
 * pointerups that didn't actually move anything.
 */
export class MovePageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Move Page';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly newOrigin: { readonly x: number; readonly y: number },
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isPage(node)) return fail(`${this.label}: node "${this.nodeId}" is not a page`);
    const current = getPageViewBox(node);
    if (current === null) {
      return fail(`${this.label}: node "${this.nodeId}" has no pageViewBox`);
    }
    if (current.x === this.newOrigin.x && current.y === this.newOrigin.y) {
      return ok(); // no-op
    }
    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) =>
      withPageViewBox(g, {
        x: this.newOrigin.x,
        y: this.newOrigin.y,
        width: current.width,
        height: current.height,
      }),
    );
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    // PAGES-REFACTOR Fase 6 — when execute was a no-op (origin
    // unchanged) the snapshot is null; undo is a silent no-op too
    // (matches SetPageOptionsCommand pattern, avoids "stuck on no-op"
    // loop where the bus would re-undo the same failed command forever).
    if (this.previousRootSnapshot === null) return ok();
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

/**
 * **PAGES-REFACTOR Fase 3** — patch a page's presentation options
 * (background, margins, orientation, format). Partial: only the fields
 * in `patch` are overwritten; the rest are preserved from the existing
 * `getPageOptions(page)` result.
 *
 * **Undo model**: snapshots the prior root before mutating; `undo()`
 * restores the snapshot. Same memory pattern as `ResizePageCommand`.
 *
 * **No-op short-circuit**: if every field in `patch` equals the current
 * value, returns `ok()` without snapshotting — keeps the undo stack
 * clean when the user clicks the same orientation radio twice.
 */
export class SetPageOptionsCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;
  private previousRootSnapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly patch: Partial<PageOptions>,
  ) {
    this.label = `Set page options`;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isPage(node)) return fail(`${this.label}: node "${this.nodeId}" is not a page`);
    const current = getPageOptions(node);
    const next: PageOptions = {
      background: this.patch.background ?? current.background,
      margins: this.patch.margins ?? current.margins,
      orientation: this.patch.orientation ?? current.orientation,
      format: this.patch.format ?? current.format,
    };
    if (samePageOptions(current, next)) return ok();
    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) =>
      withPageOptions(g, this.patch),
    );
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    // **PAGES-REFACTOR Fase 3** — when execute was a no-op (the
    // patch matched current options), `previousRootSnapshot` is null;
    // undo is a silent no-op in that case so the history step is
    // consumed cleanly. Avoids the "stuck on no-op" loop where the
    // bus would re-undo the same failed command forever.
    if (this.previousRootSnapshot === null) return ok();
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

function samePageOptions(a: PageOptions, b: PageOptions): boolean {
  return (
    sameBackground(a.background, b.background) &&
    a.margins.top === b.margins.top &&
    a.margins.right === b.margins.right &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    a.orientation === b.orientation &&
    a.format === b.format
  );
}

function sameBackground(a: PageOptions['background'], b: PageOptions['background']): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'solid' && b.kind === 'solid') return a.color === b.color;
  if (a.kind === 'image' && b.kind === 'image') return a.href === b.href;
  return true; // both 'transparent'
}
