import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MenuContribution } from './menu-contribution';
import { MenuContributionRegistry } from './menu-contribution-registry.service';

function makeContrib(over: Partial<MenuContribution> = {}): MenuContribution {
  return {
    id: 'test',
    slot: 'toolbar.main',
    label: 'Test',
    run: () => {
      /* noop */
    },
    ...over,
  };
}

describe('MenuContributionRegistry — basics', () => {
  it('starts empty', () => {
    expect(TestBed.inject(MenuContributionRegistry).contributions()).toEqual([]);
  });

  it('register adds the contribution and exposes it via contributions()', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register(makeContrib({ id: 'a' }));
    reg.register(makeContrib({ id: 'b' }));
    expect(reg.contributions().map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('register returns a Disposable that removes the contribution', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    const d = reg.register(makeContrib({ id: 'tmp' }));
    expect(reg.get('tmp')?.id).toBe('tmp');
    d.dispose();
    expect(reg.get('tmp')).toBeNull();
  });
});

describe('MenuContributionRegistry — validation', () => {
  it('throws on empty id', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    expect(() => reg.register(makeContrib({ id: '' }))).toThrowError(/id must be non-empty/);
  });

  it('throws on empty slot', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    expect(() => reg.register(makeContrib({ slot: '' }))).toThrowError(/slot must be non-empty/);
  });

  it('throws on duplicate id', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register(makeContrib({ id: 'dup' }));
    expect(() => reg.register(makeContrib({ id: 'dup' }))).toThrowError(/already registered/);
  });
});

describe('MenuContributionRegistry — bySlot()', () => {
  it('filters by slot id', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register(makeContrib({ id: 'a', slot: 'toolbar.main' }));
    reg.register(makeContrib({ id: 'b', slot: 'sidebar.left' }));
    reg.register(makeContrib({ id: 'c', slot: 'toolbar.main' }));
    const main = reg.bySlot('toolbar.main')();
    expect(main.map((c) => c.id)).toEqual(['a', 'c']);
    expect(
      reg
        .bySlot('sidebar.left')()
        .map((c) => c.id),
    ).toEqual(['b']);
  });

  it('sorts by order (lower first); default order is 100', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register(makeContrib({ id: 'a', order: 50 }));
    reg.register(makeContrib({ id: 'b' })); // default 100
    reg.register(makeContrib({ id: 'c', order: 200 }));
    expect(
      reg
        .bySlot('toolbar.main')()
        .map((c) => c.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('preserves insertion order for ties (stable sort)', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register(makeContrib({ id: 'x', order: 50 }));
    reg.register(makeContrib({ id: 'y', order: 50 }));
    reg.register(makeContrib({ id: 'z', order: 50 }));
    expect(
      reg
        .bySlot('toolbar.main')()
        .map((c) => c.id),
    ).toEqual(['x', 'y', 'z']);
  });

  it('hides items whose visible signal is false', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    const visA = signal(true);
    const visB = signal(false);
    reg.register(makeContrib({ id: 'a', visible: visA }));
    reg.register(makeContrib({ id: 'b', visible: visB }));
    reg.register(makeContrib({ id: 'c' })); // undefined visible → always shown
    expect(
      reg
        .bySlot('toolbar.main')()
        .map((c) => c.id),
    ).toEqual(['a', 'c']);
    visB.set(true);
    expect(
      reg
        .bySlot('toolbar.main')()
        .map((c) => c.id),
    ).toEqual(['a', 'b', 'c']);
    visA.set(false);
    expect(
      reg
        .bySlot('toolbar.main')()
        .map((c) => c.id),
    ).toEqual(['b', 'c']);
  });

  it('bySlot returns a reactive Signal that updates when contributions change', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    const slotMain = reg.bySlot('toolbar.main');
    expect(slotMain()).toEqual([]);
    reg.register(makeContrib({ id: 'a' }));
    expect(slotMain().map((c) => c.id)).toEqual(['a']);
  });
});
