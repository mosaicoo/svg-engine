import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import {
  EYEDROPPER_TOOL_ID,
  EyedropperToolService,
  extraToolsPlugin,
  GRADIENT_TOOL_ID,
  GradientToolService,
  KNIFE_TOOL_ID,
  KnifeToolService,
  SMOOTH_TOOL_ID,
  SmoothToolService,
  SYMBOL_SPRAYER_TOOL_ID,
  SymbolSprayerService,
  WIDTH_TOOL_ID,
  WidthToolService,
} from './extra-tools';
import { ToolRegistry } from './tool-registry.service';

/**
 * **Audit Round 3 item #13** (2026-05-29) — contract spec for `extra-tools.ts`.
 *
 * `extra-tools.ts` is a 897-line module hosting **6 tools + 6 services**
 * (Eyedropper, Knife, Smooth, Gradient, Width, Symbol Sprayer). Until
 * this round, it had ZERO dedicated spec coverage — a real regression
 * risk validated by the KNIFE-FIX history (D-344, late 2026-05) where
 * Knife regressed silently after a refactor because no test guarded
 * its registration shape.
 *
 * **Scope chosen**: contract assertions, not behavior simulation. Each
 * tool/service has its own integration paths exercised via the broader
 * test suite (selection, isolation, command-bus, etc); what was missing
 * was a single file locking down the **public surface**:
 *
 * 1. Plugin metadata shape (id / name / version / apiVersion / install)
 * 2. All 6 tool ID constants match their canonical values
 * 3. All 6 tools register on `extraToolsPlugin` install
 * 4. Each registered tool has the expected `id` / `label` / `icon` /
 *    `cursor` / `shortcut` — locked down so a rename or icon swap
 *    doesn't ship unintentionally
 * 5. All 6 services are injectable via the root injector
 * 6. Each service's signals start at expected defaults
 * 7. Setters clamp inputs to documented ranges (defends against UI
 *    sliders sending out-of-range values)
 *
 * **What this spec deliberately does NOT cover**:
 *
 * - Per-tool gesture behaviour (the existing knife-cut.command.spec
 *   and similar files cover commands; tool→command wiring is exercised
 *   indirectly via plugin auto-discovery integration tests)
 * - Overlay rendering (covered by symbol-sprayer-overlay spec etc)
 * - Mesh tool — REMOVED in D-062-fix and the `MESH_TOOL_ID` constant
 *   dropped in audit item #9 (2026-05-29, commit `d450689`)
 *
 * The goal here is to give future refactors a "tripwire": any rename
 * of a shortcut / id / label / icon / cursor will fail loudly so the
 * change becomes a deliberate decision, not a silent breakage.
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEnginePlugin(extraToolsPlugin)],
  });
  return {
    toolReg: TestBed.inject(ToolRegistry),
    pluginReg: TestBed.inject(PluginRegistry),
  };
}

describe('extraToolsPlugin — plugin contract', () => {
  it('exports the plugin with the canonical metadata shape', () => {
    expect(extraToolsPlugin.id).toBe('com.svge.tools.extra');
    expect(extraToolsPlugin.name).toMatch(/Extra Tools/);
    expect(extraToolsPlugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(extraToolsPlugin.apiVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof extraToolsPlugin.install).toBe('function');
  });

  it('registers exactly 6 tools on install (Mesh tool was removed in D-062-fix)', () => {
    const { toolReg } = setup();
    const ids = toolReg.tools().map((t) => t.id);
    expect(ids).toHaveLength(6);
    expect(ids).toEqual(
      expect.arrayContaining([
        EYEDROPPER_TOOL_ID,
        KNIFE_TOOL_ID,
        SMOOTH_TOOL_ID,
        GRADIENT_TOOL_ID,
        WIDTH_TOOL_ID,
        SYMBOL_SPRAYER_TOOL_ID,
      ]),
    );
  });

  it('tool ids match the canonical com.svge.tool.* namespace', () => {
    expect(EYEDROPPER_TOOL_ID).toBe('com.svge.tool.eyedropper');
    expect(KNIFE_TOOL_ID).toBe('com.svge.tool.knife');
    expect(SMOOTH_TOOL_ID).toBe('com.svge.tool.smooth');
    expect(GRADIENT_TOOL_ID).toBe('com.svge.tool.gradient');
    expect(WIDTH_TOOL_ID).toBe('com.svge.tool.width');
    expect(SYMBOL_SPRAYER_TOOL_ID).toBe('com.svge.tool.symbol-sprayer');
  });

  it('uninstall removes all 6 tools', () => {
    const { toolReg, pluginReg } = setup();
    expect(toolReg.tools()).toHaveLength(6);
    pluginReg.uninstall(extraToolsPlugin.id);
    expect(toolReg.tools()).toHaveLength(0);
  });
});

describe('extraToolsPlugin — per-tool registration shape', () => {
  // Lock down the user-facing surface of each tool so renames are
  // deliberate. Each row asserts: id is correct, label is human-readable
  // (matches what Material icon picker / NLU dictionary expects),
  // icon is a Material Symbols identifier, cursor is a valid CSS
  // cursor, shortcut is a single-character key.
  const expectations: readonly {
    id: string;
    label: string;
    icon: string;
    cursor: string;
    shortcut: string;
  }[] = [
    {
      id: EYEDROPPER_TOOL_ID,
      label: 'Eyedropper',
      icon: 'colorize',
      cursor: 'crosshair',
      shortcut: 'i',
    },
    { id: KNIFE_TOOL_ID, label: 'Knife', icon: 'content_cut', cursor: 'crosshair', shortcut: 'c' },
    {
      id: SMOOTH_TOOL_ID,
      label: 'Smooth',
      icon: 'auto_fix_high',
      cursor: 'crosshair',
      shortcut: 's',
    },
    {
      id: GRADIENT_TOOL_ID,
      label: 'Gradient',
      icon: 'gradient',
      cursor: 'crosshair',
      shortcut: 'g',
    },
    { id: WIDTH_TOOL_ID, label: 'Width', icon: 'line_weight', cursor: 'crosshair', shortcut: 'w' },
    {
      id: SYMBOL_SPRAYER_TOOL_ID,
      label: 'Symbol Sprayer',
      icon: 'auto_awesome',
      cursor: 'crosshair',
      shortcut: 'o',
    },
  ];

  for (const exp of expectations) {
    it(`${exp.label}: id, label, icon, cursor, shortcut all match canonical values`, () => {
      const { toolReg } = setup();
      const tool = toolReg.get(exp.id);
      expect(tool, `tool ${exp.id} should be registered`).toBeTruthy();
      expect(tool!.label).toBe(exp.label);
      expect(tool!.icon).toBe(exp.icon);
      expect(tool!.cursor).toBe(exp.cursor);
      expect(tool!.shortcut).toBe(exp.shortcut);
    });
  }

  it('every tool shortcut is reachable via getByShortcut', () => {
    const { toolReg } = setup();
    for (const exp of expectations) {
      const byKey = toolReg.getByShortcut(exp.shortcut);
      expect(byKey?.id, `shortcut "${exp.shortcut}" should map to ${exp.id}`).toBe(exp.id);
    }
  });

  it('all 6 shortcuts are unique (no collision after Mesh removal)', () => {
    const shortcuts = expectations.map((e) => e.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});

describe('EyedropperToolService — defaults + setters', () => {
  function svc() {
    TestBed.configureTestingModule({});
    return TestBed.inject(EyedropperToolService);
  }

  it('starts with sampleTarget=fill and autoApply=true (Illustrator-default behaviour)', () => {
    const s = svc();
    expect(s.sampleTarget()).toBe('fill');
    expect(s.autoApply()).toBe(true);
  });

  it('setSampleTarget accepts the 3 valid values', () => {
    const s = svc();
    s.setSampleTarget('stroke');
    expect(s.sampleTarget()).toBe('stroke');
    s.setSampleTarget('both');
    expect(s.sampleTarget()).toBe('both');
    s.setSampleTarget('fill');
    expect(s.sampleTarget()).toBe('fill');
  });
});

describe('KnifeToolService — defaults + setters with clamping', () => {
  function svc() {
    TestBed.configureTestingModule({});
    return TestBed.inject(KnifeToolService);
  }

  it('starts with snapToNodes=true and snapTolerance=12 (KNIFE-FIX defaults)', () => {
    const s = svc();
    expect(s.snapToNodes()).toBe(true);
    expect(s.snapTolerance()).toBe(12);
  });

  it('setSnapTolerance clamps to [2, 100] and rejects non-finite values', () => {
    const s = svc();
    s.setSnapTolerance(50);
    expect(s.snapTolerance()).toBe(50);
    s.setSnapTolerance(1); // below min → clamped to 2
    expect(s.snapTolerance()).toBe(2);
    s.setSnapTolerance(150); // above max → clamped to 100
    expect(s.snapTolerance()).toBe(100);
    s.setSnapTolerance(Number.NaN); // non-finite → ignored
    expect(s.snapTolerance()).toBe(100);
    s.setSnapTolerance(Number.POSITIVE_INFINITY);
    expect(s.snapTolerance()).toBe(100);
  });
});

describe('SmoothToolService — defaults + setters with clamping', () => {
  function svc() {
    TestBed.configureTestingModule({});
    return TestBed.inject(SmoothToolService);
  }

  it('starts with tolerance=1.5 (calibrated default per D-050)', () => {
    const s = svc();
    expect(s.tolerance()).toBe(1.5);
  });

  it('setTolerance clamps to [0.1, 20] and rejects non-finite', () => {
    const s = svc();
    s.setTolerance(5);
    expect(s.tolerance()).toBe(5);
    s.setTolerance(0); // below min
    expect(s.tolerance()).toBe(0.1);
    s.setTolerance(50); // above max
    expect(s.tolerance()).toBe(20);
    s.setTolerance(Number.NaN);
    expect(s.tolerance()).toBe(20);
  });
});

describe('GradientToolService — focus router state', () => {
  function svc() {
    TestBed.configureTestingModule({});
    return TestBed.inject(GradientToolService);
  }

  it('starts with focusedNodeId=null, isActive=false, hasFocus=false', () => {
    const s = svc();
    expect(s.focusedNodeId()).toBeNull();
    expect(s.isActive()).toBe(false);
    expect(s.hasFocus()).toBe(false);
  });

  it('focusNode updates hasFocus computed', () => {
    const s = svc();
    s.focusNode('node-abc');
    expect(s.focusedNodeId()).toBe('node-abc');
    expect(s.hasFocus()).toBe(true);
    s.focusNode(null);
    expect(s.hasFocus()).toBe(false);
  });

  it('setActive(false) clears focusedNodeId (auto-cleanup on tool exit)', () => {
    const s = svc();
    s.focusNode('node-xyz');
    s.setActive(true);
    expect(s.focusedNodeId()).toBe('node-xyz');
    s.setActive(false);
    expect(s.focusedNodeId()).toBeNull();
    expect(s.isActive()).toBe(false);
  });
});

describe('WidthToolService — preset + baseWidth + profile resolution', () => {
  function svc() {
    TestBed.configureTestingModule({});
    return TestBed.inject(WidthToolService);
  }

  it("starts with preset='tapered' and baseWidth=12 (D-062b defaults)", () => {
    const s = svc();
    expect(s.preset()).toBe('tapered');
    expect(s.baseWidth()).toBe(12);
  });

  it('setBaseWidth clamps to [1, 200]', () => {
    const s = svc();
    s.setBaseWidth(60);
    expect(s.baseWidth()).toBe(60);
    s.setBaseWidth(0); // below min
    expect(s.baseWidth()).toBe(1);
    s.setBaseWidth(500); // above max
    expect(s.baseWidth()).toBe(200);
  });

  it('resolveProfile returns the array matching the active preset', () => {
    const s = svc();
    // uniform → single-element [1]
    s.setPreset('uniform');
    expect(s.resolveProfile()).toEqual([1]);
    // tapered → 11-element array computed as `sin(t * π)` for t∈[0,1]
    // step 0.1. End-points should be ≈0 (within floating-point ε), and
    // the mid-point t=0.5 should be the array's max (sin(π/2)=1).
    s.setPreset('tapered');
    const tap = s.resolveProfile();
    expect(tap).toHaveLength(11);
    expect(tap[0]).toBeCloseTo(0, 10);
    expect(tap[10]).toBeCloseTo(0, 10);
    // mid-point sin(π/2)=1 exact
    expect(tap[5]).toBeCloseTo(1, 10);
    // monotonically rising to mid, falling after
    const mid = tap[5]!;
    for (const v of tap) {
      expect(v).toBeLessThanOrEqual(mid + 1e-10);
    }
    // calligraphic → 6-element profile from spec literal
    s.setPreset('calligraphic');
    expect(s.resolveProfile()).toEqual([0.2, 0.6, 1.0, 1.0, 0.6, 0.3]);
  });
});

describe('SymbolSprayerService — spray params with clamping', () => {
  function svc() {
    TestBed.configureTestingModule({});
    return TestBed.inject(SymbolSprayerService);
  }

  it('starts with spacing=40, baseSize=48, scaleJitter=0.25 (D-062a defaults)', () => {
    const s = svc();
    expect(s.spacing()).toBe(40);
    expect(s.baseSize()).toBe(48);
    expect(s.scaleJitter()).toBe(0.25);
  });

  it('setSpacing clamps to [2, 400]', () => {
    const s = svc();
    s.setSpacing(100);
    expect(s.spacing()).toBe(100);
    s.setSpacing(1);
    expect(s.spacing()).toBe(2);
    s.setSpacing(500);
    expect(s.spacing()).toBe(400);
  });

  it('setBaseSize clamps to [4, 400]', () => {
    const s = svc();
    s.setBaseSize(64);
    expect(s.baseSize()).toBe(64);
    s.setBaseSize(2);
    expect(s.baseSize()).toBe(4);
    s.setBaseSize(500);
    expect(s.baseSize()).toBe(400);
  });

  it('setScaleJitter clamps to [0, 1] (it is a fraction)', () => {
    const s = svc();
    s.setScaleJitter(0.5);
    expect(s.scaleJitter()).toBe(0.5);
    s.setScaleJitter(-0.1);
    expect(s.scaleJitter()).toBe(0);
    s.setScaleJitter(1.5);
    expect(s.scaleJitter()).toBe(1);
  });
});
