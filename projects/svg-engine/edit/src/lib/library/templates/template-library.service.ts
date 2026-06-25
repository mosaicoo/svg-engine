import { Injectable } from '@angular/core';
import type { SvgDocument } from '@mosaicoo/svg-engine/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * A "document template" — a ready-to-use blank document with
 * configured viewBox / dimensions / starter nodes / defs. The user
 * picks a template to start a new project (poster, social media,
 * business card, etc.).
 *
 * **`build()` factory**: returns a fresh `SvgDocument` with all
 * new ids. Applying a template typically resets the active document
 * via `EditorStateService.resetDocument(template.build())`.
 */
export interface TemplateLibraryItem extends LibraryItem {
  /** Document dimensions hint shown in the picker (e.g., "1080×1080"). */
  readonly dimensions?: string;
  /** Build a fresh SvgDocument for this template (new ids on every call). */
  build(): SvgDocument;
}

/**
 * Registry of `TemplateLibraryItem`s — D-048. Per-editor scope so
 * each editor can curate a different starter-template catalog.
 */
@Injectable({ providedIn: 'root' })
export class TemplateLibraryService extends LibraryRegistry<TemplateLibraryItem> {}
