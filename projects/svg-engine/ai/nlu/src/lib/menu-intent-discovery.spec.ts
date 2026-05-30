import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MenuContributionRegistry } from 'svg-engine/edit';
import { describe, expect, it } from 'vitest';
import {
  discoverMenuIntents,
  discoverMenuIntentsReactive,
  menuContributionToIntent,
} from './menu-intent-discovery';
import { NaturalLanguageService } from './natural-language.service';
import type { NluContext } from './types';

function makeCtx(): NluContext {
  return { injector: TestBed.inject(Injector) };
}

function setup() {
  TestBed.configureTestingModule({});
  return {
    nlu: TestBed.inject(NaturalLanguageService),
    menus: TestBed.inject(MenuContributionRegistry),
    ctx: makeCtx(),
  };
}

describe('NLU › menu-intent-discovery', () => {
  describe('menuContributionToIntent', () => {
    it('derives keywords from label (tokenized + deacented + stopwords stripped)', () => {
      const intent = menuContributionToIntent({
        id: 'undo',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      expect(intent).not.toBeNull();
      expect(intent!.keywords).toContain('undo');
    });

    it('strips ellipsis from labels like "Import SVG…"', () => {
      const intent = menuContributionToIntent({
        id: 'import',
        slot: 'menu.file',
        label: 'Import SVG…',
        run() {
          /* no-op */
        },
      });
      expect(intent!.keywords).toEqual(expect.arrayContaining(['import', 'svg']));
    });

    it('returns null for dividers', () => {
      const intent = menuContributionToIntent({
        id: 'div1',
        slot: 'menu.edit',
        label: '',
        divider: true,
        run() {
          /* no-op */
        },
      });
      expect(intent).toBeNull();
    });

    it('returns null for items with empty / whitespace-only label', () => {
      expect(
        menuContributionToIntent({
          id: 'a',
          slot: 'x',
          label: '',
          run() {
            /* no-op */
          },
        }),
      ).toBeNull();
    });

    it('marks intent destructive when label has delete/remove/clear', () => {
      const del = menuContributionToIntent({
        id: 'del',
        slot: 'menu.edit',
        label: 'Delete',
        run() {
          /* no-op */
        },
      });
      expect(del?.destructive).toBe(true);

      const rem = menuContributionToIntent({
        id: 'rem',
        slot: 'menu.edit',
        label: 'Remove selection',
        run() {
          /* no-op */
        },
      });
      expect(rem?.destructive).toBe(true);

      // non-destructive
      const undo = menuContributionToIntent({
        id: 'undo',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      expect(undo?.destructive).toBe(false);
    });

    it('preserves the original contribution id in the intent id (prefixed)', () => {
      const intent = menuContributionToIntent({
        id: 'svge.builtin.edit.undo',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      expect(intent?.id).toBe('svge.nlu.menu.svge.builtin.edit.undo');
    });

    it('execute() forwards the NluContext injector to the menu run()', () => {
      let runInjector: unknown = null;
      const intent = menuContributionToIntent({
        id: 'capture',
        slot: 'menu.edit',
        label: 'Capture',
        run(ctx) {
          runInjector = ctx?.injector ?? null;
        },
      });
      const fakeInjector = {} as unknown as Injector;
      intent!.execute({}, { injector: fakeInjector });
      expect(runInjector).toBe(fakeInjector);
    });
  });

  describe('discoverMenuIntents', () => {
    it('creates intents for all eligible contributions', () => {
      const { nlu, menus } = setup();
      menus.register({
        id: 'a',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      menus.register({
        id: 'b',
        slot: 'menu.edit',
        label: 'Select All',
        run() {
          /* no-op */
        },
      });
      menus.register({
        id: 'div',
        slot: 'menu.edit',
        label: '',
        divider: true,
        run() {
          /* no-op */
        },
      });
      const result = discoverMenuIntents(menus, nlu);
      expect(result.count).toBe(2); // divider skipped
      expect(nlu.intents().length).toBe(2);
    });

    it('composedDispose removes all created intents', () => {
      const { nlu, menus } = setup();
      menus.register({
        id: 'a',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      const result = discoverMenuIntents(menus, nlu);
      expect(nlu.intents().length).toBe(1);
      result.composedDispose.dispose();
      expect(nlu.intents().length).toBe(0);
    });

    it('does not throw or duplicate when called twice', () => {
      const { nlu, menus } = setup();
      menus.register({
        id: 'a',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      const first = discoverMenuIntents(menus, nlu);
      const second = discoverMenuIntents(menus, nlu);
      expect(first.count).toBe(1);
      expect(second.count).toBe(0); // já existia
      expect(nlu.intents().length).toBe(1);
    });

    it('discovered intent triggers original menu run() via NLU parse + execute', async () => {
      const { nlu, menus, ctx } = setup();
      let fired = false;
      menus.register({
        id: 'svge.test.undo',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          fired = true;
        },
      });
      discoverMenuIntents(menus, nlu);
      const result = await nlu.execute('undo', ctx);
      expect(result.executed).toBe(true);
      expect(fired).toBe(true);
    });
  });

  // Audit #12 — reactive companion. Covers: initial sync read,
  // late register, late dispose, disposal cleanup, idempotency.
  describe('discoverMenuIntentsReactive', () => {
    it('synchronously registers intents for menus already present at call time', () => {
      const { nlu, menus } = setup();
      const injector = TestBed.inject(Injector);
      menus.register({
        id: 'svge.test.undo',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      // No flushEffects — initial discovery is sync per contract.
      const handle = discoverMenuIntentsReactive(menus, nlu, injector);
      try {
        expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.undo')).toBe(true);
      } finally {
        handle.disposable.dispose();
      }
    });

    it('reflects a late-registered menu contribution as a new intent', () => {
      const { nlu, menus } = setup();
      const injector = TestBed.inject(Injector);
      const handle = discoverMenuIntentsReactive(menus, nlu, injector);
      try {
        expect(nlu.intents().length).toBe(0);
        menus.register({
          id: 'svge.test.late',
          slot: 'menu.edit',
          label: 'Redo',
          run() {
            /* no-op */
          },
        });
        TestBed.flushEffects();
        expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.late')).toBe(true);
      } finally {
        handle.disposable.dispose();
      }
    });

    it('removes the intent when its menu contribution is disposed at the registry', () => {
      const { nlu, menus } = setup();
      const injector = TestBed.inject(Injector);
      const menuDisp = menus.register({
        id: 'svge.test.toremove',
        slot: 'menu.edit',
        label: 'Cut',
        run() {
          /* no-op */
        },
      });
      const handle = discoverMenuIntentsReactive(menus, nlu, injector);
      try {
        expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.toremove')).toBe(true);
        menuDisp.dispose();
        TestBed.flushEffects();
        expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.toremove')).toBe(false);
      } finally {
        handle.disposable.dispose();
      }
    });

    it('disposable.dispose() removes the current batch and stops the effect', () => {
      const { nlu, menus } = setup();
      const injector = TestBed.inject(Injector);
      menus.register({
        id: 'svge.test.alpha',
        slot: 'menu.edit',
        label: 'Undo',
        run() {
          /* no-op */
        },
      });
      const handle = discoverMenuIntentsReactive(menus, nlu, injector);
      expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.alpha')).toBe(true);

      handle.disposable.dispose();
      expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.alpha')).toBe(false);

      // Effect should be stopped — registering a NEW menu after disposal
      // must NOT auto-create a new intent.
      menus.register({
        id: 'svge.test.beta',
        slot: 'menu.edit',
        label: 'Redo',
        run() {
          /* no-op */
        },
      });
      TestBed.flushEffects();
      expect(nlu.intents().some((i) => i.id === 'svge.nlu.menu.svge.test.beta')).toBe(false);
    });

    it('disposable.dispose() is idempotent (calling twice does not throw)', () => {
      const { nlu, menus } = setup();
      const injector = TestBed.inject(Injector);
      const handle = discoverMenuIntentsReactive(menus, nlu, injector);
      handle.disposable.dispose();
      expect(() => handle.disposable.dispose()).not.toThrow();
    });
  });
});
