import { TestBed } from '@angular/core/testing';
import type { Tool } from './tool';
import { ToolRegistry } from './tool-registry.service';

function setup() {
  TestBed.configureTestingModule({});
  return TestBed.inject(ToolRegistry);
}

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return { id: 'test.tool', label: 'Test', ...overrides };
}

describe('ToolRegistry', () => {
  it('starts empty', () => {
    const reg = setup();
    expect(reg.tools()).toEqual([]);
  });

  it('register adds the tool and returns a Disposable', () => {
    const reg = setup();
    const t = makeTool({ id: 'a' });
    const d = reg.register(t);
    expect(reg.tools()).toEqual([t]);
    expect(typeof d.dispose).toBe('function');
  });

  it('dispose() removes the tool reactively', () => {
    const reg = setup();
    const d = reg.register(makeTool({ id: 'a' }));
    expect(reg.tools().length).toBe(1);
    d.dispose();
    expect(reg.tools()).toEqual([]);
  });

  it('throws on empty id', () => {
    const reg = setup();
    expect(() => reg.register(makeTool({ id: '' }))).toThrow();
  });

  it('throws on duplicate id', () => {
    const reg = setup();
    reg.register(makeTool({ id: 'a' }));
    expect(() => reg.register(makeTool({ id: 'a' }))).toThrow(/already registered/);
  });

  it('get returns the tool by id, or null', () => {
    const reg = setup();
    const t = makeTool({ id: 'x' });
    reg.register(t);
    expect(reg.get('x')).toBe(t);
    expect(reg.get('missing')).toBeNull();
  });

  it('getByShortcut returns the matching tool', () => {
    const reg = setup();
    const v = makeTool({ id: 'sel', shortcut: 'v' });
    const p = makeTool({ id: 'pen', shortcut: 'p' });
    reg.register(v);
    reg.register(p);
    expect(reg.getByShortcut('v')).toBe(v);
    expect(reg.getByShortcut('p')).toBe(p);
    expect(reg.getByShortcut('x')).toBeNull();
  });

  it('preserves insertion order', () => {
    const reg = setup();
    reg.register(makeTool({ id: 'a' }));
    reg.register(makeTool({ id: 'b' }));
    reg.register(makeTool({ id: 'c' }));
    expect(reg.tools().map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
