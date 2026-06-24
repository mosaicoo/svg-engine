import type { SvgDocument } from 'svg-engine/core';

/**
 * **D-110 — Code Generators (Group A).** Contract for a "code output"
 * format that transforms an {@link SvgDocument} into a **string of source
 * code** — React JSX, a React component file, a Data URI, etc. — for
 * pasting into an app or component library.
 *
 * **Why a registry distinct from {@link Exporter}**: an `Exporter`
 * (io-types.ts) is download-oriented (`mediaType`/`extension`/`Blob`) and
 * has no notion of per-format options. A code generator is preview-and-copy
 * oriented and almost always carries a few knobs (component name, TS vs JS,
 * encoding…). Modelling it as its own contract keeps the asset-export panel
 * (binary/visual outputs) and the code-generation dialog (textual outputs)
 * cleanly separated — exactly the split the user asked for: code is reviewed
 * and copied, not configured-and-batched like a PNG slot.
 *
 * **Pure** (like `svgExporter`): `generate()` MUST be a pure
 * `SvgDocument → string` transform — no DOM, no service access, no side
 * effects. The "optimize first" step (running the {@link OptimizerRegistry}
 * pipeline) happens BEFORE `generate()` is called, in the UI layer, so the
 * generator always starts from a plain document. Worker-safe.
 *
 * **Plugin contribution**: generators register via
 * `ctx.track(registry.register(gen))` exactly like importers/exporters —
 * see {@link CodeGeneratorRegistry}.
 */
export interface CodeGenerator {
  /** Unique id within the {@link CodeGeneratorRegistry}. */
  readonly id: string;
  /** Human-readable label for the format dropdown (e.g. "React JSX"). */
  readonly name: string;
  /** Optional one-line description shown under the format picker. */
  readonly description?: string;
  /**
   * Language hint for the output — drives the dialog subtitle and the
   * Download filename extension fallback. e.g. `'tsx' | 'jsx' | 'text'`.
   */
  readonly language: string;
  /** File extension (no leading dot) for the Download action. */
  readonly extension: string;
  /**
   * Declarative option specs the UI renders **generically** (no per-format
   * hardcode). Omit for a zero-option generator.
   */
  readonly options?: readonly CodeGeneratorOptionSpec[];
  /**
   * Transform the document into source code. `options` carries the resolved
   * values for {@link options} (use {@link resolveCodeGeneratorOptionDefaults}
   * to seed them); a generator MUST tolerate a missing/partial `options` by
   * falling back to its declared defaults.
   */
  generate(document: SvgDocument, options?: CodeGeneratorOptions): string;
}

/** Allowed value types for a generator option. */
export type CodeGeneratorOptionValue = string | number | boolean;

/** A free-text option (e.g. the component name). */
export interface CodeGeneratorTextOption {
  readonly kind: 'text';
  readonly key: string;
  readonly label: string;
  readonly default: string;
  readonly placeholder?: string;
  readonly hint?: string;
}

/** An on/off option (e.g. TypeScript, currentColor). */
export interface CodeGeneratorBooleanOption {
  readonly kind: 'boolean';
  readonly key: string;
  readonly label: string;
  readonly default: boolean;
  readonly hint?: string;
}

/** A pick-one option (e.g. Data URI encoding url/base64). */
export interface CodeGeneratorSelectOption {
  readonly kind: 'select';
  readonly key: string;
  readonly label: string;
  readonly default: string;
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  readonly hint?: string;
}

/** Discriminated union of every option control the dialog can render. */
export type CodeGeneratorOptionSpec =
  | CodeGeneratorTextOption
  | CodeGeneratorBooleanOption
  | CodeGeneratorSelectOption;

/** Resolved option values keyed by {@link CodeGeneratorOptionSpec.key}. */
export type CodeGeneratorOptions = Record<string, CodeGeneratorOptionValue>;

/**
 * Build the default option map for a generator (`{ key: default }` for every
 * declared option). The UI seeds its editable option state from this; a
 * generator called with no `options` behaves as if seeded from it too.
 */
export function resolveCodeGeneratorOptionDefaults(gen: CodeGenerator): CodeGeneratorOptions {
  const out: CodeGeneratorOptions = {};
  for (const opt of gen.options ?? []) {
    out[opt.key] = opt.default;
  }
  return out;
}
