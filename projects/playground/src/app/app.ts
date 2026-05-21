import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Playground root layout. Renders a thin header with route navigation
 * and a `<router-outlet />` that hosts the actual page content
 * (`PlaygroundHome` at `'raw-primitives'` — Modo 1 D-037, `ShellDemo`
 * at `'shell-demo'`, etc.).
 *
 * Convenção (D-041): `/raw-primitives` é o nome canônico para o
 * exemplo Modo 1; `/` redireciona para lá. O nome do componente
 * (`PlaygroundHome`) é histórico — folder rename é polish opcional.
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
