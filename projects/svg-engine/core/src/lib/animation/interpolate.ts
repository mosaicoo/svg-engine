/**
 * **D-082 (Animation Timeline) — F1.** Value interpolation for the animation
 * model. Pure, headless.
 *
 * - **numbers** → linear blend (geometry, opacity, transform components);
 * - **colors** (`#rgb`, `#rrggbb`, `rgb()/rgba()`) → per-channel blend;
 * - **anything else** (incompatible kinds, un-parseable strings) → discrete
 *   hold: the `from` value until the segment ends, snapping to `to` at `t=1`.
 *
 * `t` is the already-eased progress in `[0, 1]`.
 */
export function interpolateValue(
  from: number | string,
  to: number | string,
  t: number,
): number | string {
  if (typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * t;
  }
  if (typeof from === 'string' && typeof to === 'string') {
    const mixed = mixColor(from, to, t);
    if (mixed !== null) return mixed;
  }
  // Non-interpolatable → discrete hold (snap to `to` only at the end).
  return t >= 1 ? to : from;
}

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * Parse a CSS color into 0-255 RGB + 0-1 alpha. Supports `#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`, and `rgb()/rgba()`. Returns `null` for anything
 * else (named colors, `hsl()`, `url(#...)`, gradients) — the caller then
 * falls back to a discrete hold.
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim();
  if (s.startsWith('#')) return parseHex(s);
  const rgb = /^rgba?\(\s*([^)]+)\)$/i.exec(s);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter((p) => p.length > 0);
    if (parts.length < 3) return null;
    const r = clampByte(Number(parts[0]));
    const g = clampByte(Number(parts[1]));
    const b = clampByte(Number(parts[2]));
    const a = parts[3] === undefined ? 1 : clamp01(Number(parts[3]));
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }
  return null;
}

function parseHex(s: string): Rgba | null {
  let hex = s.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length !== 6 && hex.length !== 8) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

/**
 * Blend two colors. Returns the CSS string (`rgb(...)` when both are opaque,
 * `rgba(...)` otherwise), or `null` when either side isn't parseable.
 */
export function mixColor(from: string, to: string, t: number): string | null {
  const a = parseColor(from);
  const b = parseColor(to);
  if (a === null || b === null) return null;
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  const al = a.a + (b.a - a.a) * t;
  return al >= 1
    ? `rgb(${r}, ${g}, ${bl})`
    : `rgba(${r}, ${g}, ${bl}, ${Math.round(al * 1000) / 1000})`;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
