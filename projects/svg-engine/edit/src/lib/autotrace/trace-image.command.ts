import {
  type Command,
  type CommandContext,
  type CommandResult,
  createGroup,
  createPath,
  fail,
  findNodeById,
  generateNodeId,
  type ImageNode,
  insertNode,
  type NodeId,
  ok,
  removeNode,
} from 'svg-engine/core';
import { traceImageToPaths, type TraceOptions } from './trace-bitmap';

/**
 * **D-062d** — `TraceImageCommand`. Trace a selected `ImageNode`'s
 * bitmap into a group of polygon paths, inserting the group at the
 * top-level of the document and (optionally) hiding the original
 * image.
 *
 * **Pipeline**:
 * 1. Resolve the image's `href` into an `HTMLImageElement` and
 *    rasterize it into a temporary `<canvas>` to obtain `ImageData`.
 * 2. Call `traceImageToPaths` with the user's threshold/tolerance
 *    options.
 * 3. Wrap the resulting `d`-string paths in a `<g>` and insert at
 *    the document root.
 *
 * **Asynchronous loading**: because the image may need to be fetched
 * from a URL or decoded from a data URI, the command exposes an
 * additional `prepare()` step that the caller invokes BEFORE
 * `dispatch()`. The command itself stays synchronous-on-execute (the
 * `CommandBus` contract requires it) — `prepare()` populates the
 * traced paths into an internal field, then `execute()` consumes
 * them.
 *
 * **Undo**: removes the inserted group by id. The original image is
 * untouched (we never delete the source; the user can hide/delete it
 * themselves after verifying the trace).
 */
export class TraceImageCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private insertedGroupId: NodeId | null = null;
  private tracedPathDs: string[] = [];

  constructor(
    private readonly imageNodeId: NodeId,
    private readonly opts: TraceOptions = {},
  ) {
    this.label = `Trace image "${imageNodeId}"`;
  }

  /**
   * Asynchronously load the image, rasterize, and run the trace.
   * Stores the resulting `d` strings on the command. Must be awaited
   * BEFORE dispatching the command — if `tracedPathDs` is empty at
   * execute time, the command fails.
   */
  async prepare(ctx: CommandContext): Promise<void> {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.imageNodeId);
    if (node === null || node.type !== 'image') {
      throw new Error(`TraceImageCommand: node "${this.imageNodeId}" not found or not an image`);
    }
    const img = node as ImageNode;
    const imageData = await loadImageToImageData(img.href);
    // Default destination = the image's current position + dimensions
    // (overlay the original 1:1).
    const opts: TraceOptions = {
      destX: img.x,
      destY: img.y,
      destWidth: img.width,
      destHeight: img.height,
      ...this.opts,
    };
    this.tracedPathDs = traceImageToPaths(imageData, opts);
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.tracedPathDs.length === 0) {
      return fail(
        `${this.label}: no contours traced — call prepare() first, or adjust threshold/tolerance.`,
      );
    }
    const doc = ctx.state.document();
    const paths = this.tracedPathDs.map((d) =>
      createPath(d, { style: { fill: '#000000', stroke: 'none' } }),
    );
    const group = createGroup(paths, {
      metadata: { name: `Traced ${this.imageNodeId}` },
    });
    // **PAGES-REFACTOR Fase 1**: drop the traced group inside the
    // active page (via ctx.parentResolver). Falls back to doc root for
    // headless consumers / legacy single-root docs. Previously this
    // hard-coded `doc.root.id` which made Auto-trace results vanish
    // when a page was active (P0 from PAGES-FIX-4 audit).
    const effectiveParent = ctx.parentResolver?.resolveAutoParent() ?? doc.root.id;
    let nextRoot;
    try {
      nextRoot = insertNode(doc.root, effectiveParent, group);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    this.insertedGroupId = group.id;
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.insertedGroupId === null) {
      return fail(`${this.label}: nothing to undo`);
    }
    const doc = ctx.state.document();
    const nextRoot = removeNode(doc.root, this.insertedGroupId);
    if (nextRoot === doc.root) {
      return fail(`${this.label} undo: group "${this.insertedGroupId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  /** Id of the inserted group — read after execute() for selection. */
  getInsertedGroupId(): NodeId | null {
    return this.insertedGroupId;
  }
}

/**
 * Browser-only helper: load an image href into ImageData via a
 * temporary canvas. CORS errors on cross-origin images surface here
 * (canvas tainted → getImageData throws); caller must surface the
 * error.
 */
async function loadImageToImageData(href: string): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`autotrace: failed to load image "${href}"`));
    img.src = href;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx2d = canvas.getContext('2d');
  if (ctx2d === null) {
    throw new Error('autotrace: 2D canvas context unavailable');
  }
  ctx2d.drawImage(img, 0, 0);
  return ctx2d.getImageData(0, 0, canvas.width, canvas.height);
}
