import { computed, inject, Injectable, signal } from '@angular/core';
import {
  CommandBus,
  createImage,
  EditorStateService,
  type ImageNode,
  InsertNodeCommand,
} from 'svg-engine/core';
import { ActivePageService } from '../../pages/active-page.service';

/**
 * Asset Manager (D-048 Item 2) — in-memory catalog of imported
 * external assets (images / SVG fragments) the user can drop into
 * the document.
 *
 * **v1 scope**: image-only via `<image href="data:...">` (data URIs
 * keep the asset embedded in the document — no broken refs after
 * export). External URLs are also supported when the consumer
 * explicitly opts in (security: data URIs are sandboxed by the
 * browser; arbitrary URLs can leak referrer / track).
 *
 * **Catalog persistence**: per-session in-memory only (a signal
 * Record). Persisting across sessions is a future enhancement that
 * would slot into the existing AutoSaveService (just bigger payload).
 *
 * **Not yet**:
 * - SVG paste / fragment insertion (needs the importer pipeline to
 *   support partial-document import).
 * - External CDN / API browsing (Unsplash, Iconify) — would belong
 *   to a separate `AssetProviderRegistry` plugin contract.
 */
export interface AssetCatalogEntry {
  readonly id: string;
  /** Display name shown in the panel. */
  readonly name: string;
  /** Data URI or external URL. */
  readonly href: string;
  /** Optional intrinsic dimensions in pixels (for default insert size). */
  readonly width?: number;
  readonly height?: number;
}

@Injectable({ providedIn: 'root' })
export class AssetManagerService {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  // PAGES-FIX-2: drop assets into the active page (legacy root otherwise).
  private readonly activePage = inject(ActivePageService);

  /** In-memory catalog keyed by entry id. */
  private readonly _catalog = signal<readonly AssetCatalogEntry[]>([]);
  readonly catalog = this._catalog.asReadonly();
  readonly hasAssets = computed(() => this._catalog().length > 0);

  /**
   * Register an asset in the catalog. The id can be any unique
   * string; for file imports `addFromFile` generates a slug-like id.
   * Throws on duplicate id (caller is responsible for namespacing).
   */
  add(entry: AssetCatalogEntry): void {
    if (this._catalog().some((e) => e.id === entry.id)) {
      throw new Error(`AssetManagerService.add: duplicate asset id "${entry.id}"`);
    }
    this._catalog.set([...this._catalog(), entry]);
  }

  /** Remove an asset from the catalog (no-op when id not found). */
  remove(id: string): void {
    this._catalog.set(this._catalog().filter((e) => e.id !== id));
  }

  /**
   * Import a local file (image) as a data URI and register it as a
   * catalog entry. Returns the created entry (or `null` if the file
   * couldn't be read).
   *
   * Browser-only (uses FileReader). Files larger than `maxBytes`
   * (default 5 MiB) are rejected to prevent the catalog from
   * dominating document size after embedding.
   */
  async addFromFile(file: File, maxBytes = 5 * 1024 * 1024): Promise<AssetCatalogEntry | null> {
    if (file.size > maxBytes) {
      // Caller (panel) is expected to show a friendly error; we
      // return null so callers can branch without try/catch.
      return null;
    }
    const dataUri = await readAsDataUri(file);
    if (dataUri === null) return null;
    const entry: AssetCatalogEntry = {
      id: `asset.${Date.now()}.${slugify(file.name)}`,
      name: file.name,
      href: dataUri,
    };
    this.add(entry);
    return entry;
  }

  /**
   * Insert an asset into the document as an `<image>` node at the
   * given top-left, with the given size (defaults: 200×200, centered
   * at viewBox origin). Dispatches a single `InsertNodeCommand` for
   * undo support.
   */
  insertIntoDocument(
    entry: AssetCatalogEntry,
    opts: { x?: number; y?: number; width?: number; height?: number } = {},
  ): ImageNode {
    const w = opts.width ?? entry.width ?? 200;
    const h = opts.height ?? entry.height ?? 200;
    const node = createImage({
      x: opts.x ?? 50,
      y: opts.y ?? 50,
      width: w,
      height: h,
      href: entry.href,
    });
    this.bus.dispatch(new InsertNodeCommand(this.activePage.effectiveDrawTargetId(), node));
    return node;
  }
}

/** Read a File as a `data:` URI. Returns null on read error. */
function readAsDataUri(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Normalize a filename to a usable id fragment (lowercase + dashes). */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '') // drop extension
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}
