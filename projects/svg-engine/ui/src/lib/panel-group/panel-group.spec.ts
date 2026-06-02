import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';

import {
  SvgePanelGroup,
  SvgePanelGroupTab,
  type SvgePanelGroupTabSide,
} from './panel-group.component';

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

@Component({
  standalone: true,
  imports: [SvgePanelGroup, SvgePanelGroupTab],
  template: `
    <svge-panel-group title="Libraries" orientation="vertical" [compact]="true">
      <ng-template svgePanelGroupTab svgePanelGroupTabId="shapes" label="Shapes" icon="category">
        <div class="shapes-body">SHAPES-CONTENT</div>
      </ng-template>
      <ng-template svgePanelGroupTab svgePanelGroupTabId="brushes" label="Brushes" icon="brush">
        <div class="brushes-body">BRUSHES-CONTENT</div>
      </ng-template>
    </svge-panel-group>
  `,
})
class VerticalHost {}

/**
 * COLLAPSE host — a multi-tab group with the collapse feature opted-in.
 * `collapsed` is two-way bound so a click on the header button (or a tab
 * while collapsed) flips it, mirroring how the shell wires it up. `side`
 * is bindable to exercise the directional chevron.
 */
@Component({
  standalone: true,
  imports: [SvgePanelGroup, SvgePanelGroupTab],
  template: `
    <svge-panel-group
      title="Right Rail"
      [tabSide]="side"
      [collapsible]="collapsible"
      [collapsed]="collapsed"
      (collapsedChange)="collapsed = $event"
    >
      <ng-template svgePanelGroupTab svgePanelGroupTabId="layers" label="Layers" icon="layers">
        <div class="layers-body">LAYERS-CONTENT</div>
      </ng-template>
      <ng-template svgePanelGroupTab svgePanelGroupTabId="props" label="Properties" icon="tune">
        <div class="props-body">PROPS-CONTENT</div>
      </ng-template>
    </svge-panel-group>
  `,
})
class CollapsibleHost {
  side: SvgePanelGroupTabSide = 'right';
  collapsible = true;
  collapsed = false;
}

/**
 * COLLAPSE single-tab host — opted-in but with only one tab. The collapse
 * button must NOT render: a collapsed single-tab group has no strip to
 * re-open from, so collapsing it would make it unreachable.
 */
@Component({
  standalone: true,
  imports: [SvgePanelGroup, SvgePanelGroupTab],
  template: `
    <svge-panel-group title="Solo" [collapsible]="true">
      <ng-template svgePanelGroupTab svgePanelGroupTabId="only" label="Only" icon="star">
        <div class="only-body">ONLY-CONTENT</div>
      </ng-template>
    </svge-panel-group>
  `,
})
class CollapsibleSingleTabHost {}

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

  it('vertical orientation renders strip on the side + shows active label in header', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(VerticalHost);
    fixture.detectChanges();
    // Strip should carry the vertical modifier + aria-orientation.
    const strip = fixture.nativeElement.querySelector('.pg-tabs--vertical') as HTMLElement | null;
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute('aria-orientation')).toBe('vertical');
    // First tab active by default → header shows "Shapes" (its label),
    // not the panel-group title "Libraries".
    const title = fixture.nativeElement.querySelector('.pg-title');
    expect(title?.textContent?.trim()).toBe('Shapes');
    // Switch tab and verify the header label tracks the active tab.
    const brushesButton = Array.from(
      fixture.nativeElement.querySelectorAll('.pg-tab') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.getAttribute('title') === 'Brushes') as HTMLButtonElement;
    brushesButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pg-title')?.textContent?.trim()).toBe('Brushes');
  });
});

/**
 * COLLAPSE specs — the opt-in hide/show feature used by the shell to
 * reclaim canvas space. The panel-group is presentational for collapse:
 * it shows the button (only when re-openable), removes its body when
 * collapsed, and emits `collapsedChange` requests; the parent owns the
 * controlled `collapsed` input + layout shrink + persistence.
 */
describe('<svge-panel-group> — collapse', () => {
  it('renders the collapse button when collapsible + multiple tabs', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pg-collapse-btn')).not.toBeNull();
  });

  it('hides the collapse button when collapsible but only one tab', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleSingleTabHost);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pg-collapse-btn')).toBeNull();
  });

  it('hides the collapse button when not collapsible (opt-out default)', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.componentInstance.collapsible = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pg-collapse-btn')).toBeNull();
  });

  it('clicking the collapse button emits collapsedChange(true)', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.pg-collapse-btn') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.collapsed).toBe(true);
  });

  it('when collapsed, removes the body wrapper but keeps the tab strip', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.componentInstance.collapsed = true;
    fixture.detectChanges();
    // Body (and its header) gone — only the icon strip remains.
    expect(fixture.nativeElement.querySelector('.pg-body-wrapper')).toBeNull();
    expect(fixture.nativeElement.querySelector('.props-body')).toBeNull();
    expect(fixture.nativeElement.querySelector('.layers-body')).toBeNull();
    // Strip stays so the user can click to re-open.
    expect(fixture.nativeElement.querySelector('.pg-tabs')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.pg-tab').length).toBe(2);
  });

  it('clicking a tab while collapsed requests re-expansion onto that tab', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.componentInstance.collapsed = true;
    fixture.detectChanges();
    const propsTab = Array.from(
      fixture.nativeElement.querySelectorAll('.pg-tab') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.getAttribute('title') === 'Properties') as HTMLButtonElement;
    propsTab.click();
    fixture.detectChanges();
    // collapsedChange(false) flipped the host's controlled input...
    expect(fixture.componentInstance.collapsed).toBe(false);
    // ...and the body re-rendered on the clicked tab.
    expect(fixture.nativeElement.querySelector('.props-body')?.textContent?.trim()).toBe(
      'PROPS-CONTENT',
    );
  });

  // The docked edge drives the chevron direction. Each side is checked in
  // a FRESH fixture configured before the first detectChanges() — mutating
  // a root-host input between two CD passes trips dev-mode's check-no-changes
  // guard, which is a test-harness artifact, not a component bug (real
  // consumers set tabSide once or via the persisted picker signal).
  it('collapse arrow points toward the wall when right-docked (chevron_right)', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.componentInstance.side = 'right';
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.pg-collapse-btn mat-icon')?.textContent?.trim(),
    ).toBe('chevron_right');
  });

  it('collapse arrow points toward the wall when left-docked (chevron_left)', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(CollapsibleHost);
    fixture.componentInstance.side = 'left';
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.pg-collapse-btn mat-icon')?.textContent?.trim(),
    ).toBe('chevron_left');
  });
});
