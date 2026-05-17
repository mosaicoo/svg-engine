import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

/**
 * Theme variants supported by the editor (D-012 part 2 — Bloco 4i).
 *
 * - `'system'` (default): follows the OS `prefers-color-scheme` media
 *   query. Switches reactively when the user changes their system
 *   preference (e.g., Mac dynamic mode).
 * - `'light'`: explicit light theme — overrides the system pref.
 * - `'dark'`: explicit dark theme — overrides the system pref.
 *
 * Stored in `localStorage` under {@link STORAGE_KEY} so the user's
 * choice survives page reloads. Consumers without a persistent
 * `localStorage` (e.g., SSR pre-render) safely fall back to
 * `'system'` — the service detects + handles `'undefined'` env.
 */
export type Theme = 'system' | 'light' | 'dark';

/**
 * Effective resolved variant — what's actually applied to the DOM.
 * `'system'` is resolved to `'light'` or `'dark'` based on the
 * current media query.
 */
export type ResolvedTheme = 'light' | 'dark';

/** Key used in localStorage to persist the user's preference. */
export const STORAGE_KEY = 'svge.theme';

/**
 * Theme manager — keeps the chosen {@link Theme}, persists it, and
 * applies the resolved variant to `<html data-theme="...">`.
 *
 * **Why `data-theme` on `<html>`** (and not a CSS class on `<body>`):
 * Material 3 + Tailwind both pick up `[data-theme="dark"]` selectors
 * cleanly, and putting the attribute on `<html>` makes it available
 * to CSS variables before `<body>` even renders — no flash-of-unstyled-
 * content on first paint.
 *
 * Effect-driven write: a single Angular `effect()` watches the
 * resolved theme and reflects it to the DOM. Bypasses change-
 * detection cycles and works whether the change came from a toggle,
 * a system pref change, or a `setTheme()` call.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly _theme = signal<Theme>(loadInitialTheme());
  private readonly _systemPrefersDark = signal<boolean>(detectSystemDark());

  /** Reactive snapshot of the user's chosen variant. */
  readonly theme = this._theme.asReadonly();

  /** The variant actually applied to the DOM (`'system'` resolved). */
  readonly resolved = computed<ResolvedTheme>(() => {
    const t = this._theme();
    if (t === 'system') return this._systemPrefersDark() ? 'dark' : 'light';
    return t;
  });

  private mediaQuery: MediaQueryList | null = null;
  private readonly mqListener = (e: MediaQueryListEvent | MediaQueryList): void => {
    this._systemPrefersDark.set(e.matches);
  };

  constructor() {
    this.subscribeSystemPrefs();
    // Effect: reflect resolved theme to <html data-theme="...">
    effect(() => {
      const resolved = this.resolved();
      const html = this.document.documentElement;
      if (html !== null) html.setAttribute('data-theme', resolved);
    });
  }

  /** Set the user's preference + persist to localStorage. */
  setTheme(theme: Theme): void {
    if (this._theme() === theme) return;
    this._theme.set(theme);
    saveTheme(theme);
  }

  /**
   * Cycle through `light → dark → system → light → ...`. Convenience
   * for a single-button toggle UI; consumers wanting an explicit
   * picker can call `setTheme()` directly.
   */
  cycle(): void {
    const next: Theme =
      this._theme() === 'light' ? 'dark' : this._theme() === 'dark' ? 'system' : 'light';
    this.setTheme(next);
  }

  private subscribeSystemPrefs(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    // Modern + fallback (older Safari uses `addListener`)
    if (typeof this.mediaQuery.addEventListener === 'function') {
      this.mediaQuery.addEventListener('change', this.mqListener as (e: Event) => void);
    } else if (
      typeof (
        this.mediaQuery as MediaQueryList & {
          addListener?: (l: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener === 'function'
    ) {
      (
        this.mediaQuery as MediaQueryList & {
          addListener: (l: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener(this.mqListener);
    }
  }
}

function loadInitialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Storage may be blocked (privacy mode, sandbox iframe) — silently
    // fall back to system.
  }
  return 'system';
}

function saveTheme(theme: Theme): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Same fallback as loadInitialTheme.
  }
}

function detectSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
