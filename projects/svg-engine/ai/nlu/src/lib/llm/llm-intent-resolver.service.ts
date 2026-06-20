import { inject, Injectable } from '@angular/core';

import { isStopword } from '../dictionaries/stopwords';
import { NaturalLanguageService } from '../natural-language.service';
import { tokenize } from '../parsers/tokenize';
import type {
  NluCandidate,
  NluContext,
  NluExecuteOptions,
  NluExecuteResult,
  NluIntent,
} from '../types';
import { AI_CHAT_PROVIDER, type AiChatMessage } from './llm-provider';

/**
 * **D-093 Fase 4** — teto de entradas no catálogo enviado ao modelo.
 *
 * Descoberta empírica (teste ao vivo 3b E 7b): com os 222 intents
 * registrados o prompt chega a ~4095 tokens — **~74s só de ingestão**
 * nessa GPU — e o modelo **perde o contrato de saída** (devolve um JSON
 * `{"card":{…}}` inventado em vez de `{"steps":[…]}`). Curar o catálogo
 * para um subconjunto relevante corta a latência E ajuda o modelo a
 * ancorar no formato. 24 cobre create-shape + cor/texto + os intents
 * textualmente relacionados ao pedido com folga.
 */
export const DEFAULT_CATALOG_MAX_ENTRIES = 24;

/**
 * **D-093 Fase 4** — intents **sempre** mantidos no catálogo curado
 * (casados por `id.includes(hint)`). São as primitivas de composição:
 * sem `create-shape` o modelo não tem como montar um "card de KPI" a
 * partir do zero. Curtos de propósito; ampliar só com primitiva nova.
 */
export const CORE_INTENT_ID_HINTS: readonly string[] = ['create-shape', 'create-text', 'set-fill'];

/**
 * Compact catalog entry fed to the model — one registered intent reduced
 * to id + description + slot names/kinds. Kept small on purpose (token
 * budget; the model only needs to pick an id and fill slots).
 */
export interface LlmIntentCatalogEntry {
  readonly id: string;
  readonly description: string;
  /** `{ slotName: kind }`, e.g. `{ fill: 'color', width: 'number' }`. */
  readonly slots: Record<string, string>;
}

/** One resolved (validated) step of a plan — intent guaranteed to exist. */
export interface LlmResolvedStep {
  readonly intentId: string;
  readonly intent: NluIntent;
  readonly slots: Record<string, unknown>;
}

/** The validated plan returned by {@link LlmIntentResolverService.resolvePlan}. */
export interface LlmResolvedPlan {
  /** Steps whose `intentId` matched a registered intent (in order). */
  readonly steps: readonly LlmResolvedStep[];
  /** Model-reported confidence in `[0,1]` (defaults to 1 if absent). */
  readonly confidence: number;
  /** Raw model text (for debugging / UI "show reasoning"). */
  readonly raw: string;
  /** `intentId`s the model produced that do NOT exist (dropped, for telemetry). */
  readonly dropped: readonly string[];
}

/** Per-call options for the resolver. */
export interface LlmResolveOptions {
  /** Model override for THIS request (complexity routing: 3b vs 7b). */
  readonly model?: string;
  /** Abort the underlying request. */
  readonly signal?: AbortSignal;
  /** Cap generated tokens. */
  readonly maxTokens?: number;
}

/** Options for {@link LlmIntentResolverService.resolveAndExecute}. */
export interface LlmExecuteOptions extends LlmResolveOptions {
  /** Confirmation gate forwarded to {@link NaturalLanguageService.executeCandidate} (required for destructive steps). */
  readonly confirmGate?: NluExecuteOptions['confirmGate'];
}

const SYSTEM_PROMPT_HEADER = [
  'You translate a user design request (Portuguese or English) into a PLAN of editor commands.',
  'Respond with ONLY a JSON object, no prose and no markdown fences, in this exact shape:',
  '{"steps":[{"intentId":"<id>","slots":{...}}],"confidence":<number 0..1>}',
  'Rules:',
  '- The top-level object MUST have exactly two keys: "steps" (array) and "confidence" (number).',
  '- NEVER output any other top-level key. Do NOT return {"card":...}, {"title":...}, {"value":...} or similar — only the {"steps":[...]} shape above.',
  '- Use ONLY intentId values present in the CATALOG below. Never invent an id.',
  '- Decompose complex requests (e.g. a KPI card) into several steps using the available primitives (create one shape/text node per step).',
  '- Fill a slot only when the request implies it; omit unknown slots.',
  '- Output valid JSON and nothing else.',
  '',
  'CATALOG:',
].join('\n');

/**
 * **D-093 — `LlmIntentResolverService`** (resolver de intents via LLM).
 *
 * O **fallback inteligente** do NLU: quando o rule-based não resolve, o
 * texto livre é mandado ao LLM ({@link AI_CHAT_PROVIDER}), que devolve um
 * **plano** de comandos **já registrados** (intentId + slots). Cada passo
 * é validado contra o registry e executado pelo pipeline seguro
 * ({@link NaturalLanguageService.executeCandidate} — gate de destrutivos,
 * try/catch). **O LLM nunca inventa comando** — só escolhe dos existentes,
 * o que mantém a segurança.
 *
 * **Opcional por design**: se nenhum {@link AI_CHAT_PROVIDER} foi
 * registrado, `isAvailable === false` e o app segue só com o rule-based
 * (zero rede, specs offline). Root-scoped como o {@link NaturalLanguageService}
 * (registry global; execução per-scope via `NluContext.injector`).
 */
@Injectable({ providedIn: 'root' })
export class LlmIntentResolverService {
  private readonly nlu = inject(NaturalLanguageService);
  private readonly provider = inject(AI_CHAT_PROVIDER, { optional: true });

  /** `true` quando um provider LLM foi registrado (camada disponível). */
  get isAvailable(): boolean {
    return this.provider !== null && this.provider !== undefined;
  }

  /**
   * Catálogo compacto dos intents registrados — enviado ao modelo no
   * system prompt. Deriva de `NaturalLanguageService.intents()`.
   *
   * **D-093 Fase 4 — curadoria por relevância**: quando há `text` E o
   * total de intents excede `maxEntries`, o catálogo é **pré-filtrado**
   * para um subconjunto relevante (primitivas core + top-K por
   * sobreposição de tokens com o pedido). Sem `text` — ou quando o
   * registry já cabe em `maxEntries` — devolve TODOS (comportamento
   * legado, specs offline intactos). Isso corta o prompt de ~4095 →
   * algumas centenas de tokens (latência) E ajuda o modelo a ancorar
   * no contrato de saída (vide nota de {@link DEFAULT_CATALOG_MAX_ENTRIES}).
   *
   * @param text pedido do usuário (opcional) — base da relevância.
   * @param opts `maxEntries` para sobrescrever o teto padrão.
   */
  buildCatalog(
    text?: string,
    opts: { maxEntries?: number } = {},
  ): readonly LlmIntentCatalogEntry[] {
    const all = this.nlu.intents();
    const maxEntries = opts.maxEntries ?? DEFAULT_CATALOG_MAX_ENTRIES;
    const chosen =
      typeof text === 'string' && text.length > 0 && all.length > maxEntries
        ? selectRelevantIntents(all, text, maxEntries)
        : all;
    return chosen.map(toCatalogEntry);
  }

  /**
   * Pede um plano ao LLM e valida cada passo contra o registry.
   * @throws se nenhum provider estiver registrado, ou se o modelo não
   *   produzir JSON parseável.
   */
  async resolvePlan(text: string, opts: LlmResolveOptions = {}): Promise<LlmResolvedPlan> {
    if (this.provider === null || this.provider === undefined) {
      throw new Error('LlmIntentResolverService: no AI_CHAT_PROVIDER registered');
    }
    const messages: AiChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(this.buildCatalog(text)) },
      { role: 'user', content: text },
    ];
    const raw = await this.provider.chat(messages, {
      format: 'json',
      model: opts.model,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
      temperature: 0,
    });

    const parsed = parsePlan(raw);
    const steps: LlmResolvedStep[] = [];
    const dropped: string[] = [];
    for (const step of parsed.steps) {
      const intent = this.nlu.getIntent(step.intentId);
      if (intent === null) {
        dropped.push(step.intentId);
        continue;
      }
      steps.push({ intentId: step.intentId, intent, slots: step.slots });
    }
    return { steps, confidence: parsed.confidence, raw, dropped };
  }

  /**
   * Resolve o plano e **executa** cada passo pelo pipeline seguro do NLU.
   * Passos não-destrutivos rodam direto; destrutivos exigem `confirmGate`
   * (senão são rejeitados, como em `executeCandidate`). Cada passo vira um
   * comando próprio no bus → **um passo de undo por etapa**.
   */
  async resolveAndExecute(
    text: string,
    ctx: NluContext,
    opts: LlmExecuteOptions = {},
  ): Promise<readonly NluExecuteResult[]> {
    const plan = await this.resolvePlan(text, opts);
    const results: NluExecuteResult[] = [];
    for (const step of plan.steps) {
      const candidate: NluCandidate = {
        intent: step.intent,
        confidence: plan.confidence,
        slots: step.slots,
        matches: [],
      };
      // autoExecuteThreshold 0: trust the LLM plan for non-destructive steps;
      // destructive still needs the gate (enforced inside executeCandidate).
      results.push(
        await this.nlu.executeCandidate(candidate, ctx, {
          autoExecuteThreshold: 0,
          confirmGate: opts.confirmGate ?? null,
        }),
      );
    }
    return results;
  }
}

/** Reduz um {@link NluIntent} à entrada compacta do catálogo (id + desc + slots). */
function toCatalogEntry(intent: NluIntent): LlmIntentCatalogEntry {
  const slots: Record<string, string> = {};
  for (const [name, schema] of Object.entries(intent.slots ?? {})) {
    slots[name] = schema.kind;
  }
  return {
    id: intent.id,
    description: intent.description ?? intent.keywords.join(', '),
    slots,
  };
}

/**
 * **D-093 Fase 4** — seleciona até `maxEntries` intents relevantes ao
 * `text`. Mantém SEMPRE as primitivas de composição ({@link
 * CORE_INTENT_ID_HINTS}) e completa com os mais relevantes por
 * {@link relevanceScore}. Pure/determinística (testável offline).
 */
function selectRelevantIntents(
  intents: readonly NluIntent[],
  text: string,
  maxEntries: number,
): readonly NluIntent[] {
  const textTokens = new Set(tokenize(text).filter((t) => !isStopword(t) && t.length >= 2));
  const core = intents.filter((i) => CORE_INTENT_ID_HINTS.some((h) => i.id.includes(h)));
  const coreIds = new Set(core.map((i) => i.id));
  const rest = intents
    .filter((i) => !coreIds.has(i.id))
    .map((i) => ({ intent: i, score: relevanceScore(i, textTokens) }))
    // Estável: score desc, empate preserva a ordem de registro (index).
    .sort((a, b) => b.score - a.score);
  const remaining = Math.max(0, maxEntries - core.length);
  return [...core, ...rest.slice(0, remaining).map((r) => r.intent)];
}

/**
 * Pontuação de relevância = nº de tokens do pedido que aparecem nos
 * termos do intent (keywords + palavras do id + tokens da description).
 */
function relevanceScore(intent: NluIntent, textTokens: ReadonlySet<string>): number {
  const terms = new Set<string>();
  for (const kw of intent.keywords) for (const t of tokenize(kw)) terms.add(t);
  for (const t of tokenize(intent.id.replace(/[.\-_]/g, ' '))) terms.add(t);
  if (typeof intent.description === 'string') {
    for (const t of tokenize(intent.description)) {
      if (!isStopword(t) && t.length >= 3) terms.add(t);
    }
  }
  let score = 0;
  for (const t of textTokens) if (terms.has(t)) score++;
  return score;
}

/**
 * **D-093 Fase 4** — exemplo few-shot mostrando a saída EXATA. Usa o id
 * real de `create-shape` presente no catálogo (sempre incluído via
 * {@link CORE_INTENT_ID_HINTS}); se ausente, omite o exemplo. Ancorar o
 * modelo num caso concreto de decomposição é o que tira o 3b/7b do
 * hábito de inventar `{"card":{…}}`.
 */
function buildFewShot(catalog: readonly LlmIntentCatalogEntry[]): string {
  const shape = catalog.find((e) => e.id.includes('create-shape'));
  if (shape === undefined) return '';
  const id = shape.id;
  const plan = {
    steps: [
      {
        intentId: id,
        slots: {
          shape: 'rect',
          width: 280,
          height: 150,
          position: { x: 400, y: 300 },
          fill: '#ffffff',
          stroke: '#d0d7de',
        },
      },
      {
        intentId: id,
        slots: {
          shape: 'text',
          content: 'Receita',
          width: 180,
          height: 20,
          position: { x: 320, y: 250 },
        },
      },
      {
        intentId: id,
        slots: {
          shape: 'text',
          content: 'R$ 1,2M',
          width: 200,
          height: 40,
          position: { x: 320, y: 320 },
        },
      },
    ],
    confidence: 0.75,
  };
  return [
    '',
    'EXAMPLE — a request and the ONLY acceptable output shape:',
    'User: "crie um card de KPI com título e valor"',
    JSON.stringify(plan),
  ].join('\n');
}

/** Reforço final do contrato, posicionado logo antes da mensagem do usuário. */
const SYSTEM_PROMPT_FOOTER = [
  '',
  'Output ONLY the JSON object {"steps":[...],"confidence":number}.',
  'Every intentId MUST appear in the CATALOG above. No prose, no markdown, no other top-level keys.',
].join('\n');

/** Build the full system prompt from the catalog. */
function buildSystemPrompt(catalog: readonly LlmIntentCatalogEntry[]): string {
  const lines = catalog.map((e) => {
    const slotStr = Object.entries(e.slots)
      .map(([n, k]) => `${n}(${k})`)
      .join(', ');
    const slotPart = slotStr.length > 0 ? ` | slots: ${slotStr}` : '';
    return `- ${e.id}: ${e.description}${slotPart}`;
  });
  return `${SYSTEM_PROMPT_HEADER}\n${lines.join('\n')}\n${buildFewShot(catalog)}\n${SYSTEM_PROMPT_FOOTER}`;
}

/** Raw (pre-validation) step shape produced by the model. */
interface RawPlanStep {
  readonly intentId: string;
  readonly slots: Record<string, unknown>;
}

/**
 * Tolerant parse of the model's JSON. Strips markdown fences, slices to
 * the outermost `{...}`, and normalizes several shapes (top-level array,
 * single step, `{steps:[...]}`). Throws only when nothing parses.
 */
export function parsePlan(raw: string): { steps: RawPlanStep[]; confidence: number } {
  const json = extractJsonBlob(raw);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('LlmIntentResolverService: model did not return valid JSON');
  }

  const rawSteps = extractSteps(data);
  const steps: RawPlanStep[] = [];
  for (const s of rawSteps) {
    if (s === null || typeof s !== 'object') continue;
    const obj = s as Record<string, unknown>;
    const id = obj['intentId'] ?? obj['id'] ?? obj['intent'];
    if (typeof id !== 'string' || id.length === 0) continue;
    const slotsVal = obj['slots'];
    const slots =
      slotsVal !== null && typeof slotsVal === 'object'
        ? (slotsVal as Record<string, unknown>)
        : {};
    steps.push({ intentId: id, slots });
  }

  let confidence = 1;
  if (data !== null && typeof data === 'object') {
    const c = (data as Record<string, unknown>)['confidence'];
    if (typeof c === 'number' && Number.isFinite(c)) confidence = Math.max(0, Math.min(1, c));
  }
  return { steps, confidence };
}

/** Pull `steps` out of the various shapes a model might emit. */
function extractSteps(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj['steps'])) return obj['steps'];
    if (typeof obj['intentId'] === 'string' || typeof obj['id'] === 'string') return [obj];
  }
  return [];
}

/** Strip ```json fences and slice to the outermost JSON object/array. */
function extractJsonBlob(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : trimmed).trim();
  const firstObj = body.indexOf('{');
  const firstArr = body.indexOf('[');
  const start = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj;
  if (start === -1) return body;
  const close = body[start] === '[' ? body.lastIndexOf(']') : body.lastIndexOf('}');
  if (close === -1 || close < start) return body;
  return body.slice(start, close + 1);
}
