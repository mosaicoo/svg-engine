import { TestBed } from '@angular/core/testing';
import { STORAGE_KEY, ThemeService } from './theme.service';

function setup() {
  // Wipe persisted theme so each test starts from defaults.
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  TestBed.configureTestingModule({});
  return TestBed.inject(ThemeService);
}

describe('ThemeService — defaults + setTheme', () => {
  it('defaults to "system" when no localStorage value exists', () => {
    const svc = setup();
    expect(svc.theme()).toBe('system');
  });

  it('setTheme persists to localStorage', () => {
    const svc = setup();
    svc.setTheme('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(svc.theme()).toBe('dark');
  });

  it('setTheme is idempotent (no double write)', () => {
    const svc = setup();
    svc.setTheme('light');
    // Re-setting same value should be a no-op
    svc.setTheme('light');
    expect(svc.theme()).toBe('light');
  });

  it('cycle: light → dark → system → light', () => {
    const svc = setup();
    svc.setTheme('light');
    svc.cycle();
    expect(svc.theme()).toBe('dark');
    svc.cycle();
    expect(svc.theme()).toBe('system');
    svc.cycle();
    expect(svc.theme()).toBe('light');
  });
});

describe('ThemeService — resolved + DOM reflection', () => {
  it('resolves "light" / "dark" explicit themes verbatim', () => {
    const svc = setup();
    svc.setTheme('light');
    expect(svc.resolved()).toBe('light');
    svc.setTheme('dark');
    expect(svc.resolved()).toBe('dark');
  });

  it('reflects resolved theme to <html data-theme="...">', () => {
    const svc = setup();
    svc.setTheme('dark');
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    svc.setTheme('light');
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('ThemeService — persistence boot', () => {
  it('reads "dark" from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('ignores invalid persisted values (falls back to "system")', () => {
    localStorage.setItem(STORAGE_KEY, 'turbo-mega-bright');
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });
});
