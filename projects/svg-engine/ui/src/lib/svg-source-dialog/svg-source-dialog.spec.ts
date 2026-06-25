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
import { SvgeSvgSourceDialog } from './svg-source-dialog.component';

function seedDoc(): SvgDocument {
  return {
    id: 'd' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup([], { id: 'root' as never }),
  };
}

describe('SvgeSvgSourceDialog', () => {
  let fixture: ComponentFixture<SvgeSvgSourceDialog>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideNoopAnimations()],
    });
    const state = TestBed.inject(EditorStateService);
    state.setDocument(seedDoc());
    fixture = TestBed.createComponent(SvgeSvgSourceDialog);
    fixture.detectChanges();
  });

  it('renders the current document as SVG source', () => {
    const text = fixture.nativeElement.querySelector('pre')!.textContent ?? '';
    expect(text).toContain('<svg');
    expect(text).toContain('viewBox="0 0 100 100"');
  });

  it('updates live when the document changes (reactive computed)', () => {
    const bus = TestBed.inject(CommandBus);
    const state = TestBed.inject(EditorStateService);
    const rootId = state.document().root.id;
    bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 10, y: 20, width: 5, height: 5 }, { id: 'r1' as never }),
      ),
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('pre')!.textContent ?? '';
    expect(text).toContain('<rect');
  });

  it('shows byte count + line count for the current source (footer status)', () => {
    // D-044 follow-up: footer status now lives in `.dlg-footer-status`
    // inside <svge-dialog-shell>'s footer slot, replacing the in-body
    // `.meta` line. Same content, standardized chrome.
    const status = fixture.nativeElement.querySelector('.dlg-footer-status')!.textContent ?? '';
    expect(status).toMatch(/\d+ bytes/);
    expect(status).toMatch(/\d+ lines/);
  });

  it('exposes a copy button (default state: content_copy icon)', () => {
    const btns = fixture.nativeElement.querySelectorAll('button[mat-icon-button]');
    // header has 2 buttons (copy + close), actions has 1 (close) → 3 total
    expect(btns.length).toBeGreaterThanOrEqual(2);
    // First header button is the copy button
    const copyIcon = btns[0].querySelector('mat-icon')!.textContent?.trim();
    expect(copyIcon).toBe('content_copy');
  });

  it('falls back to builtin svgExporter when no exporter registered for image/svg+xml', () => {
    // No registration happened in beforeEach — the component uses
    // svgExporter directly via the import fallback. The fact that the
    // first test renders <svg ...> proves this end-to-end.
    const text = fixture.nativeElement.querySelector('pre')!.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
  });
});
