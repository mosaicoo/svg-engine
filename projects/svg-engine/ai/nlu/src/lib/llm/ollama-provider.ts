import { computed, inject, Injectable, type Provider, signal } from '@angular/core';

import {
  AI_CHAT_PROVIDER,
  type AiChatMessage,
  type AiChatOptions,
  type AiChatProvider,
} from './llm-provider';

/** Default Ollama endpoint (local). Override via {@link provideOllamaChat}. */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
/** Default model — the small/fast one that fits a modest GPU (D-093 benchmark). */
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';

/**
 * **D-095 — modelos curados (conhecidos) sugeridos no seletor.**
 *
 * Lista de fallback/curadoria que o `<svge-nlu-input>` funde com os modelos
 * **descobertos** ao vivo (`/api/tags`): garante que esses apareçam no seletor
 * mesmo quando a descoberta falha (servidor offline/sem CORS) e serve de
 * sugestão para consumidores da lib que ainda não puxaram nada.
 *
 * Inclui os modelos base (D-093) **e** os **`qwen2.5-coder`** (3b/7b/14b) —
 * estes últimos são **coder-tuned**, logo bem melhores para gerar SVG (que é
 * markup/código): fecham tags, respeitam `viewBox`/`path`/`defs`. Mantidos os
 * anteriores; os coder são **adicionais** (vide D-094 modo "SVG livre").
 */
export const DEFAULT_OLLAMA_MODELS: readonly string[] = [
  'qwen2.5:3b',
  'qwen2.5:7b',
  'qwen2.5-coder:3b',
  'qwen2.5-coder:7b',
  'qwen2.5-coder:14b',
];

/** Optional configuration for {@link OllamaChatProvider} / {@link provideOllamaChat}. */
export interface OllamaChatConfig {
  /** Base URL of the Ollama server, e.g. `http://localhost:11434`. */
  readonly baseUrl?: string;
  /** Default model id, e.g. `qwen2.5:3b`. Overridable per-call via `opts.model`. */
  readonly model?: string;
  /**
   * **D-095** — sobrescreve a lista curada de modelos sugeridos no seletor
   * ({@link DEFAULT_OLLAMA_MODELS}). Quando omitido, usa a curadoria padrão.
   */
  readonly models?: readonly string[];
}

/** Shape of the relevant fields in Ollama's `/api/chat` response. */
interface OllamaChatResponse {
  readonly message?: { readonly role?: string; readonly content?: string };
  readonly error?: string;
}

/** Shape of the relevant fields in Ollama's `/api/tags` response. */
interface OllamaTagsResponse {
  readonly models?: readonly { readonly name?: string; readonly model?: string }[];
}

/** Strip a single trailing slash so `baseUrl + '/api/chat'` never doubles it. */
function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * **D-093 — `AiChatProvider` para Ollama** (API nativa `/api/chat`).
 *
 * `fetch` puro contra um servidor Ollama. Sem dependência pesada (ao
 * contrário do Whisper), então mora no mesmo entry point `svg-engine/ai/nlu`
 * junto do contrato — o token {@link AI_CHAT_PROVIDER} mantém a troca de
 * backend desacoplada.
 *
 * **baseUrl/model são signals settáveis em runtime** — atende o requisito
 * de "trocar provider/model conforme a complexidade": o app pode chamar
 * `setModel('qwen2.5:7b')` para conteúdo pesado, ou passar `opts.model`
 * por chamada (sem mexer no default).
 *
 * **CORS**: o servidor Ollama precisa subir com `OLLAMA_ORIGINS` liberando
 * a origem do app (validado no D-093). Erros de rede/HTTP são propagados
 * via `throw` — o {@link LlmIntentResolverService} captura e degrada.
 */
@Injectable()
export class OllamaChatProvider implements AiChatProvider {
  private readonly _baseUrl = signal(DEFAULT_OLLAMA_BASE_URL);
  private readonly _model = signal(DEFAULT_OLLAMA_MODEL);
  private readonly _suggestedModels = signal<readonly string[]>(DEFAULT_OLLAMA_MODELS);

  /** Current base URL (reactive). */
  readonly baseUrl = this._baseUrl.asReadonly();
  /** Current default model (reactive). Satisfies {@link AiChatProvider.defaultModel}. */
  readonly defaultModel = this._model.asReadonly();
  /**
   * **D-095** — modelos curados sugeridos no seletor (reactive). Satisfaz
   * {@link AiChatProvider.suggestedModels}. Fundidos com os descobertos via
   * `/api/tags` pela UI; default = {@link DEFAULT_OLLAMA_MODELS}.
   */
  readonly suggestedModels = this._suggestedModels.asReadonly();
  /** `true` once a non-empty base URL is set (it always is, by default). */
  readonly isConfigured = computed(() => this._baseUrl().length > 0);

  /** Apply a partial config (only the provided fields change). */
  configure(cfg: OllamaChatConfig): void {
    if (typeof cfg.baseUrl === 'string' && cfg.baseUrl.length > 0) {
      this._baseUrl.set(normalizeBaseUrl(cfg.baseUrl));
    }
    if (typeof cfg.model === 'string' && cfg.model.length > 0) {
      this._model.set(cfg.model);
    }
    // **D-095** — só substitui a curadoria quando uma lista não-vazia é dada.
    if (Array.isArray(cfg.models) && cfg.models.length > 0) {
      this._suggestedModels.set([...cfg.models]);
    }
  }
  /** Switch the server URL at runtime. */
  setBaseUrl(url: string): void {
    if (typeof url === 'string' && url.length > 0) this._baseUrl.set(normalizeBaseUrl(url));
  }
  /** Switch the default model at runtime (complexity routing). */
  setModel(model: string): void {
    if (typeof model === 'string' && model.length > 0) this._model.set(model);
  }

  async chat(messages: readonly AiChatMessage[], opts: AiChatOptions = {}): Promise<string> {
    const model = opts.model ?? this._model();
    const options: Record<string, unknown> = {};
    if (typeof opts.temperature === 'number') options['temperature'] = opts.temperature;
    if (typeof opts.maxTokens === 'number') options['num_predict'] = opts.maxTokens;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };
    if (opts.format === 'json') body['format'] = 'json';
    if (Object.keys(options).length > 0) body['options'] = options;

    const res = await fetch(`${this._baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) {
      throw new Error(`Ollama /api/chat returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as OllamaChatResponse;
    if (typeof data.error === 'string' && data.error.length > 0) {
      throw new Error(`Ollama error: ${data.error}`);
    }
    return data.message?.content ?? '';
  }

  /**
   * **D-094** — lista os modelos instalados no servidor Ollama via
   * `GET /api/tags`. Alimenta o seletor de modelo da UI (o usuário escolhe
   * entre os modelos disponíveis em runtime). Devolve os nomes (`name`,
   * ex.: `qwen2.5:3b`) ordenados alfabeticamente e deduplicados. Propaga
   * erro de rede / HTTP — o chamador degrada para o {@link defaultModel}.
   */
  async listModels(): Promise<readonly string[]> {
    const res = await fetch(`${this._baseUrl()}/api/tags`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Ollama /api/tags returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as OllamaTagsResponse;
    const names = (data.models ?? [])
      .map((m) => m.name ?? m.model)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }
}

/**
 * **D-093** — DI helper that wires {@link OllamaChatProvider} as the active
 * {@link AI_CHAT_PROVIDER}. Add to an app/route `providers: []`:
 *
 * ```ts
 * providers: [
 *   provideOllamaChat({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:3b' }),
 * ]
 * ```
 *
 * The same instance is reachable as both {@link OllamaChatProvider} (for
 * runtime `setModel`/`setBaseUrl`) and {@link AI_CHAT_PROVIDER} (what the
 * resolver consumes).
 */
export function provideOllamaChat(cfg?: OllamaChatConfig): Provider[] {
  return [
    OllamaChatProvider,
    {
      provide: AI_CHAT_PROVIDER,
      useFactory: (): AiChatProvider => {
        const provider = inject(OllamaChatProvider);
        if (cfg !== undefined) provider.configure(cfg);
        return provider;
      },
    },
  ];
}
