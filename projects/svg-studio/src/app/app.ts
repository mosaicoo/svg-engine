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
      display: block;
      height: 100vh;
      min-height: 0;
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
