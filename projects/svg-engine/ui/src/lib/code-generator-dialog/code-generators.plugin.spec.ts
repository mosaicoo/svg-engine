import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  MENU_SLOT,
  MenuContributionRegistry,
  provideSvgEnginePlugin,
  provideSvgEngineEditorScope,
} from 'svg-engine/edit';
import { CodeGeneratorRegistry } from 'svg-engine/io';
import { codeGeneratorsPlugin } from './code-generators.plugin';

/**
 * **D-110** — proves the single managed plugin does both halves: registers
 * the Group-A generators into {@link CodeGeneratorRegistry} and contributes
 * the `File ▸ Generate Code…` menu entry. The plugin installs via the
 * `ENVIRONMENT_INITIALIZER` wired by {@link provideSvgEnginePlugin}, so it is
 * also discoverable in Manage Plugins.
 */
function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(codeGeneratorsPlugin)],
  });
  return {
    menu: TestBed.inject(MenuContributionRegistry),
    generators: TestBed.inject(CodeGeneratorRegistry),
  };
}

describe('codeGeneratorsPlugin', () => {
  it('registers the three Group-A generators', () => {
    const { generators } = setup();
    expect(generators.generators().map((g) => g.id)).toEqual([
      'svge.codegen.react-jsx',
      'svge.codegen.react-component',
      'svge.codegen.data-uri',
    ]);
  });

  it('contributes File ▸ Generate Code…', () => {
    const { menu } = setup();
    const entry = menu.contributions().find((c) => c.id === 'svge.builtin.ui.file.generate-code');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Generate Code…');
    expect(entry?.slot).toBe(MENU_SLOT.FILE);
  });
});
