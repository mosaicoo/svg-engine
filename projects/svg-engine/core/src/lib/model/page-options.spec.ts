import { describe, expect, it } from 'vitest';
import { createGroup } from './node-factory';
import {
  DEFAULT_PAGE_OPTIONS,
  getPageOptions,
  type PageOptions,
  SVGE_PAGE_OPTIONS_KEY,
  withPageFlag,
  withPageOptions,
} from './page';

/**
 * **PAGES-REFACTOR Fase 3** specs — PageOptions read/write helpers.
 * Covers defaults, partial patch, defensive reads on malformed data.
 */
describe('PAGES-REFACTOR Fase 3 — getPageOptions / withPageOptions', () => {
  const VB = { x: 0, y: 0, width: 800, height: 600 };

  function makePage() {
    return withPageFlag(createGroup([], {}), VB, 'Cover');
  }

  it('getPageOptions returns DEFAULT_PAGE_OPTIONS for a non-page', () => {
    const group = createGroup([], {});
    expect(getPageOptions(group)).toEqual(DEFAULT_PAGE_OPTIONS);
  });

  it('getPageOptions returns DEFAULT_PAGE_OPTIONS for a page with no options metadata', () => {
    const page = makePage();
    expect(getPageOptions(page)).toEqual(DEFAULT_PAGE_OPTIONS);
  });

  it('withPageOptions persists a full options struct under the customData key', () => {
    const page = makePage();
    const next = withPageOptions(page, {
      background: { kind: 'solid', color: '#ff0000' },
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
      orientation: 'portrait',
      format: 'a4',
    });
    const stored = next.metadata.customData?.[SVGE_PAGE_OPTIONS_KEY] as PageOptions;
    expect(stored.background).toEqual({ kind: 'solid', color: '#ff0000' });
    expect(stored.margins.left).toBe(40);
    expect(stored.orientation).toBe('portrait');
    expect(stored.format).toBe('a4');
  });

  it('withPageOptions merges patch onto existing options (only specified fields change)', () => {
    let page = makePage();
    page = withPageOptions(page, {
      background: { kind: 'solid', color: '#blue' },
      orientation: 'portrait',
    });
    // Patch only the format, keep the rest.
    page = withPageOptions(page, { format: 'letter' });
    const opts = getPageOptions(page);
    expect(opts.background).toEqual({ kind: 'solid', color: '#blue' });
    expect(opts.orientation).toBe('portrait');
    expect(opts.format).toBe('letter');
    // Margins were never set → must equal default.
    expect(opts.margins).toEqual(DEFAULT_PAGE_OPTIONS.margins);
  });

  it('withPageOptions is a no-op on non-page input (returns same ref)', () => {
    const group = createGroup([], {});
    const same = withPageOptions(group, { format: 'a4' });
    expect(same).toBe(group);
  });

  it('getPageOptions returns defaults for malformed margins (defensive)', () => {
    const page = makePage();
    // Manually inject a malformed margins value via customData.
    const tampered = {
      ...page,
      metadata: {
        ...page.metadata,
        customData: {
          ...(page.metadata.customData ?? {}),
          [SVGE_PAGE_OPTIONS_KEY]: {
            background: { kind: 'transparent' },
            margins: { top: 'not-a-number', right: 0, bottom: 0, left: 0 },
            orientation: 'landscape',
            format: 'custom',
          },
        },
      },
    };
    const opts = getPageOptions(tampered);
    // Margins should fall back to default — never accept garbage.
    expect(opts.margins).toEqual(DEFAULT_PAGE_OPTIONS.margins);
  });

  it('getPageOptions returns default background for unknown background kind', () => {
    const page = makePage();
    const tampered = {
      ...page,
      metadata: {
        ...page.metadata,
        customData: {
          ...(page.metadata.customData ?? {}),
          [SVGE_PAGE_OPTIONS_KEY]: {
            background: { kind: 'gradient' /* unknown variant */ },
            margins: DEFAULT_PAGE_OPTIONS.margins,
            orientation: 'landscape',
            format: 'custom',
          },
        },
      },
    };
    const opts = getPageOptions(tampered);
    expect(opts.background).toEqual(DEFAULT_PAGE_OPTIONS.background);
  });
});
