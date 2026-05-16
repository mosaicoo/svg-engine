import { computed, Injectable, signal } from '@angular/core';

/**
 * How the canvas background is presented behind the rendered document.
 * **Editor presentation only** — never serialized into the SVG output.
 * SVG itself has no "background" concept; consumers who want a colored
 * fill in the *exported* SVG must add an explicit `<rect>` to the
 * document tree.
 *
 * Variants:
 * - `transparent` (default): renders the standard checkerboard pattern
 *   (light gray squares) — the universal "this area has no painted
 *   background" indicator across image editors.
 * - `solid`: a single CSS color (named, hex, rgb(), hsl(), etc.).
 * - `image`: an image URL tiled / sized via CSS — useful for reference
 *   underlays (e.g., showing a screenshot to trace).
 *
 * Future variants (deliberately not added yet — wait for real demand):
 * - `gradient` (linear / radial)
 * - `pattern` (named SVG pattern from a plugin)
 */
export type BackgroundConfig =
  | { readonly kind: 'transparent' }
  | { readonly kind: 'solid'; readonly color: string }
  | { readonly kind: 'image'; readonly href: string };

const DEFAULT_BACKGROUND: BackgroundConfig = { kind: 'transparent' };

/**
 * Editor-side **workspace presentation state** (D-021 resolution).
 *
 * Holds non-document configuration that describes how the canvas is
 * shown to the user — background pattern, future page settings, future
 * grid/guides/rulers config. **Never** mutates `SvgDocument` (which
 * stays pure SVG-spec, per D-002).
 *
 * Why a separate service:
 * - `SvgDocument` is what the user authors and exports. Background
 *   color / page size / grid visibility are *editor* concerns, not
 *   serialized SVG content.
 * - Multi-page is a future extension: `WorkspacesRegistry` will hold
 *   N `WorkspaceService` instances; each is what we have today.
 *   Putting this state in `SvgDocument` would block that path.
 *
 * Persistence: not handled here. Consumers (the playground, eventually
 * a `<svge-editor>` shell) decide whether to persist workspace state
 * per-project (project file format) or per-user (localStorage).
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly _background = signal<BackgroundConfig>(DEFAULT_BACKGROUND);

  /** Reactive snapshot of the current background config. */
  readonly background = this._background.asReadonly();

  /**
   * Convenience computed — true when the current background is the
   * transparent (checkerboard) variant. Drives a single CSS class on
   * the `<svge-workspace-background>` host so the pattern is applied
   * via stylesheet rather than inline `style.background-image`
   * (which would clash with `image` mode).
   */
  readonly isTransparentBackground = computed(() => this._background().kind === 'transparent');

  /**
   * Set the background config. Invalid configs (non-finite/empty
   * required fields) are silently rejected so the consumer doesn't
   * have to wrap every UI handler in try/catch — the background
   * simply stays as-is.
   *
   * Validation:
   * - `solid`: `color` must be a non-empty string. We do **not**
   *   validate CSS color syntax — that's the browser's job and
   *   strict client-side validation tends to lag the spec.
   * - `image`: `href` must be a non-empty string. We do **not**
   *   validate URL syntax for the same reason.
   */
  setBackground(config: BackgroundConfig): void {
    if (!isValidBackground(config)) return;
    // Don't fire signal when the new value is structurally identical
    // (avoids spurious change-detection when a UI debounces back to
    // the same color).
    if (sameBackground(this._background(), config)) return;
    this._background.set(config);
  }

  /** Reset to the default transparent (checkerboard) background. */
  resetBackground(): void {
    this._background.set(DEFAULT_BACKGROUND);
  }
}

function isValidBackground(c: BackgroundConfig): boolean {
  switch (c.kind) {
    case 'transparent':
      return true;
    case 'solid':
      return typeof c.color === 'string' && c.color.length > 0;
    case 'image':
      return typeof c.href === 'string' && c.href.length > 0;
  }
}

function sameBackground(a: BackgroundConfig, b: BackgroundConfig): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'solid' && b.kind === 'solid') return a.color === b.color;
  if (a.kind === 'image' && b.kind === 'image') return a.href === b.href;
  return true; // both 'transparent'
}
