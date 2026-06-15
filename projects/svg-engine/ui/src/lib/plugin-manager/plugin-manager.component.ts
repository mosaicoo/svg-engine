import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { PluginLoader, type PluginManifest, PluginManagerService } from 'svg-engine/edit';

/**
 * **D-083 Fase 1 — `<svge-plugin-manager>`**. The product UI for
 * managing plugins, grouped by **type**: *Internal* (bundled with the
 * app) and *External* (third-party). Reads
 * {@link PluginManagerService.plugins} (a reactive list of
 * {@link PluginManifest}s) and exposes the agreed verbs:
 *
 * - **Enable/disable** (slide toggle per row) — disabling uninstalls and
 *   remembers the preference; enabling re-installs. The toggle is
 *   blocked (greyed) while another enabled plugin depends on this one.
 * - **Uninstall** (trash button) — **external only**; internal plugins
 *   ship in the bundle and can only be disabled.
 *
 * **Mechanism, not policy** (D-083): this component renders the manager
 * and nothing more. *Who* is allowed to see/use it is the consumer's
 * call — mount it behind whatever authorization the host app already
 * has (the library has no login/roles).
 *
 * **A11y**: `role="list"` container, `role="listitem"` rows, each toggle
 * and uninstall button carries an explicit `aria-label`; a failed/blocked
 * action surfaces in a `role="alert"` banner.
 */
@Component({
  selector: 'svge-plugin-manager',
  standalone: true,
  imports: [NgTemplateOutlet, MatButton, MatIcon, MatIconButton, MatSlideToggle],
  template: `
    <header class="pm-header">
      <span class="pm-title">Plugins</span>
      <span class="pm-count" [attr.aria-label]="total() + ' plugins'">{{ total() }}</span>
      <!--
        **D-099** — "Install from URL…" lives HERE, inside the manager, not
        as a separate menu item: the installed plugin then just appears in
        the External group below. Only shown when the host configured the
        runtime loader (trusted origins + module loader); otherwise install
        is impossible and the affordance would mislead.
      -->
      @if (canInstall()) {
        <button
          mat-button
          type="button"
          class="pm-install-btn"
          [attr.aria-expanded]="showInstall()"
          (click)="toggleInstall()"
        >
          <mat-icon>add</mat-icon>
          Install…
        </button>
      }
    </header>

    @if (showInstall()) {
      <div class="pm-install" role="group" aria-label="Install plugin from URL">
        <label class="pm-install-label" for="pm-install-url">Plugin manifest URL</label>
        <div class="pm-install-row">
          <input
            id="pm-install-url"
            class="pm-install-input"
            type="url"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://trusted-origin/plugin.json"
            [value]="installUrl()"
            [disabled]="installing()"
            (input)="onUrlInput($event)"
            (keydown.enter)="submitInstall()"
          />
          <button
            mat-button
            type="button"
            color="primary"
            [disabled]="installing() || installUrl().trim().length === 0"
            (click)="submitInstall()"
          >
            {{ installing() ? 'Installing…' : 'Install' }}
          </button>
          <button mat-button type="button" [disabled]="installing()" (click)="toggleInstall()">
            Cancel
          </button>
        </div>
        <p class="pm-install-hint">
          Only manifests served from an origin this app trusts can be installed.
        </p>
      </div>
    }

    @if (actionError(); as err) {
      <div class="pm-action-error" role="alert">
        <mat-icon aria-hidden="true">error_outline</mat-icon>
        <span class="pm-action-error-text">{{ err }}</span>
        <button
          mat-icon-button
          type="button"
          class="pm-dismiss"
          title="Dismiss"
          aria-label="Dismiss message"
          (click)="actionError.set(null)"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }

    <div class="pm-list" role="list" aria-label="Installed plugins">
      @if (internal().length) {
        <div class="pm-group-label">Internal</div>
        @for (p of internal(); track p.id) {
          <ng-container
            [ngTemplateOutlet]="pluginRow"
            [ngTemplateOutletContext]="{ $implicit: p }"
          />
        }
      }
      @if (external().length) {
        <div class="pm-group-label">External</div>
        @for (p of external(); track p.id) {
          <ng-container
            [ngTemplateOutlet]="pluginRow"
            [ngTemplateOutletContext]="{ $implicit: p }"
          />
        }
      }
      @if (total() === 0) {
        <p class="pm-empty">No plugins registered.</p>
      }
    </div>

    <ng-template #pluginRow let-p>
      <div
        class="pm-row"
        role="listitem"
        [class.pm-row-disabled]="!p.enabled"
        [class.pm-row-errored]="p.error !== null"
        [attr.aria-label]="rowAria(p)"
      >
        <mat-icon class="pm-plugin-icon" aria-hidden="true">{{ p.icon || 'extension' }}</mat-icon>

        <div class="pm-meta">
          <div class="pm-name-line">
            <span class="pm-name">{{ p.name }}</span>
            <span class="pm-version">v{{ p.version }}</span>
            <span class="pm-chip">{{ p.category }}</span>
          </div>
          @if (p.description) {
            <span class="pm-desc">{{ p.description }}</span>
          }
          @if (p.author || p.dependencies.length) {
            <div class="pm-sub">
              @if (p.author) {
                <span class="pm-author">{{ p.author }}</span>
              }
              @if (p.dependencies.length) {
                <span class="pm-deps">needs: {{ p.dependencies.join(', ') }}</span>
              }
            </div>
          }
          @if (p.error !== null) {
            <span class="pm-err-msg" role="alert">{{ p.error }}</span>
          }
        </div>

        <div class="pm-row-actions">
          <mat-slide-toggle
            [checked]="p.enabled"
            [disabled]="toggleDisabled(p)"
            [title]="toggleTitle(p)"
            [attr.aria-label]="(p.enabled ? 'Disable ' : 'Enable ') + p.name"
            (change)="onToggle(p)"
          />
          @if (canUninstall(p)) {
            <button
              mat-icon-button
              type="button"
              class="pm-uninstall"
              [title]="'Uninstall ' + p.name"
              [attr.aria-label]="'Uninstall ' + p.name"
              (click)="onUninstall(p)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #fafafa);
    }
    .pm-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-low, #f5f5f5);
    }
    .pm-title {
      font-weight: 600;
    }
    .pm-count {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #666);
      background: var(--mat-sys-surface-container-high, #eee);
      border-radius: 10px;
      padding: 1px 8px;
    }
    /* D-099 — Install affordance. Compact button in the header + an
       inline form revealed below it. */
    .pm-install-btn {
      flex: 0 0 auto;
      margin-left: 6px;
      height: 28px;
      line-height: 28px;
      padding: 0 8px;
      font-size: 12px;
      min-width: 0;
    }
    .pm-install-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 2px;
    }
    .pm-install {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-low, #f5f5f5);
    }
    .pm-install-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .pm-install-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pm-install-input {
      flex: 1 1 auto;
      min-width: 0;
      box-sizing: border-box;
      padding: 6px 8px;
      font-size: 12px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 6px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    .pm-install-input:focus {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -1px;
    }
    .pm-install-hint {
      margin: 0;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .pm-action-error {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--mat-sys-error-container, #fcd8df);
      color: var(--mat-sys-on-error-container, #5c0011);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
    }
    .pm-action-error mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
    }
    .pm-action-error-text {
      flex: 1 1 auto;
      font-size: 12px;
    }
    .pm-list {
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
      padding: 4px 0 8px;
    }
    .pm-group-label {
      padding: 8px 10px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .pm-empty {
      padding: 16px;
      color: var(--mat-sys-on-surface-variant, #777);
      text-align: center;
      font-style: italic;
      font-size: 12px;
    }
    .pm-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 7px 10px;
      border-bottom: 1px solid var(--mat-sys-surface-container-high, #eee);
    }
    .pm-row-disabled {
      opacity: 0.6;
    }
    .pm-row-errored {
      background: color-mix(in srgb, var(--mat-sys-error-container, #fcd8df) 30%, transparent);
    }
    .pm-plugin-icon {
      flex: 0 0 auto;
      margin-top: 1px;
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .pm-meta {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pm-name-line {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pm-name {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pm-version {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #888);
      font-variant-numeric: tabular-nums;
    }
    .pm-chip {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--mat-sys-secondary-container, #d8e2f0);
      color: var(--mat-sys-on-secondary-container, #15263b);
    }
    .pm-desc {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .pm-sub {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #888);
    }
    .pm-deps {
      font-style: italic;
    }
    .pm-err-msg {
      font-size: 11px;
      color: var(--mat-sys-error, #ba1a1a);
    }
    .pm-row-actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .pm-uninstall {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .pm-uninstall mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePluginManager implements OnInit {
  private readonly manager = inject(PluginManagerService);
  // **D-099** — optional: present only when the host wired the runtime
  // loader via `providePluginLoader`. Null → no "Install from URL…".
  private readonly loader = inject(PluginLoader, { optional: true });

  protected readonly internal = this.manager.internalPlugins;
  protected readonly external = this.manager.externalPlugins;
  protected readonly total = computed(() => this.manager.plugins().length);

  /** Transient banner for a failed/blocked action (cleared on next success). */
  protected readonly actionError = signal<string | null>(null);

  // ── D-099 — Install from URL ─────────────────────────────────────
  /**
   * Deep-link flag: when opened from **Tools ▸ Plugins ▸ Install Plugin…**
   * the dialog passes `true` so the install form starts open. Default
   * `false` (opened from Manage Plugins → list first).
   */
  readonly openInstall = input<boolean>(false);

  /** Whether the inline install form is showing. */
  protected readonly showInstall = signal(false);
  /** Bound to the manifest URL input. */
  protected readonly installUrl = signal('');
  /** True while a `loadFromManifestUrl` call is in flight. */
  protected readonly installing = signal(false);

  ngOnInit(): void {
    if (this.openInstall() && this.canInstall()) {
      this.showInstall.set(true);
    }
  }

  /** Install is offered only when the host configured the runtime loader. */
  protected canInstall(): boolean {
    return this.loader?.isEnabled ?? false;
  }

  protected toggleInstall(): void {
    this.showInstall.update((v) => !v);
  }

  protected onUrlInput(e: Event): void {
    this.installUrl.set((e.target as HTMLInputElement).value);
  }

  /**
   * Fetch + install the plugin described by {@link installUrl}. Delegates
   * all validation + the trusted-origin gate to
   * {@link PluginLoader.loadFromManifestUrl}; on success the plugin appears
   * in the External group and the form closes, on failure the error shows
   * in the shared {@link actionError} banner.
   */
  protected async submitInstall(): Promise<void> {
    const loader = this.loader;
    const url = this.installUrl().trim();
    if (loader === null || url.length === 0 || this.installing()) return;
    this.installing.set(true);
    this.actionError.set(null);
    const res = await loader.loadFromManifestUrl(url);
    this.installing.set(false);
    if (res.ok) {
      this.installUrl.set('');
      this.showInstall.set(false);
    } else {
      this.actionError.set(res.error ?? 'Install failed');
    }
  }

  protected onToggle(p: PluginManifest): void {
    const res = p.enabled ? this.manager.disable(p.id) : this.manager.enable(p.id);
    this.actionError.set(res.ok ? null : (res.error ?? 'Action failed'));
  }

  protected onUninstall(p: PluginManifest): void {
    const ok =
      typeof window === 'undefined'
        ? true
        : window.confirm(`Uninstall plugin "${p.name}"? This removes it from this app.`);
    if (!ok) return;
    const res = this.manager.uninstall(p.id);
    this.actionError.set(res.ok ? null : (res.error ?? 'Uninstall failed'));
  }

  protected canUninstall(p: PluginManifest): boolean {
    return p.source === 'external';
  }

  /** A still-enabled plugin can't be turned off while others depend on it. */
  protected toggleDisabled(p: PluginManifest): boolean {
    return p.enabled && this.manager.enabledDependentsOf(p.id).length > 0;
  }

  protected toggleTitle(p: PluginManifest): string {
    if (this.toggleDisabled(p)) {
      return `In use by: ${this.manager.enabledDependentsOf(p.id).join(', ')}`;
    }
    return p.enabled ? 'Disable plugin' : 'Enable plugin';
  }

  protected rowAria(p: PluginManifest): string {
    const state = p.enabled ? (p.installed ? 'enabled' : 'enabled, failed to load') : 'disabled';
    return `${p.name}, version ${p.version}, ${p.source}, ${state}`;
  }
}
