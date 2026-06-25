import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  bbox,
  type BoundingBox,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { SvgeEditor } from './editor.component';

@Component({
  standalone: true,
  imports: [SvgeEditor],
  template: `<svge-editor [title]="title()" [tree]="tree()" [viewBox]="viewBox()"
    >test content slot</svge-editor
  >`,
})
class TestHost {
  readonly title = signal<string | null>(null);
  readonly tree = signal<SvgNode | null>(null);
  readonly viewBox = signal<BoundingBox | null>(null);
}

describe('SvgeEditor — composition', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
  });

  it('renders the toolbar with the supplied title', () => {
    const fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.title.set('Test Editor');
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('mat-toolbar .title');
    expect(title?.textContent?.trim()).toBe('Test Editor');
  });

  it('renders default title when none supplied', () => {
    const fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('mat-toolbar .title');
    expect(title?.textContent?.trim()).toBe('SVGEngine');
  });

  it('mounts an inner svge-renderer', () => {
    const fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svge-renderer')).not.toBeNull();
  });

  it('mounts svge-workspace-background wrapping the renderer', () => {
    const fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const bg = fixture.nativeElement.querySelector('svge-workspace-background');
    expect(bg).not.toBeNull();
    expect(bg?.querySelector('svge-renderer')).not.toBeNull();
  });

  it('projects ng-content into the renderer slot', () => {
    const fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const renderer = fixture.nativeElement.querySelector('svge-renderer');
    expect(renderer?.textContent).toContain('test content slot');
  });
});

describe('SvgeEditor — input fallbacks', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
  });

  it('uses provided viewBox input over state default', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.tree.set(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]),
    );
    fixture.componentInstance.viewBox.set(bbox(0, 0, 100, 100));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100');
  });

  it('falls back to EditorStateService.document().root when tree input is null', () => {
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const rect = createRect({ x: 5, y: 5, width: 7, height: 7 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    const fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(`[data-node-id="${rect.id}"]`)).not.toBeNull();
  });
});

// D-064 — describe block "SvgeEditor — toolbar buttons" removed. The
// Undo / Redo / Zoom-In / Zoom-Out / Reset-View buttons no longer
// live in `<svge-editor>`'s template; they ship as toolbar.main
// contributions via `builtinMenuContributionsPlugin` and are exercised
// by that plugin's own spec. The shell test here is now just
// "renders the <svge-toolbar slot> placeholder" (covered by the
// MODE specs below).

describe('SvgeEditor — THREE MODES guarantee (D-034 + D-035)', () => {
  /**
   * MODE 2 ("Shell completo") — default flags, toolbar + status bar both rendered.
   * MODE 3 ("Shell parcial") — flags disable individual pieces independently.
   *
   * MODE 1 ("Headless puro") is not testable from within /ui specs (that mode
   * specifically MEANS "consumer never imports /ui"). It's enforced
   * structurally by the entry-point boundary (D-017) — importing only
   * /core/render/edit pulls zero /ui code.
   */
  @Component({
    standalone: true,
    imports: [SvgeEditor],
    template: `<svge-editor [showToolbar]="showToolbar()" [showStatusBar]="showStatusBar()" />`,
  })
  class ModeHost {
    readonly showToolbar = signal<boolean>(true);
    readonly showStatusBar = signal<boolean>(true);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ModeHost] });
  });

  it('MODE 2 (Shell completo, default): both toolbar AND status bar render', () => {
    const fixture = TestBed.createComponent(ModeHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-toolbar.editor-toolbar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('svge-status-bar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('svge-renderer')).not.toBeNull();
  });

  it('MODE 3a (Shell parcial — sem toolbar): canvas + status bar only', () => {
    const fixture = TestBed.createComponent(ModeHost);
    fixture.componentInstance.showToolbar.set(false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-toolbar.editor-toolbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('svge-status-bar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('svge-renderer')).not.toBeNull();
  });

  it('MODE 3b (Shell parcial — sem status bar): toolbar + canvas only', () => {
    const fixture = TestBed.createComponent(ModeHost);
    fixture.componentInstance.showStatusBar.set(false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-toolbar.editor-toolbar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('svge-status-bar')).toBeNull();
    expect(fixture.nativeElement.querySelector('svge-renderer')).not.toBeNull();
  });

  it('MODE 3c (Shell parcial — canvas-only): canvas, no toolbar, no status bar', () => {
    const fixture = TestBed.createComponent(ModeHost);
    fixture.componentInstance.showToolbar.set(false);
    fixture.componentInstance.showStatusBar.set(false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-toolbar.editor-toolbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('svge-status-bar')).toBeNull();
    // Canvas + renderer are ALWAYS present — that's the non-negotiable core.
    expect(fixture.nativeElement.querySelector('svge-renderer')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('svge-workspace-background')).not.toBeNull();
  });

  it('toolbar contributions render via embedded <svge-toolbar> when toolbar visible', () => {
    const fixture = TestBed.createComponent(ModeHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    // <svge-toolbar> is rendered inside the toolbar even with no
    // contributions (it's the plugin contribution slot — empty for
    // tests with no MenuContributionRegistry entries).
    expect(fixture.nativeElement.querySelector('svge-toolbar')).not.toBeNull();
  });

  it('canvas + overlays slot remain reachable across all 3 modes', () => {
    @Component({
      standalone: true,
      imports: [SvgeEditor],
      template: `
        <svge-editor [showToolbar]="false" [showStatusBar]="false">
          <svg:rect data-test-id="custom-overlay" width="10" height="10" />
        </svge-editor>
      `,
    })
    class WithProjection {}

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [WithProjection] });
    const fixture = TestBed.createComponent(WithProjection);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-test-id="custom-overlay"]')).not.toBeNull();
  });
});

describe('SvgeEditor — custom status bar slot (replace default)', () => {
  @Component({
    standalone: true,
    imports: [SvgeEditor],
    template: `
      <svge-editor>
        <div status-bar class="my-custom-status">CUSTOM STATUS</div>
      </svge-editor>
    `,
  })
  class CustomStatusHost {}

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CustomStatusHost] });
  });

  it('projected [status-bar] element replaces the default <svge-status-bar>', () => {
    const fixture = TestBed.createComponent(CustomStatusHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    // The custom projection wins (ng-content fallback only renders when
    // the slot has no projected content).
    expect(fixture.nativeElement.querySelector('.my-custom-status')?.textContent).toContain(
      'CUSTOM STATUS',
    );
    // The default svge-status-bar should NOT also render alongside.
    expect(fixture.nativeElement.querySelector('svge-status-bar')).toBeNull();
  });
});

// D-064 — describe block "SvgeEditor — output emission" removed
// alongside the `undoTriggered` / `redoTriggered` outputs. Consumers
// that need to react to history events now subscribe to `CommandBus`
// or `HistoryService` directly (matches every other editor service).

describe('PAGES-REFACTOR Fase 5 — <svge-editor> parity opt-ins', () => {
  /**
   * Default (no opt-in flags): no <svge-pages-panel> rendered, no
   * bootstrap happens. Guards back-compat — every existing canvas-only
   * / shell-parcial consumer must keep its current visible shape.
   */
  @Component({
    standalone: true,
    imports: [SvgeEditor],
    template: `<svge-editor />`,
  })
  class DefaultsHost {}

  /**
   * Opt-in showPagesPanel: <svge-pages-panel> renders in the dedicated
   * row between the isolation breadcrumb and the canvas row.
   */
  @Component({
    standalone: true,
    imports: [SvgeEditor],
    template: `<svge-editor [showPagesPanel]="true" />`,
  })
  class WithPagesPanelHost {}

  it('default: no <svge-pages-panel> renders (opt-in off)', () => {
    TestBed.configureTestingModule({ imports: [DefaultsHost] });
    const fixture = TestBed.createComponent(DefaultsHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svge-pages-panel')).toBeNull();
  });

  it('[showPagesPanel]="true": <svge-pages-panel> renders', () => {
    TestBed.configureTestingModule({ imports: [WithPagesPanelHost] });
    const fixture = TestBed.createComponent(WithPagesPanelHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('svge-pages-panel')).not.toBeNull();
  });

  it('default: <svge-page-selection-overlay> g-host is always projected (zero-cost when no page)', () => {
    // The selection overlay is self-gated by its own @if(overlay())
    // so it's safe to project unconditionally; this test pins the
    // imports list so the projection survives refactors.
    TestBed.configureTestingModule({ imports: [DefaultsHost] });
    const fixture = TestBed.createComponent(DefaultsHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const overlay = fixture.nativeElement.querySelector('g[svgepageselectionoverlay]');
    expect(overlay).not.toBeNull();
  });
});
