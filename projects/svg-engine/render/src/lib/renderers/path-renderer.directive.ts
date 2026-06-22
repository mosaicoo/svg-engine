import { computed, Directive, input } from '@angular/core';
import { type PathNode, roundPathCorners } from 'svg-engine/core';

/**
 * Apply to `<svg:path>` to bind attributes from a {@link PathNode}.
 *
 * **D-055 (Live Corners)**: when `node.cornerRadius > 0`, the
 * rendered `d` is the result of {@link roundPathCorners}(authored d,
 * radius) — sharp interior vertices get smoothly rounded with that
 * radius. Authored `d` is left untouched (preserved on the model
 * for later edits / radius slider changes). When `cornerRadius` is
 * `0` or `undefined`, the authored `d` is emitted verbatim — same
 * behavior as before D-055.
 *
 * **D-068 follow-up — `id` host binding**: paths are the only shape
 * type a `<textPath href="#…">` (D-053) can reference, so the path
 * needs a DOM `id` matching `node.id`. Without this, `textPathRef` set
 * by the Inspector resolves to no element and the text silently
 * disappears (bbox in place, zero characters painted). The wrapper
 * `<g>` already carries `data-node-id` for selection lookup, but
 * `data-*` doesn't satisfy `#id` href lookups — only the standard
 * `id` attribute does. Cost is one attribute per path, negligible.
 * No collision risk because `NodeId`s are UUIDs (globally unique
 * across documents and editors). If a future use-case wants to opt
 * out of paint-target ids, gate this behind a flag — keeping it
 * unconditional makes textPath, future `<use href>` fallbacks, and
 * DOM inspector debugging all easier.
 */
@Directive({
  selector: '[svgePath]',
  standalone: true,
  host: {
    '[attr.id]': 'node().id',
    '[attr.d]': 'effectiveD()',
    '[attr.fill]': 'node().style.fill ?? null',
    '[attr.fill-rule]': 'node().style.fillRule ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.stroke-linecap]': 'node().style.strokeLinecap ?? null',
    '[attr.stroke-linejoin]': 'node().style.strokeLinejoin ?? null',
    '[attr.stroke-miterlimit]': 'node().style.strokeMiterlimit ?? null',
    '[attr.stroke-dasharray]': 'node().style.strokeDasharray?.join(" ") ?? null',
    '[attr.stroke-dashoffset]': 'node().style.strokeDashoffset ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.fill-opacity]': 'node().style.fillOpacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    '[attr.filter]': 'node().style.filter ?? null',
    // D-099 — respect node vector-effect; default non-scaling (resize-safe).
    '[attr.vector-effect]': 'node().style.vectorEffect ?? "non-scaling-stroke"',
  },
})
export class SvgePathDirective {
  readonly node = input.required<PathNode>({ alias: 'svgePath' });

  // D-055 — Live Corners. Memoized via signal: recomputes only when
  // node().d or node().cornerRadius actually changes. roundPathCorners
  // is O(N) per anchor + short-circuits the no-op case (radius=0 or
  // zero sharp corners), so the worst-case is one parse+emit per
  // path edit — negligible at typical path sizes.
  protected readonly effectiveD = computed(() => {
    const n = this.node();
    const r = n.cornerRadius ?? 0;
    if (r <= 0) return n.d;
    return roundPathCorners(n.d, r);
  });
}
