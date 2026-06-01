import {
  buildGradientMarkup,
  type GradientGeometry,
  type GradientLibraryItem,
  type GradientStop,
} from './gradient-library.service';

/**
 * 6 built-in gradients (D-048 Item 3). Mix of linear + radial,
 * spanning common design uses (sunset, ocean, fade, spotlight).
 *
 * **Naming convention**: `svge.builtin.gradient.{linear|radial}-{name}`.
 *
 * **Coordinate system**: linear gradients use the SVG default
 * (`x1=0% y1=0% x2=100% y2=0%`) — left-to-right horizontal sweep.
 * Vertical variants override `y2=100%`. Radial gradients default to
 * `cx=50% cy=50% r=50%` (centered, half-width radius).
 */

/** Build a `<linearGradient>` markup with the given stops. */
function buildLinear(id: string, stops: readonly GradientStop[], x2 = '100%', y2 = '0%'): string {
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${x2}" y2="${y2}">
    ${stops.map(stopMarkup).join('\n    ')}
  </linearGradient>`;
}

/** Build a `<radialGradient>` markup with the given stops. */
function buildRadial(id: string, stops: readonly GradientStop[]): string {
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">
    ${stops.map(stopMarkup).join('\n    ')}
  </radialGradient>`;
}

function stopMarkup(stop: GradientStop): string {
  const op = stop.opacity ?? 1;
  const opAttr = op !== 1 ? ` stop-opacity="${op}"` : '';
  return `<stop offset="${(stop.offset * 100).toFixed(0)}%" stop-color="${stop.color}"${opAttr} />`;
}

/** Linear left → right: light gray → dark gray. Workhorse base. */
export const linearGreyGradient: GradientLibraryItem = {
  id: 'svge.builtin.gradient.linear-grey',
  name: 'Grey (horizontal)',
  category: 'linear',
  kind: 'linear',
  stops: [
    { offset: 0, color: '#f5f5f5' },
    { offset: 1, color: '#424242' },
  ],
  buildMarkup() {
    return buildLinear(this.id, this.stops);
  },
};

/** Linear top → bottom: bright blue sky → deep navy. */
export const linearBlueSkyGradient: GradientLibraryItem = {
  id: 'svge.builtin.gradient.linear-blue-sky',
  name: 'Blue sky (vertical)',
  category: 'linear',
  kind: 'linear',
  stops: [
    { offset: 0, color: '#90caf9' },
    { offset: 1, color: '#0d47a1' },
  ],
  buildMarkup() {
    return buildLinear(this.id, this.stops, '0%', '100%');
  },
};

/** Sunset: warm 3-stop horizontal (yellow → orange → magenta). */
export const linearSunsetGradient: GradientLibraryItem = {
  id: 'svge.builtin.gradient.linear-sunset',
  name: 'Sunset',
  category: 'linear',
  kind: 'linear',
  stops: [
    { offset: 0, color: '#fff176' },
    { offset: 0.5, color: '#ff8a65' },
    { offset: 1, color: '#c2185b' },
  ],
  buildMarkup() {
    return buildLinear(this.id, this.stops);
  },
};

/** Ocean: cool 3-stop horizontal (cyan → teal → deep blue). */
export const linearOceanGradient: GradientLibraryItem = {
  id: 'svge.builtin.gradient.linear-ocean',
  name: 'Ocean',
  category: 'linear',
  kind: 'linear',
  stops: [
    { offset: 0, color: '#80deea' },
    { offset: 0.5, color: '#00897b' },
    { offset: 1, color: '#1a237e' },
  ],
  buildMarkup() {
    return buildLinear(this.id, this.stops);
  },
};

/** Radial: white center → transparent edge. "Spotlight" effect. */
export const radialSpotlightGradient: GradientLibraryItem = {
  id: 'svge.builtin.gradient.radial-spotlight',
  name: 'Spotlight',
  category: 'radial',
  kind: 'radial',
  stops: [
    { offset: 0, color: '#ffffff', opacity: 1 },
    { offset: 1, color: '#ffffff', opacity: 0 },
  ],
  buildMarkup() {
    return buildRadial(this.id, this.stops);
  },
};

/** Radial: hot pink center → deep purple edge. Neon glow effect. */
export const radialNeonGradient: GradientLibraryItem = {
  id: 'svge.builtin.gradient.radial-neon',
  name: 'Neon glow',
  category: 'radial',
  kind: 'radial',
  stops: [
    { offset: 0, color: '#ff4081' },
    { offset: 0.6, color: '#8e24aa' },
    { offset: 1, color: '#311b92' },
  ],
  buildMarkup() {
    return buildRadial(this.id, this.stops);
  },
};

// ── Orientation presets (D-058 geometry, objectBoundingBox 0..1) ─────
//
// The original 6 builtins above hard-code geometry inside `buildMarkup`
// (pre-D-058 pattern, kept for back-compat). The 15 items below use the
// post-D-058 convention instead: an explicit `geometry` field consumed
// by the shared `buildGradientMarkup(this)` helper. This is the
// recommended path (see GradientLibraryItem JSDoc) — it's data-driven,
// so the same three vectors cover all three sweep directions and the
// inline editor can render/drag handles for them.
//
// - HORIZONTAL: left → right  (0,0) → (1,0)
// - VERTICAL:   top → bottom  (0,0) → (0,1)
// - DIAGONAL:   top-left → bottom-right (0,0) → (1,1)
const HORIZONTAL: GradientGeometry = { x1: 0, y1: 0, x2: 1, y2: 0 };
const VERTICAL: GradientGeometry = { x1: 0, y1: 0, x2: 0, y2: 1 };
const DIAGONAL: GradientGeometry = { x1: 0, y1: 0, x2: 1, y2: 1 };

/**
 * Factory for a geometry-driven linear gradient item — keeps the 15
 * additions below DRY while matching the `GradientLibraryItem` shape
 * the registry expects. `buildMarkup` delegates to the shared
 * `buildGradientMarkup(this)` so the explicit `geometry` is honored.
 */
function linearItem(
  idSuffix: string,
  name: string,
  geometry: GradientGeometry,
  stops: readonly GradientStop[],
): GradientLibraryItem {
  return {
    id: `svge.builtin.gradient.linear-${idSuffix}`,
    name,
    category: 'linear',
    kind: 'linear',
    geometry,
    stops,
    buildMarkup() {
      return buildGradientMarkup(this);
    },
  };
}

// ── 5 horizontal (left → right) ──────────────────────────────────────

/** Warm peach → gold, horizontal. */
export const linearSunriseGradient = linearItem('sunrise', 'Sunrise (horizontal)', HORIZONTAL, [
  { offset: 0, color: '#ffd194' },
  { offset: 1, color: '#d1913c' },
]);

/** Fresh mint → teal, horizontal. */
export const linearMintGradient = linearItem('mint', 'Mint (horizontal)', HORIZONTAL, [
  { offset: 0, color: '#a8e6cf' },
  { offset: 1, color: '#00897b' },
]);

/** Lavender → deep purple, horizontal. */
export const linearGrapeGradient = linearItem('grape', 'Grape (horizontal)', HORIZONTAL, [
  { offset: 0, color: '#c5a3ff' },
  { offset: 1, color: '#4a148c' },
]);

/** Hot red → orange ember, horizontal. */
export const linearEmberGradient = linearItem('ember', 'Ember (horizontal)', HORIZONTAL, [
  { offset: 0, color: '#ff5252' },
  { offset: 0.5, color: '#ff7043' },
  { offset: 1, color: '#ffab40' },
]);

/** Cool steel: light blue-grey → slate, horizontal. */
export const linearSteelGradient = linearItem('steel', 'Steel (horizontal)', HORIZONTAL, [
  { offset: 0, color: '#cfd8dc' },
  { offset: 1, color: '#455a64' },
]);

// ── 5 vertical (top → bottom) ────────────────────────────────────────

/** Sunset dusk: warm orange → deep indigo, vertical. */
export const linearDuskGradient = linearItem('dusk', 'Dusk (vertical)', VERTICAL, [
  { offset: 0, color: '#ff9e57' },
  { offset: 0.5, color: '#a64f9c' },
  { offset: 1, color: '#1a237e' },
]);

/** Light green → forest green, vertical. */
export const linearForestGradient = linearItem('forest', 'Forest (vertical)', VERTICAL, [
  { offset: 0, color: '#aed581' },
  { offset: 1, color: '#1b5e20' },
]);

/** Soft sky: white → light blue, vertical fade. */
export const linearSkyFadeGradient = linearItem('sky-fade', 'Sky fade (vertical)', VERTICAL, [
  { offset: 0, color: '#ffffff' },
  { offset: 1, color: '#64b5f6' },
]);

/** Pink → crimson, vertical. */
export const linearRoseGradient = linearItem('rose', 'Rose (vertical)', VERTICAL, [
  { offset: 0, color: '#f8bbd0' },
  { offset: 1, color: '#ad1457' },
]);

/** Graphite: mid grey → near-black, vertical. */
export const linearGraphiteGradient = linearItem('graphite', 'Graphite (vertical)', VERTICAL, [
  { offset: 0, color: '#9e9e9e' },
  { offset: 1, color: '#212121' },
]);

// ── 5 diagonal (top-left → bottom-right) ─────────────────────────────

/** Aurora: teal → purple, diagonal. */
export const linearAuroraGradient = linearItem('aurora', 'Aurora (diagonal)', DIAGONAL, [
  { offset: 0, color: '#1de9b6' },
  { offset: 1, color: '#6a1b9a' },
]);

/** Peachy: yellow → pink, diagonal. */
export const linearPeachyGradient = linearItem('peachy', 'Peachy (diagonal)', DIAGONAL, [
  { offset: 0, color: '#fff59d' },
  { offset: 1, color: '#ec407a' },
]);

/** Deep sea: cyan → navy, diagonal. */
export const linearDeepSeaGradient = linearItem('deep-sea', 'Deep sea (diagonal)', DIAGONAL, [
  { offset: 0, color: '#26c6da' },
  { offset: 0.5, color: '#1565c0' },
  { offset: 1, color: '#0d1b4c' },
]);

/** Lava: bright yellow → deep red, diagonal. */
export const linearLavaGradient = linearItem('lava', 'Lava (diagonal)', DIAGONAL, [
  { offset: 0, color: '#ffee58' },
  { offset: 0.5, color: '#f4511e' },
  { offset: 1, color: '#b71c1c' },
]);

/** Twilight: blue → magenta, diagonal. */
export const linearTwilightGradient = linearItem('twilight', 'Twilight (diagonal)', DIAGONAL, [
  { offset: 0, color: '#3949ab' },
  { offset: 1, color: '#d500f9' },
]);

/**
 * Ordered list of all builtins for the picker — the 6 originals
 * (linear hard-coded geometry + 2 radials) followed by 15 geometry-
 * driven linear presets (5 horizontal, 5 vertical, 5 diagonal) added
 * to give designers a richer starter set spanning all three sweep
 * directions.
 */
export const BUILTIN_GRADIENTS: readonly GradientLibraryItem[] = [
  linearGreyGradient,
  linearBlueSkyGradient,
  linearSunsetGradient,
  linearOceanGradient,
  radialSpotlightGradient,
  radialNeonGradient,
  // + horizontal
  linearSunriseGradient,
  linearMintGradient,
  linearGrapeGradient,
  linearEmberGradient,
  linearSteelGradient,
  // + vertical
  linearDuskGradient,
  linearForestGradient,
  linearSkyFadeGradient,
  linearRoseGradient,
  linearGraphiteGradient,
  // + diagonal
  linearAuroraGradient,
  linearPeachyGradient,
  linearDeepSeaGradient,
  linearLavaGradient,
  linearTwilightGradient,
];
