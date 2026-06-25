import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import {
  CommandBus,
  EditorStateService,
  type NodeId,
  ReleaseSmartObjectCommand,
  ReplaceSmartObjectContentsCommand,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { mergeDefsFragments, svgImporter } from '@mosaicoo/svg-engine/io';

/** Outcome of {@link SmartObjectActionsService.applyReplaceText}. */
export interface ReplaceContentsResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly warnings: readonly string[];
}

/**
 * **D-076** — centralized actions for Smart Object operations that
 * don't depend on Material dialogs.
 *
 * **Why this service exists**: prior to D-076 the Inspector had no
 * Smart Object UI; the only entry points were the menu plugin (via
 * `Object ▸ Smart Object ▸ Replace Contents…`) and the edit-side
 * `builtinMenuContributionsPlugin` had its `replaceSmartObjectContents`
 * helper inlined. D-076 adds an Inspector section with the same
 * actions — extracting the file-picker + parse + dispatch flow here
 * keeps the **single source of truth** so the menu plugin AND the
 * Inspector call the same code path, identical error handling, same
 * warning surface.
 *
 * **What's NOT here**: opening the textarea editor dialog for "Edit
 * Contents" — that lives in `svg-engine/ui`'s
 * `SvgeSmartObjectEditorDialogService` because the dialog uses
 * `MatDialog` (forbidden in `edit/` per D-017). Inspector and menu
 * plugin both delegate to that ui-side service for Edit Contents.
 *
 * **Browser-safe**: each method defensively checks for `document` /
 * `window` so the service can be instantiated under SSR/tests
 * (methods then no-op gracefully).
 */
@Injectable({ providedIn: 'root' })
export class SmartObjectActionsService {
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);
  private readonly document = inject(DOCUMENT);

  /**
   * Open a native file picker, parse the chosen SVG, and dispatch
   * `ReplaceSmartObjectContentsCommand` to swap the wrapper's
   * children. The wrapper's id / transform / style / metadata are
   * preserved — only the inner content changes (Photoshop "Replace
   * Contents…" convention).
   *
   * **Failure modes** (each surfaced via `window.alert` + early
   * return — no exception thrown):
   * - User cancelled the file dialog → silent no-op
   * - SVG parse failed → alert with parser error
   * - Imported SVG has zero shapes → alert "no shapes"
   *
   * **Non-fatal warnings** from the importer (script tags stripped,
   * etc.) are logged via `console.warn` but don't abort the replace.
   *
   * @param smartObjectId id of the smart-object wrapper whose children
   *   should be replaced.
   */
  replaceContents(smartObjectId: NodeId): void {
    if (typeof this.document === 'undefined') return;
    const input = this.document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.style.display = 'none';
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        input.remove();
        if (file === undefined || file === null) return;
        void file.text().then((text) => {
          const result = this.applyReplaceText(smartObjectId, text);
          if (!result.ok && result.error !== undefined) {
            this.alert(`Replace failed: ${result.error}`);
          }
          if (result.warnings.length > 0 && typeof console !== 'undefined') {
            console.warn(`[SVGEngine] Replace warnings:\n${result.warnings.join('\n')}`);
          }
        });
      },
      { once: true },
    );
    this.document.body.appendChild(input);
    input.click();
  }

  /**
   * Parse `text`, swap the smart object's children, **and merge the
   * imported `<defs>` into the document** so gradients/filters/patterns
   * referenced via `url(#id)` keep resolving (D-097 — without this the
   * defs were dropped and gradient-filled imports rendered as dangling
   * references). Headless-testable core of {@link replaceContents} (no
   * file picker, no `window.alert`) — returns a structured result the
   * caller surfaces.
   *
   * Defs are merged into the **document** (shared) by id (existing kept,
   * new appended), mirroring the additive-import path. The merge is a
   * direct state write (not a command) — on undo the children revert and
   * the now-unused defs linger harmlessly, same convention as
   * `ImportPlacementService`.
   */
  applyReplaceText(smartObjectId: NodeId, text: string): ReplaceContentsResult {
    const result = svgImporter.import(text);
    if (!result.ok) {
      return { ok: false, error: result.error, warnings: [] };
    }
    // Imported document's root group wraps the actual top-level shapes as
    // children — pull those out (we don't want to nest a fresh root
    // inside the smart object).
    const newChildren: readonly SvgNode[] = result.document.root.children;
    if (newChildren.length === 0) {
      return { ok: false, error: 'imported SVG has no shapes', warnings: result.warnings };
    }
    this.mergeImportedDefs(result.document.defs);
    this.bus.dispatch(new ReplaceSmartObjectContentsCommand(smartObjectId, newChildren));
    return { ok: true, warnings: result.warnings };
  }

  /** Merge an imported `<defs>` fragment into the document defs (by id). */
  private mergeImportedDefs(defs: string | undefined): void {
    if (defs === undefined || defs.length === 0) return;
    const doc = this.state.document();
    const merged = mergeDefsFragments(doc.defs, defs);
    if (merged !== doc.defs) this.state.setDocument({ ...doc, defs: merged });
  }

  /**
   * **D-110** (was `rasterize`) — dispatch `ReleaseSmartObjectCommand`: drops
   * the wrapper and hoists its children (editable vectors) back into the
   * parent at the wrapper's slot. Inverse of Convert to Smart Object. Single
   * undoable history entry (the command bundles the unwrap + flag-clear).
   *
   * Idempotent: dispatching on a non-smart-object target is a no-op at the
   * command level (returns ok without mutating the tree).
   */
  release(smartObjectId: NodeId): void {
    this.bus.dispatch(new ReleaseSmartObjectCommand(smartObjectId));
  }

  /** @deprecated D-110 — renamed to {@link release} (it never rasterized). */
  rasterize(smartObjectId: NodeId): void {
    this.release(smartObjectId);
  }

  /** Cross-env alert — tolerates non-browser contexts. */
  private alert(message: string): void {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
    }
  }
}
