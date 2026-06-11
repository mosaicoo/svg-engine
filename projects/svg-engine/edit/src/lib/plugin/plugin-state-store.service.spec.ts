import { TestBed } from '@angular/core/testing';
import { PluginStateStore } from './plugin-state-store.service';

const STORAGE_KEY = 'svge:plugins:state';

function freshStore(): PluginStateStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(PluginStateStore);
}

describe('PluginStateStore', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  it('starts with nothing disabled', () => {
    const store = freshStore();
    expect(store.isDisabled('a')).toBe(false);
    expect(store.disabledIds()).toEqual([]);
    expect(store.disabled().size).toBe(0);
  });

  it('setDisabled(true) marks a plugin disabled (signal + query)', () => {
    const store = freshStore();
    store.setDisabled('com.acme.foo', true);
    expect(store.isDisabled('com.acme.foo')).toBe(true);
    expect(store.disabledIds()).toEqual(['com.acme.foo']);
    expect(store.disabled().has('com.acme.foo')).toBe(true);
  });

  it('setDisabled(false) re-enables', () => {
    const store = freshStore();
    store.setDisabled('x', true);
    store.setDisabled('x', false);
    expect(store.isDisabled('x')).toBe(false);
    expect(store.disabledIds()).toEqual([]);
  });

  it('is idempotent (double-disable / double-enable are no-ops)', () => {
    const store = freshStore();
    store.setDisabled('x', true);
    store.setDisabled('x', true);
    expect(store.disabledIds()).toEqual(['x']);
    store.setDisabled('x', false);
    store.setDisabled('x', false);
    expect(store.disabledIds()).toEqual([]);
  });

  it('forget removes a plugin from the disabled set', () => {
    const store = freshStore();
    store.setDisabled('x', true);
    store.forget('x');
    expect(store.isDisabled('x')).toBe(false);
    store.forget('never-there'); // no-op, no throw
    expect(store.disabledIds()).toEqual([]);
  });

  it('persists across instances (write then hydrate a fresh store)', () => {
    const store = freshStore();
    store.setDisabled('com.acme.a', true);
    store.setDisabled('com.acme.b', true);
    // A brand-new store (fresh root injector) hydrates from localStorage.
    const reloaded = freshStore();
    expect(reloaded.isDisabled('com.acme.a')).toBe(true);
    expect(reloaded.isDisabled('com.acme.b')).toBe(true);
    expect([...reloaded.disabledIds()].sort()).toEqual(['com.acme.a', 'com.acme.b']);
  });

  it('ignores malformed JSON in storage (degrades to empty, no throw)', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    const store = freshStore();
    expect(store.disabledIds()).toEqual([]);
  });

  it('ignores an unknown schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 999, disabled: ['x'] }));
    const store = freshStore();
    expect(store.isDisabled('x')).toBe(false);
  });
});
