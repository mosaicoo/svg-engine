import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvgeDialogShell } from '../dialog-shell';
import { SvgePluginManager } from '../plugin-manager';

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
        <svge-plugin-manager />
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
export class SvgePluginManagerDialog {}
