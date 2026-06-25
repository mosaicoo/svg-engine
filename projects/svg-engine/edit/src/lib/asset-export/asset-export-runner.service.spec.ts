import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  type SvgDocument,
} from '@mosaicoo/svg-engine/core';
import { ExporterRegistry } from '@mosaicoo/svg-engine/io';
import { ActiveDefsService } from '../library/active-defs.service';
import { provideSvgEngineEditorScope } from '../scope/editor-scope.providers';
import { AssetExportRunner } from './asset-export-runner.service';

/**
 * **Export-fidelity regression guard.**
 *
 * Runtime-derived defs (gradients / patterns / effects / chains /
 * clipPaths / masks / symbols) live only in the editor's registries,
 * not in `document.defs`. The Asset Export batch runner previously
 * handed the RAW document to each exporter, so every slot dropped those
 * defs and shapes referencing them (`fill="url(#id)"`) exported blank.
 *
 * This proves the runner now threads {@link ActiveDefsService.buildExportDefs}
 * into the doc it serializes — identical to the File→Export path.
 */
describe('AssetExportRunner — runtime defs reach the exporter', () => {
  it('threads buildExportDefs() into the doc handed to the exporter', async () => {
    TestBed.configureTestingModule({ providers: [provideSvgEngineEditorScope()] });

    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: 'url(#g)' } });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    // Stub the composed defs so the test doesn't depend on real gradient
    // registration — the contract under test is "the runner USES this
    // value as the export doc's defs", which before the fix it never did.
    const activeDefs = TestBed.inject(ActiveDefsService);
    const MERGED = '<linearGradient id="g"><stop offset="0" stop-color="#f00" /></linearGradient>';
    const spy = vi.spyOn(activeDefs, 'buildExportDefs').mockReturnValue(MERGED);

    // Capture the document each exporter receives.
    let capturedDefs: string | undefined = undefined;
    const reg = TestBed.inject(ExporterRegistry);
    reg.register({
      id: 'test.capture.svg',
      name: 'Capture',
      mediaType: 'image/svg+xml',
      extension: 'svg',
      export(doc: SvgDocument): string {
        capturedDefs = doc.defs;
        return '<svg/>';
      },
    });

    const runner = TestBed.inject(AssetExportRunner);
    await runner.exportSlot(
      { id: 's1', target: 'document', exporterId: 'test.capture.svg', scale: 1, filename: 'art' },
      new Set<string>(),
    );

    expect(spy).toHaveBeenCalled();
    expect(capturedDefs).toBe(MERGED);
  });
});
