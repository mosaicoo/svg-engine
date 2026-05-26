import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { type Tool, ToolRegistry } from 'svg-engine/edit';
import { ToolOptionsRegistry } from './tool-options-registry.service';

/**
 * **TOOL-OPT-A1** specs — covers the registry's basic contract:
 * - register / get / unregister round-trip
 * - last-write-wins for overrides
 * - warning when the tool id is unknown (without throwing)
 * - id snapshot for diagnostics
 */

@Component({ standalone: true, template: `<span class="x"></span>` })
class StubA {}

@Component({ standalone: true, template: `<span class="y"></span>` })
class StubB {}

class StubTool implements Tool {
  readonly id = 'test.tool';
  readonly label = 'Test';
}

function setup() {
  TestBed.configureTestingModule({});
  return {
    registry: TestBed.inject(ToolOptionsRegistry),
    tools: TestBed.inject(ToolRegistry),
  };
}

describe('ToolOptionsRegistry — register / get round-trip', () => {
  it('returns null when no component is registered', () => {
    const { registry } = setup();
    expect(registry.get('unknown')).toBeNull();
  });

  it('returns the registered component', () => {
    const { registry, tools } = setup();
    tools.register(new StubTool());
    registry.register('test.tool', StubA);
    expect(registry.get('test.tool')).toBe(StubA);
  });

  it('last-write-wins on duplicate id (override pattern)', () => {
    const { registry, tools } = setup();
    tools.register(new StubTool());
    registry.register('test.tool', StubA);
    registry.register('test.tool', StubB);
    expect(registry.get('test.tool')).toBe(StubB);
  });

  it('unregister removes the binding', () => {
    const { registry, tools } = setup();
    tools.register(new StubTool());
    registry.register('test.tool', StubA);
    registry.unregister('test.tool');
    expect(registry.get('test.tool')).toBeNull();
  });

  it('unregister is a no-op for unknown ids', () => {
    const { registry } = setup();
    expect(() => registry.unregister('never-registered')).not.toThrow();
  });

  it('ids() lists every registered toolId', () => {
    const { registry, tools } = setup();
    tools.register(new StubTool());
    tools.register({ id: 'b', label: 'B' });
    registry.register('test.tool', StubA);
    registry.register('b', StubB);
    expect([...registry.ids()].sort()).toEqual(['b', 'test.tool']);
  });
});

describe('ToolOptionsRegistry — warns when tool id is unknown', () => {
  it('logs a console.warn but still registers (plugin order tolerance)', () => {
    const { registry } = setup();
    // No Tool registered for this id — soft-warn, don't throw.
    // Silence the console.warn output while still capturing the call.
    // Use a no-op that returns undefined explicitly to satisfy
    // `@typescript-eslint/no-empty-function`.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registry.register('not.a.tool', StubA);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not.a.tool'));
    // But the registration still sticks — lets late-arriving tools work.
    expect(registry.get('not.a.tool')).toBe(StubA);
    warn.mockRestore();
  });
});
