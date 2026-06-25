import { TestBed } from '@angular/core/testing';
import { generateNodeId } from '@mosaicoo/svg-engine/core';
import { LayersService } from './layers.service';

function setup() {
  TestBed.configureTestingModule({});
  const svc = TestBed.inject(LayersService);
  svc.showAll();
  svc.unlockAll();
  return svc;
}

describe('LayersService — visibility', () => {
  it('starts with everything visible', () => {
    const svc = setup();
    const id = generateNodeId();
    expect(svc.isVisible(id)).toBe(true);
    expect(svc.hasHidden()).toBe(false);
    expect(svc.hiddenIds().size).toBe(0);
  });

  it('setVisible(false) hides the node', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.setVisible(id, false);
    expect(svc.isVisible(id)).toBe(false);
    expect(svc.hiddenIds().has(id)).toBe(true);
    expect(svc.hasHidden()).toBe(true);
  });

  it('setVisible(true) reveals the node', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.setVisible(id, false);
    svc.setVisible(id, true);
    expect(svc.isVisible(id)).toBe(true);
  });

  it('setVisible is idempotent (no signal fire on no-op)', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.setVisible(id, false);
    const ref = svc.hiddenIds();
    svc.setVisible(id, false);
    expect(svc.hiddenIds()).toBe(ref); // same reference — signal didn't update
  });

  it('toggleVisible flips state', () => {
    const svc = setup();
    const id = generateNodeId();
    expect(svc.isVisible(id)).toBe(true);
    svc.toggleVisible(id);
    expect(svc.isVisible(id)).toBe(false);
    svc.toggleVisible(id);
    expect(svc.isVisible(id)).toBe(true);
  });

  it('showAll clears every hidden id', () => {
    const svc = setup();
    const a = generateNodeId();
    const b = generateNodeId();
    svc.setVisible(a, false);
    svc.setVisible(b, false);
    expect(svc.hiddenIds().size).toBe(2);
    svc.showAll();
    expect(svc.hiddenIds().size).toBe(0);
  });
});

describe('LayersService — lock', () => {
  it('starts with nothing locked', () => {
    const svc = setup();
    const id = generateNodeId();
    expect(svc.isLocked(id)).toBe(false);
    expect(svc.hasLocked()).toBe(false);
  });

  it('setLocked(true) locks the node', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.setLocked(id, true);
    expect(svc.isLocked(id)).toBe(true);
    expect(svc.lockedIds().has(id)).toBe(true);
    expect(svc.hasLocked()).toBe(true);
  });

  it('toggleLocked flips state', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.toggleLocked(id);
    expect(svc.isLocked(id)).toBe(true);
    svc.toggleLocked(id);
    expect(svc.isLocked(id)).toBe(false);
  });

  it('setLocked is idempotent', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.setLocked(id, true);
    const ref = svc.lockedIds();
    svc.setLocked(id, true);
    expect(svc.lockedIds()).toBe(ref);
  });

  it('unlockAll clears every locked id', () => {
    const svc = setup();
    svc.setLocked(generateNodeId(), true);
    svc.setLocked(generateNodeId(), true);
    expect(svc.lockedIds().size).toBe(2);
    svc.unlockAll();
    expect(svc.lockedIds().size).toBe(0);
  });

  it('visibility and lock are independent', () => {
    const svc = setup();
    const id = generateNodeId();
    svc.setVisible(id, false);
    svc.setLocked(id, true);
    expect(svc.isVisible(id)).toBe(false);
    expect(svc.isLocked(id)).toBe(true);
    svc.setLocked(id, false);
    expect(svc.isVisible(id)).toBe(false); // still hidden
    expect(svc.isLocked(id)).toBe(false);
  });
});
