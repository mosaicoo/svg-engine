import { COLOR_KEYS, resolveColorName } from '../dictionaries/colors';
import { SHAPE_KEYS, resolveShapeKind } from '../dictionaries/shapes';
import { isStopword } from '../dictionaries/stopwords';
import type { NluSlotSchema } from '../types';
import {
  adjustHexLightness,
  HEX_COLOR_RE,
  LIGHTNESS_MODIFIERS,
  LIGHTNESS_MULTIPLIERS,
  parseHslFunction,
  parseRgbFunction,
} from './color-functions';
import { fuzzyMatchToken } from './fuzzy-match';

/**
 * Extrator de slots — D-046 Fase 1.
 *
 * Dado uma lista de tokens (já normalizados via `tokenize()`) e um
 * schema declarativo de slots, extrai valores tipados.
 *
 * **Suportado**:
 * - `kind: 'number'` — primeiro número encontrado. Aceita decimais
 *   `1.5` / `1,5` e dimensões `100x50` (split em dois numbers — usa
 *   o primeiro). Considera unidades `px` / `pt` (despreza).
 * - `kind: 'color'` — primeira ocorrência de cor reconhecida. Aceita
 *   hex (`#rgb` / `#rrggbb` / `#rrggbbaa`), `rgb(...)` / `rgba(...)`,
 *   `hsl(...)` / `hsla(...)`, nome do dicionário (PT/EN), nome com
 *   typo (fuzzy match) E **intensificadores adjacentes** ("azul
 *   claro", "verde bem escuro", "very dark red") — vide
 *   {@link parseColorPhrase}.
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
 * Tenta resolver um token ISOLADO como cor: hex direto, rgb/hsl
 * funcional OU lookup no dicionário com fuzzy match (dist ≤ 1 pra
 * typos como "vermelo"). Para frases com intensificador adjacente
 * ("azul claro"), use {@link parseColorPhrase}.
 */
export function parseColorToken(token: string): string | null {
  if (HEX_COLOR_RE.test(token)) return token.toLowerCase();
  const rgbHex = parseRgbFunction(token);
  if (rgbHex !== null) return rgbHex;
  const hslHex = parseHslFunction(token);
  if (hslHex !== null) return hslHex;
  // Nome direto
  const direct = resolveColorName(token);
  if (direct !== null) return direct;
  // Fuzzy match (typos)
  const m = fuzzyMatchToken(token, COLOR_KEYS);
  if (m === null) return null;
  return resolveColorName(m.term);
}

/**
 * Resultado de {@link parseColorPhrase}: cor resolvida + quantos
 * tokens adjacentes foram consumidos (sempre ≥ 1).
 */
export interface ColorPhraseMatch {
  /** Cor resolvida (`#rrggbb`, CSS keyword, ou outro do dicionário). */
  readonly color: string;
  /**
   * Quantos tokens (a partir de `startIdx`) compõem a frase de cor.
   * Sempre ≥ 1. Caller deve marcar todos esses índices como consumed.
   *
   * Exemplos:
   * - "azul" → tokensConsumed = 1
   * - "azul claro" → tokensConsumed = 2 (intensificador adjacente)
   * - "bem azul escuro" → tokensConsumed = 3 (multiplier + cor + mod)
   * - "muito claro azul" → tokensConsumed = 3 (multiplier + mod ANTES da cor)
   */
  readonly tokensConsumed: number;
}

/**
 * Resolve uma cor a partir de `tokens[startIdx]`, considerando
 * **intensificadores adjacentes** que modificam o lightness do hex
 * base. Suporta padrões:
 *
 * - `[modifier] cor [modifier]` — "azul claro" / "claro azul" /
 *   "verde escuro" / "dark green"
 * - `[multiplier] [modifier] cor` — "muito claro azul" / "very
 *   dark red"
 * - `cor [multiplier] [modifier]` — "verde bem escuro" / "blue
 *   really dark"
 *
 * Não modifica `none` / `currentColor` / `inherit` (sem hex base).
 *
 * Retorna `null` quando `tokens[startIdx]` não é cor nem
 * intensificador-seguido-de-cor.
 */
export function parseColorPhrase(
  tokens: readonly string[],
  startIdx: number,
): ColorPhraseMatch | null {
  if (startIdx < 0 || startIdx >= tokens.length) return null;

  // Tenta detectar a cor em uma janela curta (até 3 tokens adjacentes).
  // Os padrões possíveis combinam:
  //   M? D? C D?   (M = multiplier, D = lightness modifier, C = color)
  // Sliding window: começamos no startIdx e olhamos até startIdx+2.
  const window = [tokens[startIdx], tokens[startIdx + 1] ?? '', tokens[startIdx + 2] ?? ''];

  // Acha o índice da cor base na janela (0, 1 ou 2). **Primeiro tenta
  // PAIR de tokens adjacentes concatenados** (resolve cores compostas
  // como "azul marinho" → "azulmarinho" → navy; "hot pink" →
  // "hotpink"; "off white" → "offwhite"). Isso DEVE vir antes do
  // single-token lookup, senão "azul marinho" casaria com "azul"
  // (perdendo o "marinho").
  let colorIdx = -1;
  let baseColor: string | null = null;
  let compositeTokensConsumed = 0; // 0 = single-token; >0 = composto
  for (let i = 0; i < window.length - 1; i++) {
    const tokA = window[i];
    const tokB = window[i + 1];
    if (tokA.length === 0 || tokB.length === 0) continue;
    // Tenta concat AB e BA — ordem semântica varia ("azul marinho"
    // PT vs "navy blue" EN não se aplica aqui porque navy já está
    // direto no dict; "azulmarinho" é a key composta).
    const concatAB = parseColorToken(tokA + tokB);
    if (concatAB !== null) {
      colorIdx = i;
      baseColor = concatAB;
      compositeTokensConsumed = 2;
      break;
    }
    const concatBA = parseColorToken(tokB + tokA);
    if (concatBA !== null) {
      colorIdx = i;
      baseColor = concatBA;
      compositeTokensConsumed = 2;
      break;
    }
  }

  // Fallback: cor em um único token na janela.
  if (colorIdx === -1) {
    for (let i = 0; i < window.length; i++) {
      const tok = window[i];
      if (tok.length === 0) continue;
      const c = parseColorToken(tok);
      if (c !== null) {
        colorIdx = i;
        baseColor = c;
        break;
      }
    }
  }
  if (colorIdx === -1 || baseColor === null) return null;

  // Coleta modifiers / multipliers nos tokens adjacentes (janela
  // inteira), respeitando ordem (multiplier ANTES de modifier
  // amplifica). Computa o delta total.
  let delta = 0;
  let multiplier = 1;
  let consumedRight = 0; // tokens à direita da cor que viraram parte da frase
  let consumedLeft = 0; // idem à esquerda

  // Esquerda (modifiers anteriores)
  for (let i = colorIdx - 1; i >= 0; i--) {
    const tok = window[i];
    const mod = LIGHTNESS_MODIFIERS[tok];
    const mul = LIGHTNESS_MULTIPLIERS[tok];
    if (mod !== undefined) {
      delta += mod;
      consumedLeft++;
    } else if (mul !== undefined) {
      multiplier *= mul;
      consumedLeft++;
    } else {
      break; // tokens não-modifier interrompem
    }
  }
  // Direita (modifiers posteriores) — quando a cor foi composta de
  // 2 tokens (ex: "azul marinho"), pula o segundo token já consumido
  // pelo composito antes de procurar modificadores.
  const rightStart = colorIdx + (compositeTokensConsumed > 0 ? compositeTokensConsumed : 1);
  for (let i = rightStart; i < window.length; i++) {
    const tok = window[i];
    if (tok.length === 0) break;
    const mod = LIGHTNESS_MODIFIERS[tok];
    const mul = LIGHTNESS_MULTIPLIERS[tok];
    if (mod !== undefined) {
      delta += mod;
      consumedRight++;
    } else if (mul !== undefined) {
      multiplier *= mul;
      consumedRight++;
    } else {
      break;
    }
  }

  // Aplica delta * multiplier. Se delta == 0 (sem modifier), retorna
  // baseColor como veio. Não tenta ajustar keywords não-hex
  // (transparent / none / inherit / currentColor).
  let finalColor = baseColor;
  const effective = delta * multiplier;
  if (effective !== 0 && HEX_COLOR_RE.test(baseColor)) {
    finalColor = adjustHexLightness(baseColor, effective);
  }

  // tokensConsumed = quantos tokens A PARTIR DE startIdx foram
  // capturados. consumedLeft modificadores aparecem em índices
  // (colorIdx-1 .. 0); consumedRight modificadores em índices
  // (colorIdx+1 .. ); composto: 2 tokens da cor em vez de 1.
  const colorBaseTokens = compositeTokensConsumed > 0 ? compositeTokensConsumed : 1;
  const tokensConsumed = consumedLeft + colorBaseTokens + consumedRight;

  return { color: finalColor, tokensConsumed };
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
 *
 * **Edge case `kind: 'color'`** com intensificador adjacente
 * ("azul claro"): {@link parseColorPhrase} consome todos os
 * tokens da frase de cor — caller marca múltiplos consumed indices.
 */
export function extractSlots(
  tokens: readonly string[],
  schemas: Record<string, NluSlotSchema>,
  ctx: ExtractContext = { consumedIndices: new Set() },
): ExtractedSlots {
  const result: ExtractedSlots = {};
  const schemaEntries = Object.entries(schemas);

  // ── Pre-pass: dimensão composta `100x50` → width+height ──
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

  // ── Pass 1: ANCHORED slots ──────────────────────────────────
  // Slots que declaram `anchorKeywords` ("borda azul" → stroke=azul).
  // Roda ANTES do positional pra "reservar" valores que pertencem a
  // slots específicos antes que outros slots sem anchor capturem.
  for (const [name, schema] of schemaEntries) {
    if (name in result) continue;
    const anchors = schema.anchorKeywords;
    if (!anchors || anchors.length === 0) continue;

    for (let i = 0; i < tokens.length; i++) {
      if (ctx.consumedIndices.has(i)) continue;
      const tok = tokens[i];
      if (isStopword(tok)) continue;

      // Token é anchor (exato ou fuzzy)?
      const anchorHit = fuzzyMatchToken(tok, anchors);
      if (anchorHit === null) continue;

      // Procura valor no próximo token compatível (janela de 4).
      const extracted = extractValueForSlot(schema, tokens, i + 1, ctx);
      if (extracted === null) continue;

      result[name] = extracted.value;
      ctx.consumedIndices.add(i); // anchor token
      for (const idx of extracted.consumedIndices) ctx.consumedIndices.add(idx);
      break;
    }
  }

  for (const [name, schema] of schemaEntries) {
    if (name in result) continue; // já preenchido no pre-pass
    let found: unknown = undefined;
    let foundIdx = -1;
    let foundTokensConsumed = 1; // > 1 para color phrases (intensificadores)

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
          // Tenta frase completa (cor + intensificadores adjacentes).
          // parseColorPhrase verifica window de até 3 tokens — se nada
          // na janela é cor, retorna null.
          const phrase = parseColorPhrase(tokens, i);
          if (phrase !== null) {
            found = phrase.color;
            foundIdx = i;
            foundTokensConsumed = phrase.tokensConsumed;
          }
          break;
        }
        case 'shape': {
          // Resolve PT/EN/semantic aliases ("círculo" / "circle" /
          // "bola" / "nó" → 'circle') via SHAPE_DICTIONARY direto.
          // Exato primeiro, fuzzy depois.
          const direct = resolveShapeKind(tok);
          if (direct !== null) {
            found = direct;
            foundIdx = i;
          } else {
            const m = fuzzyMatchToken(tok, SHAPE_KEYS);
            if (m !== null) {
              const resolved = resolveShapeKind(m.term);
              if (resolved !== null) {
                found = resolved;
                foundIdx = i;
              }
            }
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
        case 'point': {
          const point = extractPointFromTokens(tokens, i, ctx);
          if (point !== null) {
            found = point.value;
            foundIdx = i;
            // tokensConsumed pode ser >1; mas como nosso scheme
            // marca foundIdx+k sequencialmente, usamos o consumedSpan.
            // Para garantir consumed indices não-sequenciais (ex: x e y
            // separados por stopword), marcamos explicitamente aqui.
            for (const idx of point.consumedIndices) ctx.consumedIndices.add(idx);
            // Evita o loop padrão re-marcando (foundTokensConsumed=0).
            foundTokensConsumed = 0;
          }
          break;
        }
      }
      if (foundIdx !== -1) break;
    }

    if (foundIdx !== -1) {
      result[name] = found;
      // Marca consumed: 1 token normalmente; mais quando color phrase.
      // Para 'point', já marcamos no extractPointFromTokens → skip.
      for (let k = 0; k < foundTokensConsumed; k++) {
        ctx.consumedIndices.add(foundIdx + k);
      }
    } else if (schema.optional === true && 'default' in schema && schema.default !== undefined) {
      result[name] = schema.default;
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Extrai um valor compatível com `schema` a partir de `tokens[startIdx]`,
 * pulando stopwords e tokens já consumed. Retorna `{ value, consumedIndices }`
 * ou `null` se não conseguir extrair na janela de 4 tokens.
 *
 * Usado no pass anchored (encontrou anchor, agora busca valor adjacente).
 */
function extractValueForSlot(
  schema: NluSlotSchema,
  tokens: readonly string[],
  startIdx: number,
  ctx: ExtractContext,
): { value: unknown; consumedIndices: readonly number[] } | null {
  for (let j = startIdx; j < Math.min(startIdx + 4, tokens.length); j++) {
    if (ctx.consumedIndices.has(j)) continue;
    const tok = tokens[j];
    if (isStopword(tok)) continue;

    switch (schema.kind) {
      case 'number': {
        const n = parseNumberToken(tok);
        if (n !== null) return { value: n, consumedIndices: [j] };
        return null; // primeiro não-stopword não-consumed deve ser o valor
      }
      case 'color': {
        const phrase = parseColorPhrase(tokens, j);
        if (phrase !== null) {
          const ids: number[] = [];
          for (let k = 0; k < phrase.tokensConsumed; k++) ids.push(j + k);
          return { value: phrase.color, consumedIndices: ids };
        }
        return null;
      }
      case 'shape': {
        const direct = resolveShapeKind(tok);
        if (direct !== null) return { value: direct, consumedIndices: [j] };
        const m = fuzzyMatchToken(tok, SHAPE_KEYS);
        if (m !== null) {
          const resolved = resolveShapeKind(m.term);
          if (resolved !== null) return { value: resolved, consumedIndices: [j] };
        }
        return null;
      }
      case 'enum': {
        if (schema.values.includes(tok)) return { value: tok, consumedIndices: [j] };
        const m = fuzzyMatchToken(tok, schema.values);
        if (m !== null) return { value: m.term, consumedIndices: [j] };
        return null;
      }
      case 'string': {
        return { value: tok, consumedIndices: [j] };
      }
      case 'point': {
        const point = extractPointFromTokens(tokens, j, ctx);
        if (point !== null) return { value: point.value, consumedIndices: point.consumedIndices };
        return null;
      }
    }
  }
  return null;
}

/**
 * Extrai `{ x, y }` a partir de `tokens[startIdx]`:
 * - Dimensão composta `100x50` → 1 token, `{ x: 100, y: 50 }`
 * - Dois números adjacentes (com possíveis stopwords entre) →
 *   `{ x: n1, y: n2 }`, ambos tokens consumed
 *
 * Retorna `null` se não encontrar nem dimensão nem par de números.
 */
function extractPointFromTokens(
  tokens: readonly string[],
  startIdx: number,
  ctx: ExtractContext,
): { value: { x: number; y: number }; consumedIndices: readonly number[] } | null {
  const tok = tokens[startIdx];
  if (tok === undefined) return null;

  // Caso 1: dimensão composta `100x50`
  const dim = parseDimensionToken(tok);
  if (dim !== null) {
    return { value: { x: dim.width, y: dim.height }, consumedIndices: [startIdx] };
  }

  // Caso 2: dois números adjacentes
  const n1 = parseNumberToken(tok);
  if (n1 === null) return null;

  // Procura segundo number (até 3 tokens à frente, pulando stopwords/consumed)
  for (let j = startIdx + 1; j < Math.min(startIdx + 4, tokens.length); j++) {
    if (ctx.consumedIndices.has(j)) continue;
    if (isStopword(tokens[j])) continue;
    const n2 = parseNumberToken(tokens[j]);
    if (n2 !== null) {
      return { value: { x: n1, y: n2 }, consumedIndices: [startIdx, j] };
    }
    // Primeiro não-stopword não-numeric → quebra (não há par)
    return null;
  }
  return null;
}
