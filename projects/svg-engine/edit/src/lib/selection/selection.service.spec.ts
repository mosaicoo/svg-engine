import { TestBed } from '@angular/core/testing';
import { generateNodeId } from 'svg-engine/core';
import { LayersService } from '../layers/layers.service';
import { SelectionService } from './selection.service';

describe('SelectionService', () => {
  let svc: SelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(SelectionService);
  });

  it('starts empty', () => {
    expect(svc.count()).toBe(0);
    expect(svc.hasSelection()).toBe(false);
    expect(svc.isSingleSelection()).toBe(false);
    expect(svc.focusId()).toBeNull();
    expect(svc.hoverId()).toBeNull();
    expect(svc.selectedIds().size).toBe(0);
  });

  describe('select', () => {
    it('replaces existing selection with one id', () => {
      const a = generateNodeId();
      const b = generateNodeId();
      svc.select(a);
      svc.select(b);
      expect(svc.selectedIds().has(a)).toBe(false);
      expect(svc.selectedIds().has(b)).toBe(true);
      expect(svc.focusId()).toBe(b);
      expect(svc.isSingleSelection()).toBe(true);
    });
  });

  describe('selectMany', () => {
    it('replaces selection with the given set; focus = last in iteration', () => {
      const ids = [generateNodeId(), generateNodeId(), generateNodeId()];
      svc.selectMany(ids);
      expect(svc.count()).toBe(3);
      expect(svc.focusId()).toBe(ids[2]);
    });

    it('clearing via selectMany([]) leaves focus null', () => {
      svc.select(generateNodeId());
      svc.selectMany([]);
      expect(svc.count()).toBe(0);
      expect(svc.focusId()).toBeNull();
    });
  });

  describe('addToSelection', () => {
    it('adds without removing existing members', () => {
      const a = generateNodeId();
      const b = generateNodeId();
      svc.select(a);
      svc.addToSelection(b);
      expect(svc.selectedIds().has(a)).toBe(true);
      expect(svc.selectedIds().has(b)).toBe(true);
      expect(svc.focusId()).toBe(b);
    });

    it('moves focus to id even when already in selection', () => {
      const a = generateNodeId();
      const b = generateNodeId();
      svc.selectMany([a, b]);
      expect(svc.focusId()).toBe(b);
      svc.addToSelection(a);
      expect(svc.focusId()).toBe(a);
      expect(svc.count()).toBe(2);
    });
  });

  describe('toggle', () => {
    it('adds when absent', () => {
      const a = generateNodeId();
      svc.toggle(a);
      expect(svc.isSelected(a)).toBe(true);
      expect(svc.focusId()).toBe(a);
    });

    it('removes when present', () => {
      const a = generateNodeId();
      svc.select(a);
      svc.toggle(a);
      expect(svc.isSelected(a)).toBe(false);
      expect(svc.focusId()).toBeNull();
    });

    it('removing the focused member moves focus to the new last', () => {
      const a = generateNodeId();
      const b = generateNodeId();
      svc.selectMany([a, b]);
      expect(svc.focusId()).toBe(b);
      svc.toggle(b);
      expect(svc.focusId()).toBe(a);
      expect(svc.count()).toBe(1);
    });
  });

  describe('deselect', () => {
    it('is a no-op when id is not selected', () => {
      const a = generateNodeId();
      svc.deselect(a);
      expect(svc.count()).toBe(0);
    });

    it('updates focus when removing the focused member', () => {
      const a = generateNodeId();
      const b = generateNodeId();
      svc.selectMany([a, b]);
      svc.deselect(b);
      expect(svc.focusId()).toBe(a);
    });

    it('keeps focus when deselecting a non-focused member', () => {
      const a = generateNodeId();
      const b = generateNodeId();
      svc.selectMany([a, b]);
      // focus is b (last); deselect a should keep focus on b
      svc.deselect(a);
      expect(svc.focusId()).toBe(b);
    });
  });

  describe('clear', () => {
    it('empties the selection and clears focus', () => {
      svc.selectMany([generateNodeId(), generateNodeId()]);
      svc.clear();
      expect(svc.hasSelection()).toBe(false);
      expect(svc.focusId()).toBeNull();
    });

    it('does not touch hover', () => {
      const h = generateNodeId();
      svc.setHover(h);
      svc.clear();
      expect(svc.hoverId()).toBe(h);
    });
  });

  describe('hover', () => {
    it('is independent of selection', () => {
      const a = generateNodeId();
      const h = generateNodeId();
      svc.select(a);
      svc.setHover(h);
      expect(svc.hoverId()).toBe(h);
      expect(svc.focusId()).toBe(a);
    });

    it('setHover(null) clears it', () => {
      svc.setHover(generateNodeId());
      svc.setHover(null);
      expect(svc.hoverId()).toBeNull();
    });
  });
});

describe('SelectionService — lock enforcement (Bloco 4b-Lock v2)', () => {
  let svc: SelectionService;
  let layers: LayersService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(SelectionService);
    layers = TestBed.inject(LayersService);
    layers.unlockAll();
  });

  it('select on a locked id is a silent no-op', () => {
    const a = generateNodeId();
    layers.setLocked(a, true);
    svc.select(a);
    expect(svc.selectedIds().size).toBe(0);
    expect(svc.focusId()).toBeNull();
  });

  it('selectMany filters locked ids out of the result', () => {
    const a = generateNodeId();
    const b = generateNodeId();
    const c = generateNodeId();
    layers.setLocked(b, true);
    svc.selectMany([a, b, c]);
    expect(svc.selectedIds().size).toBe(2);
    expect(svc.isSelected(a)).toBe(true);
    expect(svc.isSelected(b)).toBe(false);
    expect(svc.isSelected(c)).toBe(true);
  });

  it('addToSelection on a locked id is a silent no-op', () => {
    const a = generateNodeId();
    const b = generateNodeId();
    svc.select(a);
    layers.setLocked(b, true);
    svc.addToSelection(b);
    expect(svc.selectedIds().size).toBe(1);
    expect(svc.isSelected(b)).toBe(false);
  });

  it('toggle on a locked id never adds it', () => {
    const a = generateNodeId();
    layers.setLocked(a, true);
    svc.toggle(a);
    expect(svc.isSelected(a)).toBe(false);
    expect(svc.selectedIds().size).toBe(0);
  });

  it('setHover on a locked id clears hover (does not highlight)', () => {
    const a = generateNodeId();
    layers.setLocked(a, true);
    svc.setHover(a);
    expect(svc.hoverId()).toBeNull();
  });

  it('locking a currently-selected node auto-deselects (effect)', () => {
    const a = generateNodeId();
    svc.select(a);
    expect(svc.isSelected(a)).toBe(true);
    layers.setLocked(a, true);
    // The effect runs on the next microtask flush
    TestBed.flushEffects();
    expect(svc.isSelected(a)).toBe(false);
    expect(svc.focusId()).toBeNull();
  });

  it('locking one id from a multi-selection prunes only that id', () => {
    const a = generateNodeId();
    const b = generateNodeId();
    const c = generateNodeId();
    svc.selectMany([a, b, c]);
    layers.setLocked(b, true);
    TestBed.flushEffects();
    expect(svc.selectedIds().size).toBe(2);
    expect(svc.isSelected(a)).toBe(true);
    expect(svc.isSelected(b)).toBe(false);
    expect(svc.isSelected(c)).toBe(true);
  });

  it('locking the focused node moves focus to another selected member', () => {
    const a = generateNodeId();
    const b = generateNodeId();
    svc.selectMany([a, b]);
    expect(svc.focusId()).toBe(b); // last in iteration
    layers.setLocked(b, true);
    TestBed.flushEffects();
    expect(svc.focusId()).toBe(a);
  });

  it('locking the only selected node clears focus to null', () => {
    const a = generateNodeId();
    svc.select(a);
    layers.setLocked(a, true);
    TestBed.flushEffects();
    expect(svc.focusId()).toBeNull();
    expect(svc.selectedIds().size).toBe(0);
  });

  it('locking the hovered node clears hover', () => {
    const a = generateNodeId();
    svc.setHover(a);
    expect(svc.hoverId()).toBe(a);
    layers.setLocked(a, true);
    TestBed.flushEffects();
    expect(svc.hoverId()).toBeNull();
  });

  it('unlocking a previously-locked id does NOT auto-restore selection', () => {
    const a = generateNodeId();
    svc.select(a);
    layers.setLocked(a, true);
    TestBed.flushEffects();
    layers.setLocked(a, false);
    TestBed.flushEffects();
    // Still deselected — user must reselect manually (Affinity/Figma convention)
    expect(svc.isSelected(a)).toBe(false);
  });
});
