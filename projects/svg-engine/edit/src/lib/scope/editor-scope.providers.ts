import type { Provider } from '@angular/core';
import {
  CommandBus,
  EditorStateService,
  HistoryService,
  INSERT_PARENT_RESOLVER,
  SnapshotsService,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';

import { AlignmentService } from '../alignment/alignment.service';
import { KeyObjectService } from '../alignment/key-object.service';
import { AnchorSelectionService } from '../anchor-editor/anchor-selection.service';
import { AnimationService } from '../animation/animation.service';
import { PlaybackService } from '../animation/playback.service';
import { AssetExportPersistenceService } from '../asset-export/asset-export-persistence.service';
import { AssetExportRegistry } from '../asset-export/asset-export-registry.service';
import { AssetExportRunner } from '../asset-export/asset-export-runner.service';
import { AUTOSAVE_STORAGE_KEY } from '../autosave/autosave.config';
import { AutoSaveService } from '../autosave/autosave.service';
import { SmartObjectActionsService } from '../smart-object-actions/smart-object-actions.service';
import { ClipboardService } from '../clipboard/clipboard.service';
import { ChainFilterRegistry } from '../effect/chain-filter';
import { SelectSameService } from '../find-replace/select-same.service';
import { SnapshotsPersistenceService } from '../snapshots/snapshots-persistence.service';
import { ImportPlacementService } from '../import-placement/import-placement.service';
import { IsolationService } from '../isolation/isolation.service';
import { AssetManagerService } from '../library/assets/asset-manager.service';
import { ActiveClipPathsService } from '../library/clip-paths/clip-path-library.service';
import { ActiveDefsService } from '../library/active-defs.service';
import { BrushSelectionService } from '../library/brushes/brush-library.service';
import { GradientEditingService } from '../library/gradients/gradient-editing.service';
import { ActiveGradientsService } from '../library/gradients/gradient-library.service';
import { ActiveMasksService } from '../library/masks/mask-library.service';
import { ActivePatternsService } from '../library/patterns/pattern-library.service';
import { ActiveSymbolsService } from '../library/symbols/symbol-library.service';
import { SymbolSelectionService } from '../library/symbols/symbol-selection.service';
import { SymbolSprayerPreviewService } from '../library/symbols/symbol-sprayer-preview.service';
import { TraceProgressService } from '../autotrace/trace-progress.service';
import { LayersService } from '../layers/layers.service';
import { MarqueeService } from '../marquee/marquee.service';
import { PanelHostService } from '../panel/panel-host.service';
import { ACTIVE_PAGE_STORAGE_KEY } from '../pages/active-page.config';
import { ActivePageService } from '../pages/active-page.service';
import { PagesService } from '../pages/pages.service';
import { SelectionService } from '../selection/selection.service';
import { ShortcutService } from '../shortcut/shortcut.service';
import { SnapService } from '../snap/snap.service';
import { GradientToolService } from '../tool/extra-tools';
import { PenToolService } from '../tool/pen-tool.service';
import { ShapeToolService } from '../tool/shape-tool.service';
import { InlineTextEditorService } from '../tool/text-tool.service';
import { ToolHostService } from '../tool/tool-host.service';
import { TransformService } from '../transform/transform.service';
import { ViewportCullingService } from '../viewport-culling/viewport-culling.service';
import { WorkspaceService } from '../workspace/workspace.service';

/**
 * **D-042** — Returns providers that scope the **per-editor state stack**
 * to whichever Angular injector receives this array (a route component,
 * a panel container, a CDK overlay, etc.).
 *
 * **Problem solved**: by default, every service in this list is
 * `providedIn: 'root'` (singletons app-wide). That's correct for a
 * single-editor app, but breaks the moment a host wants **two or more
 * independent editor instances** in the same Angular app — they'd share
 * `EditorStateService.document()`, `IsolationService.isolationRootId()`,
 * `LayersService` visibility, etc. Symptoms: shapes from editor A
 * appear in editor B; entering isolation in A dims shapes in B; toggling
 * a layer in A hides it in B.
 *
 * **How it works**: Angular's hierarchical DI lets a child injector
 * (component-level `providers: []`) override a parent injector (root).
 * Listing a service in `providers: []` creates a **fresh instance** in
 * that subtree, isolated from the root instance and from sibling
 * subtrees. The original `providedIn: 'root'` declaration remains as a
 * fallback for consumers that don't opt into the scope helper.
 *
 * **What's included** (per-editor instance state):
 *
 * - **`core`**: `EditorStateService` (document), `CommandBus` (mutations),
 *   `HistoryService` (undo/redo stack).
 * - **`render`**: `ViewportService` (pan/zoom state).
 * - **`edit`**: `SelectionService`, `IsolationService`, `LayersService`,
 *   `WorkspaceService`, `SnapService`, `TransformService`,
 *   `MarqueeService`, `AlignmentService`, `AutoSaveService`,
 *   `ToolHostService`, `AnchorSelectionService`, `PenToolService`,
 *   `ShapeToolService`, `InlineTextEditorService`,
 *   `ViewportCullingService`, `ShortcutService`, `ClipboardService`
 *   (D-044), `ChainFilterRegistry` (D-047), `AssetManagerService`
 *   (D-048 — only scoped library service; the catalog services
 *   stay root-scoped so plugin registration at bootstrap reaches
 *   the same instance consumers inject).
 *
 * **What's NOT included** (intentionally app-wide):
 *
 * - **Plugin registries** (`ToolRegistry`, `MenuContributionRegistry`,
 *   `ShortcutRegistry`, `PaletteRegistry`, `EffectRegistry`,
 *   `OptimizerRegistry`, `ImporterRegistry`, `ExporterRegistry`,
 *   `PluginInfoRegistry`): plugins are registered ONCE at app bootstrap
 *   (`provideSvgEnginePlugin(...)` in `app.config.ts`) and need to be
 *   visible to every editor instance.
 * - **Renderer registries** (`NodeRendererRegistry`): renderer dispatch
 *   is a global concern — node `<rect>` → `<rect-renderer>` mapping is
 *   the same across editors.
 * - **App-wide UI services** (`ThemeService`, `ColorHistoryService`):
 *   theme is a single app-wide choice; color history is shared via
 *   localStorage by design.
 * - **`SvgeContextMenuService`** (lives in `svg-engine/ui`): not in this
 *   helper because that would violate the headless boundary (D-017 —
 *   `edit` cannot import from `ui`). Consumers using `<svge-shell-pro>`
 *   or `<svge-editor>` should add `SvgeContextMenuService` to their
 *   route providers manually if they need per-editor menu isolation.
 *   In practice, since only one route is mounted at a time in a
 *   router-driven app, the root-scoped instance works fine.
 *
 * **Shortcut handlers**: `ShortcutService` is per-editor, but
 * `ShortcutRegistry` (where plugins register bindings) is app-wide.
 * When a key fires, `ShortcutService` passes its own `Injector` to the
 * handler via `ShortcutContext`, so handlers can resolve services from
 * the **active editor scope** rather than from the root captured at
 * plugin install time. The `builtinEditorShortcutsPlugin` uses this
 * pattern; custom plugins should follow it when targeting multi-editor
 * scenarios.
 *
 * **Lifecycle**: services in this scope are constructed when the
 * component injector is created (first injection) and destroyed when
 * the component is destroyed. Routes get fresh instances on each
 * navigation — entering `/custom-editor` then `/basic-editor` then
 * back to `/custom-editor` creates **three separate** `EditorStateService`s.
 * The previous instance's `signal()` values are garbage-collected.
 *
 * **Usage** (route component):
 *
 * ```ts
 * @Component({
 *   selector: 'my-route',
 *   providers: [provideSvgEngineEditorScope()],
 *   // ...
 * })
 * export class MyRoute { ... }
 * ```
 *
 * **Usage** (multi-editor in a single view):
 *
 * ```ts
 * @Component({
 *   selector: 'split-panel',
 *   template: `
 *     <svg-engine-editor-instance editorId="a">...</svg-engine-editor-instance>
 *     <svg-engine-editor-instance editorId="b">...</svg-engine-editor-instance>
 *   `,
 * })
 * export class SplitPanel {}
 *
 * @Component({
 *   selector: 'svg-engine-editor-instance',
 *   providers: [
 *     // AUDIT-FIX P8: distinct autoSaveKey per instance so the two
 *     // editors don't overwrite each other's recovery payload in
 *     // localStorage. Without this option both would race for the
 *     // single 'svge:autosave' slot.
 *     provideSvgEngineEditorScope({ autoSaveKey: 'svge:autosave:editor-a' }),
 *   ],
 *   template: `<svge-editor>...</svge-editor>`,
 * })
 * export class EditorInstance {}
 * ```
 *
 * **Not needed for**: single-editor apps, headless-puro single-document
 * scripts, read-only viewers (`<svge-renderer>` standalone). The default
 * `providedIn: 'root'` works fine in those cases.
 */
/**
 * **AUDIT-FIX P8** — optional per-editor configuration honored by
 * {@link provideSvgEngineEditorScope}.
 *
 * Currently exposes the auto-save storage slot; future per-editor knobs
 * (snapshots storage key, recovery toggle, etc.) hang off the same
 * object so consumers configure everything in one place.
 *
 * **Backward compatible**: every field is optional. Calling
 * `provideSvgEngineEditorScope()` with no argument keeps the original
 * `'svge:autosave'` slot, so existing single-editor apps continue
 * reading their pre-existing recovery payloads.
 */
export interface SvgEngineEditorScopeOptions {
  /**
   * Override the `localStorage` base key used by
   * {@link AutoSaveService}. Default `'svge:autosave'`. Pass a
   * distinct key per editor when the host mounts multiple editor
   * instances on the same origin — otherwise they'd silently
   * overwrite each other's recovery payload (the bug this fix
   * addresses). Pass `null` to disable autosave persistence entirely
   * for this scope.
   *
   * @example
   * ```ts
   * providers: [
   *   provideSvgEngineEditorScope({ autoSaveKey: 'svge:autosave:editor-a' }),
   * ]
   * ```
   */
  readonly autoSaveKey?: string | null;

  /**
   * **PAGES-REFACTOR Fase 7** — override the `localStorage` base key
   * used by {@link ActivePageService} to persist the currently-active
   * page id. Default `'svge:activePage'`. Pass a distinct key per
   * editor when the host mounts multiple editor instances so the
   * sibling editors don't clobber each other's "last open page"
   * memory. Pass `null` to disable persistence entirely (the service
   * falls back to its auto-pick-first-page behavior on every mount).
   *
   * @example
   * ```ts
   * providers: [
   *   provideSvgEngineEditorScope({
   *     autoSaveKey: 'svge:autosave:editor-a',
   *     activePageStorageKey: 'svge:activePage:editor-a',
   *   }),
   * ]
   * ```
   */
  readonly activePageStorageKey?: string | null;
}

export function provideSvgEngineEditorScope(options?: SvgEngineEditorScopeOptions): Provider[] {
  /**
   * AUDIT-FIX P8 — when the consumer specified `autoSaveKey`, override
   * the InjectionToken inside THIS scope only. The `in` check
   * intentionally lets `null` through (explicit opt-out) while
   * preserving the root default when the field is omitted entirely.
   */
  const autosaveKeyProvider: Provider[] =
    options !== undefined && 'autoSaveKey' in options
      ? [{ provide: AUTOSAVE_STORAGE_KEY, useValue: options.autoSaveKey ?? null }]
      : [];
  /**
   * PAGES-REFACTOR Fase 7 — same pattern: explicit-presence check
   * (`in`) lets `null` through as "disable" while leaving the root
   * default in place when the option is omitted entirely.
   */
  const activePageKeyProvider: Provider[] =
    options !== undefined && 'activePageStorageKey' in options
      ? [{ provide: ACTIVE_PAGE_STORAGE_KEY, useValue: options.activePageStorageKey ?? null }]
      : [];
  return [
    ...autosaveKeyProvider,
    ...activePageKeyProvider,
    // ── core (document + mutations + history) ────────────────────
    EditorStateService,
    CommandBus,
    HistoryService,
    // D-073 — History snapshots (named restorable checkpoints).
    // Scoped per-editor because each editor instance manages its own
    // snapshot collection. The `CommandBus` (root-scoped) consults
    // `inject(SnapshotsService, { optional: true })` so consumers
    // without this provider still dispatch normally — just without
    // the auto-snapshot hook on destructive commands.
    SnapshotsService,
    // D-073 — localStorage round-trip for the snapshots collection.
    // Mirrors AutoSaveService's role for the live document. Scoped
    // per-editor (depends on per-editor SnapshotsService); the
    // companion `<svge-snapshots-panel>` calls `hydrate()` at
    // mount-time + `SnapshotsService.bootstrap(doc)` for the
    // baseline. Persistence then auto-saves via an `effect()` on
    // every change.
    SnapshotsPersistenceService,
    // ── render (viewport: pan/zoom) ──────────────────────────────
    ViewportService,
    // ── edit / selection + isolation + layers + workspace ───────
    SelectionService,
    IsolationService,
    LayersService,
    WorkspaceService,
    // **D-098** — panel reveal indirection (Window ▸ Panels → shell).
    // Per-editor scope so a reveal fired from editor A routes to A's shell
    // only; the menu handler resolves THIS instance via `runCtx.injector`.
    // Holds a `revealRequest` signal + reported `activePanelId`, both
    // editor-specific, so two editors mounted side-by-side don't cross-
    // trigger each other's panels.
    PanelHostService,
    // ── edit / gestures + snap + alignment + autosave ───────────
    SnapService,
    TransformService,
    MarqueeService,
    AlignmentService,
    // **D-094** — "Align to Key Object" state (which selected node the 6
    // align ops use as the fixed reference). Per-editor scope: it reads
    // the scoped SelectionService and two editors must keep independent
    // key objects (same rationale as SelectionService itself).
    KeyObjectService,
    AutoSaveService,
    // D-044: in-memory clipboard. Per-editor scope so two editors mounted
    // side-by-side cannot paste each other's content unintentionally.
    ClipboardService,
    // **D-076** — Smart Object actions (Replace Contents file picker +
    // Rasterize dispatch). Scoped per-editor because the service
    // injects CommandBus at construction; without per-editor scoping,
    // the Inspector and menu plugin would capture the root CommandBus
    // and dispatch into the wrong editor in multi-editor hosts
    // (same defect class fixed for SelectSameService earlier).
    SmartObjectActionsService,
    // **D-079** — Pages services (PAGES-B). PagesService derives the
    // top-level page list from the document; ActivePageService tracks
    // which page is currently viewed/edited. Both per-editor scope so
    // two editors don't share active-page state or fight over auto-
    // recovery when pages get added/removed.
    PagesService,
    ActivePageService,
    // **PAGES-REFACTOR Fase 1** — wire ActivePageService as the
    // ambient "where do new shapes go?" resolver. CommandBus injects
    // this token optionally and threads it through CommandContext, so
    // any InsertNodeCommand dispatched with `parentId: AUTO_PARENT`
    // automatically lands in the active page — no per-tool wire-up
    // needed (Symbol Sprayer, Auto-trace, NLU, plugins, etc.).
    { provide: INSERT_PARENT_RESOLVER, useExisting: ActivePageService },
    // **D-077** — Asset Export (batch export panel). Registry holds
    // each editor's slot list; Runner injects EditorStateService +
    // ExporterRegistry to execute the batch. Per-editor scope so two
    // editors don't see each other's export recipes and one editor's
    // "Export All" doesn't accidentally write the sibling's document.
    AssetExportRegistry,
    AssetExportRunner,
    // **D-077 follow-up** — opt-in localStorage persistence for the
    // slot list. Constructor wires an `effect()` that auto-saves on
    // every change (500ms debounce) and exposes `hydrate()` for
    // bootstrap-time restore. Same per-editor scoping as
    // SnapshotsPersistenceService (D-073) — disjoint storage slots
    // per editor instance via ASSET_EXPORT_STORAGE_KEY.
    AssetExportPersistenceService,
    // ── edit / tools (active tool host + tool state machines) ───
    ToolHostService,
    AnchorSelectionService,
    PenToolService,
    ShapeToolService,
    InlineTextEditorService,
    // **D-107** — interactive "place" gesture for File ▸ Import ▸ SVG.
    // Holds the pending import + live drag rectangle; the capture overlay
    // (`<svg:g svgeImportPlacementOverlay>`) drives it. Per-editor scope:
    // the pending placement is editor-specific (it injects CommandBus +
    // EditorStateService + SelectionService at construction), so two
    // editors mounted side-by-side place independently — same defect class
    // as SmartObjectActionsService / SelectSameService.
    ImportPlacementService,
    // D-050: per-editor focus signal for the Gradient tool. Scoped so
    // two editors mounted side-by-side don't share the "currently
    // focused gradient" hint.
    GradientToolService,
    // ── edit / performance + input ──────────────────────────────
    ViewportCullingService,
    ShortcutService,
    // ── edit / effects (D-047) ──────────────────────────────────
    // ChainFilterRegistry derives composed `<filter>` markup from the
    // current document's nodes — scoped per-editor so two editors
    // mounted side-by-side compute their chains from their own state.
    ChainFilterRegistry,
    // ── edit / libraries (D-048) ────────────────────────────────
    // **D-048 FIX (UX follow-up #2)**: Library architecture is split
    // by responsibility:
    //
    // - **CATALOGS** (Shape/Template/GraphicStyle/Symbol/Brush/
    //   Gradient/Pattern *Library*Service): root-only via
    //   `@Injectable({ providedIn: 'root' })`. Plugins register at
    //   bootstrap against the root injector; panels inject from the
    //   same root → both see the same registry. Removing them from
    //   THIS array is intentional — adding them WOULD create a
    //   second empty instance per route (the D-043 trap, hit twice
    //   already in D-048).
    //
    // - **ACTIVE-DEFS DERIVATION** (ActiveGradientsService,
    //   ActivePatternsService): route-scoped — they walk the current
    //   editor's `EditorStateService` document to collect URLs in
    //   use. Without scoping they'd capture the root state and miss
    //   the route's document. They consume the root catalog for
    //   markup lookup.
    //
    // - **`AssetManagerService`**: scoped — its catalog holds
    //   PER-EDITOR user uploads (file picker output). A single
    //   editor's uploads should not leak to siblings.
    AssetManagerService,
    ActiveGradientsService,
    ActivePatternsService,
    // D-058 — per-editor gradient inline editor state (active gradient
    // derived from current selection + selected-stop index for the
    // overlay's focus ring + the Inspector's color picker target).
    GradientEditingService,
    // D-058 export fix — composes Effect/Chain/Gradient/Pattern/ClipPath/
    // Mask defs from the editor's active state. Scoped so the exporter
    // sees the current editor's defs (not a sibling editor's). Replaces
    // the inline 6-source composition that previously lived in each
    // shell's `resolvedDefs` computed AND fixes the exporter bug where
    // user-added gradients were dropped from the exported file.
    ActiveDefsService,
    // D-049 (Item 4 — Composição / Recorte): same Catalog + Active
    // split as gradients/patterns. The Active*Service derives active
    // defs from the editor's document; the catalog stays root-scoped.
    ActiveClipPathsService,
    ActiveMasksService,
    // D-059 — symbols Catalog+Active split (same pattern). The
    // ActiveSymbolsService walks the document for SymbolUseNode
    // instances and emits <symbol> markup for the renderer's <defs>.
    ActiveSymbolsService,
    // D-060 — per-editor active brush selection. Drives the Pencil
    // tool's commit step: when non-null, expands the captured
    // polyline through the brush's widthProfile into a filled
    // outline; when null, Pencil keeps its centerline+stroke output
    // (backward-compat, zero regression for apps that don't install
    // builtinBrushesPlugin).
    BrushSelectionService,
    // D-062a — per-editor active symbol selection (Symbol Sprayer).
    // Same pattern as BrushSelectionService: a signal that the
    // libraries panel sets and the SymbolSprayerTool reads on each
    // pointer event. Per-editor scope so two editors can spray
    // different symbols independently.
    SymbolSelectionService,
    // D-063b — per-editor in-progress Sprayer preview buffer. Tool
    // writes drops here during drag; SymbolSprayerOverlay reads
    // them and paints ghosted `<use>`s. Scoped so two editors don't
    // see each other's in-flight preview.
    SymbolSprayerPreviewService,
    // D-066 — per-editor "tracing in progress" counter. Status bar
    // reads `running` to show the "Tracing…" pill; the dialog handler
    // calls start()/stop() around the async prepare() pass. Scoped
    // so editor A's status doesn't light up because editor B is
    // tracing.
    TraceProgressService,
    // D-071a — Select Same. Reads `SelectionService.focusId()` +
    // `EditorStateService.document()` to find the anchor node,
    // then walks the doc for matches and calls
    // `SelectionService.selectMany`. Scoped because depending on
    // per-editor state — a root singleton would capture the root
    // SelectionService at construction time and read an empty
    // selection (the original bug fixed here).
    SelectSameService,
    // **D-082 (Animation Timeline) — F2.** Per-editor animation engine +
    // transport. AnimationService reads/edits the active page's AnimationDoc
    // via undoable commands; PlaybackService owns the playhead. Scoped so two
    // editors mounted side-by-side animate and play independently (each has
    // its own container, doc, playhead, and play state). Non-destructive: the
    // document is only read by these services — playback never mutates it, and
    // edits go through the CommandBus like every other change.
    AnimationService,
    PlaybackService,
  ];
}
