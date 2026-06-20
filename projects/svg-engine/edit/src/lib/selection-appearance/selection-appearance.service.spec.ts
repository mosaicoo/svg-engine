import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clampHandleSize,
  HANDLE_SIZE_DEFAULT,
  HANDLE_SIZE_MAX,
  HANDLE_SIZE_MIN,
  HANDLE_SIZE_PRESETS,
  SelectionAppearanceService,
} from './selection-appearance.service';

const STORAGE_KEY = 'svge:selection:handle-size';

describe('SelectionAppearanceService (D-143)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  function make(): SelectionAppearanceService {
    return TestBed.configureTestingModule({}).inject(SelectionAppearanceService);
  }

  it('defaults to the medium preset (8px)', () => {
    expect(make().handleSizePx()).toBe(HANDLE_SIZE_DEFAULT);
    expect(HANDLE_SIZE_DEFAULT).toBe(HANDLE_SIZE_PRESETS.medium);
  });

  it('setHandleSize updates the signal and persists', () => {
    const svc = make();
    svc.setHandleSize(11);
    expect(svc.handleSizePx()).toBe(11);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('11');
  });

  it('setPreset maps to the canonical preset pixel sizes', () => {
    const svc = make();
    svc.setPreset('small');
    expect(svc.handleSizePx()).toBe(HANDLE_SIZE_PRESETS.small);
    svc.setPreset('large');
    expect(svc.handleSizePx()).toBe(HANDLE_SIZE_PRESETS.large);
  });

  it('clamps below the minimum and above the maximum', () => {
    const svc = make();
    svc.setHandleSize(1);
    expect(svc.handleSizePx()).toBe(HANDLE_SIZE_MIN);
    svc.setHandleSize(999);
    expect(svc.handleSizePx()).toBe(HANDLE_SIZE_MAX);
  });

  it('rounds fractional sizes to an integer', () => {
    const svc = make();
    svc.setHandleSize(9.6);
    expect(svc.handleSizePx()).toBe(10);
  });

  it('ignores non-finite input (NaN falls back to default via clamp)', () => {
    const svc = make();
    svc.setHandleSize(12);
    svc.setHandleSize(Number.NaN);
    // NaN clamps to the default; since the current value (12) differs, it sets it.
    expect(svc.handleSizePx()).toBe(HANDLE_SIZE_DEFAULT);
  });

  it('restores the persisted size on construction', () => {
    localStorage.setItem(STORAGE_KEY, '6');
    expect(make().handleSizePx()).toBe(HANDLE_SIZE_PRESETS.small);
  });

  it('clamps a persisted out-of-range value on construction', () => {
    localStorage.setItem(STORAGE_KEY, '500');
    expect(make().handleSizePx()).toBe(HANDLE_SIZE_MAX);
  });

  it('treats a garbage persisted value as the default', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-number');
    expect(make().handleSizePx()).toBe(HANDLE_SIZE_DEFAULT);
  });

  it('reset() restores the default size', () => {
    const svc = make();
    svc.setHandleSize(HANDLE_SIZE_MAX);
    svc.reset();
    expect(svc.handleSizePx()).toBe(HANDLE_SIZE_DEFAULT);
  });

  describe('clampHandleSize', () => {
    it('rounds, clamps, and guards against non-finite values', () => {
      expect(clampHandleSize(8)).toBe(8);
      expect(clampHandleSize(8.4)).toBe(8);
      expect(clampHandleSize(0)).toBe(HANDLE_SIZE_MIN);
      expect(clampHandleSize(1000)).toBe(HANDLE_SIZE_MAX);
      expect(clampHandleSize(Number.NaN)).toBe(HANDLE_SIZE_DEFAULT);
      expect(clampHandleSize(Number.POSITIVE_INFINITY)).toBe(HANDLE_SIZE_DEFAULT);
    });
  });
});
