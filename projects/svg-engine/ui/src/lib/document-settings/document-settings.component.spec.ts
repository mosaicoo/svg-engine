import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it } from 'vitest';
import {
  type BoundingBox,
  CommandBus,
  CreatePageCommand,
  createEmptyDocument,
  EditorStateService,
  getPageName,
  getPageOptions,
  getPageViewBox,
  type PageBackground,
  type PageFormat,
  type PageMargins,
  type PageOrientation,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { ActivePageService } from '@mosaicoo/svg-engine/edit';
import { SvgeDocumentSettings } from './document-settings.component';
import { SvgeDocumentSettingsDialogService } from './document-settings-dialog.service';

/**
 * **D-140** specs — Document Settings dialog. Two concerns:
 *
 * 1. **Field wiring** — every control reads the active page and writes
 *    through the same undoable core commands as the Inspector Page tab.
 *    Tested by constructing the component in an injection context (no
 *    Material rendering needed) and calling the handlers directly, then
 *    asserting the active page's serialized state changed.
 * 2. **Service delegation** — `open()` forwards to `MatDialog.open` with
 *    the `'md'` config and the caller's injector (scope-aware, D-042/D-043).
 */

const VB = { x: 0, y: 0, width: 800, height: 600 };

/** Narrow handle onto the component's protected surface for the tests. */
interface DocSettingsApi {
  page(): SvgNode | null;
  pageName(node: SvgNode): string;
  onPageNameChange(node: SvgNode, event: Event): void;
  onPageViewBoxChange(node: SvgNode, field: keyof BoundingBox, event: Event): void;
  onPageFormatChange(node: SvgNode, value: PageFormat): void;
  onPageOrientationChange(node: SvgNode, value: PageOrientation): void;
  onPageBackgroundKindChange(node: SvgNode, kind: PageBackground['kind']): void;
  onPageMarginChange(node: SvgNode, side: keyof PageMargins, event: Event): void;
  deletePage(node: SvgNode): void;
}

/** Fake DOM `change`/`selectionChange` event carrying an input value. */
function changeEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

function setupComponent() {
  // Mirror pages.spec: clear localStorage so a stale persisted active-page
  // id (jsdom localStorage is shared across spec files in a worker) can't
  // leak in.
  if (typeof localStorage !== 'undefined') localStorage.clear();
  TestBed.configureTestingModule({
    providers: [{ provide: MatDialogRef, useValue: { close: () => undefined } }],
  });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const bus = TestBed.inject(CommandBus);
  const active = TestBed.inject(ActivePageService);

  // Create a page and make it the active one (explicit setActive avoids
  // depending on the auto-recovery effect's flush timing).
  const cmd = new CreatePageCommand(VB, 'Doc Page');
  bus.dispatch(cmd);
  const pageId = cmd.getCreatedPageId()!;
  active.setActive(pageId);

  // Construct the component WITHOUT rendering — the field initializers run
  // `inject()` inside the context; we then call its handlers directly.
  const comp = TestBed.runInInjectionContext(
    () => new SvgeDocumentSettings(),
  ) as unknown as DocSettingsApi;
  return { state, bus, active, pageId, comp };
}

/** Re-read the live active page after a command mutates the document. */
function livePage(active: ActivePageService): SvgNode {
  const p = active.activePage();
  if (p === null) throw new Error('expected an active page');
  return p as unknown as SvgNode;
}

describe('D-140 SvgeDocumentSettings — field wiring (active page)', () => {
  it('exposes the active page via page()', () => {
    const { comp, pageId } = setupComponent();
    expect(comp.page()?.id).toBe(pageId);
  });

  it('renames the active page via RenamePageCommand', () => {
    const { comp, active } = setupComponent();
    comp.onPageNameChange(comp.page()!, changeEvent('  Hero  '));
    expect(getPageName(livePage(active))).toBe('Hero');
  });

  it('edits one viewBox component, preserving the others', () => {
    const { comp, active } = setupComponent();
    comp.onPageViewBoxChange(comp.page()!, 'width', changeEvent('1234'));
    const vb = getPageViewBox(livePage(active))!;
    expect(vb.width).toBe(1234);
    expect(vb.height).toBe(600); // untouched
  });

  it('changes format and orientation via SetPageOptionsCommand', () => {
    const { comp, active } = setupComponent();
    comp.onPageFormatChange(comp.page()!, 'a3');
    expect(getPageOptions(livePage(active)).format).toBe('a3');
    comp.onPageOrientationChange(livePage(active), 'portrait');
    expect(getPageOptions(livePage(active)).orientation).toBe('portrait');
  });

  it('switches background kind (seeds a default payload)', () => {
    const { comp, active } = setupComponent();
    comp.onPageBackgroundKindChange(comp.page()!, 'solid');
    const bg = getPageOptions(livePage(active)).background;
    expect(bg.kind).toBe('solid');
    expect(bg.kind === 'solid' ? bg.color : '').toBe('#ffffff');
  });

  it('edits one margin side, preserving the others', () => {
    const { comp, active } = setupComponent();
    comp.onPageMarginChange(comp.page()!, 'top', changeEvent('15'));
    const margins = getPageOptions(livePage(active)).margins;
    expect(margins.top).toBe(15);
    expect(margins.left).toBe(getPageOptions(livePage(active)).margins.left);
  });

  it('rejects a negative margin (defensive guard, no-op)', () => {
    const { comp, active } = setupComponent();
    const before = getPageOptions(livePage(active)).margins.top;
    comp.onPageMarginChange(comp.page()!, 'top', changeEvent('-5'));
    expect(getPageOptions(livePage(active)).margins.top).toBe(before);
  });

  it('deletes the active page → page() flips to null (empty state)', () => {
    const { comp } = setupComponent();
    comp.deletePage(comp.page()!);
    expect(comp.page()).toBeNull();
  });
});

describe('D-140 SvgeDocumentSettingsDialogService — delegation', () => {
  it('opens SvgeDocumentSettings with the md config + forwards the injector', () => {
    const calls: { comp: unknown; config: MatDialogConfig }[] = [];
    const dialogStub = {
      open(comp: unknown, config: MatDialogConfig) {
        calls.push({ comp, config });
        return { afterClosed: () => undefined } as unknown as MatDialogRef<unknown>;
      },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: dialogStub }],
    });
    const service = TestBed.inject(SvgeDocumentSettingsDialogService);
    const injector = TestBed.inject(Injector);

    service.open(injector);

    expect(calls.length).toBe(1);
    expect(calls[0]!.comp).toBe(SvgeDocumentSettings);
    expect(calls[0]!.config.injector).toBe(injector);
    // 'md' bucket → 600px width, shared dialog panel class.
    expect(calls[0]!.config.width).toContain('600px');
    expect(calls[0]!.config.panelClass).toBe('svge-dialog-panel');
  });
});
