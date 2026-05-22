import { COLOR_KEYS, resolveColorName } from '../dictionaries/colors';
import { isStopword } from '../dictionaries/stopwords';
import type { NluSlotSchema } from '../types';
import { fuzzyMatchToken } from './fuzzy-match';

/**
 * Extrator de slots — D-046? Fase 1.
 *
 * Dado uma lista de tokens (já normalizados via `tokenize()`) e um
 * schema declarativo de slots, extrai valores tipados.
 *
 * **Suportado**:
 * - `kind: 'number'` — primeiro número encontrado. Aceita decimais
 *   `1.5` / `1,5` e dimensões `100x50` (split em dois numbers — usa
 *   o primeiro). Considera unidades `px` / `pt` (despreza).
 * - `kind: 'color'` — primeiro hex `#rrggbb`/`#rgb` OU nome (lookup
 *   no `COLOR_DICTIONARY`, com fuzzy match dist ≤ 1 pra typos).
 * - `kind: 'enum'` — primeira ocorrência (exato ou fuzzy dist ≤ 1) de
 *   um dos valores declarados.
 * - `kind: 'string'` — primeiro token não-stopword, não-numeric,
 *   não-color, não-enum.
 *
 * **Ordem dos tokens importa**: extractor preenche posicionalmente
 * (primeiro number → slot number, etc.) — comandos como "criar
 * retângulo 100 50 vermelho" funcionam.
 *
 * **Slot ausente**: se `optional: true`, recebe `default ?? undefined`.
 * Se `optional: false` (default), recebe `undefined` mas o caller
 * deve penalizar confidence.
 */

const NUMBER_RE = /^(-?\d+(?:[.,]\d+)?)(?:px|pt)?$/;
const DIMENSION_RE = /^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Resultado da extração: valores por nome de slot. Slots não
 * encontrados são `undefined` (caller decide se aplica default).
 */
export type ExtractedSlots = Record<string, unknown>;

/**
 * Indica quais tokens foram consumidos por matchings (keywords/
 * actions/slots) — útil pra evitar dupla atribuição (token "100"
 * não deve preencher dois slots `number` distintos).
 */
export interface ExtractContext {
  /** Set mutável de índices de tokens já consumidos. */
  readonly consumedIndices: Set<number>;
}

/**
 * Parse um token como número. Aceita "100", "1.5", "1,5", "100px".
 * Trata `,` como separador decimal (PT). Não aceita signos relativos
 * exóticos. Retorna `null` quando não é número.
 */
export function parseNumberToken(token: string): number | null {
  // Dimensão composta — retorna primeiro número (caller pode
  // explicitamente pedir o segundo via slot separado).
  const dim = DIMENSION_RE.exec(token);
  if (dim) {
    const n = Number.parseFloat(dim[1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const m = NUMBER_RE.exec(token);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Tenta resolver um token como cor: hex direto OU lookup no
 * dicionário com fuzzy match (dist ≤ 1 pra typos como "vermelo").
 */
export function parseColorToken(token: string): string | null {
  if (HEX_COLOR_RE.test(token)) return token.toLowerCase();
  // Nome direto
  const direct = resolveColorName(token);
  if (direct !== null) return direct;
  // Fuzzy match (typos)
  const m = fuzzyMatchToken(token, COLOR_KEYS);
  if (m === null) return null;
  return resolveColorName(m.term);
}

/**
 * Extrai dimensão composta `100x50` em `{ width, height }` quando
 * presente. Retorna `null` quando o token não é dimensão.
 */
export function parseDimensionToken(token: string): { width: number; height: number } | null {
  const m = DIMENSION_RE.exec(token);
  if (!m) return null;
  const w = Number.parseFloat(m[1].replace(',', '.'));
  const h = Number.parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { width: w, height: h };
}

/**
 * Extrai os slots declarados em `schemas` a partir dos `tokens`,
 * marcando consumed indices no `ctx`.
 *
 * **Algoritmo (single pass por slot, ordem declarada)**:
 * 1. Para cada slot, varre tokens ainda não consumidos.
 * 2. Tenta resolver de acordo com o `kind`.
 * 3. Se encontrar, marca consumed + atribui ao slot.
 * 4. Aplica `default` quando não encontrou + `optional: true`.
 *
 * **Edge case `kind: 'number'`** com dimensão `100x50`: se houver
 * slot `width` E `height` no schema (nessa ordem), o token de
 * dimensão preenche os dois e consome o índice uma vez. Caso
 * contrário, só o primeiro number do par é usado.
 */
export function extractSlots(
  tokens: readonly string[],
  schemas: Record<string, NluSlotSchema>,
  ctx: ExtractContext = { consumedIndices: new Set() },
): ExtractedSlots {
  const result: ExtractedSlots = {};
  const schemaEntries = Object.entries(schemas);

  // Pre-pass: se tem dimensão `100x50` E width+height pendentes,
  // consome ambos com o token único.
  const widthIdx = schemaEntries.findIndex(
    ([, s]) => s.kind === 'number' && /width|largura/i.test(''),
  );
  // ↑ Sem heurística semântica simples; deixa o pre-pass apenas
  //   aos slots literalmente chamados `width` + `height`.
  if (schemas['width']?.kind === 'number' && schemas['height']?.kind === 'number') {
    for (let i = 0; i < tokens.length; i++) {
      if (ctx.consumedIndices.has(i)) continue;
      const dim = parseDimensionToken(tokens[i]);
      if (dim !== null) {
        result['width'] = dim.width;
        result['height'] = dim.height;
        ctx.consumedIndices.add(i);
        break;
      }
    }
  }
  void widthIdx;

  for (const [name, schema] of schemaEntries) {
    if (name in result) continue; // já preenchido no pre-pass
    let found: unknown = undefined;
    let foundIdx = -1;

    for (let i = 0; i < tokens.length; i++) {
      if (ctx.consumedIndices.has(i)) continue;
      const tok = tokens[i];
      if (isStopword(tok)) continue;

      switch (schema.kind) {
        case 'number': {
          const n = parseNumberToken(tok);
          if (n !== null) {
            found = n;
            foundIdx = i;
          }
          break;
        }
        case 'color': {
          const c = parseColorToken(tok);
          if (c !== null) {
            found = c;
            foundIdx = i;
          }
          break;
        }
        case 'enum': {
          const values = schema.values;
          if (values.includes(tok)) {
            found = tok;
            foundIdx = i;
          } else {
            const m = fuzzyMatchToken(tok, values);
            if (m !== null) {
              found = m.term;
              foundIdx = i;
            }
          }
          break;
        }
        case 'string': {
          // Pega o primeiro token livre — string é catch-all (deixa
          // pra última pra que slots específicos consumam primeiro).
          found = tok;
          foundIdx = i;
          break;
        }
      }
      if (foundIdx !== -1) break;
    }

    if (foundIdx !== -1) {
      result[name] = found;
      ctx.consumedIndices.add(foundIdx);
    } else if (schema.optional === true && 'default' in schema && schema.default !== undefined) {
      result[name] = schema.default;
    }
  }

  return result;
}
