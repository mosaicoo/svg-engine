import { describe, expect, it } from 'vitest';
import {
  ACTION_BONUS_CANONICAL,
  ACTION_BONUS_DIRECT,
  AUTO_EXECUTE_THRESHOLD,
  DEFAULT_MAX_RESULTS,
  DEFAULT_PARSE_THRESHOLD,
  DESCRIPTION_BOOST_MAX,
  DESCRIPTION_BOOST_PER_HIT,
  expectedScore,
  KEYWORD_WEIGHT_ACTION_ONLY,
  KEYWORD_WEIGHT_FULL,
  KEYWORD_WEIGHT_KEYWORDS_ONLY,
  KEYWORD_WEIGHT_SLOTS_ONLY,
  SLOT_BONUS_ANCHORED,
  SLOT_BONUS_OPTIONAL,
  SLOT_BONUS_REQUIRED,
  SLOT_PENALTY_REQUIRED_MISSING,
  TIEBREAKER_EPSILON,
} from './scoring-constants';

/**
 * **Scoring fixtures** — D-046 review-10 (Sprint 1.B).
 *
 * Cobertura de cenários canônicos que QUEBRAM facilmente quando uma
 * constante muda. Se mudar 0.5 → 0.45, vários desses falham — é a
 * proteção contra regressão silenciosa em ranking.
 */

describe('Scoring constants — invariantes', () => {
  it('valores numéricos congelados (mudança ≠ acidente)', () => {
    expect(KEYWORD_WEIGHT_FULL).toBe(0.5);
    expect(KEYWORD_WEIGHT_ACTION_ONLY).toBe(0.55);
    expect(KEYWORD_WEIGHT_SLOTS_ONLY).toBe(0.65);
    expect(KEYWORD_WEIGHT_KEYWORDS_ONLY).toBe(0.75);
    expect(ACTION_BONUS_DIRECT).toBe(0.25);
    expect(ACTION_BONUS_CANONICAL).toBe(0.2);
    expect(SLOT_PENALTY_REQUIRED_MISSING).toBe(0.15);
    expect(SLOT_BONUS_OPTIONAL).toBe(0.05);
    expect(SLOT_BONUS_REQUIRED).toBe(0.1);
    expect(SLOT_BONUS_ANCHORED).toBe(0.1);
    expect(DESCRIPTION_BOOST_PER_HIT).toBe(0.04);
    expect(DESCRIPTION_BOOST_MAX).toBe(0.2);
    expect(DEFAULT_PARSE_THRESHOLD).toBe(0.3);
    expect(AUTO_EXECUTE_THRESHOLD).toBe(0.7);
    expect(TIEBREAKER_EPSILON).toBe(0.05);
    expect(DEFAULT_MAX_RESULTS).toBe(5);
  });

  it('invariante: AUTO_EXECUTE > DEFAULT_PARSE (gap pra confirmação)', () => {
    expect(AUTO_EXECUTE_THRESHOLD).toBeGreaterThan(DEFAULT_PARSE_THRESHOLD);
  });

  it('invariante: ACTION_BONUS_DIRECT > ACTION_BONUS_CANONICAL', () => {
    expect(ACTION_BONUS_DIRECT).toBeGreaterThan(ACTION_BONUS_CANONICAL);
  });

  it('invariante: SLOT_BONUS_REQUIRED > SLOT_BONUS_OPTIONAL', () => {
    expect(SLOT_BONUS_REQUIRED).toBeGreaterThan(SLOT_BONUS_OPTIONAL);
  });

  it('invariante: keyword weights monotonic (full < action_only < slots_only < keywords_only)', () => {
    expect(KEYWORD_WEIGHT_FULL).toBeLessThan(KEYWORD_WEIGHT_ACTION_ONLY);
    expect(KEYWORD_WEIGHT_ACTION_ONLY).toBeLessThan(KEYWORD_WEIGHT_SLOTS_ONLY);
    expect(KEYWORD_WEIGHT_SLOTS_ONLY).toBeLessThan(KEYWORD_WEIGHT_KEYWORDS_ONLY);
  });
});

describe('expectedScore — fixtures de cenários reais', () => {
  it('Intent só-keyword exato ("Undo" auto-discovery) → 0.75 (auto-execute)', () => {
    const score = expectedScore({
      hasAction: false,
      hasSlots: false,
    });
    expect(score).toBe(0.75);
    expect(score).toBeGreaterThanOrEqual(AUTO_EXECUTE_THRESHOLD);
  });

  it('Intent action+keyword exato ("create rect" no create-shape) ≥ 0.85', () => {
    const score = expectedScore({
      hasAction: true,
      hasSlots: true, // create-shape tem slots
      actionMatched: 'direct',
      requiredFilled: 0,
      optionalFilled: 3, // shape, width, height defaults
    });
    // 0.5 + 0.25 + 3*0.05 = 0.9
    expect(score).toBeCloseTo(0.9, 2);
    expect(score).toBeGreaterThanOrEqual(AUTO_EXECUTE_THRESHOLD);
  });

  it('Intent completo (kw + action + 1 required filled + anchored)', () => {
    const score = expectedScore({
      hasAction: true,
      hasSlots: true,
      actionMatched: 'direct',
      requiredFilled: 1,
      anchoredFilled: 1,
    });
    // 0.5 + 0.25 + 0.10 + 0.10 = 0.95
    expect(score).toBeCloseTo(0.95, 2);
  });

  it('Intent com required missing cai abaixo do auto-execute', () => {
    const score = expectedScore({
      hasAction: true,
      hasSlots: true,
      actionMatched: 'direct',
      requiredMissing: 2,
    });
    // 0.5 + 0.25 - 2*0.15 = 0.45
    expect(score).toBe(0.45);
    expect(score).toBeLessThan(AUTO_EXECUTE_THRESHOLD);
  });

  it('Description boost compõe corretamente (5 hits = cap 0.20)', () => {
    const base = expectedScore({ hasAction: false, hasSlots: false }); // 0.75
    const boosted = expectedScore({ hasAction: false, hasSlots: false, descHits: 5 });
    expect(boosted - base).toBeCloseTo(DESCRIPTION_BOOST_MAX, 5);
    // Score clamped em 1
    expect(boosted).toBeLessThanOrEqual(1);
  });

  it('Description boost além do cap não aumenta score (cap firme)', () => {
    const cap5 = expectedScore({ hasAction: false, hasSlots: false, descHits: 5 });
    const cap10 = expectedScore({ hasAction: false, hasSlots: false, descHits: 10 });
    expect(cap10).toBe(cap5);
  });

  it('Action canonical contribui menos que action direct', () => {
    const direct = expectedScore({
      hasAction: true,
      hasSlots: false,
      actionMatched: 'direct',
    });
    const canonical = expectedScore({
      hasAction: true,
      hasSlots: false,
      actionMatched: 'canonical',
    });
    expect(direct).toBeGreaterThan(canonical);
    // Diff = ACTION_BONUS_DIRECT - ACTION_BONUS_CANONICAL = 0.05
    expect(direct - canonical).toBeCloseTo(ACTION_BONUS_DIRECT - ACTION_BONUS_CANONICAL, 5);
  });

  it('Score clamped em [0, 1]', () => {
    // Cenário absurdo: tudo positivo somando >>1
    const exorbitant = expectedScore({
      hasAction: true,
      hasSlots: true,
      actionMatched: 'direct',
      requiredFilled: 10,
      optionalFilled: 10,
      anchoredFilled: 10,
      descHits: 100,
    });
    expect(exorbitant).toBe(1);

    // Cenário com tudo negativo
    const collapsed = expectedScore({
      hasAction: false,
      hasSlots: true,
      requiredMissing: 100,
    });
    expect(collapsed).toBe(0);
  });

  it('Tiebreaker epsilon (0.05) é maior que precision-error típica', () => {
    // Garante que scores idênticos não disparam tiebreaker por jitter de fp.
    expect(TIEBREAKER_EPSILON).toBeGreaterThan(0.001);
  });
});
