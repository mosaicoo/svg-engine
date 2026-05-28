import { Routes } from '@angular/router';

/**
 * **SVG Studio routes** — single route: the Professional Editor.
 *
 * Any URL resolves to the editor (the catch-all wildcard at the end
 * makes deep-links from external systems land in the editor instead of
 * a 404). When the app grows to multiple routes, replace the wildcard
 * with a real `path: '**'` 404 component.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/pro-editor/pro-editor.component').then((m) => m.ProEditor),
  },
  // Catch-all → editor. Keeps deep-links/typos out of the 404 territory
  // since there's only one screen anyway.
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
