import type { PluginCategory } from './plugin';

/**
 * **Wire-format descriptor of a third-party plugin** (D-083 Fase 2),
 * read by `PluginLoader` *before* any code is fetched. Typically served
 * as JSON from a registry/CDN the consumer controls.
 *
 * The manifest carries everything needed to decide whether a plugin is
 * safe to load — the host API version it targets, the module URL, and an
 * optional Subresource-Integrity hash — plus the display metadata so the
 * plugin shows up nicely in the manager even before it installs.
 *
 * **Security note**: the manifest is *untrusted input*. `PluginLoader`
 * validates it ({@link validateExternalPluginManifest}), checks the
 * `apiVersion` and confirms `entry`'s origin is on the consumer's
 * allowlist before handing it to the (consumer-provided) module loader.
 */
export interface ExternalPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Host plugin-API version the plugin targets — major-checked at load. */
  readonly apiVersion: string;
  /**
   * Absolute URL of the ESM module whose **default export** is the
   * `EditorPlugin`. Its origin must be on the consumer's trusted-origins
   * allowlist (`providePluginLoader`).
   */
  readonly entry: string;
  /**
   * Optional Subresource Integrity string (e.g. `"sha384-…"`). When
   * present, the consumer's module loader **must** verify the fetched
   * bytes against it before importing.
   */
  readonly integrity?: string;
  readonly dependencies?: readonly string[];
  // ── Display metadata (mirrors EditorPlugin's optional fields) ──────
  readonly description?: string;
  readonly author?: string;
  readonly icon?: string;
  readonly category?: PluginCategory;
}

/** Well-formed Subresource Integrity string: `sha256|sha384|sha512` + base64. */
const SRI_RE = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
/** Minimal semver-ish gate (matches PLUGIN_API_VERSION shape `major.minor.patch`). */
const SEMVER_RE = /^\d+\.\d+\.\d+/;

/**
 * Validate an untrusted object as an {@link ExternalPluginManifest}.
 * Returns `null` when valid, or a human-readable error string. Pure —
 * no I/O, no side effects — so it's trivially testable and safe to run
 * on arbitrary registry input.
 */
export function validateExternalPluginManifest(input: unknown): string | null {
  if (input === null || typeof input !== 'object') {
    return 'manifest must be an object';
  }
  const m = input as Record<string, unknown>;

  const requireStr = (key: string): string | null => {
    const v = m[key];
    if (typeof v !== 'string' || v.length === 0)
      return `manifest.${key} must be a non-empty string`;
    return null;
  };
  for (const key of ['id', 'name', 'version', 'apiVersion', 'entry'] as const) {
    const err = requireStr(key);
    if (err !== null) return err;
  }

  if (!SEMVER_RE.test(m['apiVersion'] as string)) {
    return `manifest.apiVersion "${String(m['apiVersion'])}" is not a valid semver`;
  }

  // `entry` must be an absolute, parseable URL (so we can check its origin).
  try {
    new URL(m['entry'] as string);
  } catch {
    return `manifest.entry "${String(m['entry'])}" is not an absolute URL`;
  }

  if (m['integrity'] !== undefined) {
    if (typeof m['integrity'] !== 'string' || !SRI_RE.test(m['integrity'])) {
      return 'manifest.integrity must be a valid SRI string (e.g. "sha384-…")';
    }
  }

  if (m['dependencies'] !== undefined) {
    if (!Array.isArray(m['dependencies']) || m['dependencies'].some((d) => typeof d !== 'string')) {
      return 'manifest.dependencies must be an array of strings';
    }
  }

  return null;
}
