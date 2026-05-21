import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialogActions, MatDialogClose, MatDialogContent } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * **`<svge-dialog-shell>`** — D-044 follow-up (UI consistency sprint).
 *
 * Standardized chrome for every Material dialog in SVGEngine. Wrap
 * your dialog content with this component to inherit:
 *
 * - **Header**: optional icon + title + optional subtitle + extras
 *   slot + close (X) button. Layout, spacing, typography, ARIA all
 *   handled — consumer just supplies `icon` / `title` inputs. The
 *   header doubles as the **drag handle** (see "Drag & resize").
 * - **Body**: scrollable `<mat-dialog-content>` with normalized
 *   padding. Long content scrolls; header and footer stay pinned
 *   (matches Material spec).
 * - **Footer**: optional actions slot for buttons (typically right-
 *   aligned). When unused, no footer renders.
 * - **Resize handle**: tiny grabber at the bottom-right corner that
 *   lets the user enlarge / shrink the dialog (see "Drag & resize").
 *
 * **Why a shell component instead of per-dialog templates**: every
 * dialog in the library was hand-rolling its own header layout, close
 * button placement, and spacing — divergence accumulated (source
 * dialog had Copy + Close redundantly; workspace settings had no
 * close X; sizes varied). Centralizing here means **future dialogs
 * look consistent by construction**: consumers can't accidentally
 * skip the close button or use different icon placement. The drag +
 * resize affordances also come for free — every dialog gets them
 * without per-component wiring.
 *
 * ## Drag & resize
 *
 * Both behaviors are **on by default** and can be disabled per-dialog
 * via the `draggable` / `resizable` inputs.
 *
 * - **Drag** uses `@angular/cdk/drag-drop`. The `cdkDrag` directive is
 *   applied to the shell host with `cdkDragRootElement=".cdk-overlay-pane"`
 *   so the **entire Material overlay pane** moves (not just the inner
 *   content). The drag handle is restricted to a dedicated "handle
 *   zone" inside the header that covers the icon + titles + flexible
 *   spacer — explicitly **NOT** the header-action buttons or the close
 *   X, so users can still click them without accidentally starting a
 *   drag. Movement is bounded by `.cdk-overlay-container` so the
 *   dialog can't be lost off-screen.
 *
 * - **Resize** is a small custom grabber (no CDK primitive for resize
 *   in v21) at the bottom-right. On pointer-down it captures the
 *   pointer and writes inline `width` / `height` on the closest
 *   `.cdk-overlay-pane` ancestor. `min-width` / `min-height` keep the
 *   dialog usable; `max-width` / `max-height` are lifted from the
 *   inline style so the user can grow past the original budget if
 *   they want. The dialog's intrinsic `maxHeight: 85vh` from
 *   `svgeDialogConfig` only applies until the user resizes for the
 *   first time.
 *
 * **Why not CSS `resize: both`**: it doesn't compose with the inner
 * flexbox layout (the bottom-right of the host isn't the bottom-right
 * of the pane), the native grabber is unstyled / inconsistent across
 * OSes, and it can't tap into MatDialog's overlay sizing. A custom
 * handle gives full control and matches the design language.
 *
 * **Why drag-via-header instead of a separate handle bar**: matches
 * native window conventions (macOS, Windows, Linux) — the title bar
 * is always the drag surface. No extra chrome to design.
 *
 * **API**:
 *
 * ```html
 * <svge-dialog-shell icon="code" title="SVG source" subtitle="Live exported">
 *   <!-- Optional extra buttons in the header (e.g., Copy):           -->
 *   <ng-container svgeDialogHeaderActions>
 *     <button mat-icon-button (click)="copy()"><mat-icon>content_copy</mat-icon></button>
 *   </ng-container>
 *
 *   <!-- Body content (default slot) -->
 *   <pre>{{ source() }}</pre>
 *
 *   <!-- Optional footer actions (default = no footer) -->
 *   <ng-container svgeDialogFooterActions>
 *     <button mat-button (click)="reset()">Reset</button>
 *     <button mat-flat-button mat-dialog-close>Done</button>
 *   </ng-container>
 *
 *   <!-- Optional footer status text (e.g., size info) -->
 *   <ng-container svgeDialogFooterStatus>
 *     {{ bytes() }} bytes · {{ lines() }} lines
 *   </ng-container>
 * </svge-dialog-shell>
 * ```
 *
 * **Pairs with `svgeDialogConfig(size)`** — open the dialog with the
 * standardized MatDialogConfig and wrap its content with this shell.
 * Two pieces, one consistent look.
 *
 * **Accessibility**: header is a `<header>` landmark. Title is an
 * `<h2>` (the implicit Material default for dialogs). Close button
 * carries `aria-label="Close dialog"` and uses `mat-dialog-close`
 * directive so Esc + outside-click + button-click all dismiss
 * uniformly. The resize grabber carries `aria-label="Resize dialog"`
 * and `role="separator"`.
 */
@Component({
  selector: 'svge-dialog-shell',
  standalone: true,
  imports: [
    CdkDrag,
    CdkDragHandle,
    MatIcon,
    MatIconButton,
    MatTooltip,
    MatDialogClose,
    MatDialogContent,
    MatDialogActions,
  ],
  template: `
    <!-- The drag setup lives on the <header>: CdkDrag with
         cdkDragRootElement=".cdk-overlay-pane" makes the entire
         Material overlay pane the thing that physically moves (the
         shell's parent), while cdkDragHandle restricts drag pickup to
         the dedicated handle zone below — leaving the header buttons
         clickable. cdkDragBoundary keeps the dialog inside the
         viewport. -->
    <header
      class="dlg-header"
      role="region"
      attr.aria-label="Dialog header — {{ title() }}"
      cdkDrag
      cdkDragRootElement=".cdk-overlay-pane"
      cdkDragBoundary=".cdk-overlay-container"
      [cdkDragDisabled]="!draggable()"
    >
      <!-- "Drag zone": only the non-button area of the header initiates
           drag, so button clicks (Close X, header actions) still work
           cleanly. cdkDragHandle restricts drag to this element. -->
      <div class="dlg-handle-zone" cdkDragHandle [class.draggable]="draggable()" aria-hidden="true">
        @if (icon(); as i) {
          <mat-icon class="dlg-header-icon">{{ i }}</mat-icon>
        }
        <div class="dlg-header-titles">
          <h2 class="dlg-title" mat-dialog-title>{{ title() }}</h2>
          @if (subtitle(); as st) {
            <p class="dlg-subtitle">{{ st }}</p>
          }
        </div>
        <span class="dlg-spacer"></span>
      </div>
      <ng-content select="[svgeDialogHeaderActions]" />
      @if (showClose()) {
        <button
          mat-icon-button
          type="button"
          mat-dialog-close
          matTooltip="Close"
          aria-label="Close dialog"
          class="dlg-close-btn"
        >
          <mat-icon>close</mat-icon>
        </button>
      }
    </header>
    <mat-dialog-content class="dlg-body">
      <ng-content />
    </mat-dialog-content>
    <footer class="dlg-footer">
      <span class="dlg-footer-status">
        <ng-content select="[svgeDialogFooterStatus]" />
      </span>
      <mat-dialog-actions align="end" class="dlg-footer-actions">
        <ng-content select="[svgeDialogFooterActions]" />
      </mat-dialog-actions>
    </footer>
    @if (resizable()) {
      <!-- Resize grabber. Pointer events handled in code so we can
           grow past the configured max-width/max-height. role=separator
           + aria-orientation hint to AT that this is a draggable splitter
           rather than decorative chrome. -->
      <span
        class="dlg-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize dialog"
        title="Drag to resize"
        (pointerdown)="onResizeStart($event)"
      ></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      /* Lets the body grow to fill, header + footer stay natural-height. */
      min-height: 0;
      max-height: inherit;
      /* Tighter inner radius matches the panelClass border-radius from
         svgeDialogConfig — prevents content edges from clipping the
         dialog's rounded corners. */
      border-radius: inherit;
      overflow: hidden;
      /* Reposition reference for the absolute resize handle. */
      position: relative;
    }
    .dlg-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 0.75rem 0.75rem 1.25rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
      flex: 0 0 auto;
    }
    .dlg-handle-zone {
      /* Fill the row inside the header so the whole "empty" area is
         draggable; buttons sit outside this zone and stay clickable. */
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1 1 auto;
      min-width: 0;
      /* The cursor only signals drag when draggable input is true. */
      cursor: default;
      /* Suppress default text selection while dragging the title. */
      user-select: none;
      -webkit-user-select: none;
    }
    .dlg-handle-zone.draggable {
      cursor: move;
    }
    .dlg-header-icon {
      flex: 0 0 auto;
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--mat-sys-primary, #1976d2);
    }
    .dlg-header-titles {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }
    .dlg-title {
      margin: 0;
      padding: 0;
      font-size: 16px;
      font-weight: 500;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--mat-sys-on-surface, inherit);
    }
    .dlg-subtitle {
      margin: 0;
      font-size: 12px;
      line-height: 1.3;
      color: var(--mat-sys-on-surface-variant, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dlg-spacer {
      flex: 1 1 auto;
    }
    .dlg-close-btn {
      margin-left: 0.25rem;
    }
    .dlg-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 1rem 1.25rem;
      /* Material default adds extra top padding — normalize to match
         the consistent vertical rhythm with header. */
      margin: 0;
    }
    .dlg-footer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem 0.5rem 1.25rem;
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
      flex: 0 0 auto;
      min-height: 48px;
      box-sizing: border-box;
    }
    .dlg-footer-status {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
      font-variant-numeric: tabular-nums;
      /* Status is empty by default — collapses cleanly */
      display: inline-flex;
      align-items: center;
    }
    .dlg-footer-actions {
      flex: 0 0 auto;
      margin: 0;
      padding: 0;
      min-height: 0;
    }
    /* Resize grabber — small triangle of two diagonal lines in the
       bottom-right corner. Subtle by default, brighter on hover. Matches
       the visual weight of the footer border so it doesn't shout. */
    .dlg-resize-handle {
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      touch-action: none;
      /* Two diagonal hash lines drawn with linear gradients — purely
         decorative; no SVG/icon dependency. */
      background-image: linear-gradient(
        135deg,
        transparent 40%,
        var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.25)) 40%,
        var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.25)) 50%,
        transparent 50%,
        transparent 70%,
        var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.25)) 70%,
        var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.25)) 80%,
        transparent 80%
      );
      opacity: 0.6;
      transition: opacity 120ms ease;
      /* Keep the grabber above the footer so it stays clickable when
         actions fill the right side. */
      z-index: 1;
    }
    .dlg-resize-handle:hover,
    .dlg-resize-handle:focus-visible {
      opacity: 1;
      outline: none;
    }
    /* Visual feedback while CDK is dragging the pane (cdkDrag sits on
       the <header>, so the class lands there). */
    .dlg-header.cdk-drag-dragging,
    .dlg-header.cdk-drag-dragging .dlg-handle-zone {
      cursor: grabbing;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeDialogShell {
  /** Optional Material icon name shown left of the title. */
  readonly icon = input<string | null>(null);
  /** Required title text — single line, ellipsis when too long. */
  readonly title = input.required<string>();
  /** Optional smaller subtitle below the title. */
  readonly subtitle = input<string | null>(null);
  /**
   * Whether to render the close (X) button at top-right. Default
   * `true`. Set `false` only when the dialog is non-dismissable (rare
   * — confirm dialogs that REQUIRE explicit choice). Esc + outside
   * click are independent of this — they always dismiss unless the
   * MatDialog `disableClose` option is set.
   */
  readonly showClose = input<boolean>(true);
  /**
   * Whether the user can grab the header to reposition the dialog.
   * Default `true`. Set `false` for dialogs that anchor to a specific
   * spot (e.g., a tooltip-like surface tied to a button), where free
   * movement would break the visual connection.
   */
  readonly draggable = input<boolean>(true);
  /**
   * Whether the bottom-right grabber is shown for resizing. Default
   * `true`. Set `false` for fixed-aspect dialogs (preview panels with
   * specific aspect ratio, alerts that shouldn't grow).
   */
  readonly resizable = input<boolean>(true);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Hard floor for resize — below this the dialog stops being usable
   * (header truncates, footer wraps awkwardly). Chosen by eye from
   * the narrowest content dialog (rename prompt, ~280px tall).
   */
  private static readonly MIN_W = 320;
  private static readonly MIN_H = 220;

  /**
   * Resize gesture. Captures the pointer on the grabber, then writes
   * inline `width` / `height` on the closest `.cdk-overlay-pane`
   * ancestor on every move. Lifts the `max-width` / `max-height`
   * inline styles MatDialog sets from `svgeDialogConfig` so the user
   * can grow past the default budget.
   *
   * Why direct DOM rather than `MatDialogRef.updateSize`: `updateSize`
   * accepts only fixed CSS strings (`'600px'`), pushing every move
   * through Angular change detection. Direct style writes during a
   * gesture are smoother and keep the shell agnostic to whether
   * MatDialog is even injectable (test rigs that mount the shell
   * standalone don't inject `MatDialogRef`).
   */
  protected onResizeStart(event: PointerEvent): void {
    // Only primary-button drag — ignore right-click / middle-click.
    if (event.button !== 0) return;
    const pane = this.host.nativeElement.closest('.cdk-overlay-pane') as HTMLElement | null;
    if (!pane) return;

    const target = event.currentTarget as HTMLElement;
    const rect = pane.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = rect.width;
    const startH = rect.height;

    // Once the user starts resizing, the config-imposed max budget
    // becomes a floor for "default size", not a ceiling — clear it so
    // future moves can grow freely. Persist this for the rest of the
    // dialog's lifetime, even after the gesture ends.
    pane.style.maxWidth = 'none';
    pane.style.maxHeight = 'none';

    target.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent): void => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Cap to viewport with a small margin so the user can always
      // grab edges; never below the usability floor.
      const maxW = window.innerWidth - 16;
      const maxH = window.innerHeight - 16;
      const w = Math.max(SvgeDialogShell.MIN_W, Math.min(maxW, startW + dx));
      const h = Math.max(SvgeDialogShell.MIN_H, Math.min(maxH, startH + dy));
      pane.style.width = `${w}px`;
      pane.style.height = `${h}px`;
    };

    const onEnd = (): void => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointercancel', onEnd);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);
    // Prevent text selection / other defaults during the gesture.
    event.preventDefault();
  }
}
