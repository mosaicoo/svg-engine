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
 * Page (paper) settings — informs the rendered canvas size, print
 * preview, and exports that respect "page". The actual SVG `viewBox`
 * still controls what the renderer draws; `PageConfig` is presentation
 * meta that the editor uses to crop / center / outline the page.
 *
 * Units are abstract document units — same as `viewBox`. We don't bake
 * in mm/in/px here because conversion is the consumer's job (depends
 * on output device DPI). A future `units` extension can layer on top.
 */
export interface PageConfig {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'portrait' | 'landscape';
  /** Inner safe-area inset (top/right/bottom/left); defaults to 0. */
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}

const DEFAULT_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 } as const;
const DEFAULT_PAGE: PageConfig = {
  width: 800,
  height: 600,
  orientation: 'landscape',
  margins: DEFAULT_MARGINS,
};

/**
 * Editor grid configuration. The grid is purely a visual aid +
 * snap-target source (see `SnapService`). Never serialized.
 *
 * - `enabled`: master visibility toggle
 * - `spacing`: minor-line spacing in document units (must be > 0)
 * - `majorEvery`: highlight every Nth line as a thicker major line
 *   (1 = treat every line as major; typical: 5 or 10)
 * - `color`: CSS color for minor lines (major derives by alpha boost)
 */
export interface GridConfig {
  readonly enabled: boolean;
  readonly spacing: number;
  readonly majorEvery: number;
  readonly color: string;
}

const DEFAULT_GRID: GridConfig = {
  enabled: false,
  spacing: 20,
  majorEvery: 5,
  color: '#90a4ae',
};

/**
 * A single user-drawn guide line. Either horizontal (constant y) or
 * vertical (constant x), spanning the full canvas. Guides are visual
 * + snap targets (Snap support added in a future block).
 */
export interface Guide {
  readonly id: string;
  readonly axis: 'h' | 'v';
  /** y position for horizontal guides, x position for vertical guides. */
  readonly position: number;
}

/**
 * Editor rulers configuration. Rulers are purely presentational
 * (top + left strips with ticks + numbers). When `enabled=false`,
 * the UI hides them entirely.
 */
export interface RulersConfig {
  readonly enabled: boolean;
}

const DEFAULT_RULERS: RulersConfig = { enabled: false };

/**
 * Canvas-interaction configuration — currently only carries the
 * wheel-zoom sensitivity, but the same shape will hold future
 * gesture preferences (pan inertia, scroll-to-zoom modifier, etc.).
 *
 * - `wheelZoomSpeed`: integer 1-10 representing how much zoom one
 *   wheel notch produces. 5 (default) maps to a "natural" Figma-like
 *   feel; 1 is the slowest (must scroll a lot to zoom); 10 is the
 *   fastest. The exact pixel-delta-to-factor formula lives in the
 *   {@link SvgeCanvasGestures} directive — see {@link DEFAULT_INTERACTION}.
 *   Internally the speed is mapped to a sensitivity coefficient via
 *   `0.0002 * speed`, so:
 *     - speed=1  → 0.0002 (≈ 2% per 100-px delta)
 *     - speed=5  → 0.0010 (≈ 9.5% per 100-px delta — Figma-equivalent)
 *     - speed=10 → 0.0020 (≈ 18% per 100-px delta)
 *   This range is empirically tuned to feel "natural" on both
 *   trackpads (low deltaY per event, many events) and mouse wheels
 *   (high deltaY per event, fewer events).
 */
export interface InteractionConfig {
  readonly wheelZoomSpeed: number;
}

/** Lowest / highest values of `wheelZoomSpeed` exposed in UI sliders. */
export const WHEEL_ZOOM_SPEED_MIN = 1;
export const WHEEL_ZOOM_SPEED_MAX = 10;

const DEFAULT_INTERACTION: InteractionConfig = { wheelZoomSpeed: 5 };

/**
 * Convert the user-facing "speed" scale (1-10) into the actual
 * sensitivity coefficient used by the wheel-zoom formula. Exposed as
 * a constant + helper so tests + UI + directive all agree on the
 * same mapping.
 */
export function wheelZoomSensitivityFromSpeed(speed: number): number {
  const clamped = Math.max(WHEEL_ZOOM_SPEED_MIN, Math.min(WHEEL_ZOOM_SPEED_MAX, Math.round(speed)));
  return 0.0002 * clamped;
}

/**
 * Resolved page bounds (in document coordinates) computed from the
 * raw {@link PageConfig} + the viewport's content box. The page is
 * **centered** inside the content box when the content box is larger
 * than the page (the common case) — matches Illustrator / Affinity
 * convention where the "paper" sits in the middle of the workspace
 * and pasteboard surrounds it.
 *
 * **Orientation swap**: same logic as in `PageOverlay.effectivePage` —
 * portrait+landscape-shaped dims swap, landscape+portrait-shaped dims
 * swap. Other combos stay as authored.
 *
 * **When content box equals page**: page bounds = (0, 0, page.w, page.h).
 * No pasteboard exists. Matches the prior hardcoded behaviour.
 *
 * Shared between `PageOverlay` (rendering the rect), `GridOverlay`
 * (clipping grid lines to the page area), and `GuidesOverlay`
 * (clipping guide spans). Keeping the math in ONE function means all
 * three stay in sync when the rule changes.
 */
export function pageBoundsIn(
  contentBox: { readonly width: number; readonly height: number },
  page: PageConfig,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const portraitShaped = page.width <= page.height;
  const wantsPortrait = page.orientation === 'portrait';
  // Swap when authored shape disagrees with orientation choice.
  const swap = wantsPortrait !== portraitShaped;
  const effW = swap ? page.height : page.width;
  const effH = swap ? page.width : page.height;
  // Center inside contentBox; clamp at 0 so a page larger than the
  // contentBox doesn't render at negative coords (sticks to origin).
  const x = Math.max(0, (contentBox.width - effW) / 2);
  const y = Math.max(0, (contentBox.height - effH) / 2);
  return { x, y, width: effW, height: effH };
}

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
  private readonly _page = signal<PageConfig>(DEFAULT_PAGE);
  private readonly _grid = signal<GridConfig>(DEFAULT_GRID);
  private readonly _rulers = signal<RulersConfig>(DEFAULT_RULERS);
  private readonly _guides = signal<readonly Guide[]>([]);
  private readonly _interaction = signal<InteractionConfig>(DEFAULT_INTERACTION);
  private guideCounter = 0;

  /** Reactive snapshot of the current background config. */
  readonly background = this._background.asReadonly();

  /** Reactive snapshot of the current page (paper) config. */
  readonly page = this._page.asReadonly();

  /** Reactive snapshot of the current grid config. */
  readonly grid = this._grid.asReadonly();

  /** Reactive snapshot of the rulers config. */
  readonly rulers = this._rulers.asReadonly();

  /** Reactive snapshot of the user-drawn guides. */
  readonly guides = this._guides.asReadonly();

  /**
   * Reactive snapshot of canvas-interaction prefs (currently just
   * wheel-zoom speed). Consumed by `SvgeCanvasGestures` to compute
   * the effective zoom factor per wheel event.
   */
  readonly interaction = this._interaction.asReadonly();

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

  // ── Page ────────────────────────────────────────────────────────

  /**
   * Update page settings. Partial — only the fields provided are
   * overwritten. Invalid dims (non-finite, ≤ 0) are silently rejected
   * field-by-field so UIs can patch incrementally without try/catch.
   */
  patchPage(patch: Partial<PageConfig>): void {
    const current = this._page();
    const width = isPositiveFinite(patch.width) ? patch.width! : current.width;
    const height = isPositiveFinite(patch.height) ? patch.height! : current.height;
    const orientation = patch.orientation ?? current.orientation;
    const margins = patch.margins
      ? {
          top: isNonNegFinite(patch.margins.top) ? patch.margins.top : current.margins.top,
          right: isNonNegFinite(patch.margins.right) ? patch.margins.right : current.margins.right,
          bottom: isNonNegFinite(patch.margins.bottom)
            ? patch.margins.bottom
            : current.margins.bottom,
          left: isNonNegFinite(patch.margins.left) ? patch.margins.left : current.margins.left,
        }
      : current.margins;
    const next: PageConfig = { width, height, orientation, margins };
    if (samePage(current, next)) return;
    this._page.set(next);
  }

  resetPage(): void {
    this._page.set(DEFAULT_PAGE);
  }

  // ── Grid ────────────────────────────────────────────────────────

  /**
   * Patch grid config. Invalid fields (spacing ≤ 0, majorEvery ≤ 0)
   * are silently rejected — same policy as `patchPage`.
   */
  patchGrid(patch: Partial<GridConfig>): void {
    const current = this._grid();
    const enabled = patch.enabled ?? current.enabled;
    const spacing = isPositiveFinite(patch.spacing) ? patch.spacing! : current.spacing;
    const majorEvery = isPositiveInt(patch.majorEvery) ? patch.majorEvery! : current.majorEvery;
    const color =
      typeof patch.color === 'string' && patch.color.length > 0 ? patch.color : current.color;
    const next: GridConfig = { enabled, spacing, majorEvery, color };
    if (sameGrid(current, next)) return;
    this._grid.set(next);
  }

  toggleGrid(): void {
    this.patchGrid({ enabled: !this._grid().enabled });
  }

  resetGrid(): void {
    this._grid.set(DEFAULT_GRID);
  }

  // ── Rulers ──────────────────────────────────────────────────────

  setRulersEnabled(enabled: boolean): void {
    if (this._rulers().enabled === enabled) return;
    this._rulers.set({ enabled });
  }

  toggleRulers(): void {
    this.setRulersEnabled(!this._rulers().enabled);
  }

  // ── Guides ──────────────────────────────────────────────────────

  /**
   * Add a guide line at the given position. Returns the generated id
   * so callers can remove or update it later. Invalid (non-finite)
   * positions are silently rejected (returns null).
   */
  addGuide(axis: 'h' | 'v', position: number): string | null {
    if (!Number.isFinite(position)) return null;
    this.guideCounter += 1;
    const id = `guide-${this.guideCounter}`;
    this._guides.set([...this._guides(), { id, axis, position }]);
    return id;
  }

  /** Update the position of an existing guide. No-op if id missing. */
  moveGuide(id: string, position: number): void {
    if (!Number.isFinite(position)) return;
    const next = this._guides().map((g) => (g.id === id ? { ...g, position } : g));
    if (next === this._guides()) return;
    this._guides.set(next);
  }

  /** Remove a guide by id. No-op if id missing. */
  removeGuide(id: string): void {
    const filtered = this._guides().filter((g) => g.id !== id);
    if (filtered.length === this._guides().length) return;
    this._guides.set(filtered);
  }

  clearGuides(): void {
    if (this._guides().length === 0) return;
    this._guides.set([]);
  }

  // ── Interaction ─────────────────────────────────────────────────

  /**
   * Patch interaction config (partial). Currently only `wheelZoomSpeed`
   * is defined; out-of-range values are clamped to
   * `[WHEEL_ZOOM_SPEED_MIN, WHEEL_ZOOM_SPEED_MAX]`. Non-integer values
   * are rounded.
   */
  patchInteraction(patch: Partial<InteractionConfig>): void {
    const current = this._interaction();
    let wheelZoomSpeed = current.wheelZoomSpeed;
    if (typeof patch.wheelZoomSpeed === 'number' && Number.isFinite(patch.wheelZoomSpeed)) {
      wheelZoomSpeed = Math.max(
        WHEEL_ZOOM_SPEED_MIN,
        Math.min(WHEEL_ZOOM_SPEED_MAX, Math.round(patch.wheelZoomSpeed)),
      );
    }
    if (wheelZoomSpeed === current.wheelZoomSpeed) return;
    this._interaction.set({ wheelZoomSpeed });
  }

  resetInteraction(): void {
    this._interaction.set(DEFAULT_INTERACTION);
  }
}

function isPositiveFinite(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isNonNegFinite(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function isPositiveInt(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && Number.isInteger(n);
}

function samePage(a: PageConfig, b: PageConfig): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.orientation === b.orientation &&
    a.margins.top === b.margins.top &&
    a.margins.right === b.margins.right &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left
  );
}

function sameGrid(a: GridConfig, b: GridConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.spacing === b.spacing &&
    a.majorEvery === b.majorEvery &&
    a.color === b.color
  );
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
