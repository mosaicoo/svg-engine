import { TestBed } from '@angular/core/testing';
import { generateNodeId, type NodeId } from 'svg-engine/core';
import { MarqueeService, rectFromPoints } from './marquee.service';

function setup() {
  TestBed.configureTestingModule({});
  const svc = TestBed.inject(MarqueeService);
  svc.cancel(); // ensure clean state across tests
  return svc;
}

describe('MarqueeService', () => {
  it('starts in inactive state', () => {
    const svc = setup();
    expect(svc.isActive()).toBe(false);
    expect(svc.state()).toBeNull();
    expect(svc.rect()).toBeNull();
  });

  it('start() sets state and exposes a normalized rect', () => {
    const svc = setup();
    svc.start({ x: 10, y: 20 }, 'replace', new Set());
    expect(svc.isActive()).toBe(true);
    const r = svc.rect();
    expect(r).not.toBeNull();
    // Zero-area at start (no drag yet)
    expect(r).toEqual({ x: 10, y: 20, width: 0, height: 0 });
  });

  it('update() expands the rect', () => {
    const svc = setup();
    svc.start({ x: 10, y: 20 }, 'replace', new Set());
    svc.update({ x: 50, y: 60 });
    expect(svc.rect()).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });

  it('drag up-left produces a normalized (positive-w/h) rect', () => {
    const svc = setup();
    svc.start({ x: 100, y: 100 }, 'replace', new Set());
    svc.update({ x: 30, y: 40 });
    expect(svc.rect()).toEqual({ x: 30, y: 40, width: 70, height: 60 });
  });

  it('end() clears state', () => {
    const svc = setup();
    svc.start({ x: 0, y: 0 }, 'replace', new Set());
    svc.update({ x: 10, y: 10 });
    svc.end();
    expect(svc.isActive()).toBe(false);
    expect(svc.state()).toBeNull();
    expect(svc.rect()).toBeNull();
  });

  it('cancel() clears state', () => {
    const svc = setup();
    svc.start({ x: 0, y: 0 }, 'replace', new Set());
    svc.cancel();
    expect(svc.isActive()).toBe(false);
  });

  it('start() is a no-op while another gesture is active', () => {
    const svc = setup();
    svc.start({ x: 0, y: 0 }, 'replace', new Set());
    svc.update({ x: 5, y: 5 });
    svc.start({ x: 999, y: 999 }, 'replace', new Set()); // ignored
    expect(svc.state()?.startPoint).toEqual({ x: 0, y: 0 });
  });

  it('update() is a no-op when no gesture is active (ignores stray events)', () => {
    const svc = setup();
    svc.update({ x: 5, y: 5 });
    expect(svc.state()).toBeNull();
  });

  it('captures a defensive copy of initialSelection in add mode', () => {
    const svc = setup();
    const a = generateNodeId();
    const c = generateNodeId();
    const initial = new Set<NodeId>([a, c]);
    svc.start({ x: 0, y: 0 }, 'add', initial);
    initial.add(generateNodeId()); // mutate caller's set after start
    expect(svc.state()?.initialSelection.size).toBe(2);
  });
});

describe('rectFromPoints', () => {
  it('orders min/max correctly regardless of input order', () => {
    expect(rectFromPoints({ x: 5, y: 5 }, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });
    expect(rectFromPoints({ x: 0, y: 0 }, { x: 5, y: 5 })).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });
  });

  it('produces a zero-area rect when both points coincide (a click)', () => {
    expect(rectFromPoints({ x: 7, y: 8 }, { x: 7, y: 8 })).toEqual({
      x: 7,
      y: 8,
      width: 0,
      height: 0,
    });
  });
});
