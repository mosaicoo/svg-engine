import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize';
import {
  extractSlots,
  parseColorPhrase,
  parseColorToken,
  parseDimensionToken,
  parseNumberToken,
} from './slot-extractor';

describe('NLU › slot-extractor', () => {
  describe('parseNumberToken', () => {
    it('parses integers and decimals (en/pt)', () => {
      expect(parseNumberToken('100')).toBe(100);
      expect(parseNumberToken('1.5')).toBe(1.5);
      expect(parseNumberToken('1,5')).toBe(1.5);
      expect(parseNumberToken('-10')).toBe(-10);
    });
    it('accepts px / pt units (despreza)', () => {
      expect(parseNumberToken('100px')).toBe(100);
      expect(parseNumberToken('12pt')).toBe(12);
    });
    it('returns first number from dimension token', () => {
      expect(parseNumberToken('100x50')).toBe(100);
    });
    it('returns null for non-numeric tokens', () => {
      expect(parseNumberToken('rect')).toBeNull();
      expect(parseNumberToken('')).toBeNull();
    });
  });

  describe('parseDimensionToken', () => {
    it('parses 100x50', () => {
      expect(parseDimensionToken('100x50')).toEqual({ width: 100, height: 50 });
    });
    it('returns null for non-dimension', () => {
      expect(parseDimensionToken('100')).toBeNull();
      expect(parseDimensionToken('rect')).toBeNull();
    });
  });

  describe('parseColorToken', () => {
    it('resolves hex direto', () => {
      expect(parseColorToken('#ff0000')).toBe('#ff0000');
      expect(parseColorToken('#FF0000')).toBe('#ff0000');
      expect(parseColorToken('#f00')).toBe('#f00');
    });
    it('resolves rgb()/rgba() functional notation', () => {
      expect(parseColorToken('rgb(255,0,0)')).toBe('#ff0000');
      expect(parseColorToken('rgba(255,0,0,0.5)')).toBe('#ff0000');
    });
    it('resolves hsl()/hsla() functional notation', () => {
      expect(parseColorToken('hsl(0,100%,50%)')).toBe('#ff0000');
      expect(parseColorToken('hsl(240,100%,50%)')).toBe('#0000ff');
    });
    it('resolves named colors PT', () => {
      expect(parseColorToken('vermelho')).toBe('#e53935');
      expect(parseColorToken('azul')).toBe('#1e88e5');
    });
    it('resolves named colors EN', () => {
      expect(parseColorToken('red')).toBe('#e53935');
      expect(parseColorToken('blue')).toBe('#1e88e5');
    });
    it('resolves semantic colors (success/warning/danger/info)', () => {
      expect(parseColorToken('success')).toBe('#43a047');
      expect(parseColorToken('sucesso')).toBe('#43a047');
      expect(parseColorToken('warning')).toBe('#fbc02d');
      expect(parseColorToken('alerta')).toBe('#fbc02d');
      expect(parseColorToken('danger')).toBe('#e53935');
      expect(parseColorToken('perigo')).toBe('#e53935');
      expect(parseColorToken('info')).toBe('#1e88e5');
      expect(parseColorToken('primary')).toBe('#1e88e5');
    });
    it('fuzzy-resolves typos', () => {
      // 'vermelo' (1 typo) → 'vermelho'
      expect(parseColorToken('vermelo')).toBe('#e53935');
    });
    it('returns null for unknown tokens', () => {
      expect(parseColorToken('xyz')).toBeNull();
    });
  });

  describe('parseColorPhrase (intensificadores adjacentes)', () => {
    it('parses lonely color → 1 token consumed', () => {
      const m = parseColorPhrase(['azul'], 0);
      expect(m).not.toBeNull();
      expect(m!.color).toBe('#1e88e5');
      expect(m!.tokensConsumed).toBe(1);
    });
    it('parses "azul claro" → lighter blue, 2 tokens consumed', () => {
      const m = parseColorPhrase(['azul', 'claro'], 0);
      expect(m).not.toBeNull();
      // Não verifica hex exato (depende do delta de lightness), só
      // garante que é UM HEX diferente do base.
      expect(m!.color.startsWith('#')).toBe(true);
      expect(m!.color).not.toBe('#1e88e5');
      expect(m!.tokensConsumed).toBe(2);
    });
    it('parses "azul escuro" → darker blue, 2 tokens', () => {
      const m = parseColorPhrase(['azul', 'escuro'], 0);
      expect(m).not.toBeNull();
      expect(m!.color).not.toBe('#1e88e5');
      expect(m!.tokensConsumed).toBe(2);
    });
    it('parses "dark blue" (EN, modifier ANTES) → darker, 2 tokens', () => {
      const m = parseColorPhrase(['dark', 'blue'], 0);
      expect(m).not.toBeNull();
      expect(m!.tokensConsumed).toBe(2);
    });
    it('parses "bem azul escuro" → multiplier amplifica delta, 3 tokens', () => {
      const m = parseColorPhrase(['bem', 'azul', 'escuro'], 0);
      expect(m).not.toBeNull();
      expect(m!.tokensConsumed).toBe(3);
    });
    it('parses "very dark red" (EN multiplier) → 3 tokens', () => {
      const m = parseColorPhrase(['very', 'dark', 'red'], 0);
      expect(m).not.toBeNull();
      expect(m!.tokensConsumed).toBe(3);
    });
    it('does not modify non-hex keyword (transparent stays)', () => {
      // "transparente claro" — claro is detected but transparent stays
      // unmodified (não tem hex base pra ajustar)
      const m = parseColorPhrase(['transparente', 'claro'], 0);
      expect(m).not.toBeNull();
      expect(m!.color).toBe('transparent');
      // Modifier ainda é consumido (tokensConsumed=2) mesmo sem efeito
      expect(m!.tokensConsumed).toBe(2);
    });
    it('returns null when window has no color at all', () => {
      expect(parseColorPhrase(['criar', 'retangulo'], 0)).toBeNull();
    });
    it('parses startIdx > 0', () => {
      const m = parseColorPhrase(['criar', 'azul'], 1);
      expect(m).not.toBeNull();
      expect(m!.color).toBe('#1e88e5');
    });
  });

  describe('extractSlots', () => {
    it('extracts number and color slots positionally', () => {
      const tokens = tokenize('criar retângulo vermelho 100');
      const slots = extractSlots(tokens, {
        fill: { kind: 'color', optional: true },
        size: { kind: 'number', optional: true },
      });
      expect(slots['fill']).toBe('#e53935');
      expect(slots['size']).toBe(100);
    });

    it('extracts width/height from a single 100x50 dimension token', () => {
      const tokens = tokenize('rect 100x50');
      const slots = extractSlots(tokens, {
        width: { kind: 'number', optional: true },
        height: { kind: 'number', optional: true },
      });
      expect(slots['width']).toBe(100);
      expect(slots['height']).toBe(50);
    });

    it('extracts enum value', () => {
      const tokens = tokenize('alinhar à esquerda');
      const slots = extractSlots(tokens, {
        side: { kind: 'enum', values: ['esquerda', 'direita', 'topo'], optional: true },
      });
      expect(slots['side']).toBe('esquerda');
    });

    it('applies defaults for unfilled optional slots', () => {
      const tokens = tokenize('criar retângulo');
      const slots = extractSlots(tokens, {
        width: { kind: 'number', optional: true, default: 100 },
        height: { kind: 'number', optional: true, default: 100 },
      });
      expect(slots['width']).toBe(100);
      expect(slots['height']).toBe(100);
    });

    it('leaves unfilled required slots undefined', () => {
      const tokens = tokenize('criar retângulo');
      const slots = extractSlots(tokens, {
        color: { kind: 'color', optional: false },
      });
      expect(slots['color']).toBeUndefined();
    });

    it('does not double-consume the same token', () => {
      const tokens = tokenize('criar 100 azul');
      const slots = extractSlots(tokens, {
        size: { kind: 'number', optional: true },
        sizeAlt: { kind: 'number', optional: true },
      });
      // só um number existe — só size é preenchido
      expect(slots['size']).toBe(100);
      expect(slots['sizeAlt']).toBeUndefined();
    });

    it('ignores stopwords', () => {
      const tokens = tokenize('criar um retângulo de cor vermelha');
      const slots = extractSlots(tokens, {
        color: { kind: 'color', optional: false },
      });
      expect(slots['color']).toBe('#e53935');
    });

    // ── D-046 review-3: anchorKeywords + kind 'point' ─────────────

    describe('anchorKeywords (D-046 review-3)', () => {
      it('captures stroke via anchor "borda" sem comer o fill positional', () => {
        const tokens = tokenize('retangulo vermelho borda azul');
        const slots = extractSlots(tokens, {
          fill: { kind: 'color', optional: true },
          stroke: {
            kind: 'color',
            optional: true,
            anchorKeywords: ['borda', 'contorno', 'stroke'],
          },
        });
        // Anchor 'borda' consome 'azul' adjacente pra stroke.
        expect(slots['stroke']).toBe('#1e88e5');
        // Positional pega 'vermelho' que NÃO foi consumido pelo anchored.
        expect(slots['fill']).toBe('#e53935');
      });

      it('captures strokeWidth via anchor "espessura"', () => {
        const tokens = tokenize('borda azul espessura 5');
        const slots = extractSlots(tokens, {
          stroke: { kind: 'color', optional: true, anchorKeywords: ['borda', 'stroke'] },
          strokeWidth: {
            kind: 'number',
            optional: true,
            anchorKeywords: ['espessura', 'thickness'],
          },
        });
        expect(slots['stroke']).toBe('#1e88e5');
        expect(slots['strokeWidth']).toBe(5);
      });

      it('anchor stopword é filtrado — não dispara captura', () => {
        // 'na' é stopword. Anchor 'na' não captura nada — só 'posicao' (não-stopword).
        const tokens = tokenize('retangulo na 100 50');
        const slots = extractSlots(tokens, {
          position: {
            kind: 'point',
            optional: true,
            anchorKeywords: ['na', 'posicao'], // 'na' é stopword → ignorado
          },
        });
        // Sem anchor real válido, position fica undefined (Pass 1 falha).
        // Pass 2 positional pega o ponto pelos 2 numbers adjacentes.
        expect(slots['position']).toEqual({ x: 100, y: 50 });
      });

      it('anchor sem valor compatível adjacente E sem fallback positional → undefined', () => {
        // Quando o anchor falha em extrair valor, o positional pass
        // ainda roda e pode achar a cor via fuzzy. Aqui usamos um anchor
        // word que NÃO é fuzzy-próximo de cor alguma (por isso usamos
        // 'xstrokex' em vez de 'borda' — 'borda' fuzzy-matcha 'bordo').
        const tokens = tokenize('xstrokex 999');
        const slots = extractSlots(tokens, {
          stroke: { kind: 'color', optional: true, anchorKeywords: ['xstrokex'] },
        });
        // Nem o anchor (sem valor), nem o positional (999 não é cor)
        // preenchem o slot.
        expect(slots['stroke']).toBeUndefined();
      });
    });

    describe("kind 'point' (D-046 review-3)", () => {
      it('captures point a partir de dimensão 100x50', () => {
        const tokens = tokenize('posicao 100x50');
        const slots = extractSlots(tokens, {
          position: { kind: 'point', optional: true, anchorKeywords: ['posicao'] },
        });
        expect(slots['position']).toEqual({ x: 100, y: 50 });
      });

      it('captures point a partir de dois numbers adjacentes', () => {
        const tokens = tokenize('posicao 100 200');
        const slots = extractSlots(tokens, {
          position: { kind: 'point', optional: true, anchorKeywords: ['posicao'] },
        });
        expect(slots['position']).toEqual({ x: 100, y: 200 });
      });

      it('captures point positional (sem anchor)', () => {
        const tokens = tokenize('rect 100x50');
        const slots = extractSlots(tokens, {
          position: { kind: 'point', optional: true },
        });
        expect(slots['position']).toEqual({ x: 100, y: 50 });
      });

      it('aplica default quando ausente', () => {
        const tokens = tokenize('apenas texto');
        const slots = extractSlots(tokens, {
          position: { kind: 'point', optional: true, default: { x: 0, y: 0 } },
        });
        expect(slots['position']).toEqual({ x: 0, y: 0 });
      });

      it('integração FULL: "circulo preto 50x50 com borda azul tamanho 5 posicao 100 100"', () => {
        const tokens = tokenize('circulo preto 50x50 com borda azul tamanho 5 posicao 100 100');
        const slots = extractSlots(tokens, {
          shape: { kind: 'shape', optional: true, default: 'rect' },
          fill: { kind: 'color', optional: true },
          width: { kind: 'number', optional: true, default: 100 },
          height: { kind: 'number', optional: true, default: 100 },
          stroke: { kind: 'color', optional: true, anchorKeywords: ['borda', 'stroke'] },
          strokeWidth: {
            kind: 'number',
            optional: true,
            anchorKeywords: ['tamanho', 'espessura'],
          },
          position: {
            kind: 'point',
            optional: true,
            anchorKeywords: ['posicao', 'position'],
          },
        });
        expect(slots['shape']).toBe('circle');
        expect(slots['fill']).toBe('#000000');
        expect(slots['width']).toBe(50);
        expect(slots['height']).toBe(50);
        expect(slots['stroke']).toBe('#1e88e5');
        expect(slots['strokeWidth']).toBe(5);
        expect(slots['position']).toEqual({ x: 100, y: 100 });
      });
    });
  });
});
