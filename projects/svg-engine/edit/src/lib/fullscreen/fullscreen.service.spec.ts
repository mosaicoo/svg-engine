import { TestBed } from '@angular/core/testing';
import { FullscreenService } from './fullscreen.service';

function setup(): FullscreenService {
  TestBed.configureTestingModule({});
  return TestBed.inject(FullscreenService);
}

describe('FullscreenService (D-129)', () => {
  it('defaults to inactive', () => {
    expect(setup().active()).toBe(false);
  });

  it('isSupported() returns a boolean for the current environment', () => {
    expect(typeof setup().isSupported()).toBe('boolean');
  });

  it('enter / exit / toggle never throw (safe no-op when the API is absent)', () => {
    const svc = setup();
    expect(() => svc.enter()).not.toThrow();
    expect(() => svc.exit()).not.toThrow();
    expect(() => svc.toggle()).not.toThrow();
  });

  it('setTarget(null) and clearTarget(el) are safe (matching + non-matching)', () => {
    const svc = setup();
    const el = document.createElement('div');
    expect(() => svc.setTarget(el)).not.toThrow();
    // Non-matching element must not clear someone else's target.
    expect(() => svc.clearTarget(document.createElement('div'))).not.toThrow();
    // Matching element clears.
    expect(() => svc.clearTarget(el)).not.toThrow();
    expect(() => svc.setTarget(null)).not.toThrow();
  });

  it('active() stays in sync with the DOM via the fullscreenchange event', () => {
    const svc = setup();
    // jsdom keeps document.fullscreenElement null, so active stays false; the
    // point is the listener is wired and recomputes from the DOM without error.
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(svc.active()).toBe(document.fullscreenElement != null);
  });
});
