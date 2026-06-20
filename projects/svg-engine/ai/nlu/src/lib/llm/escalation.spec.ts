import { describe, expect, it } from 'vitest';

import { isVagueForRuleBased } from './escalation';

describe('isVagueForRuleBased (D-093 Fase 3)', () => {
  it('is NOT vague for specific shape commands (rule-based handles them)', () => {
    expect(isVagueForRuleBased('criar retângulo vermelho 100x50')).toBe(false);
    expect(isVagueForRuleBased('create a blue circle')).toBe(false);
    expect(isVagueForRuleBased('criar 3 círculos vermelhos espalhados')).toBe(false);
  });

  it('is NOT vague for short action phrases', () => {
    expect(isVagueForRuleBased('undo')).toBe(false);
    expect(isVagueForRuleBased('selecionar tudo')).toBe(false);
    expect(isVagueForRuleBased('zoom in')).toBe(false);
  });

  it('IS vague for composite-noun requests (the flagship case)', () => {
    // "card"/"kpi" resolve as shape aliases, so the rule-based matches
    // create-shape at high confidence — but the request is a composition.
    expect(isVagueForRuleBased('crie um card de KPI moderno com título e valor')).toBe(true);
    expect(isVagueForRuleBased('um dashboard de vendas')).toBe(true);
    expect(isVagueForRuleBased('fluxograma')).toBe(true);
  });

  it('IS vague for rich requests with mostly-unrecognized content', () => {
    expect(isVagueForRuleBased('desenhe uma casa simples com telhado e porta')).toBe(true);
    expect(isVagueForRuleBased('organograma corporativo detalhado')).toBe(true);
  });

  it('treats a bare verb (too short) as NOT vague — leaves it to rule-based', () => {
    expect(isVagueForRuleBased('criar')).toBe(false);
    expect(isVagueForRuleBased('')).toBe(false);
  });
});
