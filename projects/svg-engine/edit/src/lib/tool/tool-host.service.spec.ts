import { TestBed } from '@angular/core/testing';
import type { Tool, ToolPointerEvent } from './tool';
import { ToolHostService } from './tool-host.service';
import { ToolRegistry } from './tool-registry.service';

function setup() {
  TestBed.configureTestingModule({});
  const registry = TestBed.inject(ToolRegistry);
  const host = TestBed.inject(ToolHostService);
  return { registry, host };
}

function makeTool(id: string, hooks: Partial<Tool> = {}): Tool {
  return { id, label: id, ...hooks };
}

function makeEvent(): ToolPointerEvent {
  return {
    raw: new PointerEvent('pointerdown', { pointerId: 1 }),
    docPoint: { x: 0, y: 0 },
    screenX: 0,
    screenY: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

describe('ToolHostService — activate / deactivate', () => {
  it('starts with no active tool', () => {
    const { host } = setup();
    expect(host.activeId()).toBeNull();
    expect(host.activeTool()).toBeNull();
  });

  it('activate sets the active id and fires onActivate', () => {
    const { registry, host } = setup();
    const onActivate = vi.fn();
    registry.register(makeTool('a', { onActivate }));
    host.activate('a');
    expect(host.activeId()).toBe('a');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('switching tools fires onDeactivate then onActivate in order', () => {
    const { registry, host } = setup();
    const order: string[] = [];
    registry.register(
      makeTool('a', {
        onActivate: () => order.push('a:activate'),
        onDeactivate: () => order.push('a:deactivate'),
      }),
    );
    registry.register(
      makeTool('b', {
        onActivate: () => order.push('b:activate'),
        onDeactivate: () => order.push('b:deactivate'),
      }),
    );
    host.activate('a');
    host.activate('b');
    expect(order).toEqual(['a:activate', 'a:deactivate', 'b:activate']);
  });

  it('activate is no-op when the tool is already active', () => {
    const { registry, host } = setup();
    const onActivate = vi.fn();
    registry.register(makeTool('a', { onActivate }));
    host.activate('a');
    host.activate('a');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('throws when activating an unregistered id', () => {
    const { host } = setup();
    expect(() => host.activate('missing')).toThrow(/no tool registered/);
  });

  it('deactivate fires onDeactivate and clears activeId', () => {
    const { registry, host } = setup();
    const onDeactivate = vi.fn();
    registry.register(makeTool('a', { onDeactivate }));
    host.activate('a');
    host.deactivate();
    expect(host.activeId()).toBeNull();
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('deactivate is a no-op when nothing is active', () => {
    const { host } = setup();
    expect(() => host.deactivate()).not.toThrow();
  });

  it('activeTool becomes null when the active tool is uninstalled mid-session', () => {
    const { registry, host } = setup();
    const d = registry.register(makeTool('a'));
    host.activate('a');
    expect(host.activeTool()?.id).toBe('a');
    d.dispose();
    expect(host.activeTool()).toBeNull();
  });
});

describe('ToolHostService — routing', () => {
  it('routePointerDown forwards to the active tool', () => {
    const { registry, host } = setup();
    const onPointerDown = vi.fn();
    registry.register(makeTool('a', { onPointerDown }));
    host.activate('a');
    host.routePointerDown(makeEvent());
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('routePointerMove / Up / Cancel forward similarly', () => {
    const { registry, host } = setup();
    const onPointerMove = vi.fn();
    const onPointerUp = vi.fn();
    const onPointerCancel = vi.fn();
    registry.register(makeTool('a', { onPointerMove, onPointerUp, onPointerCancel }));
    host.activate('a');
    host.routePointerMove(makeEvent());
    host.routePointerUp(makeEvent());
    host.routePointerCancel(makeEvent());
    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onPointerUp).toHaveBeenCalledTimes(1);
    expect(onPointerCancel).toHaveBeenCalledTimes(1);
  });

  it('routeKeyDown forwards a real KeyboardEvent', () => {
    const { registry, host } = setup();
    const onKeyDown = vi.fn();
    registry.register(makeTool('a', { onKeyDown }));
    host.activate('a');
    host.routeKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' }),
      expect.objectContaining({ injector: expect.anything() }),
    );
  });

  it('routing is a no-op when no tool is active', () => {
    const { host } = setup();
    expect(() => host.routePointerDown(makeEvent())).not.toThrow();
  });

  it('routing is a no-op when active tool lacks the hook', () => {
    const { registry, host } = setup();
    registry.register(makeTool('a')); // no hooks
    host.activate('a');
    expect(() => host.routePointerDown(makeEvent())).not.toThrow();
  });

  it('routing is a no-op when active tool was uninstalled', () => {
    const { registry, host } = setup();
    const onPointerDown = vi.fn();
    const d = registry.register(makeTool('a', { onPointerDown }));
    host.activate('a');
    d.dispose();
    host.routePointerDown(makeEvent());
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});
