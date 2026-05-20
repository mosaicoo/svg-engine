import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  RemoveNodeCommand,
  SetPropertyCommand,
  type TextNode,
} from 'svg-engine/core';
import { InlineTextEditorService } from './text-tool.service';
import { PLACEHOLDER_TEXT } from './text-tool.plugin';

/**
 * Inline editor for SVG `<text>` nodes — opens whenever
 * {@link InlineTextEditorService.editingId} is non-null. Renders a
 * `<svg:foreignObject>` containing a contentEditable div positioned
 * over the target text node, so the user types in HTML-native
 * editing UX (cursor, selection, IME) while the result is committed
 * back to the SVG model.
 *
 * **Render strategy**: `<foreignObject>` is the SVG-spec way to embed
 * arbitrary HTML inside an SVG. The HTML inherits the SVG's coordinate
 * system, so positioning the editor at the text node's exact location
 * is a direct attribute set — no CSS transform math needed. The
 * trade-off is browser support: every modern browser supports it
 * (incl. all editor targets); jsdom has a stub.
 *
 * **Why not native `<text>` contentEditable**: HTML `contentEditable`
 * doesn't apply to SVG elements in any browser — SVG text just isn't
 * editable. foreignObject + div is the universally-accepted bridge.
 *
 * **Commit flow**:
 *
 * - Enter / blur → `SetPropertyCommand` dispatched with current text;
 *   if text is empty AND the node was a fresh placeholder, dispatch
 *   `RemoveNodeCommand` instead (user clicked but typed nothing).
 * - Esc → identical to "empty + placeholder" path when fresh; for
 *   pre-existing text, just exits edit mode without committing
 *   (the model still has the original content).
 *
 * **One undo entry per edit session** (matches Inspector behaviour):
 * we don't dispatch SetPropertyCommand per keystroke. The DOM
 * contentEditable accumulates the edit locally; commit happens once
 * on terminator (Enter/blur).
 *
 * Usage (inside an `<svge-renderer>`):
 * ```html
 * <svg:g svgeInlineTextEditor></svg:g>
 * ```
 *
 * The editor renders nothing when no node is being edited — zero
 * overlay overhead in the common case.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeInlineTextEditor]',
  standalone: true,
  template: `
    @if (target(); as t) {
      <svg:foreignObject
        [attr.x]="t.x"
        [attr.y]="t.y - t.fontSize * 0.8"
        [attr.width]="Math.max(200, t.estimatedWidth)"
        [attr.height]="t.fontSize * 1.4"
      >
        <!--
          xmlns is REQUIRED on the root HTML element inside foreignObject
          — without it, browsers parse the content as SVG-namespace and
          contentEditable / focus / typing all silently fail.
        -->
        <div
          #editor
          xmlns="http://www.w3.org/1999/xhtml"
          class="inline-text-editor"
          contenteditable="true"
          spellcheck="true"
          role="textbox"
          aria-label="Edit text content"
          [style.font-size.px]="t.fontSize"
          [style.color]="t.color"
          (keydown)="onKeyDown($event)"
          (blur)="commitAndClose()"
        ></div>
      </svg:foreignObject>
    }
  `,
  styles: `
    .inline-text-editor {
      display: inline-block;
      min-width: 4ch;
      padding: 0 2px;
      outline: 2px solid #1976d2;
      background: rgba(255, 255, 255, 0.85);
      font-family: sans-serif;
      line-height: 1.2;
      white-space: pre-wrap;
      cursor: text;
    }
    /* foreignObject can render with subpixel artifacts at the edges;
       this rule keeps the focus ring crisp at any zoom. */
    .inline-text-editor:focus-visible {
      outline-color: #1976d2;
      outline-offset: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineTextEditor {
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  private readonly editorSvc = inject(InlineTextEditorService);
  private readonly editorEl = viewChild<ElementRef<HTMLDivElement>>('editor');

  /** Math is template-side because polygon math + editor sizing both use it. */
  protected readonly Math = globalThis.Math;

  /**
   * Snapshot of the node being edited at the moment edit started.
   * Captured in an effect so the editor doesn't react to mid-edit
   * model changes (those would erase the user's typing). When
   * `editingId` flips back to null we clear `target` and the
   * `@if (target(); as t)` gate hides the editor.
   */
  private readonly _target = signal<{
    nodeId: import('svg-engine/core').NodeId;
    initialText: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    estimatedWidth: number;
  } | null>(null);

  protected readonly target = this._target.asReadonly();

  constructor() {
    // React to the InlineTextEditorService — when an id arrives,
    // resolve the node + capture its render-relevant fields. We
    // de-couple from the model AFTER capturing so the editor's
    // own SetPropertyCommand on commit doesn't cause a feedback
    // loop (the model update would otherwise re-fire this effect).
    effect(() => {
      const id = this.editorSvc.editingId();
      if (id === null) {
        this._target.set(null);
        return;
      }
      const node = findNodeById(this.state.document().root, id);
      if (node === null || node.type !== 'text') {
        // Node deleted between beginEdit and now — bail gracefully.
        this.editorSvc.endEdit();
        return;
      }
      const text = node as TextNode;
      const fontSize = text.fontSize ?? 16;
      this._target.set({
        nodeId: id,
        initialText: text.content,
        x: text.x,
        y: text.y,
        fontSize,
        color: text.style.fill ?? '#000000',
        // Rough estimate: 0.6em per char + padding. Cap at 800 to
        // avoid a 9999-char text node blowing up the foreignObject.
        estimatedWidth: Math.min(800, text.content.length * fontSize * 0.6 + 20),
      });
    });

    // Auto-focus + seed the editor's contenteditable with the initial
    // text. Runs after every render so the focus lands after the
    // `<foreignObject>` actually mounts to the DOM.
    afterEveryRender({
      read: () => {
        const ref = this.editorEl();
        const tgt = this._target();
        if (ref === undefined || tgt === null) return;
        const el = ref.nativeElement;
        // First mount of THIS edit session — seed text + focus +
        // select-all. Subsequent renders skip (we only want to clobber
        // user input on the initial mount).
        if (el.dataset['seededFor'] === tgt.nodeId) return;
        el.dataset['seededFor'] = tgt.nodeId;
        el.textContent = tgt.initialText;
        el.focus();
        // Select all so typing replaces the placeholder immediately
        // (Illustrator/Figma convention for fresh-click text creation).
        const selection = window.getSelection?.();
        const range = document.createRange?.();
        if (selection !== null && selection !== undefined && range !== undefined) {
          range.selectNodeContents(el);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      },
    });
  }

  /**
   * Keyboard handlers for the editable surface:
   *
   * - **Enter** (without Shift): commit + close. Shift+Enter inserts
   *   a literal newline (current `<text>` rendering shows it as a
   *   space — multi-line support via `<tspan>` is future polish).
   * - **Escape**: cancel. If the node was a fresh placeholder + the
   *   user typed nothing meaningful (or the value matches the
   *   original placeholder), the node is removed via
   *   `RemoveNodeCommand`. Otherwise just exits edit mode.
   * - **Tab**: prevented from default (would move focus out of the
   *   editor) — instead inserts a literal tab character.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.commitAndClose();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelAndClose();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      // Insert a literal tab via execCommand-style — modern alternative
      // is `document.execCommand('insertText', false, '\t')`; we use
      // the same primitive for compatibility with contentEditable.
      const sel = window.getSelection?.();
      if (sel === null || sel === undefined || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode('\t'));
      range.collapse(false);
    }
  }

  /**
   * Persist the editor's current contents back to the model. Called by
   * Enter and blur. If the result is empty + the node was a fresh
   * placeholder, we remove the node entirely (user clicked but typed
   * nothing → no orphan empty text in the document).
   */
  protected commitAndClose(): void {
    const ref = this.editorEl();
    const tgt = this._target();
    if (ref === undefined || tgt === null) return;
    const next = (ref.nativeElement.textContent ?? '').trim();
    const isPlaceholder = this.editorSvc.isPlaceholder();
    // Order matters: end edit FIRST so the effect closes the editor
    // before we (possibly) remove the node — otherwise the effect's
    // null-node guard would race the RemoveNodeCommand.
    this.editorSvc.endEdit();
    if (next.length === 0 && isPlaceholder) {
      this.bus.dispatch(new RemoveNodeCommand(tgt.nodeId));
      return;
    }
    if (next === tgt.initialText) return; // no change → no command
    this.bus.dispatch(new SetPropertyCommand<TextNode, 'content'>(tgt.nodeId, 'content', next));
  }

  /**
   * Discard pending edits + close. Fresh placeholders that were never
   * customised get removed entirely. Pre-existing text stays untouched
   * (the model still has the original content; we just didn't commit
   * the editor's transient state).
   */
  protected cancelAndClose(): void {
    const tgt = this._target();
    const isPlaceholder = this.editorSvc.isPlaceholder();
    this.editorSvc.endEdit();
    if (tgt === null) return;
    // Fresh placeholder + user pressed Esc without committing → treat
    // it like an accidental click. Removes the orphan node.
    if (isPlaceholder) {
      // Check the CURRENT model text — if it still matches the seeded
      // placeholder (user never accepted via Enter), remove the node.
      const node = findNodeById(this.state.document().root, tgt.nodeId);
      if (
        node !== null &&
        node.type === 'text' &&
        (node as TextNode).content === PLACEHOLDER_TEXT
      ) {
        this.bus.dispatch(new RemoveNodeCommand(tgt.nodeId));
      }
    }
  }
}
