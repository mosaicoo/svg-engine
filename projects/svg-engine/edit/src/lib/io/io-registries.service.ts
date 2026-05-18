import { Injectable, signal } from '@angular/core';
import type { Disposable } from '../plugin/plugin';
import type { Exporter, Importer } from './io-types';

/**
 * Registry of {@link Importer}s (categoria 4 do D-023). Signal-backed,
 * `register()` returns `Disposable`. Plugins contribute formats via
 * `ctx.track(reg.register(importer))`.
 *
 * **Lookup helpers** for file-based UIs:
 * - `byExtension(ext)`: case-insensitive extension match (without dot)
 * - `byMediaType(type)`: exact MIME match
 * - Both return the FIRST matching importer (insertion order tiebreak)
 *
 * **Why insertion-order tiebreak**: when multiple plugins claim the
 * same extension (e.g., two SVG variants), the first-registered wins.
 * Apps decide priority via the order in their `provideSvgEnginePlugin`
 * array. To override a builtin, plug-in your importer BEFORE the
 * builtin plugin.
 */
@Injectable({ providedIn: 'root' })
export class ImporterRegistry {
  private readonly _importers = signal<readonly Importer[]>([]);

  /** Reactive snapshot of all registered importers (insertion order). */
  readonly importers = this._importers.asReadonly();

  register(importer: Importer): Disposable {
    if (typeof importer.id !== 'string' || importer.id.length === 0) {
      throw new Error('ImporterRegistry.register: importer.id must be non-empty');
    }
    if (this._importers().some((i) => i.id === importer.id)) {
      throw new Error(`ImporterRegistry.register: importer "${importer.id}" is already registered`);
    }
    this._importers.set([...this._importers(), importer]);
    return {
      dispose: () => {
        this._importers.set(this._importers().filter((i) => i.id !== importer.id));
      },
    };
  }

  get(id: string): Importer | null {
    return this._importers().find((i) => i.id === id) ?? null;
  }

  byExtension(ext: string): Importer | null {
    const lower = ext.toLowerCase().replace(/^\./, '');
    return (
      this._importers().find((i) => i.extensions.some((e) => e.toLowerCase() === lower)) ?? null
    );
  }

  byMediaType(mediaType: string): Importer | null {
    return this._importers().find((i) => i.mediaTypes.includes(mediaType)) ?? null;
  }
}

/**
 * Registry of {@link Exporter}s (categoria 5 do D-023). Same shape as
 * {@link ImporterRegistry}.
 */
@Injectable({ providedIn: 'root' })
export class ExporterRegistry {
  private readonly _exporters = signal<readonly Exporter[]>([]);

  readonly exporters = this._exporters.asReadonly();

  register(exporter: Exporter): Disposable {
    if (typeof exporter.id !== 'string' || exporter.id.length === 0) {
      throw new Error('ExporterRegistry.register: exporter.id must be non-empty');
    }
    if (this._exporters().some((e) => e.id === exporter.id)) {
      throw new Error(`ExporterRegistry.register: exporter "${exporter.id}" is already registered`);
    }
    this._exporters.set([...this._exporters(), exporter]);
    return {
      dispose: () => {
        this._exporters.set(this._exporters().filter((e) => e.id !== exporter.id));
      },
    };
  }

  get(id: string): Exporter | null {
    return this._exporters().find((e) => e.id === id) ?? null;
  }

  byExtension(ext: string): Exporter | null {
    const lower = ext.toLowerCase().replace(/^\./, '');
    return this._exporters().find((e) => e.extension.toLowerCase() === lower) ?? null;
  }

  byMediaType(mediaType: string): Exporter | null {
    return this._exporters().find((e) => e.mediaType === mediaType) ?? null;
  }
}
