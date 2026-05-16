import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/playground-home/playground-home.component').then((m) => m.PlaygroundHome),
  },
  {
    path: 'shell-demo',
    loadComponent: () => import('./pages/shell-demo/shell-demo.component').then((m) => m.ShellDemo),
  },
  // Catch-all → redirect home
  { path: '**', redirectTo: '' },
];
