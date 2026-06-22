import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  createGroup,
  createRect,
  EditorStateService,
  type NodeId,
  type SvgDocument,
  withSmartObjectFlag,
} from 'svg-engine/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { SvgeSmartObjectEditorDialog } from './smart-object-dialog.component';

/**
 * **D-097** — the Edit Contents dialog must preserve `<defs>`: when the
 * user's source carries gradients/filters/patterns, applying must merge them
 * into the document so the smart object's `url(#id)` fills keep resolving.
 */

const SO_ID = 'so1' as NodeId;

/** A new SVG with its own gradient def + a rect that references it. */
const GRADIENT_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
  '<defs><linearGradient id="grad1"><stop offset="0" stop-color="#ff0000"/>',
  '<stop offset="1" stop-color="#0000ff"/></linearGradient></defs>',
  '<rect width="60" height="60" fill="url(#grad1)"/>',
  '</svg>',
].join('');

function seedDocWithSmartObject(state: EditorStateService): void {
  const child = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const wrapper = withSmartObjectFlag(createGroup([child], { id: SO_ID }));
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup([wrapper], { id: 'root' as NodeId }),
  };
  state.resetDocument(doc);
}

describe('SvgeSmartObjectEditorDialog (D-097)', () => {
  let fixture: ComponentFixture<SvgeSmartObjectEditorDialog>;
  let state: EditorStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { nodeId: SO_ID } },
        { provide: MatDialogRef, useValue: { close: (): void => undefined } },
      ],
    });
    state = TestBed.inject(EditorStateService);
    seedDocWithSmartObject(state);
    fixture = TestBed.createComponent(SvgeSmartObjectEditorDialog);
    fixture.detectChanges();
  });

  it('apply merges the edited <defs> into the document (gradients resolve)', () => {
    const ta = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = GRADIENT_SVG;
    ta.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { apply(): void }).apply();

    const defs = state.document().defs ?? '';
    expect(defs).toContain('linearGradient');
    expect(defs).toContain('id="grad1"');
    // The smart object's children were swapped to the new rect.
    const wrapper = state.document().root.children[0]!;
    expect(wrapper.type === 'group' && wrapper.children.length).toBe(1);
  });

  it('a no-op apply (unchanged source) does not touch the document defs', () => {
    const before = state.document();
    (fixture.componentInstance as unknown as { apply(): void }).apply();
    // dirty() is false → no dispatch, no defs write.
    expect(state.document()).toBe(before);
  });
});
