import type { Provider } from '@angular/core';
import { CommandBus, EditorStateService, HistoryService } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';

import { AlignmentService } from '../alignment/alignment.service';
import { AnchorSelectionService } from '../anchor-editor/anchor-selection.service';
import { AutoSaveService } from '../autosave/autosave.service';
import { ClipboardService } from '../clipboard/clipboard.service';
import { ChainFilterRegistry } from '../effect/chain-filter';
import { IsolationService } from '../isolation/isolation.service';
import { AssetManagerService } from '../library/assets/asset-manager.service';
import { ActiveClipPathsService } from '../library/clip-paths/clip-path-library.service';
import { ActiveGradientsService } from '../library/gradients/gradient-library.service';
import { ActiveMasksService } from '../library/masks/mask-library.service';
import { ActivePatternsService } from '../library/patterns/pattern-library.service';
import { LayersService } from '../layers/layers.service';
import { MarqueeService } from '../marquee/marquee.service';
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
 *     <svg-engine-editor-instance>...</svg-engine-editor-instance>
 *     <svg-engine-editor-instance>...</svg-engine-editor-instance>
 *   `,
 * })
 * export class SplitPanel {}
 *
 * @Component({
 *   selector: 'svg-engine-editor-instance',
 *   providers: [provideSvgEngineEditorScope()],
 *   template: `<svge-editor>...</svge-editor>`,
 * })
 * export class EditorInstance {}
 * ```
 *
 * **Not needed for**: single-editor apps, headless-puro single-document
 * scripts, read-only viewers (`<svge-renderer>` standalone). The default
 * `providedIn: 'root'` works fine in those cases.
 */
export function provideSvgEngineEditorScope(): Provider[] {
  return [
    // ── core (document + mutations + history) ────────────────────
    EditorStateService,
    CommandBus,
    HistoryService,
    // ── render (viewport: pan/zoom) ──────────────────────────────
    ViewportService,
    // ── edit / selection + isolation + layers + workspace ───────
    SelectionService,
    IsolationService,
    LayersService,
    WorkspaceService,
    // ── edit / gestures + snap + alignment + autosave ───────────
    SnapService,
    TransformService,
    MarqueeService,
    AlignmentService,
    AutoSaveService,
    // D-044: in-memory clipboard. Per-editor scope so two editors mounted
    // side-by-side cannot paste each other's content unintentionally.
    ClipboardService,
    // ── edit / tools (active tool host + tool state machines) ───
    ToolHostService,
    AnchorSelectionService,
    PenToolService,
    ShapeToolService,
    InlineTextEditorService,
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
    // D-049 (Item 4 — Composição / Recorte): same Catalog + Active
    // split as gradients/patterns. The Active*Service derives active
    // defs from the editor's document; the catalog stays root-scoped.
    ActiveClipPathsService,
    ActiveMasksService,
  ];
}
