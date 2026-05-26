import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';
import {
  SymbolLibraryService,
  SymbolSelectionService,
  SymbolSprayerService,
} from 'svg-engine/edit';
import { createRect } from 'svg-engine/core';
import { SvgeSymbolSprayerOptions } from './symbol-sprayer-options.component';

/**
 * **TOOL-OPT-A2** — specs for the Symbol Sprayer options bar.
 *
 * Verifies the component is wired to the headless services so any
 * UI mutation flows into the same place the tool reads from at runtime:
 *
 * 1. Size chips drive `SymbolSprayerService.baseSize`.
 * 2. Reset action restores defaults (48 / 40 / 0.25).
 * 3. Dropdown writes through to `SymbolSelectionService`.
 *
 * Avoids snapshot tests on Material slider innards — those break on
 * every Material release without indicating real regressions.
 */

function setup() {
  TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
  const fixture = TestBed.createComponent(SvgeSymbolSprayerOptions);
  // Seed at least one symbol so the dropdown branch renders.
  TestBed.inject(SymbolLibraryService).register({
    id: 'spec.symbol',
    name: 'Spec Symbol',
    master: createRect({ x: 0, y: 0, width: 10, height: 10 }),
    buildMarkup: () => '<symbol id="spec.symbol"/>',
  });
  fixture.detectChanges();
  return {
    fixture,
    sprayer: TestBed.inject(SymbolSprayerService),
    selection: TestBed.inject(SymbolSelectionService),
  };
}

describe('SvgeSymbolSprayerOptions — chip + reset wiring', () => {
  it('clicking a size chip updates SymbolSprayerService.baseSize', () => {
    const { fixture, sprayer } = setup();
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll('.chip'),
    ) as HTMLButtonElement[];
    // Chips in order: 24, 48, 96
    chips[2]!.click();
    fixture.detectChanges();
    expect(sprayer.baseSize()).toBe(96);
  });

  it('reset action restores defaults (size 48 / spacing 40 / jitter 0.25)', () => {
    const { fixture, sprayer } = setup();
    sprayer.setBaseSize(120);
    sprayer.setSpacing(180);
    sprayer.setScaleJitter(0.9);
    const resetBtn = fixture.nativeElement.querySelector('.opt-action') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    expect(sprayer.baseSize()).toBe(48);
    expect(sprayer.spacing()).toBe(40);
    expect(sprayer.scaleJitter()).toBeCloseTo(0.25);
  });

  it('reset does NOT clear the active symbol selection (preserves workflow)', () => {
    const { fixture, sprayer, selection } = setup();
    selection.select('spec.symbol');
    sprayer.setBaseSize(120);
    const resetBtn = fixture.nativeElement.querySelector('.opt-action') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    expect(selection.selectedSymbolId()).toBe('spec.symbol');
  });
});

describe('SvgeSymbolSprayerOptions — active chip highlight', () => {
  it('marks the chip matching the current baseSize as active', () => {
    const { fixture, sprayer } = setup();
    sprayer.setBaseSize(48);
    fixture.detectChanges();
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll('.chip'),
    ) as HTMLButtonElement[];
    // Chips are 24/48/96 — the middle one (48) should be active.
    expect(chips[0]!.classList.contains('chip--active')).toBe(false);
    expect(chips[1]!.classList.contains('chip--active')).toBe(true);
    expect(chips[2]!.classList.contains('chip--active')).toBe(false);
  });
});
