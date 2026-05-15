import { TestBed } from '@angular/core/testing';
import { generateNodeId } from 'svg-engine/core';
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
