import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import {
  CommandBus,
  CreatePageCommand,
  DeletePageCommand,
  EditorStateService,
  getPageName,
  getPageViewBox,
  MoveNodeInTreeCommand,
  type NodeId,
  RenamePageCommand,
} from 'svg-engine/core';
import { ActivePageService, PagesService } from 'svg-engine/edit';

/**
 * **D-079 / PAGES-C** — `<svge-pages-panel>`: horizontal tab bar at
 * the top of the canvas listing all top-level pages, with active
 * highlighting + add (+) + delete (X) + rename inline (dblclick).
 *
 * **Why a tab bar (and not just another right-rail panel)**:
 * Illustrator's Artboards panel, Figma's Frame tabs, and browsers
 * all put document-level navigators ABOVE the canvas — the tab is
 * an "address bar" for the artboard/page/frame the user is
 * currently editing. Right-rail panels are for properties; the
 * horizontal strip is for navigation.
 *
 * **Auto-hides when zero pages**: legacy single-root documents (no
 * page-flagged groups) don't see the strip at all — keeps the
 * canvas clean for users who never opt into multi-page workflows.
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/ui` because it
 * uses `MatIcon`. The page CORE (model + commands + services) lives
 * in `svg-engine/core` + `svg-engine/edit` — this component is the
 * visual shell on top.
 *
 * **Rename gesture**: dblclick on the tab label swaps into an inline
 * `<input>`; Enter commits via `RenamePageCommand`, Escape cancels.
 * Same pattern the Layers Panel uses (D-066-rename).
 *
 * **Reorder (drag-drop)** — Audit #10 ✅: each tab is `draggable`;
 * dragging it horizontally over another tab shows a vertical drop
 * indicator (left/right edge of the target) and on drop dispatches
 * one `MoveNodeInTreeCommand(pageId, doc.root.id, newIndex)` — same
 * atomic-undo pattern the Layers Panel uses (Bloco 4b-DnD). HTML5
 * native drag API (no CDK dep) so the headless boundary stays clean.
 *
 * **Gating**: drag is disabled on the tab being renamed (rename owns
 * the gesture) and on documents with a single page (no reorder
 * possible). The `.add-btn` and `.close-btn` are not `draggable`.
 *
 * **Index translation**: `pages()` is a `filter(isPage)` view of
 * `doc.root.children` — visual page indices ≠ raw children indices
 * when non-page siblings (e.g., `<defs>` groups) are present. We
 * always resolve the target via `children.findIndex(c => c.id === id)`
 * so the command receives the FINAL post-move children index.
 */
@Component({
  selector: 'svge-pages-panel',
  standalone: true,
  imports: [MatIcon],
  template: `
    @if (pages.hasPages() || alwaysShow()) {
      <!--
        **PAGES-REFACTOR follow-up #8 — same guard as
        SvgeIsolationBreadcrumb's <nav class="bar">.** When shell-pro
        mounts this panel as a canvas overlay (.pages-overlay inside
        .canvas-cell), pointerdown / click events from the tab
        buttons bubble up to the [svgeShellInteractions] directive on
        canvas-cell. That directive treats any pointerdown whose
        hit-test returns null (HTML buttons aren't SVG nodes) as
        "click on empty canvas" and, when isolation is active,
        dispatches isolation.exit() — which would race with our
        click handlers and break tab switching. Stopping both events
        at the bar element guarantees the panel's own (click)
        handlers run alone, regardless of which shell hosts the
        component.
      -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events,@angular-eslint/template/interactive-supports-focus -- the (click) here is a propagation guard, not an interactive affordance; real interaction lives on the <button>s inside, which are focusable + keyboard-accessible by default. -->
      <div
        class="pages-bar"
        role="tablist"
        aria-label="Pages"
        (pointerdown)="$event.stopPropagation()"
        (click)="$event.stopPropagation()"
      >
        @for (page of pages.pages(); track page.id) {
          <!--
            **AUDIT FIX B1** — was a button.page-tab with a NESTED
            button.close-btn AND an input inside. HTML5 forbids
            interactive descendants inside button; browsers re-parent
            the inner button, which broke the close (x) hit target
            and the rename input (the close button could end up
            outside its visual area). Replaced with a div role=tab
            tabindex=0 so the inner button + input are legal
            children. Keyboard parity preserved: tabindex makes it
            Tab-focusable, and Enter/Space activate the tab.
          -->
          <div
            class="page-tab"
            role="tab"
            tabindex="0"
            [class.active]="page.id === active.activePageId()"
            [class.dragging]="dragSourceId() === page.id"
            [class.drop-before]="dropTargetId() === page.id && dropPosition() === 'before'"
            [class.drop-after]="dropTargetId() === page.id && dropPosition() === 'after'"
            [attr.aria-selected]="page.id === active.activePageId()"
            [attr.draggable]="canDrag(page.id)"
            (click)="setActive(page.id)"
            (dblclick)="beginRename(page.id, $event)"
            (keydown.enter)="setActive(page.id); $event.preventDefault()"
            (keydown.space)="setActive(page.id); $event.preventDefault()"
            (dragstart)="onDragStart($event, page.id)"
            (dragover)="onDragOver($event, page.id)"
            (dragleave)="onDragLeave($event, page.id)"
            (drop)="onDrop($event, page.id)"
            (dragend)="onDragEnd()"
            [title]="tooltipFor(page.id)"
          >
            <mat-icon class="page-icon" aria-hidden="true">crop_landscape</mat-icon>
            @if (renamingId() === page.id) {
              <input
                #renameInput
                class="rename-input"
                type="text"
                [value]="renamingDraft()"
                (input)="onRenameInput($event)"
                (keydown.enter)="commitRename()"
                (keydown.escape)="cancelRename()"
                (blur)="commitRename()"
                (click)="$event.stopPropagation()"
                (dblclick)="$event.stopPropagation()"
                aria-label="Page name"
              />
            } @else {
              <span class="page-name">{{ nameOf(page.id) }}</span>
            }
            @if (pages.count() > 1) {
              <button
                type="button"
                class="close-btn"
                (click)="deletePage(page.id, $event)"
                aria-label="Delete page"
                title="Delete page"
              >
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>
        }
        <button
          type="button"
          class="add-btn"
          [class.add-btn--wide]="!pages.hasPages()"
          (click)="addPage()"
          aria-label="Add page"
          title="Add page (Page N)"
        >
          <mat-icon>add</mat-icon>
          @if (!pages.hasPages()) {
            <span class="add-btn-label">Add Page</span>
          }
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      /* DBLCLICK-FIX (see same fix on tool-options / panel-group): the
         tab bar is chrome — block native text selection so dblclick
         on a tab label opens our rename input instead of triggering
         the browser's Selection Action Menu (Translate / Copy popup). */
      user-select: none;
      -webkit-user-select: none;
      /* **AUDIT FIX U3 (v2 — click bug)** — Stacking context guard.
         When the consumer mounts this as an absolute-positioned
         overlay (shell-pro's .pages-overlay), the host needs its own
         stacking context so the inner .pages-bar's effective
         pointer-events / z-index handling doesn't get clobbered by
         sibling overlays (e.g., the renderer's <svg> inside
         workspace-background). position: relative + isolation: isolate
         is the canonical recipe — costs nothing when the host isn't
         absolute-positioned (CSS no-op for default static flow). */
      position: relative;
      isolation: isolate;
    }
    /* Background + border live on .pages-bar (not :host) so the
       component renders nothing visible when its inner template is
       gated out (legacy docs with zero pages). Saves a stray
       horizontal line across the shell for users who never opt
       into pages. */
    /* **AUDIT FIX U3 (v2 — click bug)** — was display: flex
       (full-width strip); then briefly inline-flex (which made the
       Add button unresponsive in shell-pro overlay mount — the
       inline outer-display interacted badly with the absolute-
       positioned host and pointer-events: none / auto cascade).
       Now uses display: flex + width: fit-content to achieve the
       same content-width sizing while staying block-level — no
       inline weirdness, hit-testing on the inner buttons works
       reliably regardless of how the consumer positions the host.
       max-width: 100% caps the bar so 40+ tabs don't blow past the
       canvas edge. Explicit pointer-events: auto on the bar AND on
       the buttons inside guarantees clicks land even if the
       consumer's .pages-overlay > * cascade rule is overridden by
       a later sibling rule. */
    .pages-bar {
      display: flex;
      width: fit-content;
      align-items: stretch;
      gap: 2px;
      padding: 2px 0.5rem;
      min-height: 30px;
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: thin;
      font-size: 12px;
      background: var(--mat-sys-surface-container-low, transparent);
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 4px 4px 0 0;
      pointer-events: auto;
    }
    .pages-bar .page-tab,
    .pages-bar .add-btn,
    .pages-bar .close-btn,
    .pages-bar .rename-input {
      pointer-events: auto;
    }
    .page-tab {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 6px 0 8px;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      border-radius: 4px 4px 0 0;
      opacity: 0.7;
      transition:
        opacity 120ms ease,
        background 120ms ease,
        border-color 120ms ease;
      white-space: nowrap;
      max-width: 200px;
      min-width: 60px;
    }
    .page-tab:hover {
      opacity: 0.95;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .page-tab.active {
      opacity: 1;
      background: var(--mat-sys-surface, transparent);
      border-bottom-color: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-primary, #1976d2);
    }
    .page-tab:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -2px;
    }
    /* Audit #10 — drag-drop reorder visual feedback.
       Vertical indicators (left/right edges) since the tab bar is
       horizontal — mirrors the Layers Panel's drop-before / drop-after
       pattern (which uses horizontal lines for a vertical list). */
    .page-tab.dragging {
      opacity: 0.4;
    }
    .page-tab.drop-before {
      box-shadow: inset 2px 0 0 var(--mat-sys-primary, #1976d2);
    }
    .page-tab.drop-after {
      box-shadow: inset -2px 0 0 var(--mat-sys-primary, #1976d2);
    }
    .page-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      opacity: 0.7;
    }
    .page-name {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rename-input {
      flex: 1 1 auto;
      min-width: 50px;
      max-width: 160px;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
      background: var(--mat-sys-surface, #fff);
      color: inherit;
      font: inherit;
      padding: 0 4px;
      border-radius: 2px;
      outline: none;
    }
    .rename-input:focus {
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .close-btn,
    .add-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      padding: 0;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      opacity: 0.55;
      transition:
        opacity 120ms ease,
        background 120ms ease;
    }
    .close-btn:hover {
      opacity: 1;
      background: var(--mat-sys-error-container, rgba(255, 0, 0, 0.1));
    }
    .add-btn {
      align-self: center;
      margin-left: 4px;
      width: 22px;
      height: 22px;
      opacity: 0.7;
    }
    /* When there are zero pages, expand the button so users can see
       "Add Page" affordance and discover the workflow. Otherwise
       it stays compact (the tabs already convey context). */
    .add-btn--wide {
      width: auto;
      padding: 0 10px 0 6px;
      gap: 4px;
      border-radius: 4px;
      opacity: 1;
      color: var(--mat-sys-primary, #1976d2);
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .add-btn-label {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .add-btn:hover {
      opacity: 1;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.06));
      color: var(--mat-sys-primary, #1976d2);
    }
    .close-btn mat-icon,
    .add-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePagesPanel {
  protected readonly pages = inject(PagesService);
  protected readonly active = inject(ActivePageService);
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);

  /**
   * When `true`, the bar shows even on docs with zero pages — adds
   * a single "+ Add page" button so the user can start a multi-
   * page workflow. Default `false` (auto-hides on single-root docs
   * for back-compat with consumers that don't want the chrome).
   *
   * **PAGES-FIX**: `<svge-shell-pro>` opts in to `true` so the
   * Add Page (+) button is always reachable — without it, users
   * with a fresh single-root doc had no UI path to create the
   * first page.
   */
  readonly alwaysShow = input<boolean>(false);

  /** Id of the page currently being renamed, or `null`. */
  protected readonly renamingId = signal<NodeId | null>(null);
  /** Draft text for the active rename input. */
  protected readonly renamingDraft = signal<string>('');

  /**
   * Audit #10 — drag-drop reorder state.
   *
   * `dragSourceId`: id of the tab currently being dragged (set on
   * `dragstart`, cleared on `dragend` / `drop`). Drives the
   * `.dragging` opacity class on the source tab.
   *
   * `dropTargetId` + `dropPosition`: hovered drop position (set on
   * `dragover`, cleared on `dragleave` / `dragend`). Drives the
   * `.drop-before` / `.drop-after` indicator classes on the target
   * tab. `null` when no valid target is hovered.
   */
  protected readonly dragSourceId = signal<NodeId | null>(null);
  protected readonly dropTargetId = signal<NodeId | null>(null);
  protected readonly dropPosition = signal<'before' | 'after'>('after');

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    // Auto-focus the rename input when it appears.
    effect(() => {
      if (this.renamingId() === null) return;
      const ref = this.renameInput();
      if (ref !== undefined) {
        const el = ref.nativeElement;
        // Defer one tick so the DOM has actually attached.
        queueMicrotask(() => {
          el.focus();
          el.select();
        });
      }
    });
  }

  protected nameOf(pageId: NodeId): string {
    return this.pages.nameOf(pageId);
  }

  protected tooltipFor(pageId: NodeId): string {
    const p = this.pages.byId(pageId);
    if (p === null) return '';
    const vb = getPageViewBox(p);
    const dim = vb !== null ? `${Math.round(vb.width)}×${Math.round(vb.height)}` : '?';
    return `${getPageName(p)} — ${dim} (dblclick to rename)`;
  }

  protected setActive(pageId: NodeId): void {
    // Ignore clicks while renaming this exact tab — the input owns the gesture.
    if (this.renamingId() === pageId) return;
    // **AUDIT FIX B3** — if the user is renaming another tab and
    // clicks a different tab, commit the in-flight rename FIRST so
    // the keystrokes already typed land on the right page. Without
    // this, the `(blur)` on the rename input would fire after the
    // setActive, dispatching the rename against the now-previous
    // active page id (still correct id-wise, but the order felt
    // wrong because the page switched mid-keystroke). Committing
    // proactively here keeps the sequence intuitive.
    if (this.renamingId() !== null) {
      this.commitRename();
    }
    this.active.setActive(pageId);
  }

  protected addPage(): void {
    // **AUDIT FIX I4** — new page inherits the ACTIVE page's viewBox
    // (Illustrator / Inkscape convention: "new artboard same size as
    // the current one"). Falls back to the document's viewBox if no
    // active page yet (legacy single-root flow) and finally to the
    // command's A4 default if the document has no viewBox set.
    const activePage = this.active.activePage();
    const activeVB = activePage !== null ? getPageViewBox(activePage) : null;
    const viewBox = activeVB ?? this.state.document().viewBox;
    const cmd = new CreatePageCommand(viewBox);
    const result = this.bus.dispatch(cmd);
    if (result.ok) {
      const id = cmd.getCreatedPageId();
      if (id !== null) this.active.setActive(id);
    }
  }

  protected deletePage(pageId: NodeId, event: MouseEvent): void {
    event.stopPropagation();
    // Refuse deleting the last page (UI also hides the X for the
    // single-page case, but defense in depth).
    if (this.pages.count() <= 1) return;
    this.bus.dispatch(new DeletePageCommand(pageId));
    // ActivePageService's effect auto-recovers by picking the first
    // remaining page; nothing else to do here.
  }

  protected beginRename(pageId: NodeId, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const current = this.pages.nameOf(pageId);
    this.renamingDraft.set(current);
    this.renamingId.set(pageId);
  }

  protected onRenameInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (target !== null) this.renamingDraft.set(target.value);
  }

  protected commitRename(): void {
    const id = this.renamingId();
    if (id === null) return;
    const name = this.renamingDraft().trim();
    this.renamingId.set(null);
    if (name.length === 0) return; // empty → keep current name
    this.bus.dispatch(new RenamePageCommand(id, name));
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renamingDraft.set('');
  }

  // ── Audit #10 — drag-drop reorder ──────────────────────────────

  /**
   * `[attr.draggable]` factory. Returns `'true'` for tabs that may be
   * dragged: NOT the one being renamed, NOT the only page (no reorder
   * possible with a single tab).
   */
  protected canDrag(pageId: NodeId): 'true' | 'false' {
    if (this.renamingId() === pageId) return 'false';
    if (this.pages.count() <= 1) return 'false';
    return 'true';
  }

  protected onDragStart(event: DragEvent, pageId: NodeId): void {
    // Guard: rename owns its tab's gestures. Renaming another tab is OK
    // (user can drag a different one while typing) — but we proactively
    // commit the in-flight rename so the dragged tab and the typed name
    // both land on the right page.
    if (this.renamingId() === pageId) {
      event.preventDefault();
      return;
    }
    if (this.renamingId() !== null) {
      this.commitRename();
    }
    this.dragSourceId.set(pageId);
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without setData on dataTransfer.
      // The actual id we use lives in the signal — this is just to
      // satisfy the browser's "is this a real drag?" check.
      event.dataTransfer.setData('text/plain', pageId);
    }
  }

  protected onDragOver(event: DragEvent, pageId: NodeId): void {
    const source = this.dragSourceId();
    if (source === null) return;
    // Must preventDefault on dragover to receive a drop event. Even on
    // the source tab itself we preventDefault so the cursor stays
    // "move" rather than reverting to the "no-drop" icon — but we DON'T
    // set drop-target classes on the source.
    event.preventDefault();
    if (source === pageId) {
      this.dropTargetId.set(null);
      return;
    }
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    // Horizontal tab bar: pointer X relative to the tab's mid-X decides
    // whether the drop indicator appears on the left ('before') or
    // right ('after') edge of the hovered tab.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const position: 'before' | 'after' = event.clientX < midX ? 'before' : 'after';
    this.dropTargetId.set(pageId);
    this.dropPosition.set(position);
  }

  protected onDragLeave(_event: DragEvent, pageId: NodeId): void {
    // Only clear if we're leaving the currently-targeted tab. Without
    // this guard, leaving tab A to enter tab B would clear the state
    // mid-transition and create a flicker.
    if (this.dropTargetId() === pageId) {
      this.dropTargetId.set(null);
    }
  }

  protected onDrop(event: DragEvent, targetId: NodeId): void {
    event.preventDefault();
    const sourceId = this.dragSourceId();
    const position = this.dropPosition();
    // Always clear visual state, then act.
    this.clearDragState();
    if (sourceId === null || sourceId === targetId) return;

    const doc = this.state.document();
    const children = doc.root.children;
    const sourceIdx = children.findIndex((c) => c.id === sourceId);
    const targetIdx = children.findIndex((c) => c.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    // Compute final-target index for MoveNodeInTreeCommand.
    // The command's `newIndex` is the position the node should END UP
    // at in the POST-move children array (see core/commands/move-node-in-tree.command.ts:92-103).
    // - 'before' target: new position = targetIdx
    // - 'after' target:  new position = targetIdx + 1
    // - When source is BEFORE target in the original array, removing
    //   it shifts target left by 1 — so we adjust newIndex down by 1.
    let newIndex = position === 'before' ? targetIdx : targetIdx + 1;
    if (sourceIdx < targetIdx) newIndex -= 1;
    if (newIndex === sourceIdx) return; // no-op

    this.bus.dispatch(new MoveNodeInTreeCommand(sourceId, doc.root.id, newIndex));
  }

  protected onDragEnd(): void {
    // Fires whether the drop succeeded or was cancelled (Esc, outside).
    this.clearDragState();
  }

  private clearDragState(): void {
    this.dragSourceId.set(null);
    this.dropTargetId.set(null);
  }
}
