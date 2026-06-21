import { Injector, type Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { NodeId, SvgDocument } from 'svg-engine/core';
import { ImportPlacementService } from 'svg-engine/edit';
import { describe, expect, it } from 'vitest';

import { NaturalLanguageService } from '../natural-language.service';
import type { NluContext, NluIntent } from '../types';
import {
  AI_CHAT_PROVIDER,
  type AiChatMessage,
  type AiChatOptions,
  type AiChatProvider,
} from './llm-provider';
import { extractSvgBlob, LlmIntentResolverService, parsePlan } from './llm-intent-resolver.service';

function makeCtx(): NluContext {
  return { injector: TestBed.inject(Injector) };
}

interface Captured {
  messages?: readonly AiChatMessage[];
  opts?: AiChatOptions;
}

function fakeProvider(
  reply: string,
  captured?: Captured,
  models?: readonly string[],
): AiChatProvider {
  return {
    isConfigured: signal(true).asReadonly(),
    defaultModel: signal('fake-model').asReadonly(),
    async chat(messages, opts = {}) {
      if (captured) {
        captured.messages = messages;
        captured.opts = opts;
      }
      return reply;
    },
    // **D-094** — só expõe descoberta de modelos quando `models` é passado
    // (o contrato `listModels` é opcional).
    ...(models !== undefined ? { listModels: async (): Promise<readonly string[]> => models } : {}),
  };
}

/**
 * **D-094** — fake do {@link ImportPlacementService} para isolar a lógica do
 * resolver (`generateAndInsertSvg`) da inserção real no canvas (essa é
 * coberta em `import-placement.service.spec.ts`). Captura os docs recebidos
 * e devolve o `returnId` configurado.
 */
function fakePlacement(returnId: NodeId | null): { calls: SvgDocument[]; provider: Provider } {
  const calls: SvgDocument[] = [];
  return {
    calls,
    provider: {
      provide: ImportPlacementService,
      useValue: {
        placeDocumentCentered(doc: SvgDocument): NodeId | null {
          calls.push(doc);
          return returnId;
        },
      },
    },
  };
}

function setup(provider: AiChatProvider | null, extraProviders: Provider[] = []) {
  // Reset first so a single test can call setup() more than once
  // (e.g. with/without a provider) without "already instantiated".
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ...(provider !== null ? [{ provide: AI_CHAT_PROVIDER, useValue: provider }] : []),
      ...extraProviders,
    ],
  });
  return {
    nlu: TestBed.inject(NaturalLanguageService),
    resolver: TestBed.inject(LlmIntentResolverService),
    ctx: makeCtx(),
  };
}

function recordingIntent(
  id: string,
  calls: { id: string; slots: Record<string, unknown> }[],
): NluIntent {
  return {
    id,
    keywords: [id],
    description: `desc of ${id}`,
    slots: { fill: { kind: 'color', optional: true }, width: { kind: 'number', optional: true } },
    execute(slots) {
      calls.push({ id, slots });
    },
  };
}

describe('LlmIntentResolverService (D-093)', () => {
  it('isAvailable is false without a provider, true with one', () => {
    const a = setup(null);
    expect(a.resolver.isAvailable).toBe(false);
    const b = setup(fakeProvider('{}'));
    expect(b.resolver.isAvailable).toBe(true);
  });

  it('buildCatalog reflects registered intents (id, description, slot kinds)', () => {
    const { nlu, resolver } = setup(fakeProvider('{}'));
    nlu.registerIntent(recordingIntent('create-rect', []));
    const cat = resolver.buildCatalog();
    expect(cat).toHaveLength(1);
    expect(cat[0].id).toBe('create-rect');
    expect(cat[0].description).toBe('desc of create-rect');
    expect(cat[0].slots).toEqual({ fill: 'color', width: 'number' });
  });

  it('resolvePlan maps a valid plan to resolved steps + parses confidence', async () => {
    const captured: Captured = {};
    const reply = JSON.stringify({
      steps: [{ intentId: 'create-rect', slots: { fill: 'red', width: 100 } }],
      confidence: 0.82,
    });
    const { nlu, resolver } = setup(fakeProvider(reply, captured));
    nlu.registerIntent(recordingIntent('create-rect', []));

    const plan = await resolver.resolvePlan('um retângulo vermelho', { model: 'qwen2.5:7b' });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].intentId).toBe('create-rect');
    expect(plan.steps[0].slots).toEqual({ fill: 'red', width: 100 });
    expect(plan.confidence).toBeCloseTo(0.82);
    expect(plan.dropped).toHaveLength(0);
    // model override is forwarded to the provider (complexity routing)
    expect(captured.opts?.model).toBe('qwen2.5:7b');
    expect(captured.opts?.format).toBe('json');
  });

  it('drops steps whose intentId is not registered', async () => {
    const reply = JSON.stringify({
      steps: [
        { intentId: 'create-rect', slots: {} },
        { intentId: 'does-not-exist', slots: {} },
      ],
    });
    const { nlu, resolver } = setup(fakeProvider(reply));
    nlu.registerIntent(recordingIntent('create-rect', []));
    const plan = await resolver.resolvePlan('algo');
    expect(plan.steps.map((s) => s.intentId)).toEqual(['create-rect']);
    expect(plan.dropped).toEqual(['does-not-exist']);
  });

  it('throws on malformed JSON', async () => {
    const { nlu, resolver } = setup(fakeProvider('totally not json'));
    nlu.registerIntent(recordingIntent('create-rect', []));
    await expect(resolver.resolvePlan('x')).rejects.toThrow();
  });

  it('throws when no provider is registered', async () => {
    const { resolver } = setup(null);
    await expect(resolver.resolvePlan('x')).rejects.toThrow();
  });

  it('resolveAndExecute runs each step through the NLU pipeline (in order)', async () => {
    const calls: { id: string; slots: Record<string, unknown> }[] = [];
    const reply = JSON.stringify({
      steps: [
        { intentId: 'create-rect', slots: { fill: 'blue' } },
        { intentId: 'create-text', slots: {} },
      ],
      confidence: 0.9,
    });
    const { nlu, resolver, ctx } = setup(fakeProvider(reply));
    nlu.registerIntent(recordingIntent('create-rect', calls));
    nlu.registerIntent(recordingIntent('create-text', calls));

    const results = await resolver.resolveAndExecute('um card', ctx);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.executed)).toBe(true);
    expect(calls.map((c) => c.id)).toEqual(['create-rect', 'create-text']);
    expect(calls[0].slots).toEqual({ fill: 'blue' });
  });

  it('does not auto-execute destructive steps without a confirm gate', async () => {
    const calls: { id: string; slots: Record<string, unknown> }[] = [];
    const reply = JSON.stringify({ steps: [{ intentId: 'delete-all', slots: {} }] });
    const { nlu, resolver, ctx } = setup(fakeProvider(reply));
    nlu.registerIntent({
      id: 'delete-all',
      keywords: ['delete'],
      destructive: true,
      execute(slots) {
        calls.push({ id: 'delete-all', slots: slots as Record<string, unknown> });
      },
    });
    const results = await resolver.resolveAndExecute('apague tudo', ctx);
    expect(results[0].executed).toBe(false);
    expect(results[0].rejection).toBe('destructive-no-gate');
    expect(calls).toHaveLength(0);
  });
});

describe('parsePlan (D-093)', () => {
  it('parses a clean object', () => {
    const r = parsePlan('{"steps":[{"intentId":"a","slots":{"x":1}}],"confidence":0.5}');
    expect(r.steps).toEqual([{ intentId: 'a', slots: { x: 1 } }]);
    expect(r.confidence).toBe(0.5);
  });

  it('strips markdown fences', () => {
    const r = parsePlan('```json\n{"steps":[{"intentId":"a"}]}\n```');
    expect(r.steps).toEqual([{ intentId: 'a', slots: {} }]);
  });

  it('accepts a top-level array of steps', () => {
    const r = parsePlan('[{"intentId":"a"},{"intentId":"b"}]');
    expect(r.steps.map((s) => s.intentId)).toEqual(['a', 'b']);
  });

  it('accepts a single-step object', () => {
    const r = parsePlan('{"intentId":"a","slots":{"k":2}}');
    expect(r.steps).toEqual([{ intentId: 'a', slots: { k: 2 } }]);
  });

  it('tolerates id/intent aliases and prose around the JSON', () => {
    const r = parsePlan('Here you go: {"steps":[{"id":"a"},{"intent":"b"}]} done');
    expect(r.steps.map((s) => s.intentId)).toEqual(['a', 'b']);
  });

  it('clamps confidence to [0,1] and defaults to 1', () => {
    expect(parsePlan('{"steps":[],"confidence":5}').confidence).toBe(1);
    expect(parsePlan('{"steps":[]}').confidence).toBe(1);
    expect(parsePlan('{"steps":[],"confidence":-2}').confidence).toBe(0);
  });

  it('throws on non-JSON', () => {
    expect(() => parsePlan('nope')).toThrow();
  });
});

describe('extractSvgBlob (D-094)', () => {
  it('returns the svg element verbatim', () => {
    const svg = '<svg viewBox="0 0 1 1"><rect/></svg>';
    expect(extractSvgBlob(svg)).toBe(svg);
  });

  it('strips markdown fences and surrounding prose', () => {
    const svg = '<svg><circle/></svg>';
    expect(extractSvgBlob('Here you go:\n```svg\n' + svg + '\n```\nDone')).toBe(svg);
  });

  it('slices from the first <svg to the last </svg> (case-insensitive)', () => {
    const svg = '<svg><g><rect/></g></svg>';
    expect(extractSvgBlob('blah ' + svg + ' trailing')).toBe(svg);
    expect(extractSvgBlob('<SVG><rect/></SVG>')).toBe('<SVG><rect/></SVG>');
  });

  it('returns empty string when no svg is present', () => {
    expect(extractSvgBlob('no svg here')).toBe('');
    expect(extractSvgBlob('<div>not svg</div>')).toBe('');
  });
});

describe('LlmIntentResolverService — model discovery (D-094)', () => {
  it('defaultModel is null without a provider, reflects the provider with one', () => {
    expect(setup(null).resolver.defaultModel).toBeNull();
    expect(setup(fakeProvider('{}')).resolver.defaultModel).toBe('fake-model');
  });

  it('listModels returns [] without a provider', async () => {
    await expect(setup(null).resolver.listModels()).resolves.toEqual([]);
  });

  it('listModels returns [] when the provider does not implement discovery', async () => {
    await expect(setup(fakeProvider('{}')).resolver.listModels()).resolves.toEqual([]);
  });

  it('listModels delegates to the provider when it supports discovery', async () => {
    const { resolver } = setup(fakeProvider('{}', undefined, ['qwen2.5:3b', 'qwen2.5:7b']));
    await expect(resolver.listModels()).resolves.toEqual(['qwen2.5:3b', 'qwen2.5:7b']);
  });
});

describe('LlmIntentResolverService — raw SVG mode (D-094)', () => {
  it('generateSvg requests raw SVG (no JSON format) and extracts the <svg> blob', async () => {
    const captured: Captured = {};
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>';
    const { resolver } = setup(fakeProvider('```svg\n' + svg + '\n```', captured));

    const out = await resolver.generateSvg('um quadrado', { model: 'qwen2.5:7b' });
    expect(out.svg).toBe(svg);
    // raw-SVG mode must NOT force JSON formatting (it would corrupt the markup)
    expect(captured.opts?.format).toBeUndefined();
    expect(captured.opts?.model).toBe('qwen2.5:7b');
    expect(captured.opts?.temperature).toBe(0);
    // reuses the SAME KPI-card example as the catalog mode, as an SVG
    const sys = captured.messages?.[0]?.content ?? '';
    expect(sys).toContain('card de KPI');
    expect(sys).toContain('<svg');
  });

  it('generateSvg throws when no provider is registered', async () => {
    await expect(setup(null).resolver.generateSvg('x')).rejects.toThrow();
  });

  it('generateAndInsertSvg imports the SVG and delegates to placeDocumentCentered', async () => {
    const fp = fakePlacement('node-1' as NodeId);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
    const { resolver, ctx } = setup(fakeProvider(svg), [fp.provider]);

    const res = await resolver.generateAndInsertSvg('um quadrado vermelho', ctx);
    expect(res.ok).toBe(true);
    expect(res.nodeId).toBe('node-1');
    expect(fp.calls).toHaveLength(1);
  });

  it('generateAndInsertSvg returns ok:false (no error throw) when the model returns no SVG', async () => {
    const { resolver, ctx } = setup(fakeProvider('desculpe, não consigo'));
    const res = await resolver.generateAndInsertSvg('algo', ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.nodeId).toBeUndefined();
  });

  it('generateAndInsertSvg returns ok:false when placement finds no drawable content', async () => {
    const fp = fakePlacement(null);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
    const { resolver, ctx } = setup(fakeProvider(svg), [fp.provider]);

    const res = await resolver.generateAndInsertSvg('vazio', ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('desenhável');
  });
});

describe('buildCatalog curation (D-093 Fase 4)', () => {
  function plainIntent(id: string, keywords: string[], description: string): NluIntent {
    return {
      id,
      keywords,
      description,
      execute() {
        /* test stub — never invoked in catalog-curation tests */
      },
    };
  }

  it('returns ALL intents when at/under the cap (legacy behavior, with or without text)', () => {
    const { nlu, resolver } = setup(fakeProvider('{}'));
    nlu.registerIntent(recordingIntent('create-rect', []));
    expect(resolver.buildCatalog()).toHaveLength(1);
    expect(resolver.buildCatalog('whatever the request is')).toHaveLength(1);
  });

  it('curates to maxEntries when the registry exceeds the cap, always keeping core primitives', () => {
    const { nlu, resolver } = setup(fakeProvider('{}'));
    // Core primitive (kept regardless of relevance).
    nlu.registerIntent(
      plainIntent('svge.builtin.nlu.create-shape', ['rect', 'retangulo'], 'criar forma'),
    );
    // Noise (irrelevant to the test phrase).
    for (let i = 0; i < 10; i++) {
      nlu.registerIntent(plainIntent(`noise-${i}`, [`noise${i}`], `ruido ${i}`));
    }
    // Relevant-by-text intent.
    nlu.registerIntent(plainIntent('rotate-thing', ['girar', 'rotate'], 'girar o objeto'));

    const cat = resolver.buildCatalog('girar retangulo', { maxEntries: 3 });
    expect(cat.length).toBeLessThanOrEqual(3);
    const ids = cat.map((e) => e.id);
    // create-shape is core → always present even though the phrase is about rotating.
    expect(ids).toContain('svge.builtin.nlu.create-shape');
    // rotate-thing wins a slot via the 'girar' token overlap.
    expect(ids).toContain('rotate-thing');
  });

  it('system prompt carries the few-shot example + schema reminder and forbids invented keys', async () => {
    const captured: Captured = {};
    const { nlu, resolver } = setup(fakeProvider('{"steps":[]}', captured));
    nlu.registerIntent(plainIntent('svge.builtin.nlu.create-shape', ['rect'], 'criar forma'));

    await resolver.resolvePlan('crie um card de KPI');
    const sys = captured.messages?.[0]?.content ?? '';
    expect(sys).toContain('EXAMPLE');
    // few-shot uses the REAL create-shape id from the catalog
    expect(sys).toContain('svge.builtin.nlu.create-shape');
    expect(sys).toContain('"steps"');
    // explicit guard against the observed failure mode ({"card":...})
    expect(sys).toContain('"card"');
    expect(sys).toContain('NEVER output any other top-level key');
  });
});
