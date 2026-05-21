import { type Injector, type Signal, computed } from '@angular/core';
import type { MenuContribution, MenuContributionContext } from './menu-contribution';

/**
 * Helpers shared by `<svge-menu-bar>`, `<svge-toolbar>`,
 * `<svge-context-menu>` (and any custom consumer) so the per-fire
 * context wiring (D-043 fix) is implemented **once** instead of being
 * duplicated and drifting between components.
 *
 * Two helpers are exposed:
 *
 * - {@link resolveDisabledSignal}: turns a contribution's `disabled`
 *   field (which may be `null`, a raw `Signal<boolean>`, or a
 *   factory `(injector) => Signal<boolean>`) into a single
 *   `Signal<boolean>` for the consumer's injector. Memoization is
 *   the caller's responsibility (see {@link makeDisabledResolver}).
 * - {@link runContribution}: invokes `run()` with the per-fire
 *   `MenuContributionContext` so handlers that opt into lazy service
 *   resolution hit the consumer's scope.
 *
 * **Why a shared helper**: D-040/D-042 taught us that consumer
 * components implementing the dispatch contract by hand drift apart
 * (each component re-implements the resolver, easy to forget memoize,
 * easy to forget the `divider` guard). Centralizing keeps the
 * contract consistent across surfaces.
 */

/**
 * Always-false signal used as the "never disabled" sentinel. Reused
 * instead of re-creating per call to keep CD cheap.
 */
const ALWAYS_ENABLED: Signal<boolean> = computed(() => false);

/**
 * Resolve a contribution's `disabled` to a `Signal<boolean>` using
 * `injector` (consumer's). Factory form runs once here; the caller
 * should memoize the returned signal per contribution id so the
 * factory doesn't run on every change-detection cycle.
 *
 * **Contract for handlers**:
 * - `disabled == null` → never disabled.
 * - `disabled` is a `Signal<boolean>` → use as-is (root-scoped by
 *   the plugin author; valid for single-editor apps).
 * - `disabled` is a factory → call with the consumer's injector to
 *   produce a scope-aware signal.
 */
export function resolveDisabledSignal(
  contribution: MenuContribution,
  injector: Injector,
): Signal<boolean> {
  const d = contribution.disabled;
  if (d == null) return ALWAYS_ENABLED;
  // Both `Signal<boolean>` (a 0-arg callable) and the factory form
  // `(injector) => Signal<boolean>` (1-arg) are typeof "function".
  // Discriminate by declared arity: factories take 1 arg, signals
  // take 0. `Function.length` returns the declared parameter count,
  // which is stable across runtime.
  if (typeof d === 'function' && d.length > 0) {
    return (d as (i: Injector) => Signal<boolean>)(injector);
  }
  return d as Signal<boolean>;
}

/**
 * Build a memoizing resolver bound to one consumer's injector. Each
 * UI component (`<svge-menu-bar>`, etc.) creates one resolver in its
 * constructor and calls `resolver(item)` from the template — the
 * factory runs **once** per contribution id, even if the template
 * re-renders many times.
 *
 * **Why memoize**: factory-style `disabled` resolvers call
 * `injector.get(SomeService)` and wrap the result in `computed(...)`.
 * Calling that from the template every CD cycle would create a fresh
 * signal each time (waste) and risk leaking via repeated subscriptions.
 */
export function makeDisabledResolver(
  injector: Injector,
): (contribution: MenuContribution) => Signal<boolean> {
  const cache = new Map<string, Signal<boolean>>();
  return (contribution) => {
    const cached = cache.get(contribution.id);
    if (cached !== undefined) return cached;
    const sig = resolveDisabledSignal(contribution, injector);
    cache.set(contribution.id, sig);
    return sig;
  };
}

/**
 * Invoke a contribution's `run()` with the per-fire context. Skips
 * dividers (per the interface contract — `run` MUST NOT be called for
 * dividers). Returns `void` like the contract.
 */
export function runContribution(contribution: MenuContribution, injector: Injector): void {
  if (contribution.divider === true) return;
  const ctx: MenuContributionContext = { injector };
  contribution.run(ctx);
}
