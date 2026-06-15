import { Component, inject, Injector, type ProviderToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  generateNodeId,
  HistoryService,
  InsertNodeCommand,
  SnapshotsService,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { describe, expect, it } from 'vitest';

import { AlignmentService } from '../alignment/alignment.service';
import { KeyObjectService } from '../alignment/key-object.service';
import { AnchorSelectionService } from '../anchor-editor/anchor-selection.service';
import { AnimationService } from '../animation/animation.service';
import { PlaybackService } from '../animation/playback.service';
import { AUTOSAVE_STORAGE_KEY } from '../autosave/autosave.config';
import { AutoSaveService } from '../autosave/autosave.service';
import { ClipboardService } from '../clipboard/clipboard.service';
import { ChainFilterRegistry } from '../effect/chain-filter';
import { AssetExportPersistenceService } from '../asset-export/asset-export-persistence.service';
import { AssetExportRegistry } from '../asset-export/asset-export-registry.service';
import { AssetExportRunner } from '../asset-export/asset-export-runner.service';
import { SelectSameService } from '../find-replace/select-same.service';
import { ImportPlacementService } from '../import-placement/import-placement.service';
import { IsolationService } from '../isolation/isolation.service';
import { SmartObjectActionsService } from '../smart-object-actions/smart-object-actions.service';
import { ActiveDefsService } from '../library/active-defs.service';
import { AssetManagerService } from '../library/assets/asset-manager.service';
import { BrushSelectionService } from '../library/brushes/brush-library.service';
import { ActiveClipPathsService } from '../library/clip-paths/clip-path-library.service';
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
import { SelectionService } from '../selection/selection.service';
import { ShortcutService } from '../shortcut/shortcut.service';
import { SnapService } from '../snap/snap.service';
import { SnapshotsPersistenceService } from '../snapshots/snapshots-persistence.service';
import { GradientToolService } from '../tool/extra-tools';
import { PenToolService } from '../tool/pen-tool.service';
import { ShapeToolService } from '../tool/shape-tool.service';
import { InlineTextEditorService } from '../tool/text-tool.service';
import { ToolHostService } from '../tool/tool-host.service';
import { TransformService } from '../transform/transform.service';
import { ViewportCullingService } from '../viewport-culling/viewport-culling.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { provideSvgEngineEditorScope } from './editor-scope.providers';

/**
 * D-042 contract: each component that lists `provideSvgEngineEditorScope()`
 * in its providers gets a FRESH instance of every state service, isolated
 * from the root and from sibling scopes.
 */
describe('provideSvgEngineEditorScope', () => {
  function makeScopedHost() {
    @Component({
      selector: 'svge-test-scoped-host',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope()],
    })
    class Host {
      readonly state = inject(EditorStateService);
      readonly bus = inject(CommandBus);
      readonly selection = inject(SelectionService);
      readonly isolation = inject(IsolationService);
      readonly layers = inject(LayersService);
      readonly injector = inject(Injector);
    }
    return Host;
  }

  it('returns a non-empty Provider[] array', () => {
    const providers = provideSvgEngineEditorScope();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(10);
  });

  it('isolates EditorStateService.document() across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    // Different instances
    expect(a.state).not.toBe(b.state);
    expect(a.bus).not.toBe(b.bus);

    // Mutate scope A: insert a shape via bus (so history is consistent)
    const rect = createRect({ x: 10, y: 10, width: 20, height: 20 });
    a.bus.dispatch(new InsertNodeCommand(a.state.document().root.id, rect));

    // Scope A sees the shape; scope B remains empty (proves no bleed)
    const aRoot = a.state.document().root;
    const bRoot = b.state.document().root;
    expect(aRoot.type === 'group' && aRoot.children.length).toBe(1);
    expect(bRoot.type === 'group' && bRoot.children.length).toBe(0);
  });

  it('isolates SelectionService selection across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    const id = generateNodeId();
    a.selection.select(id);

    expect(a.selection.selectedIds().size).toBe(1);
    expect(b.selection.selectedIds().size).toBe(0);
  });

  it('isolates IsolationService.isolationRootId across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    // IsolationService.enter() validates that the node exists in the
    // document AND is a group. Seed a group in scope A's document, then
    // enter isolation on it.
    const innerGroup = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const docWithGroup = createEmptyDocument();
    a.state.setDocument({
      ...docWithGroup,
      root: { ...docWithGroup.root, children: [innerGroup] },
    });
    const entered = a.isolation.enter(innerGroup.id);

    expect(entered).toBe(true);
    expect(a.isolation.isolationRootId()).toBe(innerGroup.id);
    // Scope B has a fresh empty document — its IsolationService is
    // untouched, proving no bleed.
    expect(b.isolation.isolationRootId()).toBeNull();
  });

  it('isolates LayersService hidden set across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    const id = generateNodeId();
    a.layers.setVisible(id, false); // hide in scope A

    expect(a.layers.hiddenIds().has(id)).toBe(true);
    expect(b.layers.hiddenIds().has(id)).toBe(false);
    expect(a.layers.isVisible(id)).toBe(false);
    expect(b.layers.isVisible(id)).toBe(true);
  });

  it('shares NOTHING by reference between scoped Injectors', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    expect(a.injector).not.toBe(b.injector);
    // EditorStateService resolution via scoped injectors yields different
    // instances — proves D-042 scope semantics (the per-component
    // providers override providedIn:'root').
    expect(a.injector.get(EditorStateService)).toBe(a.state);
    expect(b.injector.get(EditorStateService)).toBe(b.state);
    expect(a.injector.get(EditorStateService)).not.toBe(b.injector.get(EditorStateService));
  });
});

/**
 * **AUDIT-FIX P3 (regression trap)** — exhaustive list of stateful
 * services that MUST be per-editor scoped. If a service is added with
 * `providedIn: 'root'` but holds editor-specific signal state, it
 * silently breaks multi-editor isolation. Listing every required
 * service explicitly here means the spec fails the next time someone
 * adds a stateful service and forgets to add it to
 * `provideSvgEngineEditorScope`.
 *
 * **How to extend**: when adding a new stateful service to
 * `provideSvgEngineEditorScope`, add the corresponding token to
 * {@link STATEFUL_SCOPED_TOKENS} below. The test will fail until
 * the addition is consistent across both files.
 *
 * **What does NOT belong here**: pure registries (ToolRegistry,
 * MenuContributionRegistry, ShortcutRegistry, PluginInfoRegistry,
 * PaletteRegistry, EffectRegistry, ImporterRegistry, ExporterRegistry,
 * OptimizerRegistry) are app-wide by design — plugins register once
 * at bootstrap and every editor sees the same contributions. Renderer
 * registries (NodeRendererRegistry) are also globals. Adding any of
 * those to this list would be incorrect.
 */
const STATEFUL_SCOPED_TOKENS: readonly ProviderToken<unknown>[] = [
  // core (document + mutations + history + snapshots)
  EditorStateService,
  CommandBus,
  HistoryService,
  SnapshotsService,
  SnapshotsPersistenceService,
  // render (viewport)
  ViewportService,
  // edit — selection + isolation + layers + workspace
  SelectionService,
  IsolationService,
  LayersService,
  WorkspaceService,
  // D-098 — panel reveal indirection (Window ▸ Panels → shell).
  PanelHostService,
  // edit — gestures + snap + alignment + autosave + clipboard
  SnapService,
  TransformService,
  MarqueeService,
  AlignmentService,
  // D-094 — "Align to Key Object" per-editor state.
  KeyObjectService,
  AutoSaveService,
  ClipboardService,
  // edit — tools (active tool host + tool state machines)
  ToolHostService,
  AnchorSelectionService,
  PenToolService,
  ShapeToolService,
  InlineTextEditorService,
  GradientToolService,
  // edit — perf + input
  ViewportCullingService,
  ShortcutService,
  // edit — effects + libraries (active-* + selection-* derived state)
  ChainFilterRegistry,
  AssetManagerService,
  ActiveGradientsService,
  ActivePatternsService,
  GradientEditingService,
  ActiveDefsService,
  ActiveClipPathsService,
  ActiveMasksService,
  ActiveSymbolsService,
  BrushSelectionService,
  SymbolSelectionService,
  SymbolSprayerPreviewService,
  TraceProgressService,
  // edit — find/replace + select-same
  SelectSameService,
  // D-107 — interactive "place" gesture for File ▸ Import ▸ SVG.
  ImportPlacementService,
  // D-076 — Smart Object actions (Replace Contents + Rasterize) shared
  // by menu plugin and Inspector section.
  SmartObjectActionsService,
  // D-077 — Asset Export (batch export). Registry + Runner per-editor.
  AssetExportRegistry,
  AssetExportRunner,
  // D-077 follow-up — opt-in localStorage persistence for the slot list.
  AssetExportPersistenceService,
  // D-082 — Animation Timeline (F2): per-editor animation engine + transport.
  AnimationService,
  PlaybackService,
];

describe('provideSvgEngineEditorScope — stateful services exhaustiveness trap', () => {
  it.each(STATEFUL_SCOPED_TOKENS.map((t) => [t]))(
    'provides a fresh instance of %p per scope (regression trap)',
    (token) => {
      @Component({
        selector: 'svge-test-trap-a',
        standalone: true,
        template: '',
        providers: [provideSvgEngineEditorScope()],
      })
      class HostA {
        readonly value = inject(token);
      }
      @Component({
        selector: 'svge-test-trap-b',
        standalone: true,
        template: '',
        providers: [provideSvgEngineEditorScope()],
      })
      class HostB {
        readonly value = inject(token);
      }
      const a = TestBed.createComponent(HostA).componentInstance;
      const b = TestBed.createComponent(HostB).componentInstance;
      expect(a.value).toBeTruthy();
      expect(b.value).toBeTruthy();
      // The core invariant: two scoped components get DIFFERENT
      // instances. If a service silently becomes root-only, this
      // line fires and points at the exact missing entry in
      // `provideSvgEngineEditorScope`.
      expect(a.value).not.toBe(b.value);
    },
  );
});

describe('provideSvgEngineEditorScope({ autoSaveKey }) — AUDIT-FIX P8 contract', () => {
  it('omitting autoSaveKey keeps the root default "svge:autosave"', () => {
    @Component({
      selector: 'svge-test-autosave-default',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope()],
    })
    class Host {
      readonly key = inject(AUTOSAVE_STORAGE_KEY);
    }
    const host = TestBed.createComponent(Host).componentInstance;
    expect(host.key).toBe('svge:autosave');
  });

  it('passing a custom autoSaveKey overrides the token within this scope', () => {
    @Component({
      selector: 'svge-test-autosave-custom',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope({ autoSaveKey: 'svge:autosave:editor-a' })],
    })
    class Host {
      readonly key = inject(AUTOSAVE_STORAGE_KEY);
    }
    const host = TestBed.createComponent(Host).componentInstance;
    expect(host.key).toBe('svge:autosave:editor-a');
  });

  it('passing autoSaveKey: null disables persistence (token resolves to null)', () => {
    @Component({
      selector: 'svge-test-autosave-null',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope({ autoSaveKey: null })],
    })
    class Host {
      readonly key = inject(AUTOSAVE_STORAGE_KEY);
    }
    const host = TestBed.createComponent(Host).componentInstance;
    expect(host.key).toBeNull();
  });

  it('two scopes with different autoSaveKeys do not bleed', () => {
    @Component({
      selector: 'svge-test-autosave-a',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope({ autoSaveKey: 'editor-a' })],
    })
    class HostA {
      readonly key = inject(AUTOSAVE_STORAGE_KEY);
    }
    @Component({
      selector: 'svge-test-autosave-b',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope({ autoSaveKey: 'editor-b' })],
    })
    class HostB {
      readonly key = inject(AUTOSAVE_STORAGE_KEY);
    }
    const a = TestBed.createComponent(HostA).componentInstance;
    const b = TestBed.createComponent(HostB).componentInstance;
    expect(a.key).toBe('editor-a');
    expect(b.key).toBe('editor-b');
    expect(a.key).not.toBe(b.key);
  });
});
