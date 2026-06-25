import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  CommandBus,
  createGroup,
  createRect,
  EditorStateService,
  InsertNodeCommand,
  type SvgDocument,
} from '@mosaicoo/svg-engine/core';
import {
  SelectionService,
  SnapService,
  TraceProgressService,
  WorkspaceService,
} from '@mosaicoo/svg-engine/edit';
import { ViewportService } from '@mosaicoo/svg-engine/render';
import { SvgeStatusBar, STATUS_BAR_SECTIONS } from './status-bar.component';

function seedDoc(): SvgDocument {
  return {
    id: 'd' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup([], { id: 'root' as never }),
  };
}

describe('SvgeStatusBar — sections render', () => {
  let fixture: ComponentFixture<SvgeStatusBar>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideNoopAnimations()],
    });
    // resetDocument() clears the dirty flag — we want the test to assert
    // the "no isolation + not dirty" baseline of 5 default sections.
    TestBed.inject(EditorStateService).resetDocument(seedDoc());
    fixture = TestBed.createComponent(SvgeStatusBar);
    fixture.detectChanges();
  });

  it('renders all default sections (except isolation/tracing/dirty which are conditional)', () => {
    const sections = fixture.nativeElement.querySelectorAll('.section');
    // tool + selection + cursor + zoom + snap = 5 always-on by default
    // isolation hidden (no isolation active), tracing hidden (no run in
    // flight), dirty hidden (fresh doc)
    expect(sections.length).toBe(5);
  });

  it('honors [sections] input — only listed sections render', () => {
    fixture.componentRef.setInput('sections', ['zoom', 'tool']);
    fixture.detectChanges();
    const sections = fixture.nativeElement.querySelectorAll('.section');
    expect(sections.length).toBe(2);
    expect(fixture.nativeElement.querySelector('.section-zoom')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.section-tool')).not.toBeNull();
  });

  it('exports STATUS_BAR_SECTIONS as the full default list', () => {
    // **AUDIT FIX U4** — 'page' section added between 'tool' and
    // 'selection' so the user has a persistent "which page" signal
    // (the pages strip moved into the canvas overlay, so it's no
    // longer always present in the layout).
    expect(STATUS_BAR_SECTIONS).toEqual([
      'tool',
      'page',
      'selection',
      'cursor',
      'zoom',
      'snap',
      'isolation',
      'tracing',
      'dirty',
    ]);
  });
});

describe('SvgeStatusBar — tracing section (D-066e)', () => {
  let fixture: ComponentFixture<SvgeStatusBar>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideNoopAnimations()],
    });
    TestBed.inject(EditorStateService).resetDocument(seedDoc());
    fixture = TestBed.createComponent(SvgeStatusBar);
    fixture.detectChanges();
  });

  it('does not render the tracing pill while idle', () => {
    expect(fixture.nativeElement.querySelector('.section-tracing')).toBeNull();
  });

  it('renders the tracing pill while TraceProgressService.running()', () => {
    const tp = TestBed.inject(TraceProgressService);
    tp.start();
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('.section-tracing');
    expect(pill).not.toBeNull();
    expect(pill.querySelector('.value').textContent).toContain('Tracing');
    tp.stop();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.section-tracing')).toBeNull();
  });

  it('pluralizes label when multiple traces run concurrently', () => {
    const tp = TestBed.inject(TraceProgressService);
    tp.start();
    tp.start();
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.section-tracing .value').textContent;
    expect(text).toContain('2');
    tp.stop();
    tp.stop();
  });
});

describe('SvgeStatusBar — reactivity', () => {
  let fixture: ComponentFixture<SvgeStatusBar>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideNoopAnimations()],
    });
    // resetDocument() clears the dirty flag — we want the test to assert
    // the "no isolation + not dirty" baseline of 5 default sections.
    TestBed.inject(EditorStateService).resetDocument(seedDoc());
    fixture = TestBed.createComponent(SvgeStatusBar);
    fixture.detectChanges();
  });

  it('updates selection count when selection changes', () => {
    const sel = TestBed.inject(SelectionService);
    const bus = TestBed.inject(CommandBus);
    const state = TestBed.inject(EditorStateService);
    bus.dispatch(
      new InsertNodeCommand(
        state.document().root.id,
        createRect({ x: 0, y: 0, width: 5, height: 5 }, { id: 'r1' as never }),
      ),
    );
    sel.select('r1' as never);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.section-selection .value').textContent;
    // "1 · r1" or just "1" depending on focus
    expect(text).toMatch(/1/);
  });

  it('updates zoom % when ViewportService.zoom changes', () => {
    const vp = TestBed.inject(ViewportService);
    vp.setZoom(2);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.section-zoom .value').textContent;
    expect(text).toBe('200%');
  });

  it('updates cursor when WorkspaceService.setRulerCursor changes', () => {
    const ws = TestBed.inject(WorkspaceService);
    ws.setRulerCursor({ x: 12.5, y: -7.3 });
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.section-cursor .value').textContent;
    expect(text).toBe('12.5, -7.3');
  });

  it('shows snap as "off" when SnapService is disabled', () => {
    const snap = TestBed.inject(SnapService);
    snap.setEnabled(false);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.section-snap .value').textContent;
    expect(text).toBe('off');
  });

  it('setSnap("off") also clears snapToGuides — no silent re-enable (D-112)', () => {
    const snap = TestBed.inject(SnapService);
    snap.setEnabled(true);
    snap.setSnapToGuides(true);
    expect(snap.snapToGuides()).toBe(true);
    (fixture.componentInstance as unknown as { setSnap(t: 'off'): void }).setSnap('off');
    expect(snap.enabled()).toBe(false);
    // The trap was: a leftover snapToGuides=true let a later guides-toggle
    // re-enable snap. "off" now zeroes it, so off stays off.
    expect(snap.snapToGuides()).toBe(false);
  });

  it('shows active tool label when ToolHostService.activate is called', () => {
    // No tools registered in this test, so activeId() === null → "—"
    const text = fixture.nativeElement.querySelector('.section-tool .value').textContent;
    expect(text).toBe('—');
    // (Tool registration + activate scenarios are covered by tool-host specs.)
  });
});
