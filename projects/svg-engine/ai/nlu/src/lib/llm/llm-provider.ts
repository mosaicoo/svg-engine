import { InjectionToken, type Signal } from '@angular/core';

/**
 * **D-093 — contrato de provedor LLM (chat) desacoplado.**
 *
 * Define a abstração `AiChatProvider` num lugar **headless** (sem rede
 * amarrada, sem Material) — exatamente como o {@link VoiceProvider} fez
 * para voz. Qualquer backend (Ollama local, OpenAI, Anthropic, vLLM…)
 * que satisfaça este contrato pode alimentar o {@link LlmIntentResolverService}
 * sem que o resolver saiba qual é.
 *
 * O resolver injeta o provider **opcionalmente** via {@link AI_CHAT_PROVIDER}
 * (default `null` — LLM não instalado). Apps que querem a camada LLM
 * registram um provider concreto (ex.: `provideOllamaChat(...)`).
 */

/** Papel de uma mensagem no diálogo (formato estilo chat completions). */
export type AiChatRole = 'system' | 'user' | 'assistant';

/** Uma mensagem do diálogo enviada ao modelo. */
export interface AiChatMessage {
  readonly role: AiChatRole;
  readonly content: string;
}

/**
 * Opções por-chamada. Tudo opcional — o provider aplica seus defaults.
 *
 * **`model`** é o ponto-chave do requisito do usuário: permite **trocar
 * o modelo por requisição conforme a complexidade** do conteúdo (ex.:
 * `qwen2.5:3b` para o trivial, `qwen2.5:7b` para composições pesadas)
 * sem reconfigurar o provider.
 */
export interface AiChatOptions {
  /** Sobrescreve o modelo do provider só nesta chamada (roteamento por complexidade). */
  readonly model?: string;
  /** Pede saída **JSON** estruturada (mapeia para `format:"json"` no Ollama). */
  readonly format?: 'json';
  /** Temperatura de amostragem (0 = determinístico). */
  readonly temperature?: number;
  /** Teto de tokens gerados (mapeia para `num_predict` no Ollama). */
  readonly maxTokens?: number;
  /** Cancela a chamada (timeout / troca de contexto). */
  readonly signal?: AbortSignal;
}

/**
 * Surface mínima de um provedor de chat LLM. Satisfeito
 * **estruturalmente** — não exige `implements` nominal.
 */
export interface AiChatProvider {
  /** `false` quando o provider não está utilizável (sem baseUrl, etc.). */
  readonly isConfigured: Signal<boolean>;
  /** Modelo default deste provider (o usado quando `opts.model` é omitido). */
  readonly defaultModel: Signal<string>;
  /**
   * **D-095 — modelos sugeridos** (curados/conhecidos), opcional. A UI funde
   * esta lista com os modelos descobertos ao vivo ({@link
   * AiChatProvider.listModels}) para popular o seletor — útil de fallback
   * quando a descoberta falha e como sugestão para consumidores. Backends sem
   * curadoria simplesmente não expõem (a UI cai nos descobertos + default).
   */
  readonly suggestedModels?: Signal<readonly string[]>;
  /**
   * Envia o diálogo e resolve com o **texto** da resposta do assistente.
   * Lança em erro de rede / HTTP — o chamador (resolver) trata.
   */
  chat(messages: readonly AiChatMessage[], opts?: AiChatOptions): Promise<string>;
  /**
   * **D-094 — descoberta de modelos** (opcional). Lista os modelos
   * disponíveis no backend para o usuário escolher (ex.: Ollama
   * `GET /api/tags`). O contrato é opcional: backends que não expõem um
   * catálogo (ou que só servem um modelo) simplesmente não implementam, e
   * a UI cai no {@link AiChatProvider.defaultModel}. Lança em erro de rede
   * / HTTP — o chamador trata e degrada para o default.
   */
  listModels?(): Promise<readonly string[]>;
}

/**
 * Token DI **opcional** do provedor LLM. Default `null` (camada LLM não
 * instalada → o {@link LlmIntentResolverService} reporta `isAvailable === false`
 * e o app continua só com o NLU rule-based). Apps registram um provider
 * concreto via, p.ex., `provideOllamaChat({ baseUrl, model })`.
 */
export const AI_CHAT_PROVIDER = new InjectionToken<AiChatProvider | null>('AI_CHAT_PROVIDER', {
  providedIn: 'root',
  factory: () => null,
});
