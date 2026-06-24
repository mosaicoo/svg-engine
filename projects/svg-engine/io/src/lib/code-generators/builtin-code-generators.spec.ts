import { describe, expect, it } from 'vitest';
import { createGroup, createRect, type SvgDocument, type SvgNode } from 'svg-engine/core';
import {
  applyCurrentColor,
  BUILTIN_CODE_GENERATORS,
  dataUriGenerator,
  reactComponentGenerator,
  reactJsxGenerator,
  svgStringToJsx,
  svgToDataUri,
  toPascalCaseComponentName,
} from './builtin-code-generators';
import { CodeGeneratorRegistry } from './code-generator-registry.service';
import { type CodeGenerator, resolveCodeGeneratorOptionDefaults } from './code-generator-types';

/**
 * **D-110** — coverage for the Group-A code generators (pure transforms)
 * and the registry. Asserts the JSX rewrite (attribute camelCasing + style
 * string → object), the currentColor swap, the React component scaffolding,
 * the Data URI encodings, and the registry contract.
 */

function docOf(children: readonly SvgNode[]): SvgDocument {
  return {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
  };
}

describe('reactJsxGenerator', () => {
  it('strips the <?xml?> prolog', () => {
    const out = reactJsxGenerator.generate(
      docOf([createRect({ x: 0, y: 0, width: 10, height: 10 })]),
    );
    expect(out).not.toContain('<?xml');
    expect(out.trimStart().startsWith('<svg')).toBe(true);
  });

  it('camelCases kebab-case presentation attributes', () => {
    const out = reactJsxGenerator.generate(
      docOf([createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { strokeWidth: 2 } })]),
    );
    expect(out).toContain('strokeWidth="2"');
    expect(out).not.toContain('stroke-width=');
  });

  it('converts a style="..." attribute into a JSX object literal', () => {
    const out = reactJsxGenerator.generate(
      docOf([
        createRect({ x: 0, y: 0, width: 10, height: 10 }, { style: { mixBlendMode: 'multiply' } }),
      ]),
    );
    expect(out).toContain('style={{ mixBlendMode: "multiply" }}');
    expect(out).not.toContain('style="mix-blend-mode');
  });

  it('applies currentColor only when the option is set, leaving none/url() refs', () => {
    const doc = docOf([
      createRect(
        { x: 0, y: 0, width: 10, height: 10 },
        { style: { fill: '#ff0000', stroke: 'none' } },
      ),
    ]);
    const plain = reactJsxGenerator.generate(doc);
    expect(plain).toContain('fill="#ff0000"');

    const swapped = reactJsxGenerator.generate(doc, { currentColor: true });
    expect(swapped).toContain('fill="currentColor"');
    expect(swapped).toContain('stroke="none"');
  });
});

describe('applyCurrentColor', () => {
  it('leaves url() paint-server references intact', () => {
    const svg = '<rect fill="url(#grad)" stroke="#000" />';
    const out = applyCurrentColor(svg);
    expect(out).toContain('fill="url(#grad)"');
    expect(out).toContain('stroke="currentColor"');
  });
});

describe('svgStringToJsx', () => {
  it('renames class → className and namespaced xlink:href → xlinkHref', () => {
    const out = svgStringToJsx('<use class="ico" xlink:href="#a" />');
    expect(out).toContain('className="ico"');
    expect(out).toContain('xlinkHref="#a"');
  });

  it('keeps data-* and aria-* attributes hyphenated', () => {
    const out = svgStringToJsx('<rect data-foo="1" aria-label="x" />');
    expect(out).toContain('data-foo="1"');
    expect(out).toContain('aria-label="x"');
  });
});

describe('reactComponentGenerator', () => {
  const doc = docOf([createRect({ x: 0, y: 0, width: 10, height: 10 })]);

  it('emits a TS default-export component that spreads props', () => {
    const out = reactComponentGenerator.generate(doc, {
      componentName: 'MyIcon',
      typescript: true,
    });
    expect(out).toContain("import type { SVGProps } from 'react';");
    expect(out).toContain('export default function MyIcon(props: SVGProps<SVGSVGElement>)');
    expect(out).toContain('{...props}');
    expect(out).toContain('return (');
  });

  it('emits a named export when requested', () => {
    const out = reactComponentGenerator.generate(doc, {
      componentName: 'MyIcon',
      namedExport: true,
    });
    expect(out).toContain('export function MyIcon(');
    expect(out).not.toContain('export default');
  });

  it('drops the TS type import for JavaScript output', () => {
    const out = reactComponentGenerator.generate(doc, {
      componentName: 'MyIcon',
      typescript: false,
    });
    expect(out).not.toContain('SVGProps');
    expect(out).toContain('export default function MyIcon(props) {');
  });

  it('PascalCases an arbitrary component name', () => {
    const out = reactComponentGenerator.generate(doc, { componentName: 'my cool-icon' });
    expect(out).toContain('function MyCoolIcon(');
  });
});

describe('toPascalCaseComponentName', () => {
  it('falls back to Icon for empty/symbol-only names', () => {
    expect(toPascalCaseComponentName('   ')).toBe('Icon');
    expect(toPascalCaseComponentName('***')).toBe('Icon');
  });
  it('prefixes Icon when the result would start with a digit', () => {
    expect(toPascalCaseComponentName('123 star')).toBe('Icon123Star');
  });
});

describe('dataUriGenerator', () => {
  const doc = docOf([createRect({ x: 0, y: 0, width: 10, height: 10 })]);

  it('produces a URL-encoded data URI by default', () => {
    const out = dataUriGenerator.generate(doc);
    expect(out.startsWith('data:image/svg+xml,')).toBe(true);
    expect(out).not.toContain('<?xml');
    // encodeURIComponent encodes the angle brackets.
    expect(out).toContain('%3Csvg');
  });

  it('produces a base64 data URI when requested', () => {
    const out = dataUriGenerator.generate(doc, { encoding: 'base64' });
    expect(out.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('round-trips base64 back to the SVG body (UTF-8 safe)', () => {
    const svg = '<svg>★</svg>';
    const uri = svgToDataUri(svg, 'base64');
    const b64 = uri.replace('data:image/svg+xml;base64,', '');
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    expect(decoded).toBe(svg);
  });
});

describe('CodeGeneratorRegistry', () => {
  it('registers, looks up, and disposes generators', () => {
    const reg = new CodeGeneratorRegistry();
    const gen: CodeGenerator = {
      id: 'test.gen',
      name: 'Test',
      language: 'text',
      extension: 'txt',
      generate: () => 'x',
    };
    const handle = reg.register(gen);
    expect(reg.get('test.gen')).toBe(gen);
    expect(reg.generators().length).toBe(1);
    handle.dispose();
    expect(reg.get('test.gen')).toBeNull();
    expect(reg.generators().length).toBe(0);
  });

  it('throws on duplicate id and empty id', () => {
    const reg = new CodeGeneratorRegistry();
    reg.register({ id: 'dup', name: 'A', language: 'text', extension: 'txt', generate: () => '' });
    expect(() =>
      reg.register({
        id: 'dup',
        name: 'B',
        language: 'text',
        extension: 'txt',
        generate: () => '',
      }),
    ).toThrow(/already registered/);
    expect(() =>
      reg.register({ id: '', name: 'C', language: 'text', extension: 'txt', generate: () => '' }),
    ).toThrow(/non-empty/);
  });
});

describe('resolveCodeGeneratorOptionDefaults', () => {
  it('builds the default option map from the generator specs', () => {
    const defaults = resolveCodeGeneratorOptionDefaults(reactComponentGenerator);
    expect(defaults['componentName']).toBe('Icon');
    expect(defaults['typescript']).toBe(true);
    expect(defaults['namedExport']).toBe(false);
  });

  it('exposes the three Group-A builtins in order', () => {
    expect(BUILTIN_CODE_GENERATORS.map((g) => g.id)).toEqual([
      reactJsxGenerator.id,
      reactComponentGenerator.id,
      dataUriGenerator.id,
    ]);
  });
});
