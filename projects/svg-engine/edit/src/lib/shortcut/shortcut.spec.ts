import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  canonicalCombo,
  comboFromEvent,
  comboMatches,
  formatCombo,
  parseCombo,
  validateCombo,
} from './shortcut';
import { ShortcutRegistry } from './shortcut-registry.service';
import { ShortcutService } from './shortcut.service';

function ke(key: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...mods });
}

describe('parseCombo', () => {
  it('parses bare key (letter)', () => {
    const p = parseCombo('g');
    expect(p).toMatchObject({ ctrl: false, shift: false, alt: false, meta: false, key: 'g' });
  });

  it('parses Ctrl+letter', () => {
    const p = parseCombo('Ctrl+G');
    expect(p).toMatchObject({ ctrl: true, shift: false, alt: false, meta: false, key: 'g' });
  });

  it('parses Ctrl+Shift+letter', () => {
    const p = parseCombo('Ctrl+Shift+G');
    expect(p).toMatchObject({ ctrl: true, shift: true, alt: false, meta: false, key: 'g' });
  });

  it('accepts named keys (ArrowUp, Escape, F5)', () => {
    expect(parseCombo('ArrowUp').key).toBe('arrowup');
    expect(parseCombo('Escape').key).toBe('escape');
    expect(parseCombo('Alt+F5')).toMatchObject({ alt: true, key: 'f5' });
  });

  it('aliases: Control→Ctrl, Option→Alt, Cmd/Meta/Win→meta', () => {
    expect(parseCombo('Control+G').ctrl).toBe(true);
    expect(parseCombo('Option+G').alt).toBe(true);
    expect(parseCombo('Cmd+G').meta).toBe(true);
    expect(parseCombo('Meta+G').meta).toBe(true);
    expect(parseCombo('Win+G').meta).toBe(true);
  });

  it('CmdOrCtrl encodes a special flag (matches either ctrl OR meta)', () => {
    const p = parseCombo('CmdOrCtrl+G') as ReturnType<typeof parseCombo> & {
      __cmdOrCtrl?: true;
    };
    expect(p.__cmdOrCtrl).toBe(true);
    expect(p.key).toBe('g');
  });

  it('throws on empty input', () => {
    expect(() => parseCombo('')).toThrow();
    expect(() => parseCombo('   ')).toThrow();
  });

  it('throws on unknown modifier token', () => {
    expect(() => parseCombo('Hyper+G')).toThrowError(/unknown modifier/);
  });

  it('throws on empty token between +', () => {
    expect(() => parseCombo('Ctrl++G')).toThrowError(/empty token/);
  });
});

describe('comboMatches', () => {
  it('matches exact modifier set', () => {
    const p = parseCombo('Ctrl+G');
    expect(comboMatches(p, ke('g', { ctrlKey: true }))).toBe(true);
    // Different modifiers → no match (exact)
    expect(comboMatches(p, ke('g', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(comboMatches(p, ke('g', {}))).toBe(false);
  });

  it('letter comparison is case-insensitive', () => {
    const p = parseCombo('Ctrl+G');
    expect(comboMatches(p, ke('G', { ctrlKey: true }))).toBe(true);
    expect(comboMatches(p, ke('g', { ctrlKey: true }))).toBe(true);
  });

  it('CmdOrCtrl matches either ctrl OR meta', () => {
    const p = parseCombo('CmdOrCtrl+G');
    expect(comboMatches(p, ke('g', { ctrlKey: true }))).toBe(true);
    expect(comboMatches(p, ke('g', { metaKey: true }))).toBe(true);
    // Neither → no match
    expect(comboMatches(p, ke('g'))).toBe(false);
    // CmdOrCtrl still requires NO shift / NO alt
    expect(comboMatches(p, ke('g', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('matches named keys (Escape, ArrowUp)', () => {
    expect(comboMatches(parseCombo('Escape'), ke('Escape'))).toBe(true);
    expect(comboMatches(parseCombo('Alt+ArrowUp'), ke('ArrowUp', { altKey: true }))).toBe(true);
  });
});

describe('ShortcutRegistry', () => {
  function makeShortcut(id: string, combo: string, runImpl?: () => void) {
    return { id, combo, run: runImpl ?? (() => undefined) };
  }

  it('starts empty', () => {
    expect(TestBed.inject(ShortcutRegistry).shortcuts()).toEqual([]);
  });

  it('register adds the shortcut and exposes via shortcuts() signal', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register(makeShortcut('a', 'Ctrl+A'));
    reg.register(makeShortcut('b', 'Ctrl+B'));
    expect(reg.shortcuts().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('register returns a Disposable that removes the shortcut', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    const d = reg.register(makeShortcut('tmp', 'Ctrl+T'));
    expect(reg.get('tmp')?.id).toBe('tmp');
    d.dispose();
    expect(reg.get('tmp')).toBeNull();
  });

  it('throws on duplicate id', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register(makeShortcut('a', 'Ctrl+A'));
    expect(() => reg.register(makeShortcut('a', 'Ctrl+B'))).toThrowError(/already registered/);
  });

  it('throws on invalid combo syntax at register time', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    expect(() => reg.register(makeShortcut('bad', 'Hyper+G'))).toThrowError(/unknown modifier/);
  });

  it('allows duplicate combo (when guards keep them disjoint)', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register(makeShortcut('esc-marquee', 'Escape'));
    expect(() => reg.register(makeShortcut('esc-rotate', 'Escape'))).not.toThrow();
  });

  it('tryMatch returns the first shortcut whose combo matches AND when is active', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    let firedA = 0;
    let firedB = 0;
    const whenB = signal(false);
    reg.register({ id: 'a', combo: 'Ctrl+G', when: signal(true), run: () => firedA++ });
    reg.register({ id: 'b', combo: 'Ctrl+G', when: whenB, run: () => firedB++ });
    // Only A is active → tryMatch returns A
    const match = reg.tryMatch(ke('g', { ctrlKey: true }));
    expect(match?.id).toBe('a');
    match?.run(ke('g', { ctrlKey: true }));
    expect(firedA).toBe(1);
    // Disable A → B (now active) wins
    (reg.get('a')?.when as ReturnType<typeof signal<boolean>>).set(false);
    whenB.set(true);
    expect(reg.tryMatch(ke('g', { ctrlKey: true }))?.id).toBe('b');
  });

  it('tryMatch returns null when no shortcut matches', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    reg.register(makeShortcut('a', 'Ctrl+G'));
    expect(reg.tryMatch(ke('h', { ctrlKey: true }))).toBeNull();
    expect(reg.tryMatch(ke('g'))).toBeNull(); // no ctrl
  });

  it('tryMatch skips shortcut whose when() is false', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    const gate = signal(false);
    reg.register({ id: 'a', combo: 'Ctrl+G', when: gate, run: () => undefined });
    expect(reg.tryMatch(ke('g', { ctrlKey: true }))).toBeNull();
    gate.set(true);
    expect(reg.tryMatch(ke('g', { ctrlKey: true }))?.id).toBe('a');
  });
});

describe('ShortcutService — global dispatcher', () => {
  it('start() routes document keydown to ShortcutRegistry.tryMatch', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    const svc = TestBed.inject(ShortcutService);
    let fired = 0;
    reg.register({ id: 'a', combo: 'Ctrl+J', run: () => fired++ });
    svc.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));
    expect(fired).toBe(1);
    svc.stop();
  });

  it('stop() removes the listener (no further dispatch)', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    const svc = TestBed.inject(ShortcutService);
    let fired = 0;
    reg.register({ id: 'a', combo: 'Ctrl+K', run: () => fired++ });
    svc.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(fired).toBe(1);
    svc.stop();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(fired).toBe(1); // still 1
  });

  it('does NOT dispatch when target is editable (input/textarea/contenteditable)', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    const svc = TestBed.inject(ShortcutService);
    let fired = 0;
    reg.register({ id: 'a', combo: 'Delete', run: () => fired++ });
    svc.start();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(fired).toBe(0);
    input.remove();
    // Same key with a non-editable target → fires
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(fired).toBe(1);
    svc.stop();
  });

  it('start() is idempotent — calling twice does not double-fire', () => {
    const reg = TestBed.inject(ShortcutRegistry);
    const svc = TestBed.inject(ShortcutService);
    let fired = 0;
    reg.register({ id: 'a', combo: 'Ctrl+L', run: () => fired++ });
    svc.start();
    svc.start(); // second call should be a no-op
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true }));
    expect(fired).toBe(1);
    svc.stop();
  });
});

describe('validateCombo', () => {
  it('returns ok for valid combos', () => {
    expect(validateCombo('Ctrl+G').ok).toBe(true);
    expect(validateCombo('g').ok).toBe(true);
    expect(validateCombo('Alt+ArrowUp').ok).toBe(true);
  });

  it('returns the error message for invalid combos', () => {
    const r = validateCombo('Ctrl+');
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    expect(validateCombo('').ok).toBe(false);
  });
});

describe('formatCombo', () => {
  it('normalizes modifier order + casing', () => {
    expect(formatCombo('ctrl+g')).toBe('Ctrl+G');
    expect(formatCombo('shift+ctrl+z')).toBe('Ctrl+Shift+Z');
  });

  it('maps named keys to friendly labels', () => {
    expect(formatCombo('alt+arrowup')).toBe('Alt+↑');
    expect(formatCombo('Escape')).toBe('Esc');
    expect(formatCombo('Ctrl+F5')).toBe('Ctrl+F5');
  });

  it('returns an empty string for an empty combo', () => {
    expect(formatCombo('')).toBe('');
    expect(formatCombo('   ')).toBe('');
  });
});

describe('comboFromEvent', () => {
  it('builds a parseable combo that round-trips through comboMatches', () => {
    const ev = ke('g', { ctrlKey: true, shiftKey: true });
    const combo = comboFromEvent(ev)!;
    expect(combo).toBe('Ctrl+Shift+g');
    expect(comboMatches(parseCombo(combo), ke('g', { ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it('keeps named keys verbatim', () => {
    expect(comboFromEvent(ke('ArrowUp', { altKey: true }))).toBe('Alt+ArrowUp');
  });

  it('returns null for a lone modifier press', () => {
    expect(comboFromEvent(ke('Control', { ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(ke('Shift', { shiftKey: true }))).toBeNull();
  });
});

describe('canonicalCombo', () => {
  it('is case-insensitive on the key', () => {
    expect(canonicalCombo('Ctrl+Shift+Z')).toBe(canonicalCombo('Ctrl+Shift+z'));
  });

  it('is order-insensitive on the modifiers', () => {
    expect(canonicalCombo('Shift+Ctrl+z')).toBe(canonicalCombo('Ctrl+Shift+z'));
  });

  it('distinguishes genuinely different combos', () => {
    expect(canonicalCombo('Ctrl+G')).not.toBe(canonicalCombo('Ctrl+Shift+G'));
    expect(canonicalCombo('Ctrl+G')).not.toBe(canonicalCombo('Alt+G'));
    expect(canonicalCombo('Ctrl+G')).not.toBe(canonicalCombo('Meta+G'));
  });

  it('falls back to a normalized string for unparseable input', () => {
    // No throw; deterministic key so conflict counting never crashes.
    expect(canonicalCombo('Ctrl+')).toBe(canonicalCombo('ctrl+'));
  });
});
