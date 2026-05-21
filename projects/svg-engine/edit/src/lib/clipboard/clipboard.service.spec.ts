import { TestBed } from '@angular/core/testing';
import { createGroup, createRect } from 'svg-engine/core';
import { describe, expect, it } from 'vitest';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(ClipboardService);
  }

  it('starts empty', () => {
    const c = setup();
    expect(c.hasContent()).toBe(false);
    expect(c.size()).toBe(0);
    expect(c.peekIds()).toEqual([]);
  });

  it('copy(nodes) stores clones with FRESH ids (not the originals)', () => {
    const c = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    c.copy([r]);
    expect(c.hasContent()).toBe(true);
    expect(c.size()).toBe(1);
    expect(c.peekIds()[0]).not.toBe(r.id);
  });

  it('copy([]) is a no-op (does not wipe prior clipboard)', () => {
    const c = setup();
    c.copy([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    expect(c.size()).toBe(1);
    c.copy([]);
    expect(c.size()).toBe(1);
  });

  it('paste() returns deep clones with NEW ids each call', () => {
    const c = setup();
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    c.copy([r]);
    const first = c.paste();
    const second = c.paste();
    expect(first.length).toBe(1);
    expect(second.length).toBe(1);
    expect(first[0]!.id).not.toBe(second[0]!.id);
    expect(first[0]!.id).not.toBe(r.id);
  });

  it('paste of group deep-clones children with new ids', () => {
    const c = setup();
    const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const r2 = createRect({ x: 20, y: 0, width: 10, height: 10 });
    const g = createGroup([r1, r2]);
    c.copy([g]);
    const [paste] = c.paste();
    expect(paste!.type).toBe('group');
    const pastedGroup = paste as { readonly children: readonly { readonly id: string }[] };
    expect(pastedGroup.children.length).toBe(2);
    expect(pastedGroup.children[0]!.id).not.toBe(r1.id);
    expect(pastedGroup.children[1]!.id).not.toBe(r2.id);
  });

  it('clear() empties the clipboard', () => {
    const c = setup();
    c.copy([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    expect(c.hasContent()).toBe(true);
    c.clear();
    expect(c.hasContent()).toBe(false);
    expect(c.paste()).toEqual([]);
  });
});
