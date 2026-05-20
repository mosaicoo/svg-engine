import { Injectable, signal } from '@angular/core';
import type { SvgDocument } from 'svg-engine/core';
import type { Disposable } from 'svg-engine/core';
import type { Optimizer } from './optimizer';

/**
 * Registry of {@link Optimizer}s (categoria 3 do D-023). Signal-backed,
 * `register()` returns `Disposable`. Plugins contribute passes via
 * `ctx.track(reg.register(opt))`.
 *
 * The registry also offers a {@link runPipeline} convenience that
 * sorts active optimizers by `order` (default 100, stable sort on
 * ties) and chains them — most consumers want this, not raw enumeration.
 */
@Injectable({ providedIn: 'root' })
export class OptimizerRegistry {
  private readonly _optimizers = signal<readonly Optimizer[]>([]);

  /** Reactive snapshot (insertion order; pipeline reorders by `order`). */
  readonly optimizers = this._optimizers.asReadonly();

  register(optimizer: Optimizer): Disposable {
    if (typeof optimizer.id !== 'string' || optimizer.id.length === 0) {
      throw new Error('OptimizerRegistry.register: optimizer.id must be non-empty');
    }
    if (this._optimizers().some((o) => o.id === optimizer.id)) {
      throw new Error(
        `OptimizerRegistry.register: optimizer "${optimizer.id}" is already registered`,
      );
    }
    this._optimizers.set([...this._optimizers(), optimizer]);
    return {
      dispose: () => {
        this._optimizers.set(this._optimizers().filter((o) => o.id !== optimizer.id));
      },
    };
  }

  get(id: string): Optimizer | null {
    return this._optimizers().find((o) => o.id === id) ?? null;
  }

  /**
   * Run all enabled optimizers in `order` ascending. When
   * `enabledIds` is provided, only those (intersected with available)
   * run — useful for "advanced settings" UIs where users toggle
   * individual passes. When omitted, all optimizers with
   * `defaultEnabled !== false` run.
   *
   * Returns a new document with all passes applied in order. If no
   * pass changes the document (reference equality), the original
   * document is returned unchanged.
   */
  runPipeline(document: SvgDocument, enabledIds?: ReadonlySet<string> | null): SvgDocument {
    const active = this._optimizers()
      .filter((o) => (enabledIds == null ? (o.defaultEnabled ?? true) : enabledIds.has(o.id)))
      .slice() // shallow copy before sort (don't mutate signal value)
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    let current = document;
    for (const opt of active) {
      const next = opt.optimize(current);
      if (next !== current) current = next;
    }
    return current;
  }
}
