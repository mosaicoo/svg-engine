import { resolveColorName } from '../dictionaries/colors';
import { resolveNumberWord } from '../dictionaries/number-words';
import { resolveActionCanonical } from '../dictionaries/actions';
import { resolveShapeKind } from '../dictionaries/shapes';
import { isStopword } from '../dictionaries/stopwords';
import { tokenize } from '../parsers/tokenize';

/**
 * **D-093 (Fase 3)** — gatilho de escalonamento para o LLM.
 *
 * Problema (descoberto na Fase 2): o rule-based é **guloso** com verbos
 * de criação — "crie um card de KPI moderno com título e valor" casa
 * `create-shape` com 90% (gera 1 retângulo default) e **não** escala,
 * então pedidos complexos nunca chegam ao LLM.
 *
 * Heurística aqui: o pedido é **vago para o rule-based** quando tem
 * conteúdo suficiente mas a maior parte dele **não é reconhecida** pelos
 * dicionários (não é forma, cor, número/dimensão nem verbo de ação).
 * Nesse caso o `<svge-nlu-input>` roteia direto para o LLM — que usa o
 * texto inteiro — em vez de deixar o rule-based criar uma forma genérica.
 *
 * Protege os bons casos:
 * - "criar retângulo vermelho 100x50" → 4/4 reconhecidos → NÃO vago.
 * - "undo", "selecionar tudo" → poucos tokens → NÃO vago.
 * - "crie um card de KPI moderno com título e valor" → só "crie"
 *   reconhecido (1/6) → **vago** → LLM.
 */

/** Mínimo de tokens significativos para considerar o roteamento (frases curtas ficam no rule-based). */
export const VAGUE_MIN_MEANINGFUL_TOKENS = 3;
/** Abaixo desta fração de tokens reconhecidos, o pedido é "vago". */
export const VAGUE_RECOGNIZED_FRACTION = 0.5;

/**
 * Substantivos **compostos** — coisas feitas de várias primitivas. Quando
 * aparecem, o rule-based reduz tudo a UMA forma genérica (o `create-shape`
 * casa "card"/"kpi" como alias de forma e gera 1 retângulo), então
 * roteamos direto ao LLM, que sabe decompor em vários comandos.
 * Deaccentuados/lowercase (forma do tokenizer).
 */
export const COMPOSITE_KEYWORDS: ReadonlySet<string> = new Set([
  'card',
  'kpi',
  'dashboard',
  'painel',
  'organograma',
  'fluxograma',
  'diagrama',
  'infografico',
  'infografia',
  'banner',
  'formulario',
  'timeline',
  'cronograma',
  'grafico',
  'tabela',
  'calendario',
  'mockup',
  'wireframe',
  'cartaz',
  'poster',
  'folder',
  'panfleto',
]);

/** `true` se o token é "entendido" pelo rule-based (forma/cor/número/ação). */
function isRecognizedToken(tok: string): boolean {
  if (resolveShapeKind(tok) !== null) return true;
  if (resolveColorName(tok) !== null) return true;
  if (resolveActionCanonical(tok) !== null) return true;
  if (resolveNumberWord(tok) !== null) return true;
  // Qualquer token com dígito: número, dimensão (100x50), hex (#fff), 5px.
  if (/[0-9]/.test(tok)) return true;
  return false;
}

/**
 * Decide se `text` deve pular o rule-based e ir direto ao LLM.
 * Pure function — sem efeitos colaterais, testável offline.
 *
 * Vago quando QUALQUER:
 * 1. contém um substantivo composto ({@link COMPOSITE_KEYWORDS}) — ex.:
 *    "card", "dashboard", "organograma" (o rule-based só faria 1 forma); OU
 * 2. tem conteúdo suficiente mas a maioria dos tokens **não é reconhecida**
 *    pelos dicionários (forma/cor/número/ação) — ex.: "casa com telhado e
 *    porta".
 */
export function isVagueForRuleBased(text: string): boolean {
  const tokens = tokenize(text);
  if (tokens.some((t) => COMPOSITE_KEYWORDS.has(t))) return true;
  const meaningful = tokens.filter((t) => !isStopword(t) && t.length >= 2);
  if (meaningful.length < VAGUE_MIN_MEANINGFUL_TOKENS) return false;
  const recognized = meaningful.filter(isRecognizedToken).length;
  return recognized / meaningful.length < VAGUE_RECOGNIZED_FRACTION;
}
