import { TestBed } from '@angular/core/testing';
import { WorkspaceService } from './workspace.service';

function setup() {
  TestBed.configureTestingModule({});
  const svc = TestBed.inject(WorkspaceService);
  svc.resetBackground();
  return svc;
}

describe('WorkspaceService — background', () => {
  it('starts with the transparent (checkerboard) default', () => {
    const ws = setup();
    expect(ws.background()).toEqual({ kind: 'transparent' });
    expect(ws.isTransparentBackground()).toBe(true);
  });

  it('setBackground accepts solid color and updates the signal', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#ffeebb' });
    expect(ws.background()).toEqual({ kind: 'solid', color: '#ffeebb' });
    expect(ws.isTransparentBackground()).toBe(false);
  });

  it('setBackground accepts image and updates the signal', () => {
    const ws = setup();
    ws.setBackground({ kind: 'image', href: '/grid.png' });
    expect(ws.background()).toEqual({ kind: 'image', href: '/grid.png' });
  });

  it('setBackground rejects empty solid color (silently)', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '' });
    expect(ws.background().kind).toBe('transparent');
  });

  it('setBackground rejects empty image href (silently)', () => {
    const ws = setup();
    ws.setBackground({ kind: 'image', href: '' });
    expect(ws.background().kind).toBe('transparent');
  });

  it('setBackground is a no-op when the new value is structurally identical', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#fff' });
    const ref = ws.background();
    ws.setBackground({ kind: 'solid', color: '#fff' });
    // Same object reference (signal didn't fire) — proves the dedup
    expect(ws.background()).toBe(ref);
  });

  it('setBackground does fire when the value changes', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#fff' });
    const before = ws.background();
    ws.setBackground({ kind: 'solid', color: '#000' });
    expect(ws.background()).not.toBe(before);
    expect(ws.background()).toEqual({ kind: 'solid', color: '#000' });
  });

  it('resetBackground returns to transparent', () => {
    const ws = setup();
    ws.setBackground({ kind: 'solid', color: '#abc' });
    ws.resetBackground();
    expect(ws.background()).toEqual({ kind: 'transparent' });
  });

  it('isTransparentBackground reflects current variant reactively', () => {
    const ws = setup();
    expect(ws.isTransparentBackground()).toBe(true);
    ws.setBackground({ kind: 'solid', color: '#fff' });
    expect(ws.isTransparentBackground()).toBe(false);
    ws.setBackground({ kind: 'image', href: '/x.png' });
    expect(ws.isTransparentBackground()).toBe(false);
    ws.resetBackground();
    expect(ws.isTransparentBackground()).toBe(true);
  });
});
