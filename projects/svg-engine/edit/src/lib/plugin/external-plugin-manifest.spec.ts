import { describe, expect, it } from 'vitest';
import {
  type ExternalPluginManifest,
  validateExternalPluginManifest,
} from './external-plugin-manifest';

function valid(): ExternalPluginManifest {
  return {
    id: 'com.acme.demo',
    name: 'Acme Demo',
    version: '1.0.0',
    apiVersion: '1.0.0',
    entry: 'https://plugins.acme.com/demo.js',
  };
}

describe('validateExternalPluginManifest', () => {
  it('accepts a minimal valid manifest', () => {
    expect(validateExternalPluginManifest(valid())).toBeNull();
  });

  it('accepts a full manifest with integrity + dependencies + metadata', () => {
    expect(
      validateExternalPluginManifest({
        ...valid(),
        integrity: 'sha384-' + 'A'.repeat(64),
        dependencies: ['com.acme.base'],
        description: 'd',
        author: 'Acme',
        icon: 'star',
        category: 'tool',
      }),
    ).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(validateExternalPluginManifest(null)).toContain('object');
    expect(validateExternalPluginManifest('x')).toContain('object');
    expect(validateExternalPluginManifest(42)).toContain('object');
  });

  it('requires non-empty id/name/version/apiVersion/entry', () => {
    for (const key of ['id', 'name', 'version', 'apiVersion', 'entry'] as const) {
      const m = { ...valid(), [key]: '' };
      expect(validateExternalPluginManifest(m)).toContain(key);
    }
  });

  it('rejects a non-semver apiVersion', () => {
    expect(validateExternalPluginManifest({ ...valid(), apiVersion: 'one' })).toContain('semver');
  });

  it('rejects a non-absolute entry URL', () => {
    expect(validateExternalPluginManifest({ ...valid(), entry: '/relative/path.js' })).toContain(
      'absolute URL',
    );
  });

  it('rejects a malformed integrity string', () => {
    expect(validateExternalPluginManifest({ ...valid(), integrity: 'md5-abc' })).toContain('SRI');
  });

  it('rejects dependencies that are not an array of strings', () => {
    expect(validateExternalPluginManifest({ ...valid(), dependencies: 'x' })).toContain(
      'dependencies',
    );
    expect(validateExternalPluginManifest({ ...valid(), dependencies: [1, 2] })).toContain(
      'dependencies',
    );
  });
});
