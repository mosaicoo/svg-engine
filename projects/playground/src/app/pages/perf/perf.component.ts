import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommandBus, EditorStateService, HistoryService } from 'svg-engine/core';
import {
  ExporterRegistry,
  ImporterRegistry,
  OptimizeCommand,
  OptimizerRegistry,
  SelectionService,
  SvgeViewportCullingDirective,
} from 'svg-engine/edit';
import { SvgeRenderer, ViewportService } from 'svg-engine/render';
import { FpsMeter } from './fps-meter';
import { createSyntheticDoc } from './synth-doc';

/**
 * Performance harness page — Fase 6a baseline.
 *
 * **Goal**: produce reproducible numbers BEFORE we optimize anything.
 * The whole point of 6a is to avoid speculative perf work in 6b — every
 * "quick win" must show a measurable before/after delta on this page.
 *
 * **What we measure**:
 *
 * - **Steady-state FPS** during a programmatic pan/zoom benchmark (3s
 *   sweep of viewport translation + zoom oscillation; reports
 *   rolling-average FPS over the sweep).
 * - **Render-to-paint latency** after a document reset (wraps the
 *   `state.resetDocument` call with `performance.now` and a
 *   double-rAF — the SECOND rAF fires after the browser has had a
 *   chance to repaint, giving a closer-to-real number than a single
 *   `microtask`).
 * - **Round-trip IO**: export → re-import time of the current doc
 *   (proxy for "save + load" in real apps).
 * - **Optimize pipeline time**: how long `runPipeline` takes on the
 *   current doc.
 *
 * **What we don't measure (yet)**:
 *
 * - Memory pressure (no good cross-browser API; deferred to manual
 *   DevTools snapshots when 6b lands).
 * - GC pauses (same reason).
 * - Cold-start bundle parse time (orthogonal — handled by
 *   `ng build --stats`).
 *
 * **Why programmatic pan/zoom** (vs. asking the user to drag): consistent
 * input across runs. Manual gestures vary too much to compare before/after
 * a single component change.
 */
@Component({
  selector: 'app-pg-perf',
  standalone: true,
  imports: [SvgeRenderer, SvgeViewportCullingDirective],
  templateUrl: './perf.component.html',
  styleUrl: './perf.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfPage implements OnDestroy {
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly bus = inject(CommandBus);
  protected readonly viewport = inject(ViewportService);
  private readonly exporters = inject(ExporterRegistry);
  private readonly importers = inject(ImporterRegistry);
  private readonly optimizers = inject(OptimizerRegistry);

  /** Available preset sizes for the synthetic-doc generator. */
  protected readonly presetCounts: readonly number[] = [10, 100, 500, 1000, 2000, 5000];

  /**
   * Currently loaded node count. For synthetic docs this equals the preset
   * (top-level only, since the generator emits flat trees). For real
   * imported files this is the TOTAL nodes including descendants (uses
   * `state.nodeCount` which walks recursively) — Illustrator output is
   * usually nested, so a "100-shape" file may have 300+ tree nodes.
   */
  protected readonly loadedCount = signal(0);

  /** Source label shown next to the count — distinguishes synth vs. imported file. */
  protected readonly loadedSource = signal<'synth' | 'file' | null>(null);

  /** File name of the last imported document (when loaded from a real file). */
  protected readonly importedFileName = signal<string | null>(null);

  /**
   * Parse-only time for the last imported file in ms — separate from
   * `roundTripMs` (which times export+import together). This isolates
   * cost of `svgImporter.import(text)` on a real-world document, which
   * Illustrator output stresses far harder than the synth generator.
   */
  protected readonly importParseMs = signal<number | null>(null);

  /** Warnings emitted by the importer on the last loaded file (sanitization etc.). */
  protected readonly importWarnings = signal<readonly string[]>([]);

  /** Last reset-to-paint duration in ms (or null when not measured yet). */
  protected readonly resetMs = signal<number | null>(null);

  /** Last round-trip (export → import) duration in ms. */
  protected readonly roundTripMs = signal<number | null>(null);

  /** Last optimize-pipeline duration in ms. */
  protected readonly optimizeMs = signal<number | null>(null);

  /** Last pan/zoom benchmark result. */
  protected readonly panZoomFps = signal<number | null>(null);

  /** Live FPS reading (updates 4×/s while the meter is running). */
  protected readonly liveFps = signal(0);

  /** True while the pan/zoom benchmark is running (disables buttons). */
  protected readonly busyBenchmark = signal(false);

  /**
   * Toggle for the `[svgeViewportCulling]` directive (Fase 6b-2). When
   * `true`, the renderer applies `data-svge-culled="1"` to top-level
   * children outside the visible viewBox; CSS rule turns them into
   * `display: none` so the browser skips paint. Toggle off to compare
   * before/after on the same loaded document.
   */
  protected readonly cullingEnabled = signal(true);

  /** Tree + viewBox bindings for the renderer. */
  protected readonly tree = computed(() => this.state.document().root);
  /** Defs fragment passed to the renderer (Fase 6c-1 round-trip). */
  protected readonly defs = computed(() => this.state.document().defs ?? null);
  protected readonly viewBox = computed(() => this.state.document().viewBox);

  /** Reference to the hidden `<input type="file">` used by the file-picker button. */
  protected readonly importFileRef = viewChild<ElementRef<HTMLInputElement>>('importFile');

  private readonly fpsMeter = new FpsMeter();

  constructor() {
    // Start the live FPS meter as soon as the page mounts; updates the
    // signal at ~4 Hz so the live readout doesn't thrash CD.
    this.fpsMeter.start((fps) => this.liveFps.set(Math.round(fps)));
  }

  ngOnDestroy(): void {
    this.fpsMeter.stop();
  }

  /**
   * Load a synthetic document of `count` nodes. Measures the time from
   * `resetDocument` to the second rAF after — proxy for "user clicked,
   * how long until the canvas paints".
   */
  protected loadSynthetic(count: number): void {
    const doc = createSyntheticDoc({ count });
    this.applyDocAndMeasure(doc, count, 'synth');
    // Reset the "imported file" panel so the UI doesn't show stale info.
    this.importedFileName.set(null);
    this.importParseMs.set(null);
    this.importWarnings.set([]);
  }

  /**
   * Trigger the hidden `<input type="file">` so the user can pick a real
   * SVG. The actual import + measurement happens in `onImportFileChange`.
   */
  protected openImportPicker(): void {
    this.importFileRef()?.nativeElement.click();
  }

  /**
   * Read the picked file, time the importer's parse step in isolation,
   * then load the resulting document into the renderer (which also
   * records the standard `Reset→paint` measurement).
   *
   * Why parse time gets its own metric: import-from-file is the most
   * common "expensive" operation against a real Illustrator file —
   * deeply nested groups, complex `<path d>` attributes, lots of
   * unsupported elements triggering sanitization warnings. The
   * synthetic generator can't reproduce this; only a real file does.
   */
  protected async onImportFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file == null) return;
    const ext = file.name.split('.').pop() ?? '';
    const importer =
      this.importers.byExtension(ext) ?? this.importers.byMediaType(file.type) ?? null;
    if (importer === null) {
      console.warn(`Perf: no importer registered for "${file.name}"`);
      input.value = '';
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      console.error('Perf: failed to read file —', e);
      input.value = '';
      return;
    }
    const parseStart = performance.now();
    const result = importer.import(text);
    const parseMs = performance.now() - parseStart;
    if (!result.ok) {
      console.error(`Perf: import failed — ${result.error}`);
      input.value = '';
      return;
    }
    this.importParseMs.set(Math.round(parseMs));
    this.importedFileName.set(file.name);
    this.importWarnings.set(result.warnings);
    // Apply the doc and let the standard `Reset→paint` measurement run.
    // We pass the recursive node count from state (which already walks
    // the tree) once it updates — `applyDocAndMeasure` reads it inside
    // the rAF callback so nested files report their TOTAL node count.
    this.applyDocAndMeasure(result.document, null, 'file');
    input.value = '';
  }

  /**
   * Shared "reset document, then time the paint" pipeline used by both
   * synth and real-file loaders. Pass `null` for `displayCount` when the
   * count should be read from `state.nodeCount` (i.e., for imported files
   * with nested groups whose total node count isn't known up front).
   */
  private applyDocAndMeasure(
    doc: ReturnType<typeof createSyntheticDoc>,
    displayCount: number | null,
    source: 'synth' | 'file',
  ): void {
    const start = performance.now();
    this.state.resetDocument(doc);
    this.viewport.setContentBox(doc.viewBox);
    this.selection.clear();
    this.history.clear();
    this.loadedSource.set(source);
    // Two rAFs: the first one batches Angular's CD; the second fires
    // AFTER the browser has had a chance to paint. Realistic "to-paint"
    // approximation without requiring the Performance Paint API
    // (which only fires for the first paint of the document).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.resetMs.set(Math.round(performance.now() - start));
        // For real files we want the post-walk total. The state's
        // `nodeCount` computed has settled by now (it depends on the
        // same document signal we just wrote).
        this.loadedCount.set(displayCount ?? this.state.nodeCount());
      });
    });
  }

  /**
   * Export current doc as SVG text, then re-import it. Measures total
   * time. Proxy for "save then re-open" in a real app.
   */
  protected async runRoundTripBenchmark(): Promise<void> {
    const exporter = this.exporters.byMediaType('image/svg+xml');
    const importer = this.importers.byMediaType('image/svg+xml');
    if (exporter === null || importer === null) {
      console.warn('Perf: SVG IO plugins not registered');
      return;
    }
    const start = performance.now();
    const out = await Promise.resolve(exporter.export(this.state.document()));
    if (typeof out !== 'string') {
      console.warn('Perf: expected SVG exporter to return string');
      return;
    }
    const parsed = importer.import(out);
    const end = performance.now();
    if (!parsed.ok) {
      console.warn('Perf: re-import failed —', parsed.error);
      return;
    }
    this.roundTripMs.set(Math.round(end - start));
  }

  /** Run the full optimizer pipeline; measure wall-clock. */
  protected runOptimizeBenchmark(): void {
    const start = performance.now();
    this.bus.dispatch(new OptimizeCommand(this.optimizers));
    // dispatch is synchronous — the new doc is already in state.
    this.optimizeMs.set(Math.round(performance.now() - start));
  }

  /**
   * Programmatic pan/zoom sweep: 3 seconds of viewport oscillation, then
   * reports rolling-average FPS sampled by the same meter that drives
   * the live readout.
   *
   * The sweep:
   * - X axis: sine wave over the viewBox width (zoom-equivalent pan)
   * - Zoom: triangle wave between 0.5× and 2×
   *
   * After the sweep, viewport is reset to its starting state so the
   * benchmark doesn't leave the user in a weird zoom.
   */
  protected async runPanZoomBenchmark(): Promise<void> {
    if (this.busyBenchmark()) return;
    this.busyBenchmark.set(true);
    const vb = this.state.document().viewBox;
    const startZoom = this.viewport.zoom();
    const startPanX = this.viewport.panX();
    const startPanY = this.viewport.panY();
    const startTime = performance.now();
    const durationMs = 3000;

    // Sample window: count frames during the sweep, divide by elapsed
    // for an FPS that doesn't include start-up jitter.
    let frames = 0;
    const startFrames = startTime;
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const elapsed = performance.now() - startTime;
        if (elapsed >= durationMs) {
          resolve();
          return;
        }
        const t = elapsed / durationMs;
        const panX = Math.sin(t * Math.PI * 4) * (vb.width / 4);
        const zoom = 0.5 + Math.abs(((t * 4) % 2) - 1) * 1.5; // triangle 0.5→2→0.5
        this.viewport.setPan(panX, 0);
        this.viewport.setZoom(zoom);
        frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - startFrames;
    const fps = Math.round((frames * 1000) / elapsed);
    this.panZoomFps.set(fps);
    this.viewport.setPan(startPanX, startPanY);
    this.viewport.setZoom(startZoom);
    this.busyBenchmark.set(false);
  }

  /** Reset all readings (useful when starting a fresh measurement series). */
  protected clearReadings(): void {
    this.resetMs.set(null);
    this.roundTripMs.set(null);
    this.optimizeMs.set(null);
    this.panZoomFps.set(null);
    this.importParseMs.set(null);
    this.importWarnings.set([]);
  }
}
