import { InjectionToken } from '@angular/core';
import type { InsertParentResolver } from './command';

/**
 * **PAGES-REFACTOR Fase 1** — DI token for the {@link InsertParentResolver}
 * threaded through {@link CommandContext.parentResolver}.
 *
 * Consumers in `svg-engine/edit` provide an implementation
 * (`ActivePageService.resolveAutoParent`) through
 * {@link provideSvgEngineEditorScope}. `CommandBus` injects this token
 * **optionally** so:
 *
 * - Apps with the full edit scope (the standard playground / Mosaicoo
 *   shells) get page-aware inserts automatically — every command that
 *   accepts `parentId: 'auto'` lands in the active page.
 * - Headless / Node / unit-test consumers that only pull
 *   `svg-engine/core` don't pay any DI cost; `'auto'` falls back to the
 *   document root.
 *
 * Token name is **not** a service class to avoid a runtime dependency
 * from `core` on `edit`. The interface lives in `core`; the
 * implementation in `edit` opts in via the token.
 */
export const INSERT_PARENT_RESOLVER = new InjectionToken<InsertParentResolver>(
  'svge.commands.InsertParentResolver',
);
