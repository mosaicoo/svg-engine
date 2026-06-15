import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SvgeDialogShell } from '../dialog-shell';
import { SvgePluginManager } from '../plugin-manager';

/** Data injected by {@link SvgePluginManagerDialogService.open}. */
export interface SvgePluginManagerDialogData {
  /** **D-099** — start with the "Install from URL…" form open (deep-link). */
  readonly openInstall?: boolean;
}

/**
 * **D-083 Fase 1 — `<svge-plugin-manager-dialog>`**. Material dialog
 * wrapper that hosts the headless-friendly `<svge-plugin-manager>` panel
 * inside the shared `<svge-dialog-shell>` chrome (icon + title + Close X
 * + drag/resize + focus trap), so it can be opened from a menu item the
 * same way as View Source / Workspace Settings / Find & Replace.
 *
 * Pure composition — no logic. The panel reads `PluginManagerService`
 * (root) on its own. Opened via {@link SvgePluginManagerDialogService};
 * sized `'md'` there.
 */
@Component({
  selector: 'svge-plugin-manager-dialog',
  standalone: true,
  imports: [SvgeDialogShell, SvgePluginManager],
  template: `
    <svge-dialog-shell
      icon="extension"
      title="Plugins"
      subtitle="Enable, disable or uninstall this editor's plugins"
    >
      <div class="pmd-body">
        <svge-plugin-manager [openInstall]="openInstall" />
      </div>
    </svge-dialog-shell>
  `,
  styles: `
    /* The inner <svge-plugin-manager> is \`height: 100%\` and scrolls its
       list internally, so it needs a DEFINITE parent height. We get that
       by flex-growing to fill the shell's \`.dlg-body\` (itself a flex
       column that fills the overlay pane) instead of pinning a fixed
       height — that's what lets the panel follow the dialog when the user
       resizes it (no dead space above the footer). The initial open
       height comes from the dialog config (\`height\` in the service), not
       from here. \`min-height\` is just a usability floor for very small
       resizes. */
    .pmd-body {
      display: flex;
      flex: 1 1 auto;
      min-height: 200px;
    }
    .pmd-body > svge-plugin-manager {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePluginManagerDialog {
  // **D-099** — forwarded to the panel so a deep-link (Tools ▸ Plugins ▸
  // Install Plugin…) can open straight into the install form. Optional:
  // when opened without data (e.g. Manage Plugins), defaults to false.
  private readonly data = inject<SvgePluginManagerDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });
  protected readonly openInstall = this.data?.openInstall ?? false;
}
