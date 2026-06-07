import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { builtinTemplatesPlugin } from './builtin-templates.plugin';
import { TemplateLibraryService } from './template-library.service';

/**
 * D-048 — Template Library specs:
 * 1. Plugin registers all 12 builtins (4 originais + 8 do round 2).
 * 2. ids únicos e prefixados.
 * 3. build() devolve um SvgDocument cujo viewBox bate com `dimensions`.
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(builtinTemplatesPlugin)],
  });
  return { catalog: TestBed.inject(TemplateLibraryService) };
}

const ALL_IDS = [
  // originais
  'a4-portrait',
  'instagram-square',
  'twitter-card',
  'business-card',
  // round 2
  'a4-landscape',
  'letter-portrait',
  'instagram-story',
  'instagram-portrait',
  'youtube-thumbnail',
  'presentation-16-9',
  'pinterest-pin',
  'facebook-cover',
];

describe('builtinTemplatesPlugin — registra 12 builtins', () => {
  it('registra os 12 templates (4 originais + 8 novos)', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    for (const id of ALL_IDS) {
      expect(ids).toContain(`svge.builtin.template.${id}`);
    }
    expect(catalog.items().length).toBe(12);
    expect(catalog.items().length).toBe(BUILTIN_TEMPLATES.length);
  });

  it('todos os ids são únicos e prefixados com svge.builtin.template.', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('svge.builtin.template.')).toBe(true);
  });

  it('build() devolve um documento cujo viewBox bate com o hint `dimensions`', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const doc = t.build();
      // viewBox positivo + origem (0,0).
      expect(doc.viewBox.width).toBeGreaterThan(0);
      expect(doc.viewBox.height).toBeGreaterThan(0);
      expect(doc.viewBox.x).toBe(0);
      expect(doc.viewBox.y).toBe(0);
      // root vazio (template é um documento em branco).
      expect(doc.root.type).toBe('group');
      // dimensions "W×H" deve casar com o viewBox.
      expect(t.dimensions).toBeDefined();
      const [w, h] = t.dimensions!.split('×').map((s) => Number(s.trim()));
      expect(w).toBe(doc.viewBox.width);
      expect(h).toBe(doc.viewBox.height);
    }
  });

  it('build() gera um documento novo (id distinto) a cada chamada', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.build().id).not.toBe(t.build().id);
    }
  });
});
