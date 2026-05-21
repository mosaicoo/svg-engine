import { Routes } from '@angular/router';

/**
 * Playground routes — sandbox/showcase para os 4 modos (D-037).
 *
 * Convenção (D-041): `/raw-primitives` é o **nome canônico** do exemplo
 * Modo 1 (Canvas headless puro com UI construída pelo consumer). A
 * raiz `/` redireciona para `/raw-primitives` por compatibilidade com
 * bookmarks antigos.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'raw-primitives',
  },
  {
    path: 'raw-primitives',
    loadComponent: () =>
      import('./pages/playground-home/playground-home.component').then((m) => m.PlaygroundHome),
  },
  {
    path: 'shell-demo',
    loadComponent: () => import('./pages/shell-demo/shell-demo.component').then((m) => m.ShellDemo),
  },
  {
    path: 'shell-partial-demo',
    loadComponent: () =>
      import('./pages/shell-partial-demo/shell-partial-demo.component').then(
        (m) => m.ShellPartialDemo,
      ),
  },
  {
    path: 'shell-canvas-only',
    loadComponent: () =>
      import('./pages/shell-canvas-only/shell-canvas-only.component').then(
        (m) => m.ShellCanvasOnly,
      ),
  },
  {
    path: 'shell-pro-demo',
    loadComponent: () =>
      import('./pages/shell-pro-demo/shell-pro-demo.component').then((m) => m.ShellProDemo),
  },
  {
    path: 'perf',
    loadComponent: () => import('./pages/perf/perf.component').then((m) => m.PerfPage),
  },
  // Catch-all → redirect home
  { path: '**', redirectTo: '' },
];
