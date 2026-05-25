import { TestBed } from '@angular/core/testing';
import { createGroup, createPath, createRect, type SvgDocument } from 'svg-engine/core';
import {
  dropDefaultsOptimizer,
  OptimizerRegistry,
  precisionOptimizer,
  pruneEmptyGroupsOptimizer,
  stripAuthoredTitlesOptimizer,
} from 'svg-engine/optimize';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { builtinOptimizersPlugin } from './builtin-optimizers.plugin';

function doc(children: ReturnType<typeof createRect>[]): SvgDocument {
  return {
    id: 'd' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
  };
}

describe('OptimizerRegistry — basics', () => {
  it('register adds; get/Disposable work; pipeline starts empty', () => {
    const reg = TestBed.inject(OptimizerRegistry);
    const d = reg.register(precisionOptimizer);
    expect(reg.get(precisionOptimizer.id)?.id).toBe(precisionOptimizer.id);
    d.dispose();
    expect(reg.get(precisionOptimizer.id)).toBeNull();
  });

  it('throws on empty id and duplicate id', () => {
    const reg = TestBed.inject(OptimizerRegistry);
    expect(() => reg.register({ ...precisionOptimizer, id: '' })).toThrowError(/non-empty/);
    reg.register(precisionOptimizer);
    expect(() => reg.register(precisionOptimizer)).toThrowError(/already registered/);
  });

  it('runPipeline returns same document when no optimizers registered', () => {
    const reg = TestBed.inject(OptimizerRegistry);
    const d = doc([createRect({ x: 0, y: 0, width: 5, height: 5 })]);
    expect(reg.runPipeline(d)).toBe(d);
  });

  it('runPipeline applies optimizers in `order` ascending', () => {
    const reg = TestBed.inject(OptimizerRegistry);
    const calls: string[] = [];
    reg.register({
      id: 'b',
      name: 'B',
      order: 100,
      optimize: (d) => {
        calls.push('b');
        return d;
      },
    });
    reg.register({
      id: 'a',
      name: 'A',
      order: 10,
      optimize: (d) => {
        calls.push('a');
        return d;
      },
    });
    reg.register({
      id: 'c',
      name: 'C',
      order: 200,
      optimize: (d) => {
        calls.push('c');
        return d;
      },
    });
    reg.runPipeline(doc([]));
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('runPipeline respects enabledIds (only listed optimizers run)', () => {
    const reg = TestBed.inject(OptimizerRegistry);
    const calls: string[] = [];
    reg.register({ id: 'a', name: 'A', optimize: (d) => (calls.push('a'), d) });
    reg.register({ id: 'b', name: 'B', optimize: (d) => (calls.push('b'), d) });
    reg.runPipeline(doc([]), new Set(['b']));
    expect(calls).toEqual(['b']);
  });

  it('runPipeline skips optimizers with defaultEnabled:false when no explicit set', () => {
    const reg = TestBed.inject(OptimizerRegistry);
    const calls: string[] = [];
    reg.register({ id: 'a', name: 'A', optimize: (d) => (calls.push('a'), d) });
    reg.register({
      id: 'b',
      name: 'B',
      defaultEnabled: false,
      optimize: (d) => (calls.push('b'), d),
    });
    reg.runPipeline(doc([]));
    expect(calls).toEqual(['a']);
  });
});

describe('precisionOptimizer', () => {
  it('rounds rect x/y/w/h to 3 decimals', () => {
    const r = createRect({
      x: 1.23456789,
      y: 2.000000001,
      width: 10.1,
      height: 20.99999999,
    });
    const optimized = precisionOptimizer.optimize(doc([r]));
    const opt = optimized.root.children[0] as typeof r;
    expect(opt.x).toBe(1.235);
    expect(opt.y).toBe(2);
    expect(opt.width).toBe(10.1);
    expect(opt.height).toBe(21);
  });

  it('rounds numeric tokens inside path `d`', () => {
    const p = createPath('M 1.23456789 2.5 L 10.0000001 20.99999');
    const optimized = precisionOptimizer.optimize(
      doc([p as unknown as ReturnType<typeof createRect>]),
    );
    const opt = optimized.root.children[0] as ReturnType<typeof createPath>;
    expect(opt.d).toBe('M 1.235 2.5 L 10 21');
  });

  it('rounds style numeric fields (strokeWidth, opacity, ...)', () => {
    const r = createRect(
      { x: 0, y: 0, width: 1, height: 1 },
      { style: { strokeWidth: 1.999999, opacity: 0.3333333, fillOpacity: 0.6666666 } },
    );
    const optimized = precisionOptimizer.optimize(doc([r]));
    const opt = optimized.root.children[0] as typeof r;
    expect(opt.style.strokeWidth).toBe(2);
    expect(opt.style.opacity).toBe(0.333);
    expect(opt.style.fillOpacity).toBe(0.667);
  });

  it('produces structurally-equal output when nothing needs rounding', () => {
    // The optimizer always returns a fresh node object (immutable spread),
    // so reference equality doesn't hold even on no-op inputs. Verify
    // structural equality instead — pipeline-level ref-equality dedup
    // happens at the OptimizerRegistry.runPipeline level via the
    // "if (next !== current)" check (covered in registry tests).
    const r = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const d = doc([r]);
    const out = precisionOptimizer.optimize(d);
    expect(out.root.children[0]).toEqual(d.root.children[0]);
  });
});

describe('dropDefaultsOptimizer', () => {
  it('strips fillOpacity=1, strokeOpacity=1, opacity=1, visibility=visible', () => {
    const r = createRect(
      { x: 0, y: 0, width: 5, height: 5 },
      {
        style: {
          fill: '#ff0000',
          fillOpacity: 1,
          strokeOpacity: 1,
          opacity: 1,
          visibility: 'visible',
        },
      },
    );
    const optimized = dropDefaultsOptimizer.optimize(doc([r]));
    const opt = optimized.root.children[0] as typeof r;
    expect(opt.style.fill).toBe('#ff0000'); // kept
    expect(opt.style.fillOpacity).toBeUndefined();
    expect(opt.style.strokeOpacity).toBeUndefined();
    expect(opt.style.opacity).toBeUndefined();
    expect(opt.style.visibility).toBeUndefined();
  });

  it('does NOT strip non-default values', () => {
    const r = createRect(
      { x: 0, y: 0, width: 5, height: 5 },
      { style: { fillOpacity: 0.5, opacity: 0.99 } },
    );
    const opt = dropDefaultsOptimizer.optimize(doc([r])).root.children[0] as typeof r;
    expect(opt.style.fillOpacity).toBe(0.5);
    expect(opt.style.opacity).toBe(0.99);
  });

  it('returns same document reference when nothing to drop', () => {
    const r = createRect({ x: 0, y: 0, width: 5, height: 5 }, { style: { fill: '#ff0000' } });
    const d = doc([r]);
    expect(dropDefaultsOptimizer.optimize(d)).toBe(d);
  });
});

describe('pruneEmptyGroupsOptimizer', () => {
  it('removes a top-level empty <g>', () => {
    const empty = createGroup([]);
    const r = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const optimized = pruneEmptyGroupsOptimizer.optimize(
      doc([empty as unknown as ReturnType<typeof createRect>, r]),
    );
    expect(optimized.root.children.length).toBe(1);
    expect(optimized.root.children[0]?.type).toBe('rect');
  });

  it('recursively prunes nested empty groups', () => {
    const deepEmpty = createGroup([createGroup([createGroup([])])]);
    const optimized = pruneEmptyGroupsOptimizer.optimize(
      doc([deepEmpty as unknown as ReturnType<typeof createRect>]),
    );
    // Whole chain pruned: outer group becomes empty after inner pruning → also dropped
    expect(optimized.root.children.length).toBe(0);
  });

  it('preserves non-empty groups untouched', () => {
    const grp = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    const d = doc([grp as unknown as ReturnType<typeof createRect>]);
    expect(pruneEmptyGroupsOptimizer.optimize(d)).toBe(d);
  });

  it('document root is never pruned (always preserved)', () => {
    const d = doc([]);
    const optimized = pruneEmptyGroupsOptimizer.optimize(d);
    expect(optimized.root).toBeDefined();
    expect(optimized.root.type).toBe('group');
  });
});

describe('builtinOptimizersPlugin — full pipeline via PluginRegistry', () => {
  it('install registers all 4 + uninstall removes them', () => {
    const opt = TestBed.inject(OptimizerRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    pluginReg.install(builtinOptimizersPlugin);
    // 3 default-enabled (precision/drop-defaults/prune) + 1 opt-in
    // D-072-follow-up pass (strip authored titles).
    expect(opt.optimizers().length).toBe(4);
    pluginReg.uninstall(builtinOptimizersPlugin.id);
    expect(opt.optimizers().length).toBe(0);
  });

  it('runPipeline with builtin plugin: precision → drop-defaults → prune (default-enabled only)', () => {
    const opt = TestBed.inject(OptimizerRegistry);
    TestBed.inject(PluginRegistry).install(builtinOptimizersPlugin);
    const r = createRect({ x: 1.000001, y: 0, width: 5, height: 5 }, { style: { fillOpacity: 1 } });
    const emptyG = createGroup([]);
    const d = doc([r, emptyG as unknown as ReturnType<typeof createRect>]);
    const result = opt.runPipeline(d);
    // precision: 1.000001 → 1
    expect((result.root.children[0] as typeof r).x).toBe(1);
    // drop-defaults: fillOpacity:1 removed
    expect((result.root.children[0] as typeof r).style.fillOpacity).toBeUndefined();
    // prune-empty-groups: empty <g> removed
    expect(result.root.children.length).toBe(1);
    // strip-authored-titles is opt-in (defaultEnabled: false) — runPipeline
    // without explicit enabledIds does NOT toggle exportPreferences.
    expect(result.exportPreferences?.emitAuthoredTitles).toBeUndefined();
  });
});

describe('D-072 follow-up — stripAuthoredTitlesOptimizer', () => {
  it('sets emitAuthoredTitles=false on the document', () => {
    const d = doc([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    expect(d.exportPreferences).toBeUndefined();
    const out = stripAuthoredTitlesOptimizer.optimize(d);
    expect(out.exportPreferences?.emitAuthoredTitles).toBe(false);
  });

  it('is idempotent (returns same ref on second pass)', () => {
    const d: SvgDocument = {
      ...doc([createRect({ x: 0, y: 0, width: 1, height: 1 })]),
      exportPreferences: { emitAuthoredTitles: false },
    };
    expect(stripAuthoredTitlesOptimizer.optimize(d)).toBe(d);
  });

  it('has defaultEnabled: false (opt-in)', () => {
    expect(stripAuthoredTitlesOptimizer.defaultEnabled).toBe(false);
  });

  it('does NOT touch metadata.name (only the export preference)', () => {
    const r = createRect({ x: 0, y: 0, width: 1, height: 1 }, { metadata: { name: 'Bercos' } });
    const d = doc([r]);
    const out = stripAuthoredTitlesOptimizer.optimize(d);
    expect(out.root.children[0]?.metadata.name).toBe('Bercos');
  });
});
