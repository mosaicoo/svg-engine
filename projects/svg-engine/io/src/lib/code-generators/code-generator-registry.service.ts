import { Injectable, signal } from '@angular/core';
import type { Disposable } from 'svg-engine/core';
import type { CodeGenerator } from './code-generator-types';

/**
 * **D-110 — Registry of {@link CodeGenerator}s.** Signal-backed, same shape
 * as {@link ExporterRegistry} / {@link ImporterRegistry}: `register()`
 * returns a `Disposable`, lookups are insertion-ordered.
 *
 * Plugins contribute formats via `ctx.track(reg.register(generator))`; the
 * built-in Group-A generators (React JSX / React Component / Data URI) are
 * registered by `codeGeneratorsPlugin` (svg-engine/ui). Headless consumers
 * can register the bare generators from `svg-engine/io` directly.
 *
 * `providedIn: 'root'` so the registry is a single shared instance — the
 * code-generation dialog and any plugin see the same set.
 */
@Injectable({ providedIn: 'root' })
export class CodeGeneratorRegistry {
  private readonly _generators = signal<readonly CodeGenerator[]>([]);

  /** Reactive snapshot of all registered generators (insertion order). */
  readonly generators = this._generators.asReadonly();

  register(generator: CodeGenerator): Disposable {
    if (typeof generator.id !== 'string' || generator.id.length === 0) {
      throw new Error('CodeGeneratorRegistry.register: generator.id must be non-empty');
    }
    if (this._generators().some((g) => g.id === generator.id)) {
      throw new Error(
        `CodeGeneratorRegistry.register: generator "${generator.id}" is already registered`,
      );
    }
    this._generators.set([...this._generators(), generator]);
    return {
      dispose: () => {
        this._generators.set(this._generators().filter((g) => g.id !== generator.id));
      },
    };
  }

  get(id: string): CodeGenerator | null {
    return this._generators().find((g) => g.id === id) ?? null;
  }
}
