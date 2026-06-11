import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type EditorPlugin,
  PLUGIN_API_VERSION,
  PluginCatalog,
  type PluginManifest,
  PluginManagerService,
  PluginRegistry,
  provideSvgEnginePlugin,
} from 'svg-engine/edit';
import { SvgePluginManager } from './plugin-manager.component';

const STORAGE_KEY = 'svge:plugins:state';

/** Subset of the panel's protected handlers we drive directly in tests. */
interface PanelActions {
  onToggle(p: PluginManifest): void;
  onUninstall(p: PluginManifest): void;
}

function makePlugin(overrides: Partial<EditorPlugin> = {}): EditorPlugin {
  return {
    id: 'ui.test',
    name: 'UI Test',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    install: () => undefined,
    ...overrides,
  };
}

@Component({
  standalone: true,
  imports: [SvgePluginManager],
  template: `<svge-plugin-manager />`,
})
class TestHost {}

function setup(plugins: readonly EditorPlugin[] = []) {
  TestBed.configureTestingModule({
    imports: [TestHost],
    providers: [provideNoopAnimations(), ...plugins.map((p) => provideSvgEnginePlugin(p))],
  });
  const manager = TestBed.inject(PluginManagerService);
  const registry = TestBed.inject(PluginRegistry);
  const catalog = TestBed.inject(PluginCatalog);
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const panel = fixture.debugElement.query(By.directive(SvgePluginManager))
    .componentInstance as unknown as PanelActions;
  return { fixture, manager, registry, catalog, panel };
}

function manifestOf(manager: PluginManagerService, id: string): PluginManifest {
  const m = manager.plugins().find((p) => p.id === id);
  expect(m).toBeDefined();
  return m as PluginManifest;
}

describe('SvgePluginManager', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('renders a row per internal plugin under an "Internal" group', () => {
    const { fixture } = setup([
      makePlugin({ id: 'a', name: 'Alpha', category: 'tool' }),
      makePlugin({ id: 'b', name: 'Beta' }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.pm-row').length).toBe(2);
    expect(el.querySelector('.pm-count')?.textContent?.trim()).toBe('2');
    const labels = [...el.querySelectorAll('.pm-group-label')].map((l) => l.textContent?.trim());
    expect(labels).toContain('Internal');
    expect(labels).not.toContain('External');
  });

  it('internal plugins show no uninstall button', () => {
    const { fixture } = setup([makePlugin({ id: 'a' })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.pm-uninstall')).toBeNull();
  });

  it('shows an empty state when nothing is registered', () => {
    const { fixture } = setup([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.pm-empty')).not.toBeNull();
  });

  it('toggling a row disables (uninstalls) the plugin', () => {
    const { fixture, manager, registry, panel } = setup([makePlugin({ id: 'a' })]);
    expect(registry.has('a')).toBe(true);
    panel.onToggle(manifestOf(manager, 'a'));
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(registry.has('a')).toBe(false);
    expect(manifestOf(manager, 'a').enabled).toBe(false);
  });

  it('external plugins render under "External" with an uninstall button', () => {
    const { fixture, manager } = setup([]);
    manager.installExternal(makePlugin({ id: 'ext', name: 'Ext' }));
    TestBed.flushEffects();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const labels = [...el.querySelectorAll('.pm-group-label')].map((l) => l.textContent?.trim());
    expect(labels).toContain('External');
    expect(el.querySelector('.pm-uninstall')).not.toBeNull();
  });

  it('uninstalling an external plugin removes it (confirm accepted)', () => {
    const { fixture, manager, catalog, panel } = setup([]);
    manager.installExternal(makePlugin({ id: 'ext', name: 'Ext' }));
    TestBed.flushEffects();
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    panel.onUninstall(manifestOf(manager, 'ext'));
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(catalog.has('ext')).toBe(false);
  });
});
