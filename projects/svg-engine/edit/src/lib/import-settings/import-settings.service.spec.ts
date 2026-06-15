import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImportSettingsService } from './import-settings.service';

const STORAGE_KEY = 'svge:import:placement-mode';

describe('ImportSettingsService (D-106)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    TestBed.resetTestingModule();
  });
  afterEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  function make(): ImportSettingsService {
    return TestBed.configureTestingModule({}).inject(ImportSettingsService);
  }

  it("defaults to 'centered'", () => {
    expect(make().placementMode()).toBe('centered');
  });

  it('setPlacementMode updates the signal and persists', () => {
    const svc = make();
    svc.setPlacementMode('place');
    expect(svc.placementMode()).toBe('place');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('place');
  });

  it('restores the persisted mode on construction', () => {
    localStorage.setItem(STORAGE_KEY, 'place');
    expect(make().placementMode()).toBe('place');
  });

  it('treats any non-"place" persisted value as the centered default', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage');
    expect(make().placementMode()).toBe('centered');
  });
});
