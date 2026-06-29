export {
  type Effect,
  type EffectParam,
  type EffectNumberParam,
  type EffectColorParam,
  type EffectSelectParam,
  type EffectBooleanParam,
  type EffectParamType,
  type EffectParamValue,
  type EffectParams,
  type EffectPreset,
  effectDefaults,
  resolveEffectParams,
  nonDefaultParams,
  isNumberParam,
} from './effect';
export { EffectRegistry } from './effect-registry.service';
export {
  BUILTIN_EFFECTS,
  // Originals
  blurEffect,
  dropShadowEffect,
  grayscaleEffect,
  sepiaEffect,
  // D-047 — shadows / glows
  innerShadowEffect,
  outerGlowEffect,
  innerGlowEffect,
  // D-047 — 3D / stylize
  bevelEffect,
  embossEffect,
  pixelateEffect,
  posterizeEffect,
  // D-047 — color
  invertEffect,
  // D-047 — adjustments
  brightnessEffect,
  contrastEffect,
  saturateEffect,
  hueRotateEffect,
  // D-047 — distortion
  noiseEffect,
  displacementMapEffect,
  chromaticAberrationEffect,
} from './builtin-effects';
export { builtinEffectsPlugin } from './builtin-effects.plugin';
export {
  ChainFilterRegistry,
  // composeChainFilter: composição interna do filtro de chain (só chain-filter.ts).
  // extract/make/parseChainFilterId PERMANECEM — consumidos pelo svge-effects-panel
  // (svg-engine/ui) via barrel público.
  extractChainFilterId,
  makeChainFilterId,
  parseChainFilterId,
  CHAIN_FILTER_ID_PREFIX,
  CHAIN_FILTER_SEPARATOR,
} from './chain-filter';
