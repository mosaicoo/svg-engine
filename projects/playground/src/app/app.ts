import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Playground root layout. Renders a thin header with route navigation
 * and a `<router-outlet />` that hosts the actual page content.
 *
 * Routes (D-041, slugs EN / labels PT):
 * - `/custom-editor`   → CustomEditor       (sem `<svge-editor>` — Modo 1+3 misto)
 * - `/basic-editor`    → BasicEditor        (`<svge-editor>` drop-in básico — Modo 2)
 * - `/modular-editor`  → ModularEditor      (configurador com 6 checkboxes)
 * - `/embeddable-canvas` → EmbeddableCanvas (canvas com edição sem chrome — Modo 4)
 * - `/pro-editor`      → ProEditor          (`<svge-shell-pro>` completo — Modo 2 pro)
 * - `/nlu-test`        → NluTest            (editor + `<svge-nlu-input>` lado a lado — D-046)
 * - `/svg-viewer`      → SvgViewer          (read-only puro — só render+io)
 * - `/benchmark`       → Benchmark          (perf harness)
 *
 * URLs antigas redirecionam para os slugs novos (compatibilidade).
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
