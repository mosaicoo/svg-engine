/**
 * Color parsing helpers — D-046 Fase 1 enrich.
 *
 * Reconhece formatos CSS além de hex puro:
 * - `rgb(255, 0, 0)` / `rgba(255, 0, 0, 0.5)`
 * - `hsl(0, 100%, 50%)` / `hsla(0, 100%, 50%, 0.5)`
 * - Hex (3, 4, 6, 8 dígitos) — delegado pro caller via `HEX_COLOR_RE`
 *
 * Também expõe `lightenHex` / `darkenHex` usados pelos intensificadores
 * ("azul claro" / "verde escuro" / "bem escuro") no slot extractor.
 *
 * **Por que arquivo separado** (em vez de empilhar tudo no
 * slot-extractor): coesão. Color math é responsabilidade única;
 * tornar reaproveitável por outros parsers / plugins / UI components.
 *
 * **Sem dependências externas** (requisito Fase 1).
 */

// ── Regex / parsing ────────────────────────────────────────────

/** Hex 3, 4, 6 ou 8 dígitos (com `#`). */
export const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `rgb(r,g,b)` ou `rgba(r,g,b,a)`. Aceita whitespace livre entre
 * vírgulas, mas tokens devem ser fechados (sem split por `,` do
 * tokenizer — pra isso `parseRgbPhrase` reconstrói de múltiplos
 * tokens quando necessário).
 */
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/**
 * `hsl(h,s%,l%)` ou `hsla(h,s%,l%,a)`. `s` e `l` aceitam o `%`
 * obrigatório do CSS.
 */
const HSL_RE =
  /^hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/**
 * Parse `rgb(...)` / `rgba(...)` → hex (ignora alpha por ora, sem
 * suporte a alpha no slot color). Retorna `null` se não casar.
 */
export function parseRgbFunction(input: string): string | null {
  const m = RGB_RE.exec(input);
  if (!m) return null;
  const r = clamp255(Number.parseInt(m[1], 10));
  const g = clamp255(Number.parseInt(m[2], 10));
  const b = clamp255(Number.parseInt(m[3], 10));
  return rgbToHex(r, g, b);
}

/**
 * Parse `hsl(...)` / `hsla(...)` → hex. Retorna `null` se não casar.
 */
export function parseHslFunction(input: string): string | null {
  const m = HSL_RE.exec(input);
  if (!m) return null;
  const h = ((Number.parseFloat(m[1]) % 360) + 360) % 360;
  const s = clamp01(Number.parseFloat(m[2]) / 100);
  const l = clamp01(Number.parseFloat(m[3]) / 100);
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ── Intensifiers (claro / escuro / bem / muito) ────────────────

/**
 * Vocabulário de intensificadores que **modificam** uma cor adjacente.
 * `delta` é a variação de lightness (HSL, 0..1) aplicada ao hex base.
 * Positivo = mais claro, negativo = mais escuro.
 *
 * Multiplicador "bem" / "muito" / "very" / "really" dobra o efeito do
 * intensificador subsequente (vide `LIGHTNESS_MULTIPLIERS`).
 */
export const LIGHTNESS_MODIFIERS: Readonly<Record<string, number>> = Object.freeze({
  // PT
  claro: +0.18,
  clara: +0.18,
  escuro: -0.18,
  escura: -0.18,
  pastel: +0.25,
  vibrante: -0.05, // mais saturado mais que mais escuro, mas approx
  // EN
  light: +0.18,
  lighter: +0.24,
  dark: -0.18,
  darker: -0.24,
  pale: +0.25,
});

/**
 * Multiplicadores que amplificam o intensificador SEGUINTE.
 * "bem escuro" / "muito claro" / "very dark" → multiplica o delta.
 */
export const LIGHTNESS_MULTIPLIERS: Readonly<Record<string, number>> = Object.freeze({
  bem: 1.6,
  muito: 1.5,
  mais: 1.3, // "mais claro"
  very: 1.6,
  really: 1.5,
  super: 1.7,
});

/**
 * Aplica delta de lightness a um hex `#rrggbb` (ou `#rgb`). Mantém
 * matiz e saturação; só altera L no espaço HSL.
 */
export function adjustHexLightness(hex: string, delta: number): string {
  const rgb = hexToRgb(hex);
  if (rgb === null) return hex;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const newL = clamp01(l + delta);
  const [r, g, b] = hslToRgb(h, s, newL);
  return rgbToHex(r, g, b);
}

/** Conveniência: clarear. */
export function lightenHex(hex: string, amount = 0.18): string {
  return adjustHexLightness(hex, +Math.abs(amount));
}
/** Conveniência: escurecer. */
export function darkenHex(hex: string, amount = 0.18): string {
  return adjustHexLightness(hex, -Math.abs(amount));
}

// ── HSL / RGB internos ─────────────────────────────────────────

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

/**
 * `#rrggbb` (ou `#rgb`) → `[r, g, b]` em [0, 255]. `null` se inválido.
 * Ignora alpha quando 4 ou 8 dígitos.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (!HEX_COLOR_RE.test(hex)) return null;
  let h = hex.slice(1).toLowerCase();
  // Expande forma curta: f00 → ff0000, f00f → ff0000ff
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number): string => clamp255(Math.round(n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** RGB [0,255] → HSL [h:0-360, s:0-1, l:0-1]. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

/** HSL [h:0-360, s:0-1, l:0-1] → RGB [0,255]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return [
    hueToRgb(p, q, hk + 1 / 3) * 255,
    hueToRgb(p, q, hk) * 255,
    hueToRgb(p, q, hk - 1 / 3) * 255,
  ];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
