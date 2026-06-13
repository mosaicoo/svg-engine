import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KeybindingsService } from './keybindings.service';
import { ShortcutRegistry } from './shortcut-registry.service';

const STORAGE_KEY = 'svge:keybindings:v1';

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* privacy mode — ignore */
  }
}

/** Build a keydown event matching a combo like `Ctrl+Shift+G` / `g`. */
function key(combo: string): KeyboardEvent {
  const tokens = combo.split('+');
  const k = tokens[tokens.length - 1]!;
  const mods = tokens.slice(0, -1).map((t) => t.toLowerCase());
  return new KeyboardEvent('keydown', {
    key: k,
    ctrlKey: mods.includes('ctrl'),
    shiftKey: mods.includes('shift'),
    altKey: mods.includes('alt'),
    metaKey: mods.includes('cmd') || mods.includes('meta'),
  });
}

describe('KeybindingsService', () => {
  let kb: KeybindingsService;
  let reg: ShortcutRegistry;

  beforeEach(() => {
    clearStorage();
    TestBed.configureTestingModule({});
    reg = TestBed.inject(ShortcutRegistry);
    kb = TestBed.inject(KeybindingsService);
  });

  afterEach(() => clearStorage());

  it('with no overrides, tryMatch mirrors the registry default', () => {
    let fired = 0;
    reg.register({ id: 'a', combo: 'Ctrl+G', description: 'Group', run: () => (fired += 1) });
    const match = kb.tryMatch(key('Ctrl+G'));
    expect(match?.id).toBe('a');
    match!.run(key('Ctrl+G'));
    expect(fired).toBe(1);
    expect(kb.tryMatch(key('Ctrl+H'))).toBeNull();
  });

  it('setBinding rebinds: the new combo matches, the old does not', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    expect(kb.setBinding('a', 'Ctrl+Shift+K').ok).toBe(true);
    expect(kb.tryMatch(key('Ctrl+Shift+K'))?.id).toBe('a');
    expect(kb.tryMatch(key('Ctrl+G'))).toBeNull();
    expect(kb.bindings().find((b) => b.id === 'a')!.isCustom).toBe(true);
  });

  it('setBinding rejects an invalid combo without mutating', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    const res = kb.setBinding('a', 'Ctrl+');
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
    expect(kb.tryMatch(key('Ctrl+G'))?.id).toBe('a');
    expect(kb.hasCustomizations()).toBe(false);
  });

  it('setBinding equal to the default clears the override', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    kb.setBinding('a', 'Ctrl+G');
    expect(kb.hasCustomizations()).toBe(false);
    expect(kb.bindings().find((b) => b.id === 'a')!.isCustom).toBe(false);
  });

  it('unbind removes the shortcut (tryMatch null) and marks it custom/unbound', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    kb.unbind('a');
    expect(kb.tryMatch(key('Ctrl+G'))).toBeNull();
    const v = kb.bindings().find((b) => b.id === 'a')!;
    expect(v.isUnbound).toBe(true);
    expect(v.isCustom).toBe(true);
    expect(v.combo).toBeNull();
  });

  it('resetBinding restores the registered default', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    kb.setBinding('a', 'Ctrl+Shift+K');
    kb.resetBinding('a');
    expect(kb.tryMatch(key('Ctrl+G'))?.id).toBe('a');
    expect(kb.hasCustomizations()).toBe(false);
  });

  it('resetAll clears every override', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    reg.register({ id: 'b', combo: 'Ctrl+J', run: () => undefined });
    kb.setBinding('a', 'Ctrl+Shift+K');
    kb.unbind('b');
    expect(kb.hasCustomizations()).toBe(true);
    kb.resetAll();
    expect(kb.hasCustomizations()).toBe(false);
    expect(kb.tryMatch(key('Ctrl+G'))?.id).toBe('a');
    expect(kb.tryMatch(key('Ctrl+J'))?.id).toBe('b');
  });

  it('flags a conflict when two commands share an effective combo', () => {
    reg.register({ id: 'a', combo: 'Ctrl+G', description: 'A', run: () => undefined });
    reg.register({ id: 'b', combo: 'Ctrl+J', description: 'B', run: () => undefined });
    expect(kb.bindings().every((v) => !v.conflict)).toBe(true);
    kb.setBinding('b', 'Ctrl+G');
    const views = kb.bindings();
    expect(views.find((v) => v.id === 'a')!.conflict).toBe(true);
    expect(views.find((v) => v.id === 'b')!.conflict).toBe(true);
    expect(kb.conflictIdsFor('Ctrl+G', 'b')).toContain('a');
  });

  it('respects when() guards in tryMatch', () => {
    const gate = signal(false);
    reg.register({ id: 'a', combo: 'Ctrl+G', when: gate, run: () => undefined });
    expect(kb.tryMatch(key('Ctrl+G'))).toBeNull();
    gate.set(true);
    expect(kb.tryMatch(key('Ctrl+G'))?.id).toBe('a');
  });

  it('surfaces category / description / defaultCombo in the bindings view', () => {
    reg.register({
      id: 'a',
      combo: 'Ctrl+G',
      description: 'Group selection',
      category: 'Object',
      run: () => undefined,
    });
    const v = kb.bindings().find((b) => b.id === 'a')!;
    expect(v.description).toBe('Group selection');
    expect(v.category).toBe('Object');
    expect(v.defaultCombo).toBe('Ctrl+G');
    expect(v.combo).toBe('Ctrl+G');
  });
});

describe('KeybindingsService — persistence', () => {
  beforeEach(() => clearStorage());
  afterEach(() => clearStorage());

  it('writes overrides to localStorage', () => {
    TestBed.configureTestingModule({});
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    const kb = TestBed.inject(KeybindingsService);
    kb.setBinding('a', 'Ctrl+Shift+K');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ a: 'Ctrl+Shift+K' });
  });

  it('loads overrides written before construction', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 'Ctrl+Shift+K' }));
    TestBed.configureTestingModule({});
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    const kb = TestBed.inject(KeybindingsService);
    expect(kb.tryMatch(key('Ctrl+Shift+K'))?.id).toBe('a');
    expect(kb.tryMatch(key('Ctrl+G'))).toBeNull();
    expect(kb.hasCustomizations()).toBe(true);
  });

  it('ignores corrupt localStorage payloads', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    TestBed.configureTestingModule({});
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register({ id: 'a', combo: 'Ctrl+G', run: () => undefined });
    const kb = TestBed.inject(KeybindingsService);
    expect(kb.hasCustomizations()).toBe(false);
    expect(kb.tryMatch(key('Ctrl+G'))?.id).toBe('a');
  });
});
