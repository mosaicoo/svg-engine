import { describe, expect, it } from 'vitest';
import { createGroup, createRect } from './node-factory';
import {
  getPageName,
  getPageViewBox,
  isPage,
  SVGE_KIND_PAGE,
  SVGE_PAGE_NAME_KEY,
  SVGE_PAGE_VIEWBOX_KEY,
  withPageFlag,
  withPageName,
  withPageViewBox,
  withoutPageFlag,
} from './page';
import { SVGE_KIND_KEY } from './layer';

/**
 * **D-079** specs — page metadata helpers. Mirrors layer.spec.ts +
 * smart-object specs in pattern. Pure functions, no DI.
 */

const SAMPLE_VIEWBOX = { x: 0, y: 0, width: 800, height: 600 };

describe('D-079 — isPage type guard', () => {
  it('returns true only for groups flagged as page', () => {
    const group = createGroup([], {});
    expect(isPage(group)).toBe(false);
    const page = withPageFlag(group, SAMPLE_VIEWBOX);
    expect(isPage(page)).toBe(true);
  });

  it('returns false for non-group nodes', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    // Forcibly flag the metadata (defensive — should still be false because type !== group).
    const fake = {
      ...rect,
      metadata: { ...rect.metadata, customData: { [SVGE_KIND_KEY]: SVGE_KIND_PAGE } },
    };
    expect(isPage(fake)).toBe(false);
  });

  it('returns false for groups flagged as layer or smart-object', () => {
    const group = createGroup([], {
      metadata: { customData: { [SVGE_KIND_KEY]: 'layer' } },
    });
    expect(isPage(group)).toBe(false);
  });
});

describe('D-079 — withPageFlag / withoutPageFlag', () => {
  it('sets viewBox + name + svgeKind', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX, 'Cover');
    expect(page.metadata.customData?.[SVGE_KIND_KEY]).toBe(SVGE_KIND_PAGE);
    expect(page.metadata.customData?.[SVGE_PAGE_VIEWBOX_KEY]).toEqual(SAMPLE_VIEWBOX);
    expect(page.metadata.customData?.[SVGE_PAGE_NAME_KEY]).toBe('Cover');
  });

  it('preserves pre-existing customData keys', () => {
    const group = createGroup([], { metadata: { customData: { other: 'value' } } });
    const page = withPageFlag(group, SAMPLE_VIEWBOX);
    expect(page.metadata.customData?.['other']).toBe('value');
    expect(page.metadata.customData?.[SVGE_KIND_KEY]).toBe(SVGE_KIND_PAGE);
  });

  it('withoutPageFlag clears page-specific metadata', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX, 'Cover');
    const plain = withoutPageFlag(page);
    expect(isPage(plain)).toBe(false);
    expect(plain.metadata.customData).toBeUndefined();
  });

  it('withoutPageFlag is a no-op for non-page groups', () => {
    const group = createGroup([], {});
    expect(withoutPageFlag(group)).toBe(group);
  });

  it('withoutPageFlag preserves other customData when present', () => {
    const group = createGroup([], { metadata: { customData: { other: 'value' } } });
    const page = withPageFlag(group, SAMPLE_VIEWBOX);
    const back = withoutPageFlag(page);
    expect(isPage(back)).toBe(false);
    expect(back.metadata.customData).toEqual({ other: 'value' });
  });
});

describe('D-079 — getPageViewBox', () => {
  it('returns the stored viewBox', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX);
    expect(getPageViewBox(page)).toEqual(SAMPLE_VIEWBOX);
  });

  it('returns null for non-page nodes', () => {
    expect(getPageViewBox(createGroup([], {}))).toBeNull();
  });

  it('returns null when viewBox metadata is missing', () => {
    const group = createGroup([], {
      metadata: { customData: { [SVGE_KIND_KEY]: SVGE_KIND_PAGE } },
    });
    expect(getPageViewBox(group)).toBeNull();
  });

  it('returns null when viewBox metadata is malformed', () => {
    const group = createGroup([], {
      metadata: {
        customData: {
          [SVGE_KIND_KEY]: SVGE_KIND_PAGE,
          [SVGE_PAGE_VIEWBOX_KEY]: { x: 0, y: 0, width: 'bad' },
        },
      },
    });
    expect(getPageViewBox(group)).toBeNull();
  });
});

describe('D-079 — getPageName fallbacks', () => {
  it('returns the explicit page name when set', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX, 'Front');
    expect(getPageName(page)).toBe('Front');
  });

  it('falls back to metadata.name', () => {
    const base = createGroup([], { metadata: { name: 'Legacy' } });
    const page = withPageFlag(base, SAMPLE_VIEWBOX);
    expect(getPageName(page)).toBe('Legacy');
  });

  it('falls back to "Untitled Page" when nothing is set', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX);
    expect(getPageName(page)).toBe('Untitled Page');
  });

  it('returns empty string for non-page nodes', () => {
    expect(getPageName(createGroup([], {}))).toBe('');
  });
});

describe('D-079 — withPageViewBox / withPageName mutations', () => {
  it('withPageViewBox replaces the stored viewBox', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX);
    const next = withPageViewBox(page, { x: 10, y: 10, width: 200, height: 100 });
    expect(getPageViewBox(next)).toEqual({ x: 10, y: 10, width: 200, height: 100 });
  });

  it('withPageViewBox is a no-op for non-page nodes', () => {
    const group = createGroup([], {});
    expect(withPageViewBox(group, SAMPLE_VIEWBOX)).toBe(group);
  });

  it('withPageName updates display name', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX, 'Old');
    const next = withPageName(page, 'New');
    expect(getPageName(next)).toBe('New');
  });

  it('withPageName clears name when empty string given', () => {
    const page = withPageFlag(createGroup([], {}), SAMPLE_VIEWBOX, 'Some');
    const cleared = withPageName(page, '');
    // Empty name → fallback to "Untitled Page" (no metadata.name either).
    expect(getPageName(cleared)).toBe('Untitled Page');
  });
});
