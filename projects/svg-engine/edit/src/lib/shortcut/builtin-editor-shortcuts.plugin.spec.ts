import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { MenuContributionRegistry } from '../menu/menu-contribution-registry.service';
import { MENU_SLOT } from '../menu/menu-slots';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import { builtinEditorShortcutsPlugin } from './builtin-editor-shortcuts.plugin';
import { ShortcutRegistry } from './shortcut-registry.service';

/**
 * **D-138 (follow-up)** — Ctrl+S wiring. The shortcut delegates to the
 * `svge.builtin.file.save` menu contribution so it reuses the exact save
 * code path; these specs prove the binding + delegation + graceful no-op
 * without exercising the real download.
 */
function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEnginePlugin(builtinEditorShortcutsPlugin)],
  });
  const shortcuts = TestBed.inject(ShortcutRegistry);
  const menu = TestBed.inject(MenuContributionRegistry);
  const injector = TestBed.inject(Injector);
  return { shortcuts, menu, injector };
}

function ctrlS(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
}

describe('builtinEditorShortcutsPlugin — Ctrl+S Save Workspace (D-138)', () => {
  it('registers Ctrl+S in the File category', () => {
    const { shortcuts } = setup();
    const sc = shortcuts.get('svge.builtin.shortcut.save-workspace');
    expect(sc).toBeTruthy();
    expect(sc?.combo).toBe('Ctrl+S');
    expect(sc?.category).toBe('File');
    // The combo string actually matches a real Ctrl+S keydown.
    expect(shortcuts.tryMatch(ctrlS())?.id).toBe('svge.builtin.shortcut.save-workspace');
  });

  it('runs the File ▸ Save menu contribution and prevents the browser default', () => {
    const { shortcuts, menu, injector } = setup();
    let ran = 0;
    menu.register({
      id: 'svge.builtin.file.save',
      slot: MENU_SLOT.FILE,
      label: 'Save',
      order: 30,
      run() {
        ran++;
      },
    });
    const sc = shortcuts.get('svge.builtin.shortcut.save-workspace')!;
    const event = ctrlS();
    const prevent = vi.spyOn(event, 'preventDefault');
    sc.run(event, { injector });
    expect(ran).toBe(1);
    expect(prevent).toHaveBeenCalledTimes(1);
  });

  it('is a graceful no-op (lets the browser Save dialog through) when the Save item is absent', () => {
    const { shortcuts, injector } = setup();
    const sc = shortcuts.get('svge.builtin.shortcut.save-workspace')!;
    const event = ctrlS();
    const prevent = vi.spyOn(event, 'preventDefault');
    expect(() => sc.run(event, { injector })).not.toThrow();
    expect(prevent).not.toHaveBeenCalled();
  });
});
