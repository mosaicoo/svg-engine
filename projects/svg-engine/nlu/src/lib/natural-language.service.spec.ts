import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NaturalLanguageService } from './natural-language.service';
import type { NluContext, NluIntent } from './types';

function makeCtx(): NluContext {
  return { injector: TestBed.inject(Injector) };
}

function setup() {
  TestBed.configureTestingModule({});
  return {
    nlu: TestBed.inject(NaturalLanguageService),
    ctx: makeCtx(),
  };
}

function buildSimpleIntent(overrides: Partial<NluIntent> = {}): NluIntent {
  return {
    id: 'test.simple',
    keywords: ['retangulo', 'rectangle'],
    execute() {
      /* no-op */
    },
    ...overrides,
  };
}

describe('NaturalLanguageService', () => {
  it('starts with empty intents', () => {
    const { nlu } = setup();
    expect(nlu.intents().length).toBe(0);
  });

  describe('registerIntent', () => {
    it('registers and returns disposable', () => {
      const { nlu } = setup();
      const d = nlu.registerIntent(buildSimpleIntent());
      expect(nlu.intents().length).toBe(1);
      d.dispose();
      expect(nlu.intents().length).toBe(0);
    });
    it('throws on empty id', () => {
      const { nlu } = setup();
      expect(() => nlu.registerIntent(buildSimpleIntent({ id: '' }))).toThrow();
    });
    it('throws on empty keywords', () => {
      const { nlu } = setup();
      expect(() => nlu.registerIntent(buildSimpleIntent({ keywords: [] }))).toThrow();
    });
    it('throws on duplicate id', () => {
      const { nlu } = setup();
      nlu.registerIntent(buildSimpleIntent());
      expect(() => nlu.registerIntent(buildSimpleIntent())).toThrow();
    });
  });

  describe('parse', () => {
    it('returns empty when no intents registered', () => {
      const { nlu, ctx } = setup();
      expect(nlu.parse('criar retangulo', ctx)).toEqual([]);
    });
    it('returns empty for empty text', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent());
      expect(nlu.parse('', ctx)).toEqual([]);
    });
    it('matches an intent with exact keyword', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent());
      const candidates = nlu.parse('criar retangulo', ctx);
      expect(candidates.length).toBe(1);
      expect(candidates[0].confidence).toBeGreaterThan(0.5);
    });
    it('matches PT and EN equivalently when both keywords declared', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent());
      const pt = nlu.parse('retangulo', ctx);
      const en = nlu.parse('rectangle', ctx);
      expect(pt[0]?.intent.id).toBe('test.simple');
      expect(en[0]?.intent.id).toBe('test.simple');
    });
    it('elevates confidence with action keyword', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent({ actionKeywords: ['create'] }));
      const withAction = nlu.parse('criar retangulo', ctx);
      const withoutAction = nlu.parse('retangulo', ctx);
      expect(withAction[0].confidence).toBeGreaterThan(withoutAction[0].confidence);
    });
    it('penalizes required slots that are missing', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(
        buildSimpleIntent({
          slots: { color: { kind: 'color', optional: false } },
        }),
      );
      const withColor = nlu.parse('retangulo vermelho', ctx);
      const withoutColor = nlu.parse('retangulo', ctx);
      // Both may return candidates, but withColor should outrank
      expect(withColor[0].confidence).toBeGreaterThan(withoutColor[0]?.confidence ?? -1);
    });
    it('respects threshold option', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent());
      // Very high threshold filters all out
      expect(nlu.parse('retangulo', ctx, { threshold: 0.99 }).length).toBe(0);
    });
    it('returns sorted by confidence desc', () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent({ id: 'a', actionKeywords: ['create'] }));
      nlu.registerIntent(buildSimpleIntent({ id: 'b' }));
      const candidates = nlu.parse('criar retangulo', ctx);
      expect(candidates.length).toBe(2);
      expect(candidates[0].confidence).toBeGreaterThanOrEqual(candidates[1].confidence);
      expect(candidates[0].intent.id).toBe('a'); // tem actionKeyword match
    });
  });

  describe('execute', () => {
    it('returns no-match when no candidates', async () => {
      const { nlu, ctx } = setup();
      const result = await nlu.execute('xyz abc', ctx);
      expect(result.executed).toBe(false);
      expect(result.rejection).toBe('no-match');
    });

    it('auto-executes high-confidence non-destructive intent', async () => {
      const { nlu, ctx } = setup();
      let called = false;
      nlu.registerIntent(
        buildSimpleIntent({
          actionKeywords: ['create'],
          execute: () => {
            called = true;
          },
        }),
      );
      const result = await nlu.execute('criar retangulo', ctx);
      expect(result.executed).toBe(true);
      expect(called).toBe(true);
    });

    it('rejects destructive intent without confirmGate', async () => {
      const { nlu, ctx } = setup();
      let called = false;
      nlu.registerIntent(
        buildSimpleIntent({
          destructive: true,
          actionKeywords: ['delete'],
          execute: () => {
            called = true;
          },
        }),
      );
      const result = await nlu.execute('deletar retangulo', ctx);
      expect(result.executed).toBe(false);
      expect(result.rejection).toBe('destructive-no-gate');
      expect(called).toBe(false);
    });

    it('executes destructive intent when confirmGate approves', async () => {
      const { nlu, ctx } = setup();
      let called = false;
      nlu.registerIntent(
        buildSimpleIntent({
          destructive: true,
          actionKeywords: ['delete'],
          execute: () => {
            called = true;
          },
        }),
      );
      const result = await nlu.execute('deletar retangulo', ctx, {
        confirmGate: () => true,
      });
      expect(result.executed).toBe(true);
      expect(called).toBe(true);
    });

    it('rejects when confirmGate declines', async () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(
        buildSimpleIntent({
          destructive: true,
          actionKeywords: ['delete'],
        }),
      );
      const result = await nlu.execute('deletar retangulo', ctx, {
        confirmGate: () => false,
      });
      expect(result.executed).toBe(false);
      expect(result.rejection).toBe('confirmation-declined');
    });

    it('returns alternatives sorted by confidence', async () => {
      const { nlu, ctx } = setup();
      nlu.registerIntent(buildSimpleIntent({ id: 'best', actionKeywords: ['create'] }));
      nlu.registerIntent(buildSimpleIntent({ id: 'second' }));
      const result = await nlu.execute('criar retangulo', ctx);
      expect(result.executed).toBe(true);
      expect(result.candidate?.intent.id).toBe('best');
      expect(result.alternatives.length).toBe(1);
      expect(result.alternatives[0].intent.id).toBe('second');
    });
  });
});
