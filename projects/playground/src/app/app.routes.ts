import { Routes } from '@angular/router';

/**
 * Playground routes — sandbox/showcase para os 4 modos de consumo (D-037).
 *
 * **Convenção D-041**: slugs em inglês (URLs); labels em PT-BR (nav).
 * Cada rota tem **nome que descreve a atividade**, não a categoria
 * arquitetural. Detalhes em `docs/01-visao-geral.md` → "Vocabulário
 * canônico" e D-041 em `docs/04-decisoes-tecnicas.md`.
 *
 * **Compatibilidade**: URLs antigas (`/raw-primitives`, `/shell-demo`,
 * `/shell-partial-demo`, `/shell-canvas-only`, `/shell-pro-demo`,
 * `/perf`) redirecionam para os novos slugs para que bookmarks
 * antigos continuem funcionando.
 */
export const routes: Routes = [
  // Raiz → editor custom (mantém comportamento anterior: a "tela cheia"
  // do playground é o exemplo mais completo, demonstrando que se pode
  // construir um editor profissional sem o shell).
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'custom-editor',
  },

  // ── Rotas canônicas ────────────────────────────────────────────
  {
    path: 'custom-editor',
    loadComponent: () =>
      import('./pages/custom-editor/custom-editor.component').then((m) => m.CustomEditor),
  },
  {
    path: 'basic-editor',
    loadComponent: () =>
      import('./pages/basic-editor/basic-editor.component').then((m) => m.BasicEditor),
  },
  {
    path: 'modular-editor',
    loadComponent: () =>
      import('./pages/modular-editor/modular-editor.component').then((m) => m.ModularEditor),
  },
  {
    path: 'embeddable-canvas',
    loadComponent: () =>
      import('./pages/embeddable-canvas/embeddable-canvas.component').then(
        (m) => m.EmbeddableCanvas,
      ),
  },
  {
    path: 'pro-editor',
    loadComponent: () => import('./pages/pro-editor/pro-editor.component').then((m) => m.ProEditor),
  },
  {
    path: 'svg-viewer',
    loadComponent: () => import('./pages/svg-viewer/svg-viewer.component').then((m) => m.SvgViewer),
  },
  {
    path: 'benchmark',
    loadComponent: () => import('./pages/benchmark/benchmark.component').then((m) => m.Benchmark),
  },
  {
    path: 'nlu-test',
    loadComponent: () => import('./pages/nlu-test/nlu-test.component').then((m) => m.NluTest),
  },
  {
    path: 'plugins',
    loadComponent: () => import('./pages/plugins/plugins.component').then((m) => m.PluginsPage),
  },

  // ── Redirects de URLs antigas (D-041 rename) ───────────────────
  // Mantidos para preservar bookmarks/screenshots/links externos.
  // Podem ser removidos em uma major futura quando o ecossistema
  // tiver migrado para os slugs novos.
  { path: 'raw-primitives', redirectTo: 'custom-editor', pathMatch: 'full' },
  { path: 'shell-demo', redirectTo: 'basic-editor', pathMatch: 'full' },
  { path: 'shell-partial-demo', redirectTo: 'modular-editor', pathMatch: 'full' },
  { path: 'shell-canvas-only', redirectTo: 'embeddable-canvas', pathMatch: 'full' },
  { path: 'shell-pro-demo', redirectTo: 'pro-editor', pathMatch: 'full' },
  { path: 'perf', redirectTo: 'benchmark', pathMatch: 'full' },

  // Catch-all → editor custom
  { path: '**', redirectTo: 'custom-editor' },
];
