import type { GradientLibraryItem, GradientStop } from './gradient-library.service';

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

/** Ordered list of all 6 builtins for the picker. */
export const BUILTIN_GRADIENTS: readonly GradientLibraryItem[] = [
  linearGreyGradient,
  linearBlueSkyGradient,
  linearSunsetGradient,
  linearOceanGradient,
  radialSpotlightGradient,
  radialNeonGradient,
];
