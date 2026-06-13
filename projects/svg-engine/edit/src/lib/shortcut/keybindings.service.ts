import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  comboMatches,
  parseCombo,
  type ParsedCombo,
  type Shortcut,
  validateCombo,
} from './shortcut';
import { ShortcutRegistry } from './shortcut-registry.service';

/** localStorage slot for the user's keybinding overrides (versioned). */
const KEYBINDINGS_STORAGE_KEY = 'svge:keybindings:v1';

/**
 * A user override map — `id → combo`. A `null` value means the command
 * is **explicitly unbound** (no keyboard shortcut), which is distinct
 * from "absent" (use the registered default). Persisted verbatim as JSON.
 */
export type KeybindingOverrides = Readonly<Record<string, string | null>>;

/**
 * One row in the keyboard-shortcuts manager — a registered command plus
 * its resolved (effective) binding and conflict status. Built reactively
 * by {@link KeybindingsService.bindings}.
 */
export interface KeybindingView {
  /** Stable command id (the {@link Shortcut.id}). */
  readonly id: string;
  /** Human-readable label (`Shortcut.description ?? id`). */
  readonly description: string;
  /** Grouping label for the UI (`Shortcut.category ?? 'Other'`). */
  readonly category: string;
  /** The originally-registered combo (what "Reset" restores). */
  readonly defaultCombo: string;
  /** Effective combo — override if any, else default. `null` = unbound. */
  readonly combo: string | null;
  /** `true` when the user changed this binding (rebound OR unbound). */
  readonly isCustom: boolean;
  /** `true` when the effective binding is "no shortcut". */
  readonly isUnbound: boolean;
  /** `true` when another command shares this exact effective combo. */
  readonly conflict: boolean;
}

/**
 * **D-087** — central command + keyboard-shortcut manager. The single
 * source of truth for "which key fires which command", layering **user
 * overrides** on top of the registered {@link ShortcutRegistry} defaults
 * and persisting them to `localStorage`.
 *
 * **Why a service distinct from the registry**: `ShortcutRegistry` holds
 * the *defaults* contributed by plugins (immutable bindings + handlers).
 * Customization is a separate, app-wide **user preference** — it must
 * survive plugin re-registration and apply identically across editors.
 * So overrides live here (global, `providedIn: 'root'`, one localStorage
 * key) while the registry stays the catalog of commands + their factory
 * bindings.
 *
 * **Dispatch integration**: {@link ShortcutService} routes keydown events
 * through {@link tryMatch} (not the registry directly), so a rebind takes
 * effect immediately. With **no** overrides, `tryMatch` is behaviourally
 * identical to `ShortcutRegistry.tryMatch` (effective = default).
 *
 * **Conflict policy** mirrors VSCode: two commands MAY share a combo
 * (the registry allows it — disambiguated by `when` guards + insertion
 * order). The manager surfaces a soft warning (`conflict: true`) so the
 * user notices, but never blocks the save.
 */
@Injectable({ providedIn: 'root' })
export class KeybindingsService {
  private readonly registry = inject(ShortcutRegistry);
  private readonly document = inject(DOCUMENT);

  /** Writable override map; public reads go through {@link overrides}. */
  private readonly _overrides = signal<KeybindingOverrides>({});
  /** Reactive view of the raw override map (mostly for tests / debug). */
  readonly overrides = this._overrides.asReadonly();

  constructor() {
    this._overrides.set(this.load());
  }

  // ── Reactive views ─────────────────────────────────────────────────

  /**
   * Pre-parsed effective bindings for dispatch. Recomputes only when the
   * registry's shortcut set OR the override map changes — NOT per
   * keydown — so {@link tryMatch} stays allocation-free at event time.
   * Unbound (`null`) and unparseable overrides are excluded.
   */
  private readonly effectiveEntries = computed<
    readonly { readonly shortcut: Shortcut; readonly parsed: ParsedCombo }[]
  >(() => {
    const overrides = this._overrides();
    const out: { shortcut: Shortcut; parsed: ParsedCombo }[] = [];
    for (const shortcut of this.registry.shortcuts()) {
      const combo = this.effectiveCombo(shortcut, overrides);
      if (combo === null || combo.length === 0) continue;
      let parsed: ParsedCombo;
      try {
        parsed = parseCombo(combo);
      } catch {
        // A corrupt override (hand-edited localStorage) shouldn't break
        // dispatch — skip it; the default stays unreachable until reset.
        continue;
      }
      out.push({ shortcut, parsed });
    }
    return out;
  });

  /**
   * The manager's table model: one {@link KeybindingView} per registered
   * command, sorted by category then description, with conflict flags.
   */
  readonly bindings = computed<readonly KeybindingView[]>(() => {
    const overrides = this._overrides();
    const shortcuts = this.registry.shortcuts();
    // Count effective combos once for conflict detection.
    const comboCounts = new Map<string, number>();
    for (const s of shortcuts) {
      const c = this.effectiveCombo(s, overrides);
      if (c === null || c.length === 0) continue;
      comboCounts.set(c, (comboCounts.get(c) ?? 0) + 1);
    }
    const views = shortcuts.map<KeybindingView>((s) => {
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides, s.id);
      const effective = hasOverride ? overrides[s.id]! : s.combo;
      const isUnbound = effective === null || effective.length === 0;
      const combo = isUnbound ? null : effective;
      return {
        id: s.id,
        description: s.description ?? s.id,
        category: s.category ?? 'Other',
        defaultCombo: s.combo,
        combo,
        isCustom: hasOverride,
        isUnbound,
        conflict: combo !== null && (comboCounts.get(combo) ?? 0) > 1,
      };
    });
    return [...views].sort((a, b) =>
      a.category !== b.category
        ? a.category.localeCompare(b.category)
        : a.description.localeCompare(b.description),
    );
  });

  /** `true` when at least one command has a user override (rebind/unbind). */
  readonly hasCustomizations = computed(() => Object.keys(this._overrides()).length > 0);

  // ── Dispatch ───────────────────────────────────────────────────────

  /**
   * Find the first command whose **effective** combo matches `event` and
   * whose `when` guard is active. Drop-in replacement for
   * `ShortcutRegistry.tryMatch` that honours user overrides.
   */
  tryMatch(event: KeyboardEvent): Shortcut | null {
    for (const entry of this.effectiveEntries()) {
      if (!comboMatches(entry.parsed, event)) continue;
      const guard = entry.shortcut.when;
      if (guard != null && !guard()) continue;
      return entry.shortcut;
    }
    return null;
  }

  // ── Mutations (persisted) ──────────────────────────────────────────

  /**
   * Rebind `id` to `combo`. Validates the combo first (returns the parse
   * error without mutating on failure). Setting a combo equal to the
   * command's default clears the override (keeps the stored map minimal
   * and `isCustom` honest).
   */
  setBinding(id: string, combo: string): { readonly ok: boolean; readonly error?: string } {
    const v = validateCombo(combo);
    if (!v.ok) return v;
    const def = this.registry.get(id)?.combo ?? null;
    this._overrides.update((o) => {
      const next = { ...o };
      if (def !== null && combo === def) delete next[id];
      else next[id] = combo;
      return next;
    });
    this.save();
    return { ok: true };
  }

  /** Explicitly unbind `id` (no shortcut) — distinct from reset-to-default. */
  unbind(id: string): void {
    this._overrides.update((o) => ({ ...o, [id]: null }));
    this.save();
  }

  /** Drop `id`'s override, restoring its registered default combo. */
  resetBinding(id: string): void {
    this._overrides.update((o) => {
      if (!Object.prototype.hasOwnProperty.call(o, id)) return o;
      const next = { ...o };
      delete next[id];
      return next;
    });
    this.save();
  }

  /** Clear every override — restores all commands to their defaults. */
  resetAll(): void {
    this._overrides.set({});
    this.save();
  }

  // ── Queries ────────────────────────────────────────────────────────

  /** Validate a combo string without mutating (for live UI feedback). */
  validate(combo: string): { readonly ok: boolean; readonly error?: string } {
    return validateCombo(combo);
  }

  /**
   * Ids of OTHER commands whose effective combo equals `combo` — used by
   * the manager to warn before saving a rebind that collides. Pass
   * `excludeId` to ignore the command being edited.
   */
  conflictIdsFor(combo: string, excludeId?: string): readonly string[] {
    if (combo.length === 0) return [];
    const overrides = this._overrides();
    const out: string[] = [];
    for (const s of this.registry.shortcuts()) {
      if (s.id === excludeId) continue;
      if (this.effectiveCombo(s, overrides) === combo) out.push(s.id);
    }
    return out;
  }

  // ── Internals ──────────────────────────────────────────────────────

  /** Effective combo for a shortcut given the current overrides. */
  private effectiveCombo(shortcut: Shortcut, overrides: KeybindingOverrides): string | null {
    return Object.prototype.hasOwnProperty.call(overrides, shortcut.id)
      ? overrides[shortcut.id]!
      : shortcut.combo;
  }

  private load(): KeybindingOverrides {
    const win = this.window();
    if (win === null) return {};
    try {
      const raw = win.localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (raw === null || raw.length === 0) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' || v === null) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  private save(): void {
    const win = this.window();
    if (win === null) return;
    try {
      win.localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(this._overrides()));
    } catch (e) {
      console.warn('KeybindingsService: persist failed —', e);
    }
  }

  /** Cross-env window accessor — null in SSR / privacy modes. */
  private window(): (Window & typeof globalThis) | null {
    const docWindow = this.document.defaultView;
    if (docWindow !== null) {
      try {
        if (typeof docWindow.localStorage !== 'undefined') {
          return docWindow as Window & typeof globalThis;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}
