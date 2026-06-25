import { TestBed } from '@angular/core/testing';
import {
  createEllipse,
  createGroup,
  createPath,
  createRect,
  createText,
  type GroupNode,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { FindReplaceService } from './find-replace.service';

/**
 * **D-070** — Coverage for the pure find logic. Mirrors the v1
 * scope: case-insensitive color string equality, font-family
 * contains-match, generic attribute exact-string.
 */

function root(children: readonly SvgNode[]): GroupNode {
  return createGroup(children, { id: 'root' as never });
}

function svc(): FindReplaceService {
  TestBed.configureTestingModule({ providers: [FindReplaceService] });
  return TestBed.inject(FindReplaceService);
}

describe('FindReplaceService — fill / stroke', () => {
  it('matches nodes by fill color (case-insensitive)', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#FF0000' } });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#ff0000' } });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#00ff00' } });
    const matches = svc().findAll(root([a, b, c]), { kind: 'fill', value: '#ff0000' });
    expect(matches.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
    expect(matches[0]!.bucket).toBe('style');
    expect(matches[0]!.field).toBe('fill');
  });

  it('matches by stroke color', () => {
    const a = createPath('M0 0 L10 10', { style: { stroke: 'black' } });
    const b = createPath('M0 0 L10 10', { style: { stroke: 'red' } });
    const matches = svc().findAll(root([a, b]), { kind: 'stroke', value: 'black' });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(a.id);
  });

  it('does NOT match across formats (string equality, not color parsing)', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { fill: '#ff0000' } });
    const matches = svc().findAll(root([r]), { kind: 'fill', value: 'red' });
    expect(matches).toHaveLength(0); // documented limitation
  });

  it('ignores nodes without the queried style field', () => {
    // Note: createPath defaults provide style.fill — to truly test absence
    // we override style explicitly without that field.
    const noFill = createPath('M0 0 L10 10', { style: { stroke: 'black', fill: undefined } });
    const matches = svc().findAll(root([noFill]), { kind: 'fill', value: '#000' });
    expect(matches).toHaveLength(0);
  });
});

describe('FindReplaceService — fontFamily', () => {
  it('matches text nodes by fontFamily (contains, case-insensitive)', () => {
    const a = { ...createText({ x: 0, y: 0, content: 'A' }), fontFamily: 'Arial, sans-serif' };
    const b = { ...createText({ x: 0, y: 0, content: 'B' }), fontFamily: 'Inter, sans-serif' };
    const c = { ...createText({ x: 0, y: 0, content: 'C' }) }; // no fontFamily
    const matches = svc().findAll(root([a, b, c]), { kind: 'fontFamily', value: 'arial' });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(a.id);
    expect(matches[0]!.bucket).toBe('top');
    expect(matches[0]!.field).toBe('fontFamily');
  });

  it('exact match mode requires full equality', () => {
    const a = { ...createText({ x: 0, y: 0, content: 'A' }), fontFamily: 'Arial' };
    const b = { ...createText({ x: 0, y: 0, content: 'B' }), fontFamily: 'Arial, sans-serif' };
    const matches = svc().findAll(root([a, b]), {
      kind: 'fontFamily',
      value: 'Arial',
      match: 'exact',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(a.id);
  });

  it('skips non-text nodes entirely', () => {
    // A rect with metadata.name="Arial" must NOT match a fontFamily query
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 }, { metadata: { name: 'Arial' } });
    const t = { ...createText({ x: 0, y: 0, content: 'T' }), fontFamily: 'Arial' };
    const matches = svc().findAll(root([r, t]), { kind: 'fontFamily', value: 'Arial' });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(t.id);
  });
});

describe('FindReplaceService — attribute (generic)', () => {
  it('matches top-level field by exact string equality', () => {
    const a = { ...createText({ x: 0, y: 0, content: 'A' }), fontSize: 16 };
    const b = { ...createText({ x: 0, y: 0, content: 'B' }), fontSize: 24 };
    const matches = svc().findAll(root([a, b]), {
      kind: 'attribute',
      key: 'fontSize',
      value: '16',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(a.id);
  });

  it('ignores nodes that do not have the key', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const matches = svc().findAll(root([a]), { kind: 'attribute', key: 'fontSize', value: '16' });
    expect(matches).toHaveLength(0);
  });
});

describe('FindReplaceService — traversal', () => {
  it('walks into nested groups (depth > 1)', () => {
    const leaf = createRect({ x: 0, y: 0, width: 1, height: 1 }, { style: { fill: '#aaa' } });
    const inner = createGroup([leaf]);
    const r = root([inner]);
    const matches = svc().findAll(r, { kind: 'fill', value: '#aaa' });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(leaf.id);
  });

  it('returns empty array on no matches (never throws)', () => {
    const matches = svc().findAll(root([createEllipse({ cx: 0, cy: 0, rx: 1, ry: 1 })]), {
      kind: 'fill',
      value: '#nope',
    });
    expect(matches).toEqual([]);
  });
});
