/**
 * Pure color-space conversion helpers used by {@link SvgeColorPicker}.
 * No dependencies — safe to call from anywhere (incl. specs without DI).
 *
 * **Color spaces involved**:
 *
 * - **HEX**: `#rrggbb` (lowercase, 6-char form only — short `#rgb` is
 *   expanded on parse). 7 chars always.
 * - **RGB**: r/g/b in **0..255** (integers preferred but float tolerated).
 * - **HSV**: h in **0..360**, s/v in **0..1**. Picked over HSL for the
 *   sat/val square — HSV's value axis behaves intuitively as "brightness"
 *   (top = bright, bottom = dark), matching Photoshop/Figma pickers.
 *
 * All `parseX` functions return `null` for malformed input — they never
 * throw, callers decide how to surface the error.
 */

export interface RGB {
  readonly r: number; // 0..255
  readonly g: number;
  readonly b: number;
}

export interface HSV {
  /** Hue in degrees, 0..360. Wraps via modulo on conversion. */
  readonly h: number;
  /** Saturation, 0..1. */
  readonly s: number;
  /** Value (brightness), 0..1. */
  readonly v: number;
}

// ── HEX ↔ RGB ──────────────────────────────────────────────────────

/**
 * Parse a `#rrggbb` or `#rgb` HEX string into RGB. Returns `null` for
 * any malformed input (wrong length, non-hex chars, missing `#`).
 *
 * `#rgb` shorthand expands per the CSS Color spec: `#abc → #aabbcc`.
 * Case-insensitive.
 */
export function parseHex(hex: string): RGB | null {
  const trimmed = hex.trim();
  if (!trimmed.startsWith('#')) return null;
  let body = trimmed.slice(1);
  if (body.length === 3) {
    body = body[0]! + body[0]! + body[1]! + body[1]! + body[2]! + body[2]!;
  }
  if (body.length !== 6) return null;
  if (!/^[0-9a-f]{6}$/i.test(body)) return null;
  return {
    r: Number.parseInt(body.slice(0, 2), 16),
    g: Number.parseInt(body.slice(2, 4), 16),
    b: Number.parseInt(body.slice(4, 6), 16),
  };
}

/**
 * Format an RGB triple as `#rrggbb`. Each channel is clamped to 0..255,
 * rounded, then hex-padded to 2 chars.
 */
export function formatHex(rgb: RGB): string {
  const hex = (n: number): string => clamp255(n).toString(16).padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

// ── RGB ↔ HSV ──────────────────────────────────────────────────────

/**
 * Convert RGB (0..255) to HSV. Matches the algorithm at
 * https://en.wikipedia.org/wiki/HSL_and_HSV#Formal_derivation.
 *
 * Edge cases:
 * - Grey (r=g=b): hue is undefined per spec; we return 0.
 * - Black (all zeros): hue=0, sat=0, val=0.
 */
export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

/**
 * Convert HSV back to RGB (0..255 integers). Hue wraps via modulo,
 * sat/val are clamped to 0..1 before computing.
 */
export function hsvToRgb(hsv: HSV): RGB {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp01(hsv.s);
  const v = clamp01(hsv.v);
  const c = v * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hPrime >= 0 && hPrime < 1) {
    r1 = c;
    g1 = x;
  } else if (hPrime < 2) {
    r1 = x;
    g1 = c;
  } else if (hPrime < 3) {
    g1 = c;
    b1 = x;
  } else if (hPrime < 4) {
    g1 = x;
    b1 = c;
  } else if (hPrime < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// ── Convenience round-trips ────────────────────────────────────────

/**
 * Parse any hex string + return its HSV equivalent. Returns `null` for
 * malformed input. Saves callers from chaining `parseHex` + `rgbToHsv`.
 */
export function parseHexToHsv(hex: string): HSV | null {
  const rgb = parseHex(hex);
  if (rgb === null) return null;
  return rgbToHsv(rgb);
}

/** Format an HSV triple as `#rrggbb`. */
export function formatHsvAsHex(hsv: HSV): string {
  return formatHex(hsvToRgb(hsv));
}

// ── Clamping helpers ───────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 255) return 255;
  return Math.round(n);
}
