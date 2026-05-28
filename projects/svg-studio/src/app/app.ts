import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * **SVG Studio root** — single-route app that hosts the Professional
 * Editor experience full-bleed (no top navigation chrome, since there
 * are no other routes to switch between).
 *
 * The router-outlet renders the one and only route component
 * ({@link import('./pages/pro-editor/pro-editor.component').ProEditor}),
 * which mounts `<svge-shell-pro>` directly into the viewport.
 *
 * If/when additional routes are added, introduce a header in this
 * component the same way the playground does — but for now the editor
 * gets every pixel.
 */
@Component({
  selector: 'studio-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: `
    :host {
      /* **Responsive full-bleed shell** — flex column instead of
         block+height:100% so the routed component (a flex item with
         flex: 1) grows to fill the remaining space after router-outlet
         (which takes 0 height as an empty custom element). Block +
         height: 100% on the routed host fails because <router-outlet>
         is the SIBLING of the routed component, not its parent — block
         children of a non-flex/grid parent can't reliably stretch to
         100% when there's an inline sibling in front of them. Flex
         column makes the relationship explicit and reflows on viewport
         changes (resize / F11 / mobile URL bar / DPI change) without
         extra JS. */
      display: flex;
      flex-direction: column;
      height: 100vh;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
