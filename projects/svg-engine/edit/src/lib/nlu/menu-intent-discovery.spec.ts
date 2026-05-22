import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MenuContributionRegistry } from '../menu/menu-contribution-registry.service';
import { discoverMenuIntents, menuContributionToIntent } from './menu-intent-discovery';
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
});
