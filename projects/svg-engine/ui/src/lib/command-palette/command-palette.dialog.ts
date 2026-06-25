import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  makeDisabledResolver,
  type MenuContribution,
  MenuContributionRegistry,
  runContribution,
} from '@mosaicoo/svg-engine/edit';
import {
  filterPaletteCommands,
  humanizeMenuSlot,
  type PaletteCommandLike,
} from './command-palette.filter';

/** One runnable command surfaced in the palette — a registry entry + resolved state. */
interface PaletteEntry extends PaletteCommandLike {
  readonly id: string;
  readonly icon?: string;
  readonly shortcut?: string;
  /** The originating contribution — executed via `runContribution`. */
  readonly contribution: MenuContribution;
  /** Scope-aware disabled signal (memoized via {@link makeDisabledResolver}). */
  readonly disabled: Signal<boolean>;
}

/**
 * **`<svge-command-palette-dialog>`** — Tools ▸ Command Palette (Ctrl+Shift+P).
 *
 * A keyboard-first "run any command" overlay (VS Code / Figma "Quick
 * actions" / Linear style): a floating search input over a live,
 * fuzzy-filtered list of **every registered menu/toolbar command**, run
 * with Enter or a click. Distinct from the SVG Studio NLU palette
 * (Ctrl+K, natural language) — this one searches command **names** over
 * the `MenuContributionRegistry`, with **no NLU/ML dependency**.
 *
 * **Source of truth**: `MenuContributionRegistry.contributions()` — the
 * same entries the menu bar / toolbar render. So the palette covers
 * everything any plugin contributes, automatically, with zero per-command
 * wiring. Excluded: dividers, submenu *parents* (their `run` is a no-op
 * trigger), `comingSoon` roadmap placeholders, and `visible:false` items.
 *
 * **Scope (multi-editor, D-042/D-043)**: opened with
 * `MatDialogConfig.injector = <editor scope>`, so this component's
 * `inject(Injector)` resolves the route-scoped services. Each command's
 * `disabled` factory and its `run()` receive that injector → they act on
 * the focused editor, never the empty root.
 *
 * **Keyboard**: ↑/↓ (wrap-around) move the highlight, Home/End jump,
 * Enter runs the highlighted command, Esc closes (Material default —
 * we deliberately don't intercept it). Disabled commands are shown but
 * not executable.
 */
@Component({
  selector: 'svge-command-palette-dialog',
  standalone: true,
  imports: [MatIcon, MatIconButton, MatTooltip],
  template: `
    <div class="cp" role="dialog" aria-label="Command palette">
      <div class="cp-input-row">
        <mat-icon class="cp-search-icon" aria-hidden="true">search</mat-icon>
        <input
          #queryInput
          class="cp-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          [value]="query()"
          (input)="onQuery($event)"
          (keydown)="onKey($event)"
          placeholder="Type a command…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls="cp-listbox"
        />
        @if (query() !== '') {
          <button
            mat-icon-button
            type="button"
            class="cp-clear"
            matTooltip="Clear"
            aria-label="Clear search"
            (click)="clear()"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>

      <div #list id="cp-listbox" class="cp-list" role="listbox" aria-label="Commands">
        @if (results().length === 0) {
          <p class="cp-empty">No commands match “{{ query() }}”.</p>
        } @else {
          @for (r of results(); track r.id; let i = $index) {
            <button
              type="button"
              class="cp-item"
              role="option"
              [class.active]="i === activeIndex()"
              [class.is-disabled]="r.disabled()"
              [attr.data-index]="i"
              [attr.aria-selected]="i === activeIndex()"
              [attr.aria-disabled]="r.disabled()"
              [title]="r.id"
              (mouseenter)="activeIndex.set(i)"
              (click)="execute(r)"
            >
              <mat-icon class="cp-item-icon" aria-hidden="true">{{
                r.icon || 'chevron_right'
              }}</mat-icon>
              <span class="cp-item-label">{{ r.label }}</span>
              <span class="cp-item-group">{{ r.group }}</span>
              @if (r.shortcut) {
                <kbd class="cp-item-kbd">{{ r.shortcut }}</kbd>
              }
            </button>
          }
        }
      </div>

      <div class="cp-footer">
        <span class="cp-hint">
          <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> run · <kbd>Esc</kbd> close
        </span>
        <span class="cp-count"
          >{{ results().length }} command{{ results().length === 1 ? '' : 's' }}</span
        >
      </div>
    </div>
  `,
  styles: `
    .cp {
      display: flex;
      flex-direction: column;
      max-height: inherit;
    }
    .cp-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
    }
    .cp-search-icon {
      flex: 0 0 auto;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .cp-input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      font-size: 16px;
      color: var(--mat-sys-on-surface, inherit);
      padding: 4px 0;
    }
    .cp-input::placeholder {
      color: var(--mat-sys-on-surface-variant, #aaa);
    }
    .cp-clear {
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      --mdc-icon-button-state-layer-size: 32px;
      --mat-icon-button-touch-target-display: none;
    }
    .cp-clear mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }
    .cp-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 4px;
    }
    .cp-empty {
      margin: 0;
      padding: 24px 12px;
      text-align: center;
      font-size: 13px;
      font-style: italic;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .cp-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 7px 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--mat-sys-on-surface, inherit);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }
    .cp-item.active {
      background: var(--mat-sys-surface-container-high, rgba(25, 118, 210, 0.1));
    }
    .cp-item.is-disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .cp-item-icon {
      flex: 0 0 auto;
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .cp-item-label {
      flex: 1 1 auto;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cp-item-group {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #999);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .cp-item-kbd {
      flex: 0 0 auto;
      font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      background: var(--mat-sys-surface-container, #f3f3f3);
      color: var(--mat-sys-on-surface-variant, #666);
      white-space: nowrap;
    }
    .cp-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 12px;
      border-top: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .cp-hint kbd {
      font-family: monospace;
      font-size: 10px;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      padding: 1px 4px;
      border-radius: 3px;
      margin: 0 1px;
    }
    .cp-count {
      flex: 0 0 auto;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeCommandPaletteDialog {
  private readonly registry = inject(MenuContributionRegistry);
  private readonly injector = inject(Injector);
  private readonly ref = inject<MatDialogRef<SvgeCommandPaletteDialog, void>>(MatDialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Memoized `disabled` resolver bound to THIS dialog's (scoped) injector. */
  private readonly resolveDisabled = makeDisabledResolver(this.injector);

  protected readonly query = signal<string>('');
  protected readonly activeIndex = signal<number>(0);

  /**
   * Every runnable command from the registry, mapped to a palette entry.
   * Excludes dividers, `comingSoon` placeholders, submenu *parents*
   * (their `run` is a no-op trigger — only their children are runnable),
   * and `visible:false` items.
   */
  private readonly allEntries = computed<readonly PaletteEntry[]>(() => {
    const contributions = this.registry.contributions();
    const parentIds = new Set<string>();
    for (const c of contributions) {
      if (typeof c.parentId === 'string' && c.parentId.length > 0) parentIds.add(c.parentId);
    }
    const out: PaletteEntry[] = [];
    for (const c of contributions) {
      if (c.divider === true) continue;
      if (c.comingSoon === true) continue;
      if (parentIds.has(c.id)) continue;
      if (typeof c.label !== 'string' || c.label.length === 0) continue;
      if (c.visible != null && c.visible() === false) continue;
      const keywords = [c.tooltip ?? '', c.shortcut ?? ''].join(' ').trim();
      out.push({
        id: c.id,
        label: c.label,
        group: humanizeMenuSlot(c.slot),
        keywords: keywords.length > 0 ? keywords : undefined,
        icon: c.icon,
        shortcut: c.shortcut,
        contribution: c,
        disabled: this.resolveDisabled(c),
      });
    }
    return out;
  });

  /** The filtered + ranked entries for the current query. */
  protected readonly results = computed<readonly PaletteEntry[]>(() =>
    filterPaletteCommands([...this.allEntries()], this.query()),
  );

  constructor() {
    // Keep the highlighted row scrolled into view as the user navigates
    // or the result set changes. Read-only (no signal writes) → no loop.
    effect(() => {
      const i = this.activeIndex();
      this.results(); // re-run when the list changes
      queueMicrotask(() => {
        const el = this.host.nativeElement.querySelector<HTMLElement>(
          `.cp-item[data-index="${i}"]`,
        );
        el?.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  protected onQuery(ev: Event): void {
    this.query.set((ev.target as HTMLInputElement).value);
    // New query → start from the top (the best match).
    this.activeIndex.set(0);
  }

  protected clear(): void {
    this.query.set('');
    this.activeIndex.set(0);
  }

  /** Keyboard navigation. Escape intentionally left to Material (closes the dialog). */
  protected onKey(ev: KeyboardEvent): void {
    const n = this.results().length;
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        if (n > 0) this.activeIndex.set((this.activeIndex() + 1) % n);
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (n > 0) this.activeIndex.set((this.activeIndex() - 1 + n) % n);
        break;
      case 'Home':
        ev.preventDefault();
        this.activeIndex.set(0);
        break;
      case 'End':
        ev.preventDefault();
        if (n > 0) this.activeIndex.set(n - 1);
        break;
      case 'Enter':
        ev.preventDefault();
        this.execute(this.results()[this.activeIndex()]);
        break;
      default:
        break;
    }
  }

  /**
   * Run a command: ignore disabled ones, close the palette, then dispatch
   * via `runContribution` with the scoped injector. Close-before-run so
   * the overlay is gone if the command opens its own dialog. `run()` must
   * not throw (interface contract) but we guard anyway.
   */
  protected execute(entry: PaletteEntry | undefined): void {
    if (entry === undefined || entry.disabled()) return;
    this.ref.close();
    try {
      runContribution(entry.contribution, this.injector);
    } catch (err) {
      console.error('[Command Palette] command failed:', err);
    }
  }
}
