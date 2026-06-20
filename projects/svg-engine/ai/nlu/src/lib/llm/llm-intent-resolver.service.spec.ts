import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NaturalLanguageService } from '../natural-language.service';
import type { NluContext, NluIntent } from '../types';
import {
  AI_CHAT_PROVIDER,
  type AiChatMessage,
  type AiChatOptions,
  type AiChatProvider,
} from './llm-provider';
import { LlmIntentResolverService, parsePlan } from './llm-intent-resolver.service';

function makeCtx(): NluContext {
  return { injector: TestBed.inject(Injector) };
}

interface Captured {
  messages?: readonly AiChatMessage[];
  opts?: AiChatOptions;
}

function fakeProvider(reply: string, captured?: Captured): AiChatProvider {
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
  };
}

function setup(provider: AiChatProvider | null) {
  // Reset first so a single test can call setup() more than once
  // (e.g. with/without a provider) without "already instantiated".
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: provider !== null ? [{ provide: AI_CHAT_PROVIDER, useValue: provider }] : [],
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
