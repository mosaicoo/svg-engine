import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI_CHAT_PROVIDER } from './llm-provider';
import { DEFAULT_OLLAMA_MODEL, OllamaChatProvider, provideOllamaChat } from './ollama-provider';

function mockFetchOnce(payload: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  })) as unknown as ReturnType<typeof vi.fn>;
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastBody(fn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fn.mock.calls[fn.mock.calls.length - 1];
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('OllamaChatProvider (D-093)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function make(): OllamaChatProvider {
    TestBed.configureTestingModule({ providers: [OllamaChatProvider] });
    return TestBed.inject(OllamaChatProvider);
  }

  it('posts to {baseUrl}/api/chat with the default model and returns the content', async () => {
    const fetchFn = mockFetchOnce({ message: { role: 'assistant', content: 'olá' } });
    const p = make();
    const out = await p.chat([{ role: 'user', content: 'oi' }]);
    expect(out).toBe('olá');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect((init as RequestInit).method).toBe('POST');
    const body = lastBody(fetchFn);
    expect(body['model']).toBe(DEFAULT_OLLAMA_MODEL);
    expect(body['stream']).toBe(false);
    expect(body['messages']).toEqual([{ role: 'user', content: 'oi' }]);
  });

  it('per-call model overrides the default (complexity routing)', async () => {
    const fetchFn = mockFetchOnce({ message: { content: 'x' } });
    const p = make();
    await p.chat([{ role: 'user', content: 'oi' }], { model: 'qwen2.5:7b' });
    expect(lastBody(fetchFn)['model']).toBe('qwen2.5:7b');
  });

  it('maps format/temperature/maxTokens onto the request', async () => {
    const fetchFn = mockFetchOnce({ message: { content: 'x' } });
    const p = make();
    await p.chat([{ role: 'user', content: 'oi' }], {
      format: 'json',
      temperature: 0,
      maxTokens: 128,
    });
    const body = lastBody(fetchFn);
    expect(body['format']).toBe('json');
    expect(body['options']).toEqual({ temperature: 0, num_predict: 128 });
  });

  it('omits options when no sampling knobs are passed', async () => {
    const fetchFn = mockFetchOnce({ message: { content: 'x' } });
    const p = make();
    await p.chat([{ role: 'user', content: 'oi' }]);
    expect(lastBody(fetchFn)['options']).toBeUndefined();
  });

  it('throws on non-OK HTTP', async () => {
    mockFetchOnce({}, false, 403);
    const p = make();
    await expect(p.chat([{ role: 'user', content: 'oi' }])).rejects.toThrow(/403/);
  });

  it('throws when the body carries an error field', async () => {
    mockFetchOnce({ error: 'model not found' });
    const p = make();
    await expect(p.chat([{ role: 'user', content: 'oi' }])).rejects.toThrow(/model not found/);
  });

  it('setBaseUrl normalizes a trailing slash; setModel changes the default', async () => {
    const fetchFn = mockFetchOnce({ message: { content: 'x' } });
    const p = make();
    p.setBaseUrl('http://192.168.1.21:11434/');
    p.setModel('qwen2.5:7b');
    expect(p.baseUrl()).toBe('http://192.168.1.21:11434');
    expect(p.defaultModel()).toBe('qwen2.5:7b');
    await p.chat([{ role: 'user', content: 'oi' }]);
    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe('http://192.168.1.21:11434/api/chat');
    expect(lastBody(fetchFn)['model']).toBe('qwen2.5:7b');
  });

  it('provideOllamaChat wires AI_CHAT_PROVIDER to the same instance + applies config', () => {
    TestBed.configureTestingModule({
      providers: [provideOllamaChat({ baseUrl: 'http://192.168.1.21:11434', model: 'qwen2.5:7b' })],
    });
    const token = TestBed.inject(AI_CHAT_PROVIDER);
    const concrete = TestBed.inject(OllamaChatProvider);
    expect(token).toBe(concrete);
    expect(concrete.defaultModel()).toBe('qwen2.5:7b');
    expect(concrete.baseUrl()).toBe('http://192.168.1.21:11434');
  });
});
