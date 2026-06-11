import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { type PluginManifest, PluginManagerService } from 'svg-engine/edit';

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
  imports: [NgTemplateOutlet, MatIcon, MatIconButton, MatSlideToggle],
  template: `
    <header class="pm-header">
      <span class="pm-title">Plugins</span>
      <span class="pm-count" [attr.aria-label]="total() + ' plugins'">{{ total() }}</span>
    </header>

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
export class SvgePluginManager {
  private readonly manager = inject(PluginManagerService);

  protected readonly internal = this.manager.internalPlugins;
  protected readonly external = this.manager.externalPlugins;
  protected readonly total = computed(() => this.manager.plugins().length);

  /** Transient banner for a failed/blocked action (cleared on next success). */
  protected readonly actionError = signal<string | null>(null);

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
