import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
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
 * **Reorder (drag-drop)**: deferred to a follow-up. The model
 * already supports it (children array order = z-order), but the
 * drag UX needs CDK DnD wire-up similar to layers-panel; first ship
 * focuses on tab navigation + CRUD.
 */
@Component({
  selector: 'svge-pages-panel',
  standalone: true,
  imports: [MatIcon],
  template: `
    @if (pages.hasPages() || alwaysShow()) {
      <div class="pages-bar" role="tablist" aria-label="Pages">
        @for (page of pages.pages(); track page.id) {
          <button
            type="button"
            class="page-tab"
            role="tab"
            [class.active]="page.id === active.activePageId()"
            [attr.aria-selected]="page.id === active.activePageId()"
            (click)="setActive(page.id)"
            (dblclick)="beginRename(page.id, $event)"
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
          </button>
        }
        <button
          type="button"
          class="add-btn"
          (click)="addPage()"
          aria-label="Add page"
          title="Add page (Page N)"
        >
          <mat-icon>add</mat-icon>
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
    }
    /* Background + border live on .pages-bar (not :host) so the
       component renders nothing visible when its inner template is
       gated out (legacy docs with zero pages). Saves a stray
       horizontal line across the shell for users who never opt
       into pages. */
    .pages-bar {
      display: flex;
      align-items: stretch;
      gap: 2px;
      padding: 2px 0.5rem;
      min-height: 30px;
      overflow-x: auto;
      scrollbar-width: thin;
      font-size: 12px;
      background: var(--mat-sys-surface-container-low, transparent);
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
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

  /** When `true`, the bar shows even on docs with zero pages — adds
   *  a single "+ Add page" button so the user can start a multi-
   *  page workflow. Default `false` (auto-hides on single-root docs
   *  for back-compat). */
  protected readonly alwaysShow = signal<boolean>(false);

  /** Id of the page currently being renamed, or `null`. */
  protected readonly renamingId = signal<NodeId | null>(null);
  /** Draft text for the active rename input. */
  protected readonly renamingDraft = signal<string>('');

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
    this.active.setActive(pageId);
  }

  protected addPage(): void {
    // New page inherits the CURRENT document's viewBox so the user's
    // mental model of "page = canvas size" stays intact. Falls back
    // to the command's A4 default when the document has no viewBox
    // (shouldn't happen in practice but defensive).
    const docVB = this.state.document().viewBox;
    const cmd = new CreatePageCommand(docVB);
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
}
