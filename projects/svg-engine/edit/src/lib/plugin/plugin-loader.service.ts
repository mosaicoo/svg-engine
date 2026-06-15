import { inject, Injectable, InjectionToken } from '@angular/core';
import { type EditorPlugin, PLUGIN_API_VERSION, withPluginMeta } from './plugin';
import {
  type ExternalPluginManifest,
  validateExternalPluginManifest,
} from './external-plugin-manifest';
import { type PluginActionResult, PluginManagerService } from './plugin-manager.service';

/**
 * Consumer-provided function that turns a validated manifest into the
 * plugin's ES module namespace. **The library ships no default** — remote
 * code loading is strictly opt-in: a consumer that wants Fase 2 provides
 * this via {@link providePluginLoader}. Keeping the actual dynamic
 * `import()` (and any SRI fetch/verify) in *consumer* code means the
 * library bundle never contains a "load arbitrary URL" primitive.
 *
 * A typical implementation:
 * ```ts
 * const moduleLoader: PluginModuleLoader = (m) => import(/* @vite-ignore *\/ m.entry);
 * ```
 * (Add SRI: `fetch` the bytes, verify `m.integrity`, then import a blob URL.)
 */
export type PluginModuleLoader = (manifest: ExternalPluginManifest) => Promise<unknown>;

/**
 * Allowlist of origins (`scheme://host[:port]`) a plugin's `entry` URL is
 * allowed to come from. **Empty by default — fail closed**: with no
 * configured origin, `PluginLoader.load` refuses every manifest. The
 * consumer sets this via {@link providePluginLoader}.
 */
export const SVGE_PLUGIN_TRUSTED_ORIGINS = new InjectionToken<readonly string[]>(
  'SVGE_PLUGIN_TRUSTED_ORIGINS',
  { factory: () => [] },
);

/** The consumer's {@link PluginModuleLoader}, or `null` when not provided. */
export const SVGE_PLUGIN_MODULE_LOADER = new InjectionToken<PluginModuleLoader | null>(
  'SVGE_PLUGIN_MODULE_LOADER',
  { factory: () => null },
);

/**
 * **D-083 Fase 2 — runtime loader for external (third-party) plugins.**
 *
 * Loads a plugin described by an {@link ExternalPluginManifest} through a
 * chain of guards, **fail-closed at every step**, then installs it via
 * {@link PluginManagerService.installExternal}. Order is deliberate —
 * cheap/static checks first so untrusted code is fetched *only* once the
 * manifest has cleared validation, the API-version gate and the origin
 * allowlist:
 *
 * 1. **Validate** the manifest shape (untrusted input).
 * 2. **API-version gate** — major must match `PLUGIN_API_VERSION` (don't
 *    even fetch incompatible code).
 * 3. **Origin allowlist** — `entry`'s origin must be on the consumer's
 *    trusted list (empty ⇒ nothing loads).
 * 4. **Module loader present** — else opt-in not configured.
 * 5. **Fetch + import** via the consumer's loader (where SRI lives).
 * 6. **Shape-check** the default export is an `EditorPlugin` whose id +
 *    apiVersion match the manifest.
 * 7. **Install** as `'external'` (disable/uninstall like any external).
 *
 * Never throws — every failure path returns `{ ok: false, error }`.
 *
 * **Not an open marketplace** (D-083): there is intentionally no
 * "paste a URL and run" surface. Loading requires the consumer to both
 * configure trusted origins and supply the module loader.
 */
@Injectable({ providedIn: 'root' })
export class PluginLoader {
  private readonly manager = inject(PluginManagerService);
  private readonly trustedOrigins = inject(SVGE_PLUGIN_TRUSTED_ORIGINS);
  private readonly moduleLoader = inject(SVGE_PLUGIN_MODULE_LOADER);

  /** Whether runtime external loading is configured (origins + loader). */
  get isEnabled(): boolean {
    return this.moduleLoader !== null && this.trustedOrigins.length > 0;
  }

  /** Whether a URL's origin is on the consumer's trusted allowlist. */
  isOriginTrusted(url: string): boolean {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return false;
    }
    return this.trustedOrigins.includes(origin);
  }

  /** Load + install an external plugin from its manifest. */
  async load(manifest: ExternalPluginManifest): Promise<PluginActionResult> {
    const invalid = validateExternalPluginManifest(manifest);
    if (invalid !== null) return fail(`Invalid manifest: ${invalid}`);

    if (majorOf(manifest.apiVersion) !== majorOf(PLUGIN_API_VERSION)) {
      return fail(
        `Plugin "${manifest.id}" targets API v${manifest.apiVersion} but host is v${PLUGIN_API_VERSION}`,
      );
    }

    if (!this.isOriginTrusted(manifest.entry)) {
      return fail(
        `Refused: "${manifest.entry}" is not on the trusted-origins allowlist (${
          this.trustedOrigins.length === 0 ? 'none configured' : this.trustedOrigins.join(', ')
        })`,
      );
    }

    const loader = this.moduleLoader;
    if (loader === null) {
      return fail('Runtime plugin loading is not configured (no module loader provided)');
    }

    let mod: unknown;
    try {
      mod = await loader(manifest);
    } catch (err) {
      return fail(`Failed to load module from "${manifest.entry}": ${stringify(err)}`);
    }

    const extracted = extractPlugin(mod, manifest);
    if (typeof extracted === 'string') return fail(extracted);

    // Fall back to the manifest's display metadata for any field the
    // loaded plugin didn't declare itself.
    const plugin = withPluginMeta(extracted, {
      description: extracted.description ?? manifest.description,
      author: extracted.author ?? manifest.author,
      icon: extracted.icon ?? manifest.icon,
      category: extracted.category ?? manifest.category,
    });

    return this.manager.installExternal(plugin);
  }

  /**
   * **D-099** — convenience for the "Install from URL…" UI: fetch an
   * {@link ExternalPluginManifest} as JSON from `manifestUrl`, then hand it
   * to {@link load} (which runs every guard: validate → apiVersion gate →
   * entry-origin allowlist → moduleLoader → shape-check → install).
   *
   * **Stricter at the front, same fail-closed posture**: the manifest URL
   * itself must be on the trusted-origins allowlist *before any network
   * call*. So this is NOT a "paste any URL and fetch" surface — it only
   * reaches origins the host already trusts (the library's deliberate
   * non-marketplace stance, D-083). Never throws; returns `{ ok, error }`.
   */
  async loadFromManifestUrl(manifestUrl: string): Promise<PluginActionResult> {
    if (!this.isEnabled) {
      return fail('Runtime plugin loading is not configured by this app');
    }
    if (!this.isOriginTrusted(manifestUrl)) {
      return fail(
        `Refused: "${manifestUrl}" is not on the trusted-origins allowlist (${
          this.trustedOrigins.length === 0 ? 'none configured' : this.trustedOrigins.join(', ')
        })`,
      );
    }

    let res: Response;
    try {
      res = await fetch(manifestUrl, { credentials: 'omit' });
    } catch (err) {
      return fail(`Failed to fetch manifest from "${manifestUrl}": ${stringify(err)}`);
    }
    if (!res.ok) {
      return fail(`Failed to fetch manifest from "${manifestUrl}": HTTP ${res.status}`);
    }

    let manifest: ExternalPluginManifest;
    try {
      manifest = (await res.json()) as ExternalPluginManifest;
    } catch (err) {
      return fail(`Manifest at "${manifestUrl}" is not valid JSON: ${stringify(err)}`);
    }

    return this.load(manifest);
  }
}

function extractPlugin(mod: unknown, manifest: ExternalPluginManifest): EditorPlugin | string {
  if (mod === null || typeof mod !== 'object') return 'Loaded module is not an object';
  const def = (mod as { default?: unknown }).default;
  if (def === null || typeof def !== 'object') return 'Loaded module has no default export object';
  const p = def as Partial<EditorPlugin>;
  if (typeof p.id !== 'string' || p.id.length === 0) {
    return 'Default export is not an EditorPlugin (missing id)';
  }
  if (typeof p.install !== 'function') {
    return 'Default export is not an EditorPlugin (missing install())';
  }
  if (typeof p.apiVersion !== 'string') {
    return 'Loaded plugin is missing apiVersion';
  }
  if (p.id !== manifest.id) {
    return `Loaded plugin id "${p.id}" does not match manifest id "${manifest.id}"`;
  }
  if (majorOf(p.apiVersion) !== majorOf(PLUGIN_API_VERSION)) {
    return `Loaded plugin "${p.id}" targets API v${p.apiVersion} but host is v${PLUGIN_API_VERSION}`;
  }
  return def as EditorPlugin;
}

function majorOf(semver: string): number | null {
  const m = /^(\d+)\./.exec(semver);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function fail(error: string): PluginActionResult {
  return { ok: false, error };
}

function stringify(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
