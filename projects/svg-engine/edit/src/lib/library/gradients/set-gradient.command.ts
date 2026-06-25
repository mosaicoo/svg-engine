import { type Injector } from '@angular/core';
import {
  type Command,
  type CommandResult,
  fail,
  generateNodeId,
  ok,
} from '@mosaicoo/svg-engine/core';

import {
  buildGradientMarkup,
  type GradientGeometry,
  type GradientKind,
  type GradientLibraryItem,
  type GradientStop,
  GradientLibraryService,
} from './gradient-library.service';

/**
 * **D-058** — single command for any gradient mutation (stops,
 * geometry, kind). Carries a partial of the gradient's mutable
 * fields; merges with the current item to build the replacement.
 *
 * **Why one command instead of N specialized ones** (SetStops,
 * SetGeometry, SetKind, AddStop, RemoveStop): keeps the undo
 * granularity at "one user action = one undo step" without forcing
 * the caller to remember which command applies to which mutation.
 * The patch shape is `Partial<GradientLibraryItem>` (subset) so
 * callers express only what they change.
 *
 * **Snapshot for undo**: stores the previous full item (not just the
 * patch) so undo always restores the EXACT pre-edit state, even if
 * the registry was mutated between execute and undo by other code.
 *
 * **D-042/D-043 multi-editor safety**: needs the consumer's
 * injector to reach `GradientLibraryService`. The static `for()`
 * factory wraps the resolution so menu handlers and overlays don't
 * have to lookup the service themselves before constructing.
 */
export interface GradientPatch {
  readonly kind?: GradientKind;
  readonly stops?: readonly GradientStop[];
  readonly geometry?: GradientGeometry;
  readonly name?: string;
}

export class SetGradientCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Edit gradient';

  private previousItem: GradientLibraryItem | null = null;

  constructor(
    private readonly gradientId: string,
    private readonly patch: GradientPatch,
    /**
     * The registry is per-injector — the command is constructed by
     * code that already has access to it, so the caller passes it
     * in (avoids the command itself needing DI plumbing). The
     * `for()` factory below hides this for menu/overlay code that
     * already has the consumer's injector.
     */
    private readonly registry: GradientLibraryService,
  ) {}

  /**
   * Convenience factory — resolves `GradientLibraryService` from the
   * given injector. Matches the construction pattern used by other
   * D-058 callers (overlay + Inspector).
   */
  static for(injector: Injector, gradientId: string, patch: GradientPatch): SetGradientCommand {
    return new SetGradientCommand(gradientId, patch, injector.get(GradientLibraryService));
  }

  execute(): CommandResult {
    const current = this.registry.get(this.gradientId);
    if (current === null) return fail(`${this.label}: gradient "${this.gradientId}" not found`);
    this.previousItem = current;

    // Build the merged item. Spread current first, then patch fields
    // — patch wins. buildMarkup is re-derived from the shared helper
    // so geometry/stops changes round-trip into the rendered defs.
    const merged: GradientLibraryItem = {
      ...current,
      ...this.patch,
      // Always emit fresh markup so the renderer sees the new state.
      // (Items keep their own `buildMarkup` for legacy compat, but
      // post-edit we standardize on the geometry-aware helper.)
      buildMarkup(): string {
        return buildGradientMarkup(this);
      },
    };

    if (!this.registry.update(this.gradientId, merged)) {
      return fail(`${this.label}: update failed for "${this.gradientId}"`);
    }
    return ok();
  }

  undo(): CommandResult {
    if (this.previousItem === null) return fail(`${this.label} undo: nothing captured`);
    if (!this.registry.update(this.gradientId, this.previousItem)) {
      return fail(`${this.label} undo: gradient "${this.gradientId}" no longer in registry`);
    }
    return ok();
  }
}
