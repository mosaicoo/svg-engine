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

/**
 * **D-111** — Cut/Copy/Paste/Paste-in-place/Duplicate keyboard bindings. Each
 * delegates to its Edit-menu contribution (single source of truth) and is
 * categorized 'Edit' so it surfaces in the Keyboard Shortcuts dialog.
 */
describe('builtinEditorShortcutsPlugin — clipboard + duplicate (D-111)', () => {
  const CASES = [
    { shortcutId: 'svge.builtin.shortcut.cut', combo: 'Ctrl+X', menuId: 'svge.builtin.edit.cut' },
    { shortcutId: 'svge.builtin.shortcut.copy', combo: 'Ctrl+C', menuId: 'svge.builtin.edit.copy' },
    {
      shortcutId: 'svge.builtin.shortcut.paste',
      combo: 'Ctrl+V',
      menuId: 'svge.builtin.edit.paste',
    },
    {
      shortcutId: 'svge.builtin.shortcut.paste-in-place',
      combo: 'Ctrl+Shift+V',
      menuId: 'svge.builtin.edit.paste-in-place',
    },
    {
      shortcutId: 'svge.builtin.shortcut.duplicate',
      combo: 'Ctrl+D',
      menuId: 'svge.builtin.edit.duplicate',
    },
  ];

  it('registers all five bindings in the Edit category', () => {
    const { shortcuts } = setup();
    for (const c of CASES) {
      const sc = shortcuts.get(c.shortcutId);
      expect(sc).toBeTruthy();
      expect(sc?.combo).toBe(c.combo);
      expect(sc?.category).toBe('Edit');
    }
  });

  it('each delegates to its Edit-menu contribution and prevents the default', () => {
    const { shortcuts, menu, injector } = setup();
    for (const c of CASES) {
      let ran = 0;
      menu.register({
        id: c.menuId,
        slot: MENU_SLOT.EDIT,
        label: c.menuId,
        order: 40,
        run() {
          ran++;
        },
      });
      const sc = shortcuts.get(c.shortcutId)!;
      const event = new KeyboardEvent('keydown', { key: 'x' });
      const prevent = vi.spyOn(event, 'preventDefault');
      sc.run(event, { injector });
      expect(ran).toBe(1);
      expect(prevent).toHaveBeenCalledTimes(1);
    }
  });

  it('is a graceful no-op when the menu item is absent', () => {
    const { shortcuts, injector } = setup();
    const sc = shortcuts.get('svge.builtin.shortcut.copy')!;
    const event = new KeyboardEvent('keydown', { key: 'c' });
    const prevent = vi.spyOn(event, 'preventDefault');
    expect(() => sc.run(event, { injector })).not.toThrow();
    expect(prevent).not.toHaveBeenCalled();
  });
});
