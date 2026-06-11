import { describe, expect, it } from 'vitest';
import { type EditorPlugin, PLUGIN_API_VERSION, withPluginMeta } from './plugin';

function base(): EditorPlugin {
  return {
    id: 'x',
    name: 'X',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    install: () => undefined,
  };
}

describe('withPluginMeta', () => {
  it('returns a copy with metadata attached, preserving id/version/install', () => {
    const original = base();
    const out = withPluginMeta(original, {
      description: 'd',
      author: 'A',
      icon: 'i',
      category: 'tool',
    });
    expect(out).not.toBe(original);
    expect(out.id).toBe('x');
    expect(out.version).toBe('1.0.0');
    expect(out.install).toBe(original.install); // same function reference
    expect(out.description).toBe('d');
    expect(out.author).toBe('A');
    expect(out.icon).toBe('i');
    expect(out.category).toBe('tool');
  });

  it('does not mutate the original plugin', () => {
    const original = base();
    withPluginMeta(original, { category: 'io' });
    expect(original.category).toBeUndefined();
    expect(original.description).toBeUndefined();
  });

  it('accepts a partial metadata object', () => {
    const out = withPluginMeta(base(), { icon: 'star' });
    expect(out.icon).toBe('star');
    expect(out.category).toBeUndefined();
  });
});
