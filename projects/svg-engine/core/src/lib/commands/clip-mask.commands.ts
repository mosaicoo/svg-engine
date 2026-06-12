import type { SvgDocument } from '../document/svg-document';
import { findNodeById, findParent, insertNode, removeNode, updateNode } from '../tree/tree-ops';
import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-086 — Object ▸ Mask (gesture-based clip / opacity mask).**
 *
 * `kind` selects the SVG mechanism + the `style` field written on the
 * clipped target(s):
 * - `'clipPath'` → `<clipPath>` def + `style.clipPath = url(#id)` (binary
 *   inclusion crop).
 * - `'mask'` → `<mask>` def + `style.mask = url(#id)` (luminance/alpha
 *   opacity mask).
 *
 * These commands are **pure model mutations**: they receive the already
 * serialized `<clipPath>`/`<mask>` markup (built by the edit-side handler
 * via `nodeToSvgMarkup`, which lives in `svg-engine/io`) and a restored
 * node for Release (parsed by the handler via `svgImporter`). Keeping the
 * io work outside the command keeps `svg-engine/core` headless.
 */
export type ClipMaskKind = 'clipPath' | 'mask';

// ── Pure `document.defs` string helpers (exported + testable) ────────

/** Append a `<clipPath>`/`<mask>` element to the defs fragment. */
export function appendDef(defs: string | undefined, markup: string): string {
  const base = defs ?? '';
  return base.length === 0 ? markup : `${base}\n${markup}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex matching a single `<clipPath id="X">…</clipPath>` (or `<mask>`)
 * element. `clipPath`/`mask` never nest in themselves, so the non-greedy
 * body is safe. Case-insensitive tag; `id` may appear anywhere in the
 * opening tag, single- or double-quoted.
 */
function defElementRegex(id: string): RegExp {
  return new RegExp(
    `<(clipPath|mask)\\b[^>]*\\bid=(["'])${escapeRegExp(id)}\\2[^>]*>[\\s\\S]*?</\\1>`,
    'i',
  );
}

/** Remove the `<clipPath>`/`<mask>` element with the given id from defs. */
export function removeDefById(defs: string | undefined, id: string): string {
  if (defs === undefined || defs.length === 0) return '';
  return defs
    .replace(defElementRegex(id), '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Extract the full `<clipPath>`/`<mask>` element markup, or `null`. */
export function extractDefById(defs: string | undefined, id: string): string | null {
  if (defs === undefined || defs.length === 0) return null;
  const m = defElementRegex(id).exec(defs);
  return m === null ? null : m[0];
}

/** Pull the bare id out of a `url(#id)` style value, or `null`. */
export function unwrapUrlRef(value: string | undefined): string | null {
  if (value === undefined) return null;
  const m = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(value.trim());
  return m === null ? null : m[1]!;
}

/** Immutably set (or clear) `style.clipPath`/`style.mask` on a node. */
function withStyleField(node: SvgNode, field: ClipMaskKind, value: string | undefined): SvgNode {
  return { ...node, style: { ...node.style, [field]: value } } as SvgNode;
}

// ── Make ─────────────────────────────────────────────────────────────

/**
 * **Make Clipping Path / Make Opacity Mask** — the topmost selected node
 * (the `clipper`) is consumed into a `<clipPath>`/`<mask>` def in
 * `document.defs`, removed from the tree, and the remaining selected
 * node(s) (`targetIds`) get `style.clipPath`/`style.mask = url(#defId)`.
 *
 * Undo restores the whole document snapshot (clipper back, refs cleared,
 * def dropped) — robust against the multi-part mutation.
 */
export class MakeClipMaskCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly isDestructive = true;
  private before: SvgDocument | null = null;

  constructor(
    private readonly targetIds: readonly NodeId[],
    private readonly clipperId: NodeId,
    private readonly defId: string,
    private readonly defMarkup: string,
    private readonly kind: ClipMaskKind,
  ) {
    this.id = defId;
    this.label = kind === 'clipPath' ? 'Make clipping path' : 'Make opacity mask';
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    if (this.targetIds.length === 0) return fail('MakeClipMaskCommand: no target nodes');
    if (findNodeById(doc.root, this.clipperId) === null) {
      return fail(`MakeClipMaskCommand: clipper "${this.clipperId}" not found`);
    }
    for (const id of this.targetIds) {
      if (findNodeById(doc.root, id) === null) {
        return fail(`MakeClipMaskCommand: target "${id}" not found`);
      }
    }
    this.before = doc;

    let root = removeNode(doc.root, this.clipperId);
    const ref = `url(#${this.defId})`;
    for (const id of this.targetIds) {
      root = updateNode(root, id, (n: SvgNode) => withStyleField(n, this.kind, ref));
    }
    ctx.state.setDocument({ ...doc, root, defs: appendDef(doc.defs, this.defMarkup) });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.before === null) return fail('MakeClipMaskCommand: nothing to undo');
    ctx.state.setDocument(this.before);
    return ok();
  }
}

// ── Release ──────────────────────────────────────────────────────────

/**
 * **Release Clipping Path / Release Mask** — clears the
 * `style.clipPath`/`style.mask` reference on `nodeId`, drops the now-orphan
 * `<clipPath>`/`<mask>` def from `document.defs`, and (Illustrator parity)
 * re-inserts `restoredNode` — the clip shape parsed back from the def by
 * the edit-side handler — at the top of the target's parent.
 *
 * `restoredNode` may be `null` (parse failed, or a library/imported clip
 * with no recoverable geometry) — then Release just removes the reference.
 */
export class ReleaseClipMaskCommand implements Command {
  readonly id: string;
  readonly label: string;
  readonly isDestructive = true;
  private before: SvgDocument | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly kind: ClipMaskKind,
    private readonly restoredNode: SvgNode | null,
  ) {
    this.id = `release-${nodeId}`;
    this.label = kind === 'clipPath' ? 'Release clipping path' : 'Release mask';
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`ReleaseClipMaskCommand: node "${this.nodeId}" not found`);
    const defId = unwrapUrlRef(node.style[this.kind]);
    if (defId === null) {
      return fail(`ReleaseClipMaskCommand: node has no ${this.kind} reference`);
    }
    this.before = doc;

    let root = updateNode(doc.root, this.nodeId, (n: SvgNode) =>
      withStyleField(n, this.kind, undefined),
    );
    if (this.restoredNode !== null && findNodeById(root, this.restoredNode.id) === null) {
      const parent = findParent(root, this.nodeId);
      root = insertNode(root, parent?.id ?? root.id, this.restoredNode);
    }
    ctx.state.setDocument({ ...doc, root, defs: removeDefById(doc.defs, defId) });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.before === null) return fail('ReleaseClipMaskCommand: nothing to undo');
    ctx.state.setDocument(this.before);
    return ok();
  }
}
