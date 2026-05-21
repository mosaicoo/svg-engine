import type { Injector, Signal } from '@angular/core';

/**
 * Per-fire context passed to {@link Shortcut.run} — **D-042** addition.
 *
 * Lets handlers resolve services from the **active editor's injector**
 * rather than from a closure captured at plugin install time. Critical
 * for multi-editor apps using {@link provideSvgEngineEditorScope}: a
 * Ctrl+Z handler must dispatch to **this editor's** `CommandBus`, not
 * to the root one.
 *
 * **Fields**:
 * - `injector`: the {@link Injector} of the dispatching `ShortcutService`.
 *   In a route-scoped editor, that's the per-editor injector. In a
 *   single-editor app (no scope helper), that's the root injector —
 *   equivalent to the closure-capture pattern.
 *
 * **Backward compatibility**: handlers that don't take `ctx` continue
 * to work (TypeScript widens the function type). They just won't be
 * multi-editor-safe — they'll always hit the closure-captured services
 * regardless of which editor fired the keystroke. Single-editor apps
 * remain functionally identical.
 */
export interface ShortcutContext {
  readonly injector: Injector;
}

/**
 * A keyboard shortcut binding — categoria 9 parte 2 do D-023.
 * Stored in {@link ShortcutRegistry} and dispatched by
 * {@link ShortcutService}.
 *
 * **Fields**:
 * - `id`: stable unique identifier across the registry. Reverse-DNS
 *   recommended for plugin contributions.
 * - `combo`: canonical key combination string. See
 *   {@link parseCombo} / {@link comboMatches} for the accepted forms
 *   and matching semantics. Example: `'Ctrl+G'`, `'Cmd+Shift+G'`,
 *   `'Alt+ArrowUp'`, `'g'`.
 * - `when`: optional reactive guard. When `false`, the shortcut is
 *   silently ignored (other matching shortcuts may still fire). When
 *   `null` / `undefined`, always active.
 * - `description`: human-readable description for preferences UIs.
 *   Optional; falls back to `id` in display contexts.
 * - `run(event, ctx?)`: handler. Receives the original `KeyboardEvent`
 *   so the implementation can `preventDefault()` if needed (the service
 *   doesn't auto-prevent — leaves the choice to the shortcut). The
 *   second argument is a {@link ShortcutContext} carrying the active
 *   editor's `Injector` — used to resolve services lazily in
 *   multi-editor apps (D-042). Handlers that don't take `ctx` keep
 *   working in single-editor apps.
 */
export interface Shortcut {
  readonly id: string;
  readonly combo: string;
  readonly when?: Signal<boolean> | null;
  readonly description?: string;
  run(event: KeyboardEvent, ctx?: ShortcutContext): void;
}

/**
 * Internal canonical form of a parsed combo. Modifiers are booleans
 * (avoids set-mutation costs at match time); `key` is the **printable**
 * key or named key from `KeyboardEvent.key`, lowercased for printable
 * single chars (so `Ctrl+G` matches whether shift is held or not — same
 * as VSCode/Figma convention; modifier presence is explicit).
 *
 * **`meta` matching**: on macOS the convention is to use `Cmd` (= meta);
 * on Windows / Linux it's `Ctrl`. The accept-either alias `'CmdOrCtrl'`
 * is documented in {@link parseCombo}; users typing `Cmd+G` on Windows
 * still match (we don't enforce OS — keep cross-platform behavior).
 */
export interface ParsedCombo {
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  /** Lowercased printable key OR named key like `'arrowup'`, `'escape'`. */
  readonly key: string;
}

/**
 * Parse a combo string into its canonical form. Tokens are separated
 * by `+`, case-insensitive. Recognized modifier tokens:
 *
 * - `Ctrl` / `Control`
 * - `Shift`
 * - `Alt` / `Option`
 * - `Cmd` / `Meta` / `Win` — matches `meta`
 * - `CmdOrCtrl` — matches EITHER `meta` (Mac) OR `ctrl` (other) —
 *   useful for OS-agnostic shortcuts. Parsed to a special flag that
 *   {@link comboMatches} handles by checking `ctrl || meta`.
 *
 * The LAST token is the key (e.g., `g`, `ArrowUp`, `Escape`, `F5`).
 * Names match `KeyboardEvent.key` semantics:
 * - Printable single-char keys are lowercased (`g`, `1`, `/`)
 * - Named keys keep their canonical form lowercased
 *   (`arrowup`, `escape`, `enter`, `f5`, `space`)
 *
 * Throws on empty input, missing key, or unknown modifier tokens —
 * configuration errors should fail loud.
 */
export function parseCombo(combo: string): ParsedCombo {
  const raw = combo.trim();
  if (raw.length === 0) throw new Error('parseCombo: combo string is empty');
  const tokens = raw.split('+').map((t) => t.trim());
  if (tokens.some((t) => t.length === 0)) {
    throw new Error(`parseCombo: invalid combo "${combo}" (empty token between '+')`);
  }
  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  let cmdOrCtrl = false;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i]!.toLowerCase();
    switch (t) {
      case 'ctrl':
      case 'control':
        ctrl = true;
        break;
      case 'shift':
        shift = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      case 'cmd':
      case 'meta':
      case 'win':
        meta = true;
        break;
      case 'cmdorctrl':
        cmdOrCtrl = true;
        break;
      default:
        throw new Error(`parseCombo: unknown modifier "${tokens[i]}" in combo "${combo}"`);
    }
  }
  const keyToken = tokens[tokens.length - 1]!;
  // Normalize: printable single-char lowercased; named keys lowercased too.
  const key = keyToken.length === 1 ? keyToken.toLowerCase() : keyToken.toLowerCase();
  return {
    ctrl: cmdOrCtrl ? false : ctrl,
    shift,
    alt,
    meta: cmdOrCtrl ? false : meta,
    // CmdOrCtrl flag encoded by setting BOTH ctrl and meta false here +
    // a sentinel in `key`. We use a side-channel field instead to keep
    // the type clean: re-emit the parsed combo's matcher with a custom
    // predicate. Implementation lives in `comboMatches`.
    ...(cmdOrCtrl ? { __cmdOrCtrl: true as const } : {}),
    key,
  } as ParsedCombo & { readonly __cmdOrCtrl?: true };
}

/**
 * Test whether a `KeyboardEvent` matches a parsed combo. The match
 * requires EXACT modifier set (so `Ctrl+G` does NOT match `Ctrl+Shift+G`)
 * unless the combo was parsed with `CmdOrCtrl` (in which case `ctrl`
 * OR `meta` satisfies that bit).
 *
 * Key comparison uses `event.key` lowercased — handles letters,
 * digits, punctuation, and named keys uniformly.
 */
export function comboMatches(parsed: ParsedCombo, event: KeyboardEvent): boolean {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  if (eventKey !== parsed.key) return false;
  // CmdOrCtrl: accept either modifier present.
  const isCmdOrCtrl = (parsed as ParsedCombo & { __cmdOrCtrl?: true }).__cmdOrCtrl === true;
  if (isCmdOrCtrl) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else {
    if (event.ctrlKey !== parsed.ctrl) return false;
    if (event.metaKey !== parsed.meta) return false;
  }
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  return true;
}
