import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Playground root layout. Renders a thin header with route navigation
 * and a `<router-outlet />` that hosts the actual page content
 * (`PlaygroundHome` at `''`, `ShellDemo` at `'shell-demo'`).
 *
 * Pages are route components — see `app.routes.ts`.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
