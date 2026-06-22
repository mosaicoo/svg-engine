import { describe, expect, it } from 'vitest';

import { CreatePageCommand } from '../commands/page.commands';
import type { CommandContext } from '../commands/command';
import { isPage } from '../model/page';
import type { GroupNode } from '../model/group-node';
import { createEmptyDocument } from './document-factory';
import type { SvgDocument } from './svg-document';

/**
 * **D-103** — structural container groups (document root, page) must NOT carry
 * `createGroup`'s `DEFAULT_STYLE` (`stroke:#333333`, `fill:#cccccc`). SVG
 * `stroke` is inherited, so a default on a container painted a spurious dark
 * border on every stroke-less child placed into the editor (e.g. imported
 * fill-only art). Companion to D-102 (imported document root).
 */

describe('D-103 — container groups have no default stroke/fill', () => {
  it('createEmptyDocument root has no stroke/fill (no inherited border)', () => {
    const doc = createEmptyDocument();
    expect(doc.root.style.stroke).toBeUndefined();
    expect(doc.root.style.fill).toBeUndefined();
  });

  it('CreatePageCommand creates a page group with no stroke/fill', () => {
    let doc = createEmptyDocument();
    const ctx = {
      state: {
        document: () => doc,
        setDocument: (d: SvgDocument) => {
          doc = d;
        },
      },
    } as unknown as CommandContext;

    new CreatePageCommand().execute(ctx);

    const page = doc.root.children.find(isPage) as GroupNode | undefined;
    expect(page).toBeDefined();
    expect(page!.style.stroke).toBeUndefined();
    expect(page!.style.fill).toBeUndefined();
  });
});
