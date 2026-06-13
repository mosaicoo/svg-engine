import { describe, expect, it } from 'vitest';
import {
  CUSTOM_ATTR_DATA_PREFIX,
  customAttrToDataName,
  dataNameToCustomAttr,
  hasCustomAttrs,
  isValidCustomAttrName,
  readCustomAttrs,
  removeCustomAttr,
  renameCustomAttr,
  setCustomAttr,
  SVGE_CUSTOM_ATTRS_KEY,
  withCustomAttrs,
} from './custom-attrs';
import { createRect } from './node-factory';

describe('D-089 — custom attribute name validation', () => {
  it('accepts a lowercase data-* suffix', () => {
    expect(isValidCustomAttrName('sku')).toBe(true);
    expect(isValidCustomAttrName('product-id')).toBe(true);
    expect(isValidCustomAttrName('a1')).toBe(true);
    expect(isValidCustomAttrName('x-y-z-9')).toBe(true);
  });

  it('rejects empties / uppercase / leading digit / bad chars', () => {
    expect(isValidCustomAttrName('')).toBe(false);
    expect(isValidCustomAttrName('SKU')).toBe(false);
    expect(isValidCustomAttrName('1abc')).toBe(false);
    expect(isValidCustomAttrName('-abc')).toBe(false);
    expect(isValidCustomAttrName('a_b')).toBe(false);
    expect(isValidCustomAttrName('a b')).toBe(false);
    expect(isValidCustomAttrName('café')).toBe(false);
  });

  it('rejects the engine-reserved svge / svge-* prefixes', () => {
    expect(isValidCustomAttrName('svge')).toBe(false);
    expect(isValidCustomAttrName('svge-kind')).toBe(false);
    expect(isValidCustomAttrName('svge-page-name')).toBe(false);
    // but a name that merely *contains* svge elsewhere is fine
    expect(isValidCustomAttrName('mysvge')).toBe(true);
    expect(isValidCustomAttrName('svgex')).toBe(true);
  });
});

describe('D-089 — data-name conversion', () => {
  it('prefixes / strips the data- prefix', () => {
    expect(CUSTOM_ATTR_DATA_PREFIX).toBe('data-');
    expect(customAttrToDataName('sku')).toBe('data-sku');
    expect(dataNameToCustomAttr('data-sku')).toBe('sku');
  });

  it('returns null for non-data or reserved attributes', () => {
    expect(dataNameToCustomAttr('sku')).toBeNull(); // no prefix
    expect(dataNameToCustomAttr('fill')).toBeNull();
    expect(dataNameToCustomAttr('data-svge-kind')).toBeNull(); // reserved
    expect(dataNameToCustomAttr('data-SKU')).toBeNull(); // invalid suffix
    expect(dataNameToCustomAttr('data-')).toBeNull(); // empty suffix
  });
});

describe('D-089 — read / has', () => {
  it('reads an empty object when none', () => {
    expect(readCustomAttrs(createRect({ x: 0, y: 0, width: 1, height: 1 }))).toEqual({});
    expect(hasCustomAttrs(createRect({ x: 0, y: 0, width: 1, height: 1 }))).toBe(false);
  });

  it('reads stored attrs and ignores other customData', () => {
    const node = createRect(
      { x: 0, y: 0, width: 1, height: 1 },
      {
        metadata: {
          customData: {
            svgeKind: 'smart-object',
            [SVGE_CUSTOM_ATTRS_KEY]: { sku: '123', 'product-id': 'ABC' },
          },
        },
      },
    );
    expect(readCustomAttrs(node)).toEqual({ sku: '123', 'product-id': 'ABC' });
    expect(hasCustomAttrs(node)).toBe(true);
  });

  it('defensively drops non-string values and invalid names', () => {
    const node = createRect(
      { x: 0, y: 0, width: 1, height: 1 },
      {
        metadata: {
          customData: {
            [SVGE_CUSTOM_ATTRS_KEY]: { sku: '123', bad: 42, SKU: 'x', svge: 'y' },
          },
        },
      },
    );
    expect(readCustomAttrs(node)).toEqual({ sku: '123' });
  });
});

describe('D-089 — pure setters', () => {
  const base = createRect({ x: 0, y: 0, width: 1, height: 1 });

  it('setCustomAttr adds an attribute', () => {
    const next = setCustomAttr(base, 'sku', '123');
    expect(readCustomAttrs(next)).toEqual({ sku: '123' });
    // original untouched (immutability)
    expect(readCustomAttrs(base)).toEqual({});
  });

  it('setCustomAttr updates an existing attribute', () => {
    const a = setCustomAttr(base, 'sku', '123');
    const b = setCustomAttr(a, 'sku', '456');
    expect(readCustomAttrs(b)).toEqual({ sku: '456' });
  });

  it('setCustomAttr is a no-op (same ref) on an invalid name', () => {
    expect(setCustomAttr(base, 'SKU', '1')).toBe(base);
    expect(setCustomAttr(base, 'svge-kind', '1')).toBe(base);
  });

  it('removeCustomAttr removes one attribute', () => {
    const a = setCustomAttr(setCustomAttr(base, 'sku', '1'), 'tag', 'x');
    const b = removeCustomAttr(a, 'sku');
    expect(readCustomAttrs(b)).toEqual({ tag: 'x' });
  });

  it('removeCustomAttr is a no-op (same ref) when absent', () => {
    const a = setCustomAttr(base, 'sku', '1');
    expect(removeCustomAttr(a, 'missing')).toBe(a);
  });

  it('removing the last attribute drops the customData entirely', () => {
    const a = setCustomAttr(base, 'sku', '1');
    const b = removeCustomAttr(a, 'sku');
    expect(b.metadata.customData).toBeUndefined();
  });

  it('keeps sibling customData when removing the last custom attr', () => {
    const node = createRect(
      { x: 0, y: 0, width: 1, height: 1 },
      { metadata: { customData: { svgeKind: 'layer', [SVGE_CUSTOM_ATTRS_KEY]: { sku: '1' } } } },
    );
    const cleaned = removeCustomAttr(node, 'sku');
    expect(readCustomAttrs(cleaned)).toEqual({});
    expect(cleaned.metadata.customData?.['svgeKind']).toBe('layer');
  });

  it('withCustomAttrs replaces the whole map and filters invalid entries', () => {
    const next = withCustomAttrs(base, { sku: '1', SKU: 'x', tag: 'y' } as Record<string, string>);
    expect(readCustomAttrs(next)).toEqual({ sku: '1', tag: 'y' });
  });
});

describe('D-089 — rename', () => {
  const base = setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '123');

  it('renames preserving the value', () => {
    const next = renameCustomAttr(base, 'sku', 'product-id');
    expect(readCustomAttrs(next)).toEqual({ 'product-id': '123' });
  });

  it('is a no-op (same ref) when source absent / target invalid / target exists', () => {
    expect(renameCustomAttr(base, 'missing', 'x')).toBe(base);
    expect(renameCustomAttr(base, 'sku', 'SKU')).toBe(base);
    const two = setCustomAttr(base, 'tag', 'y');
    expect(renameCustomAttr(two, 'sku', 'tag')).toBe(two);
  });
});
