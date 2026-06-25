import type { BoundingBox } from '@mosaicoo/svg-engine/core';
import type {
  BackgroundConfig,
  GridConfig,
  Guide,
  InteractionConfig,
  PageConfig,
  RulersConfig,
} from './workspace.service';

/**
 * **D-138** — `.svge` / `.svgez` workspace file codec (pure, headless).
 *
 * The workspace file is a versioned **JSON envelope** whose `document`
 * field is the FULL multi-page SVG markup (with all used defs already
 * materialized — see {@link ActiveDefsService}) and whose `editor` field
 * holds the editor-only state that SVG can't express: which page is
 * active, the viewport (pan/zoom), and the {@link WorkspaceService}
 * presentation config (background / page / grid / rulers / guides /
 * interaction).
 *
 * Why JSON-wrapping-SVG instead of a raw JSON model tree: the SVG
 * payload is produced by the SAME exporter the editor already uses, so
 * every gradient/pattern/symbol/effect a shape references round-trips for
 * free (a raw model tree would reference defs by id but lose their
 * definitions). The trade — a single opaque SVG string — is invisible to
 * the user: the file is `.svge` (never opened as an image by other tools),
 * and multi-page renders correctly because it's re-imported, not viewed.
 *
 * `.svgez` is just this JSON envelope gzipped (see `gzipText`/`gunzipText`
 * in `svg-engine/io`) — the same `.svg`→`.svgz` relationship (D-137).
 *
 * This module is PURE: no Angular, no services, no DOM. The plugin
 * captures editor state into {@link WorkspaceEditorState} and restores
 * from it; this file only does the JSON build/parse + defensive
 * validation (a workspace file is untrusted input).
 */

export const WORKSPACE_FORMAT = 'svge-workspace';
export const WORKSPACE_SCHEMA_VERSION = 1;

/** Viewport (pan/zoom) snapshot — restored verbatim on open. */
export interface WorkspaceViewportState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly contentBox: BoundingBox;
}

/**
 * {@link WorkspaceService} presentation config that's worth persisting.
 * Ephemeral view-modes (outline / pixel-preview / presentation / timeline
 * / ruler cursor) are deliberately excluded — they're transient by design.
 */
export interface WorkspaceConfigState {
  readonly background?: BackgroundConfig;
  readonly page?: PageConfig;
  readonly grid?: GridConfig;
  readonly rulers?: RulersConfig;
  readonly guides?: readonly Guide[];
  readonly guidesLocked?: boolean;
  readonly interaction?: InteractionConfig;
}

/**
 * Editor-only state captured alongside the document. `activePageIndex`
 * is the INDEX (not id) of the active page among the document's pages —
 * page ids are not preserved by the SVG round-trip (the exporter omits
 * group ids), but child order is, so the index is the stable anchor.
 */
export interface WorkspaceEditorState {
  readonly activePageIndex: number | null;
  readonly viewport?: WorkspaceViewportState;
  readonly workspace?: WorkspaceConfigState;
}

/** The on-disk shape. */
export interface WorkspaceEnvelope {
  readonly format: typeof WORKSPACE_FORMAT;
  readonly schemaVersion: number;
  readonly app: string;
  readonly document: string;
  readonly editor: WorkspaceEditorState;
}

export type WorkspaceParseResult =
  | { readonly ok: true; readonly document: string; readonly editor: WorkspaceEditorState }
  | { readonly ok: false; readonly error: string };

/**
 * Build the `.svge` JSON text. Pretty-printed (2-space) so the readable
 * variant is genuinely inspectable; the `.svgez` variant gzips this.
 */
export function serializeWorkspace(
  svg: string,
  editor: WorkspaceEditorState,
  app = 'SVGEngine',
): string {
  const envelope: WorkspaceEnvelope = {
    format: WORKSPACE_FORMAT,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    app,
    document: svg,
    editor,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parse `.svge` JSON text into the SVG payload + a NORMALIZED editor
 * state. Rejects non-JSON, wrong format, future schema versions, or a
 * missing/empty document. The `editor` block is best-effort: invalid
 * sub-fields are dropped here, and the consumer's setters re-validate on
 * restore (defense in depth) — so a partially-corrupt file still opens
 * its document instead of failing.
 */
export function parseWorkspace(text: string): WorkspaceParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid workspace file (invalid JSON).' };
  }
  if (!isObject(raw)) {
    return { ok: false, error: 'Not a valid workspace file (expected a JSON object).' };
  }
  if (raw['format'] !== WORKSPACE_FORMAT) {
    return { ok: false, error: 'Not an SVGEngine workspace file.' };
  }
  const schemaVersion = raw['schemaVersion'];
  if (typeof schemaVersion !== 'number' || schemaVersion > WORKSPACE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported workspace version (${String(schemaVersion)}); this build reads up to v${WORKSPACE_SCHEMA_VERSION}.`,
    };
  }
  const docPayload = raw['document'];
  if (typeof docPayload !== 'string' || docPayload.length === 0) {
    return { ok: false, error: 'Workspace file has no document payload.' };
  }
  return { ok: true, document: docPayload, editor: normalizeEditorState(raw['editor']) };
}

// ── Defensive normalizers ───────────────────────────────────────────

function normalizeEditorState(raw: unknown): WorkspaceEditorState {
  if (!isObject(raw)) return { activePageIndex: null };
  const idx = raw['activePageIndex'];
  const activePageIndex = typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 ? idx : null;
  return {
    activePageIndex,
    viewport: normalizeViewport(raw['viewport']),
    workspace: normalizeWorkspace(raw['workspace']),
  };
}

function normalizeViewport(raw: unknown): WorkspaceViewportState | undefined {
  if (!isObject(raw)) return undefined;
  const zoom = raw['zoom'];
  const panX = raw['panX'];
  const panY = raw['panY'];
  const contentBox = normalizeBox(raw['contentBox']);
  if (!isFinite2(zoom) || !isFinite2(panX) || !isFinite2(panY) || contentBox === null) {
    return undefined;
  }
  return { zoom, panX, panY, contentBox };
}

function normalizeBox(raw: unknown): BoundingBox | null {
  if (!isObject(raw)) return null;
  const x = raw['x'];
  const y = raw['y'];
  const width = raw['width'];
  const height = raw['height'];
  if (!isFinite2(x) || !isFinite2(y) || !isFinite2(width) || !isFinite2(height)) return null;
  return { x, y, width, height };
}

function normalizeWorkspace(raw: unknown): WorkspaceConfigState | undefined {
  if (!isObject(raw)) return undefined;
  return {
    background: asObjectConfig<BackgroundConfig>(raw['background']),
    page: asObjectConfig<PageConfig>(raw['page']),
    grid: asObjectConfig<GridConfig>(raw['grid']),
    rulers: asObjectConfig<RulersConfig>(raw['rulers']),
    guides: normalizeGuides(raw['guides']),
    guidesLocked: typeof raw['guidesLocked'] === 'boolean' ? raw['guidesLocked'] : undefined,
    interaction: asObjectConfig<InteractionConfig>(raw['interaction']),
  };
}

/**
 * Accept any plain object as a config of type `T` (cast through `unknown`).
 * The {@link WorkspaceService} setters deep-validate each field on restore,
 * so a structurally-wrong object degrades gracefully rather than throwing.
 */
function asObjectConfig<T>(v: unknown): T | undefined {
  return isObject(v) ? (v as unknown as T) : undefined;
}

function normalizeGuides(raw: unknown): readonly Guide[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Guide[] = [];
  raw.forEach((g, i) => {
    if (!isObject(g)) return;
    const axis = g['axis'];
    const position = g['position'];
    const id = g['id'];
    if ((axis === 'h' || axis === 'v') && isFinite2(position)) {
      out.push({
        id: typeof id === 'string' && id.length > 0 ? id : `guide-${i + 1}`,
        axis,
        position,
      });
    }
  });
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isFinite2(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
