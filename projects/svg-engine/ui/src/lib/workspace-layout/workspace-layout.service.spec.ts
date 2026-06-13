import { TestBed } from '@angular/core/testing';
import { WorkspaceLayoutService } from './workspace-layout.service';

describe('WorkspaceLayoutService', () => {
  let svc: WorkspaceLayoutService;

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* private mode — ignore */
    }
    TestBed.configureTestingModule({});
    svc = TestBed.inject(WorkspaceLayoutService);
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('starts at epoch 0', () => {
    expect(svc.resetEpoch()).toBe(0);
  });

  it('reset() clears layout keys (tab side + rail collapse) and bumps the epoch', () => {
    localStorage.setItem('svge-panel-group-tabside-shell-pro-right-rail', 'left');
    localStorage.setItem('svge-panel-group-tabside-inspector', 'bottom');
    localStorage.setItem('svge-shell-pro-libraries-collapsed', '1');
    localStorage.setItem('svge-shell-pro-right-rail-collapsed', '1');

    svc.reset();

    expect(localStorage.getItem('svge-panel-group-tabside-shell-pro-right-rail')).toBeNull();
    expect(localStorage.getItem('svge-panel-group-tabside-inspector')).toBeNull();
    expect(localStorage.getItem('svge-shell-pro-libraries-collapsed')).toBeNull();
    expect(localStorage.getItem('svge-shell-pro-right-rail-collapsed')).toBeNull();
    expect(svc.resetEpoch()).toBe(1);
  });

  it('reset() leaves NON-layout keys untouched (document / color history / keybindings)', () => {
    localStorage.setItem('svge.color-history', '["#fff"]');
    localStorage.setItem('svge:keybindings:v1', '{}');
    localStorage.setItem('svge-autosave', 'doc-json');
    localStorage.setItem('svge-panel-group-tabside-x', 'right');

    svc.reset();

    // Layout key gone…
    expect(localStorage.getItem('svge-panel-group-tabside-x')).toBeNull();
    // …everything else preserved.
    expect(localStorage.getItem('svge.color-history')).toBe('["#fff"]');
    expect(localStorage.getItem('svge:keybindings:v1')).toBe('{}');
    expect(localStorage.getItem('svge-autosave')).toBe('doc-json');
  });

  it('each reset increments the epoch (safe to repeat)', () => {
    svc.reset();
    svc.reset();
    expect(svc.resetEpoch()).toBe(2);
  });

  it('reset() is a no-op-safe when there are no layout keys', () => {
    expect(() => svc.reset()).not.toThrow();
    expect(svc.resetEpoch()).toBe(1);
  });
});
