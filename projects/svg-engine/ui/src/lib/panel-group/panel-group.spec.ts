import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';

import { SvgePanelGroup, SvgePanelGroupTab } from './panel-group.component';

/**
 * D-061 — `<svge-panel-group>` specs:
 * 1. Single-tab → tab strip is HIDDEN (only title shown).
 * 2. Multi-tab → tab strip is visible, first tab is active by default.
 * 3. Click on a non-active tab switches the body to that tab's template.
 * 4. Controlled `[activeTab]` input wins over internal state.
 * 5. `(activeTabChange)` fires when user clicks a different tab.
 */

@Component({
  standalone: true,
  imports: [SvgePanelGroup, SvgePanelGroupTab],
  template: `
    <svge-panel-group title="Hierarchy">
      <ng-template svgePanelGroupTab svgePanelGroupTabId="layers" label="Layers">
        <div class="layers-body">LAYERS-CONTENT</div>
      </ng-template>
    </svge-panel-group>
  `,
})
class SingleTabHost {}

@Component({
  standalone: true,
  imports: [SvgePanelGroup, SvgePanelGroupTab],
  template: `
    <svge-panel-group [activeTab]="active" (activeTabChange)="active = $event">
      <ng-template svgePanelGroupTab svgePanelGroupTabId="layers" label="Layers">
        <div class="layers-body">LAYERS-CONTENT</div>
      </ng-template>
      <ng-template svgePanelGroupTab svgePanelGroupTabId="pages" label="Pages">
        <div class="pages-body">PAGES-CONTENT</div>
      </ng-template>
    </svge-panel-group>
  `,
})
class MultiTabHost {
  active: string | null = null;
}

describe('<svge-panel-group>', () => {
  it('hides tab strip when there is only one tab', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(SingleTabHost);
    fixture.detectChanges();
    const strip = fixture.nativeElement.querySelector('.pg-tabs');
    expect(strip).toBeNull();
    const title = fixture.nativeElement.querySelector('.pg-title');
    expect(title?.textContent?.trim()).toBe('Hierarchy');
    const body = fixture.nativeElement.querySelector('.layers-body');
    expect(body?.textContent?.trim()).toBe('LAYERS-CONTENT');
  });

  it('shows tab strip with multiple tabs and renders first tab by default', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(MultiTabHost);
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('.pg-tab');
    expect(tabs.length).toBe(2);
    expect(fixture.nativeElement.querySelector('.layers-body')?.textContent?.trim()).toBe(
      'LAYERS-CONTENT',
    );
    expect(fixture.nativeElement.querySelector('.pages-body')).toBeNull();
  });

  it('switches the body when a different tab is clicked', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(MultiTabHost);
    fixture.detectChanges();
    const pagesButton = Array.from(
      fixture.nativeElement.querySelectorAll('.pg-tab') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Pages')) as HTMLButtonElement;
    pagesButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pages-body')?.textContent?.trim()).toBe(
      'PAGES-CONTENT',
    );
    expect(fixture.nativeElement.querySelector('.layers-body')).toBeNull();
  });

  it('emits activeTabChange and updates aria-selected on click', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(MultiTabHost);
    fixture.detectChanges();
    const pagesButton = Array.from(
      fixture.nativeElement.querySelectorAll('.pg-tab') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Pages')) as HTMLButtonElement;
    pagesButton.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.active).toBe('pages');
    expect(pagesButton.getAttribute('aria-selected')).toBe('true');
  });
});
