import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  CommandBus,
  EditorStateService,
  EditSmartObjectContentsCommand,
  findNodeById,
  isSmartObject,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';
import { svgExporter, svgImporter } from 'svg-engine/io';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * Data injected into {@link SvgeSmartObjectEditorDialog} via
 * `MAT_DIALOG_DATA`.
 */
export interface SmartObjectEditorDialogData {
  /** Id of the smart object being edited (the wrapper, not children). */
  readonly nodeId: NodeId;
}

/**
 * **D-074 — `<svge-smart-object-editor-dialog>`**: editable SVG source
 * for the contents of a Smart Object wrapper. Mirrors Photoshop's
 * "Edit Contents" flow, adapted to a vector-first editor: instead of
 * spawning a separate canvas window, we surface the inner SVG as text
 * and let the user edit/paste/replace fragments.
 *
 * **Flow**:
 *
 * 1. Component mounts → reads the smart object from
 *    `EditorStateService`, finds its children, exports them as an
 *    inline `<svg>` wrapper (so the user sees something parseable
 *    and editable).
 * 2. Textarea pre-fills with the exported SVG. User edits freely.
 * 3. Apply → re-parse the textarea via `svgImporter`, dispatch
 *    `EditSmartObjectContentsCommand` with the parsed children. The
 *    wrapper's id / transform / style / metadata stay intact (the
 *    command only touches `children`). Single undo entry.
 * 4. Cancel → close without dispatching.
 *
 * **Why text editing (not a sub-canvas)**: building a nested editor
 * surface inside a dialog would be a major UI undertaking (full
 * canvas, overlays, tools panel). Text is the pragmatic MVP — power
 * users can paste an entire SVG file, batch-edit attributes via
 * find/replace in the textarea, etc. A future "Open Smart Object in
 * new tab" would be the right enhancement, but is out of scope here.
 *
 * **Why a wrapper `<svg>` is shown** (not just the inner nodes): the
 * source dialog (D-036) demonstrates that users expect to see an
 * `<svg>` envelope around any SVG content. Without the wrapper, the
 * textarea would be a fragment that doesn't parse standalone. The
 * importer pulls children out of the root after re-parsing, so the
 * wrapper is just a parseability scaffold — its attributes are
 * irrelevant beyond `xmlns`.
 *
 * **Error surfacing**: parse failure → inline error banner under the
 * textarea + Apply disabled. The user can fix and try again without
 * losing their edits.
 */
@Component({
  selector: 'svge-smart-object-editor-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatButton, MatIcon],
  template: `
    <svge-dialog-shell
      icon="inventory_2"
      title="Edit Smart Object Contents"
      [subtitle]="subtitle()"
    >
      <textarea
        class="source"
        spellcheck="false"
        aria-label="Smart Object SVG source"
        [value]="initialSource()"
        (input)="onInput($event)"
      ></textarea>
      @if (errorMessage(); as err) {
        <p class="error" role="alert">
          <mat-icon class="error-icon" aria-hidden="true">error</mat-icon>
          {{ err }}
        </p>
      }
      @if (warnings().length > 0) {
        <ul class="warnings" role="status" aria-live="polite">
          @for (w of warnings(); track w) {
            <li>{{ w }}</li>
          }
        </ul>
      }

      <span svgeDialogFooterStatus aria-live="polite"> {{ byteCount() }} bytes </span>
      <div svgeDialogFooterActions>
        <button mat-button type="button" (click)="close()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="errorMessage() !== null || !dirty()"
          (click)="apply()"
        >
          Apply
        </button>
      </div>
    </svge-dialog-shell>
  `,
  styles: `
    .source {
      width: 100%;
      min-height: 280px;
      resize: vertical;
      padding: 0.75rem 1rem;
      border-radius: 0.35rem;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      color: var(--mat-sys-on-surface, inherit);
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      flex: 1 1 auto;
      min-height: 0;
      box-sizing: border-box;
    }
    .source:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
    }
    .error {
      margin: 8px 0 0;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      border-radius: 4px;
      background: var(--mat-sys-error-container, #fde7e9);
      color: var(--mat-sys-on-error-container, #5a1014);
      font-size: 13px;
    }
    .error-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .warnings {
      margin: 8px 0 0;
      padding: 6px 8px 6px 24px;
      border-radius: 4px;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
      color: var(--mat-sys-on-surface-variant, #777);
      font-size: 12px;
      list-style: disc;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeSmartObjectEditorDialog {
  private readonly data = inject<SmartObjectEditorDialogData>(MAT_DIALOG_DATA);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  private readonly dialogRef = inject(MatDialogRef<SvgeSmartObjectEditorDialog>);

  /**
   * The initial SVG text shown in the textarea. Computed once at
   * mount (the smart object's current children, wrapped in a parseable
   * `<svg>`); subsequent edits live in {@link currentText} via input
   * binding. Read-only — the textarea uses `[value]` so it's NOT
   * controlled by Angular on every keystroke (would lose cursor
   * position and history).
   */
  protected readonly initialSource = signal<string>('');
  protected readonly subtitle = signal<string>('');

  /** Last user-typed value — used for parse + dispatch. */
  private currentText = '';
  /** Computed children of a successful parse, ready for dispatch. */
  private pendingChildren: readonly SvgNode[] | null = null;
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly warnings = signal<readonly string[]>([]);
  protected readonly dirty = signal(false);
  protected readonly byteCount = signal(0);

  constructor() {
    // Build initial source from the smart object's current children.
    // The wrapper `<svg>` carries the document viewBox so the editor
    // shows valid markup the user can iterate on without scaffolding.
    const doc = this.state.document();
    const node = findNodeById(doc.root, this.data.nodeId);
    if (node === null) {
      this.errorMessage.set(`Smart Object "${this.data.nodeId}" not found.`);
      return;
    }
    if (!isSmartObject(node)) {
      this.errorMessage.set('Selected node is not a Smart Object.');
      return;
    }
    this.subtitle.set(
      node.metadata.name !== undefined && node.metadata.name.length > 0
        ? node.metadata.name
        : `${node.children.length} child${node.children.length === 1 ? '' : 'ren'}`,
    );
    // Build a temporary sub-document with just the smart object's
    // children at the root, share the parent doc's viewBox so the
    // user sees correct coordinates when comparing to the canvas.
    const sub = {
      id: this.data.nodeId,
      viewBox: doc.viewBox,
      root: { ...node, metadata: {} },
    };
    const exported = svgExporter.export(sub);
    const text = typeof exported === 'string' ? exported : '';
    this.initialSource.set(text);
    this.currentText = text;
    this.byteCount.set(new Blob([text]).size);
    // Set initial pending children = current children (no-op apply
    // is no-op). The user actually triggers an action only after they
    // type something that changes parsed output.
    this.pendingChildren = node.children;
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.currentText = value;
    this.byteCount.set(new Blob([value]).size);
    this.parseAndValidate(value);
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected apply(): void {
    if (this.errorMessage() !== null) return;
    if (this.pendingChildren === null) return;
    if (!this.dirty()) {
      // No actual change — close without dispatch (no spurious undo).
      this.dialogRef.close();
      return;
    }
    this.bus.dispatch(new EditSmartObjectContentsCommand(this.data.nodeId, this.pendingChildren));
    this.dialogRef.close();
  }

  /**
   * Parse the textarea contents and validate. Sets `pendingChildren`
   * on success, `errorMessage` on failure. Updates `warnings` from the
   * importer's non-fatal warnings list (script tags stripped, etc.).
   */
  private parseAndValidate(text: string): void {
    if (text === this.initialSource()) {
      this.dirty.set(false);
      this.errorMessage.set(null);
      this.warnings.set([]);
      return;
    }
    this.dirty.set(true);
    const result = svgImporter.import(text);
    if (!result.ok) {
      this.errorMessage.set(`Parse failed: ${result.error}`);
      this.warnings.set([]);
      this.pendingChildren = null;
      return;
    }
    if (result.document.root.children.length === 0) {
      this.errorMessage.set('The edited SVG must contain at least one shape.');
      this.warnings.set(result.warnings);
      this.pendingChildren = null;
      return;
    }
    this.errorMessage.set(null);
    this.warnings.set(result.warnings);
    this.pendingChildren = result.document.root.children;
  }
}
