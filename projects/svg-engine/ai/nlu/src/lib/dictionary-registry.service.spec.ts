import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NluDictionaryRegistry } from './dictionary-registry.service';

describe('NluDictionaryRegistry (D-046 review-10 / H5)', () => {
  function setup(): NluDictionaryRegistry {
    TestBed.configureTestingModule({});
    return TestBed.inject(NluDictionaryRegistry);
  }

  it('registra cor customizada e resolve', () => {
    const r = setup();
    r.registerColor('vibrant-blue', '#1e90ff');
    expect(r.resolveColor('vibrant-blue')).toBe('#1e90ff');
  });

  it('registra shape customizada (alias semântico)', () => {
    const r = setup();
    r.registerShape('actor', 'circle');
    expect(r.resolveShape('actor')).toBe('circle');
  });

  it('registra action canonical customizada', () => {
    const r = setup();
    r.registerAction('compor', 'create');
    expect(r.resolveAction('compor')).toBe('create');
  });

  it('Disposable remove a entrada quando disposed', () => {
    const r = setup();
    const d = r.registerColor('temp', '#abcdef');
    expect(r.resolveColor('temp')).toBe('#abcdef');
    d.dispose();
    expect(r.resolveColor('temp')).toBeNull();
  });

  it('override silencioso quando registra mesma chave 2×', () => {
    const r = setup();
    r.registerColor('mycolor', '#111111');
    r.registerColor('mycolor', '#222222');
    expect(r.resolveColor('mycolor')).toBe('#222222');
  });

  it('signal colors() é reativo', () => {
    const r = setup();
    expect(r.colors().size).toBe(0);
    r.registerColor('a', '#111');
    expect(r.colors().size).toBe(1);
    r.registerColor('b', '#222');
    expect(r.colors().size).toBe(2);
  });

  it('throws em key vazia', () => {
    const r = setup();
    expect(() => r.registerColor('', '#000')).toThrow(/non-empty/);
  });
});
