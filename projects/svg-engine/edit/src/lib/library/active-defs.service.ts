import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService } from '@mosaicoo/svg-engine/core';

import { ChainFilterRegistry } from '../effect/chain-filter';
import { ParametricEffectRegistry } from '../effect/effect-instance';
import { EffectRegistry } from '../effect/effect-registry.service';
import { ActiveClipPathsService } from './clip-paths/clip-path-library.service';
import { ActiveGradientsService } from './gradients/gradient-library.service';
import { ActiveMasksService } from './masks/mask-library.service';
import { ActivePatternsService } from './patterns/pattern-library.service';
import { ActiveSymbolsService } from './symbols/symbol-library.service';

/**
 * **D-058 export fix** — central composition of the `<defs>` fragment
 * for the current editor. Single source of truth for which defs
 * should accompany the current document, used by:
 *
 * 1. **Renderer shells** (`<svge-editor>`, `<svge-shell-pro>`,
 *    `<custom-editor>`) — feed this to `<svge-renderer [defs]>` so
 *    `url(#id)` references on nodes resolve at paint time.
 * 2. **Exporter** (`exportAndDownload` in
 *    `builtin-menu-contributions.plugin`) — merges this with
 *    `document.defs` BEFORE calling `svgExporter.export()` so the
 *    exported `.svg` is visually identical to the canvas.
 *
 * **Pre-existing bug fixed**: before this service existed, each
 * consumer hand-rolled the composition (editor.component had a
 * `resolvedDefs` computed reading 6 sub-services). The exporter
 * NEVER did this — it just passed `state.document()` straight to
 * `svgExporter`, so user-added gradients/patterns/clipPaths/masks/
 * effects/chains were dropped from the export. Shapes with
 * `fill="url(#id)"` came out transparent in the exported file
 * because the gradient definition wasn't there to resolve. Now both
 * paths share this service.
 *
 * **Composition order** (matters for `url(#id)` resolution — later
 * defs override earlier ones with the same id; SVG spec uses the
 * first-encountered occurrence, so we put round-trip imports first
 * and runtime-derived defs after):
 *
 * 1. `document.defs` — verbatim pass-through of imported `<defs>`
 *    (handled by the consumer that calls `buildDefs()` — see method
 *    JSDoc for the merge pattern).
 * 2. `EffectRegistry.buildAllFiltersMarkup()` — `<filter>` per
 *    registered effect.
 * 3. `ChainFilterRegistry.buildAllChainsMarkup()` — composed
 *    `<filter>` per chain referenced in the doc.
 * 4. `ActiveGradientsService.buildAllActiveGradientsMarkup()` —
 *    `<linearGradient>` / `<radialGradient>` per gradient used.
 * 5. `ActivePatternsService.buildAllActivePatternsMarkup()` —
 *    `<pattern>` per pattern used.
 * 6. `ActiveClipPathsService.buildAllActiveClipPathsMarkup()` —
 *    `<clipPath>` per clip used.
 * 7. `ActiveMasksService.buildAllActiveMasksMarkup()` —
 *    `<mask>` per mask used.
 *
 * **Why a service instead of a pure function**: each source is a
 * route-scoped service that reads the active editor's state. A
 * function would have to take 6 services as args; a service auto-
 * resolves them from the consumer's injector. Multi-editor safe
 * (D-042) — provided via `provideSvgEngineEditorScope()` so each
 * editor instance composes its own defs from its own state.
 */
@Injectable({ providedIn: 'root' })
export class ActiveDefsService {
  // Scoped editor state — lets `buildExportDefs` scan the document for
  // which effect filters are actually referenced (export prunes unused
  // filters; the live `composed()` keeps injecting all of them).
  private readonly state = inject(EditorStateService);
  private readonly effects = inject(EffectRegistry);
  private readonly chains = inject(ChainFilterRegistry);
  // D-118 — parametric effect instances (custom param values encoded in
  // the style.filter URL). Derived from the document like chains.
  private readonly parametric = inject(ParametricEffectRegistry);
  private readonly gradients = inject(ActiveGradientsService);
  private readonly patterns = inject(ActivePatternsService);
  private readonly clipPaths = inject(ActiveClipPathsService);
  private readonly masks = inject(ActiveMasksService);
  // D-059 — symbols added to the active-defs composition. Same
  // pattern: per-editor service derives <symbol> markup from
  // SymbolUseNode references in the document.
  private readonly symbols = inject(ActiveSymbolsService);

  /**
   * Reactive composed defs for the runtime renderer. Recomputes when
   * any source signal changes (effect registrations, chain updates,
   * gradient catalog edits, document mutations that change which
   * defs are "active"). Returns `null` when every source is empty
   * (renderer can skip the `<defs>` block entirely — zero overhead
   * when no defs in use).
   *
   * **Does NOT include `document.defs`** — that's a static field on
   * the document, not a signal source. Consumers compose:
   *
   * ```ts
   * const docDefs = state.document().defs ?? '';
   * const dynamic = activeDefsSvc.composed();
   * const merged = [docDefs, dynamic ?? '']
   *   .filter((s) => s.length > 0).join('\n');
   * ```
   */
  readonly composed = computed<string | null>(() => {
    const parts = [
      this.effects.buildAllFiltersMarkup(),
      this.chains.buildAllChainsMarkup(),
      this.parametric.buildAllInstancesMarkup(),
      this.gradients.buildAllActiveGradientsMarkup(),
      this.patterns.buildAllActivePatternsMarkup(),
      this.clipPaths.buildAllActiveClipPathsMarkup(),
      this.masks.buildAllActiveMasksMarkup(),
      this.symbols.buildAllActiveSymbolsMarkup(),
    ].filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join('\n') : null;
  });

  /**
   * Build the FULL defs string suitable for export — concatenates
   * `document.defs` (if any) with the dynamic composed defs.
   *
   * Used by `exportAndDownload` (and other exporters) before calling
   * `svgExporter.export()`: replace `doc.defs` with this value so
   * the exported SVG carries everything that was painted on the
   * canvas. Without this, `fill="url(#id)"` references would land in
   * the exported file with no matching `<linearGradient>` /
   * `<pattern>` / `<filter>` definition — shapes would render
   * transparent or unfiltered when viewed outside the editor.
   */
  buildExportDefs(documentDefs: string | undefined): string {
    const docDefs = documentDefs ?? '';
    // Same composition as `composed()` EXCEPT the effects part is pruned
    // to the filters actually referenced by the document. The renderer
    // injects every registered filter (instant effect apply); an
    // exported file should only carry what it uses — consistent with the
    // already-pruned gradients / patterns / clipPaths / masks / symbols.
    const root = this.state.document().root;
    const dynamic = [
      this.effects.buildUsedFiltersMarkup(root),
      this.chains.buildAllChainsMarkup(),
      this.parametric.buildAllInstancesMarkup(),
      this.gradients.buildAllActiveGradientsMarkup(),
      this.patterns.buildAllActivePatternsMarkup(),
      this.clipPaths.buildAllActiveClipPathsMarkup(),
      this.masks.buildAllActiveMasksMarkup(),
      this.symbols.buildAllActiveSymbolsMarkup(),
    ]
      .filter((s) => s.length > 0)
      .join('\n');
    if (docDefs.length === 0) return dynamic;
    if (dynamic.length === 0) return docDefs;
    return `${docDefs}\n${dynamic}`;
  }
}
