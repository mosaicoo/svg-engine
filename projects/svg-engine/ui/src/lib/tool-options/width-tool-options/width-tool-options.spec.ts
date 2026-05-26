import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';
import { WidthToolService } from 'svg-engine/edit';
import { SvgeWidthToolOptions } from './width-tool-options.component';

/**
 * **TOOL-OPT-A3** — specs for the Width tool options bar.
 *
 * Mirrors the SymbolSprayerOptions spec shape: assert chip clicks +
 * reset action mutate the underlying {@link WidthToolService}. The
 * mat-button-toggle-group is tested via the public valueChange path
 * (`setPreset`) since clicking the inner radios in jsdom is flaky.
 */

function setup() {
  TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
  const fixture = TestBed.createComponent(SvgeWidthToolOptions);
  fixture.detectChanges();
  return { fixture, width: TestBed.inject(WidthToolService) };
}

describe('SvgeWidthToolOptions — width chips drive the service', () => {
  it('clicking a chip updates WidthToolService.baseWidth', () => {
    const { fixture, width } = setup();
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll('.chip'),
    ) as HTMLButtonElement[];
    // Chips in order: 1, 5, 12, 25, 50 — click "25"
    chips[3]!.click();
    fixture.detectChanges();
    expect(width.baseWidth()).toBe(25);
  });

  it('marks the chip matching the current baseWidth as active', () => {
    const { fixture, width } = setup();
    width.setBaseWidth(12);
    fixture.detectChanges();
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll('.chip'),
    ) as HTMLButtonElement[];
    // 12 is chips[2] (1, 5, 12, 25, 50).
    expect(chips[2]!.classList.contains('chip--active')).toBe(true);
    expect(chips[0]!.classList.contains('chip--active')).toBe(false);
    expect(chips[3]!.classList.contains('chip--active')).toBe(false);
  });
});

describe('SvgeWidthToolOptions — reset restores defaults', () => {
  it('reset returns preset to "tapered" and width to 12', () => {
    const { fixture, width } = setup();
    width.setPreset('uniform');
    width.setBaseWidth(50);
    const resetBtn = fixture.nativeElement.querySelector('.opt-action') as HTMLButtonElement;
    resetBtn.click();
    fixture.detectChanges();
    expect(width.preset()).toBe('tapered');
    expect(width.baseWidth()).toBe(12);
  });
});
