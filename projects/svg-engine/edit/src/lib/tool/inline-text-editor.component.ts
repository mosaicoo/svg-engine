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
  applyTransform,
  CommandBus,
  EditorStateService,
  findNodeById,
  RemoveNodeCommand,
  SetPropertyCommand,
  type TextNode,
} from 'svg-engine/core';
import { composeAncestorMatrix } from '../anchor-editor/compose-ancestor-matrix';
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
      const root = this.state.document().root;
      const node = findNodeById(root, id);
      if (node === null || node.type !== 'text') {
        // Node deleted between beginEdit and now — bail gracefully.
        this.editorSvc.endEdit();
        return;
      }
      const text = node as TextNode;
      const fontSize = text.fontSize ?? 16;
      // **Visual position** (bug fix round 2): the editor's
      // `<foreignObject>` is a sibling at the SVG root, so its `x`/`y`
      // need to be in ROOT user-coords. The text node's model `(x, y)`
      // are in node-local space (before any transforms). When the text
      // was moved via drag (gains a `transform` on its own `<g>`) or
      // lives inside a moved/rotated group, model coords ≠ visual
      // position — without composing the ancestor matrix the editor
      // appeared at the original creation spot regardless of which
      // text the user clicked.
      const ancestor = composeAncestorMatrix(root, id);
      const visual = applyTransform(ancestor, text.x, text.y);
      this._target.set({
        nodeId: id,
        initialText: text.content,
        x: visual.x,
        y: visual.y,
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
    // Enter (no Shift) commits + closes. stopPropagation prevents any
    // global Enter handler (e.g. confirm-dialog) from running.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.commitAndClose();
      return;
    }
    // Shift+Enter inserts a NEWLINE (multi-line text). Bug fix #3:
    // the browser default would insert a <br> element, but
    // Node.textContent (which we read on commit) does NOT convert
    // <br> to '\n' per spec — so the model would end up with the
    // visible-but-not-stored line break. We insert a literal '\n'
    // via execCommand('insertText') so the editor's textContent
    // contains the newline + the model captures it on commit. The
    // CSS `white-space: pre-wrap` on .inline-text-editor renders the
    // \n as a visible line break.
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      // execCommand is technically deprecated but `insertText` remains
      // universally supported in contentEditable and the modern
      // InputEvent API is more invasive for this single-character case.
      document.execCommand('insertText', false, '\n');
      return;
    }
    // Escape cancels + closes. stopPropagation is CRITICAL here —
    // bug fix #2: without it, the global Escape handler (cancel-gesture
    // / drill-up isolation) would fire AFTER our cancel, in some
    // browsers triggering a focus blur that races with cancelAndClose
    // and prevented the placeholder removal from being dispatched.
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelAndClose();
      return;
    }
    // Tab handling intentionally REMOVED (was inserting literal '\t'
    // which SVG <text> renders as a single space — bug fix #3 user
    // reported "Tab nao refletiu"). Letting Tab fall through to the
    // browser default moves focus out of the editor and triggers blur
    // -> commitAndClose, which is more useful UX (Tab = "I'm done").
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
   *
   * **Sequencing matters** (bug fix #2): we now dispatch the removal
   * BEFORE calling endEdit(). The previous order (endEdit first) had
   * a subtle race — endEdit synchronously fires the signal effect that
   * nulls `_target`, which can trigger the editor's `(blur)` handler
   * via DOM removal, which in turn called `commitAndClose` on a stale
   * target. With the new order we remove the node first (while
   * everything is still consistent), then close the editor.
   *
   * Also widened the "should remove" condition to include "live
   * editor text is empty" (user maybe typed then deleted) as well as
   * the original "model still has placeholder content".
   */
  protected cancelAndClose(): void {
    const tgt = this._target();
    const isPlaceholder = this.editorSvc.isPlaceholder();
    if (tgt !== null && isPlaceholder) {
      const ref = this.editorEl();
      const liveText = (ref?.nativeElement.textContent ?? '').trim();
      const node = findNodeById(this.state.document().root, tgt.nodeId);
      const modelText = node !== null && node.type === 'text' ? (node as TextNode).content : '';
      const stillPlaceholder = modelText === PLACEHOLDER_TEXT;
      const userTypedNothing = liveText.length === 0 || liveText === PLACEHOLDER_TEXT;
      if (stillPlaceholder || userTypedNothing) {
        this.bus.dispatch(new RemoveNodeCommand(tgt.nodeId));
      }
    }
    this.editorSvc.endEdit();
  }
}
