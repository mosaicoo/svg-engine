import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SvgNode } from '@mosaicoo/svg-engine/core';
import { NodeRendererRegistry } from './node-renderer-registry.service';

@Component({ selector: 'svge-test-fake-star', standalone: true, template: '' })
class FakeStarRenderer {
  readonly node = input.required<SvgNode>();
}

@Component({ selector: 'svge-test-fake-other', standalone: true, template: '' })
class FakeOtherRenderer {
  readonly node = input.required<SvgNode>();
}

describe('NodeRendererRegistry', () => {
  let registry: NodeRendererRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(NodeRendererRegistry);
  });

  it('starts empty', () => {
    expect(registry.registeredTypes()).toEqual([]);
    expect(registry.resolve('star')).toBeNull();
  });

  it('registers and resolves a custom renderer', () => {
    registry.register('star', FakeStarRenderer);
    expect(registry.resolve('star')).toBe(FakeStarRenderer);
    expect(registry.registeredTypes()).toContain('star');
  });

  it('throws on duplicate registration', () => {
    registry.register('star', FakeStarRenderer);
    expect(() => registry.register('star', FakeOtherRenderer)).toThrow(/already registered/);
  });

  it('allows override after unregister', () => {
    registry.register('star', FakeStarRenderer);
    registry.unregister('star');
    expect(() => registry.register('star', FakeOtherRenderer)).not.toThrow();
    expect(registry.resolve('star')).toBe(FakeOtherRenderer);
  });

  it('unregister of unknown type is a no-op', () => {
    expect(() => registry.unregister('nope')).not.toThrow();
    expect(registry.resolve('nope')).toBeNull();
  });
});
