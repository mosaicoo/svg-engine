import { inject, Injectable } from '@angular/core';

import { NaturalLanguageService } from '../natural-language.service';
import type {
  NluCandidate,
  NluContext,
  NluExecuteOptions,
  NluExecuteResult,
  NluIntent,
} from '../types';
import { AI_CHAT_PROVIDER, type AiChatMessage } from './llm-provider';

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
  '- Use ONLY intentId values present in the CATALOG below. Never invent an id.',
  '- Decompose complex requests (e.g. a KPI card) into several steps using the available primitives.',
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
   */
  buildCatalog(): readonly LlmIntentCatalogEntry[] {
    return this.nlu.intents().map((intent) => {
      const slots: Record<string, string> = {};
      for (const [name, schema] of Object.entries(intent.slots ?? {})) {
        slots[name] = schema.kind;
      }
      return {
        id: intent.id,
        description: intent.description ?? intent.keywords.join(', '),
        slots,
      };
    });
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
      { role: 'system', content: buildSystemPrompt(this.buildCatalog()) },
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

/** Build the full system prompt from the catalog. */
function buildSystemPrompt(catalog: readonly LlmIntentCatalogEntry[]): string {
  const lines = catalog.map((e) => {
    const slotStr = Object.entries(e.slots)
      .map(([n, k]) => `${n}(${k})`)
      .join(', ');
    const slotPart = slotStr.length > 0 ? ` | slots: ${slotStr}` : '';
    return `- ${e.id}: ${e.description}${slotPart}`;
  });
  return `${SYSTEM_PROMPT_HEADER}\n${lines.join('\n')}`;
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
