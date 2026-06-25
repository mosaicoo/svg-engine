import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MenuContributionRegistry } from '@mosaicoo/svg-engine/edit';
import { SvgeToolbar } from './toolbar.component';

@Component({
  standalone: true,
  imports: [SvgeToolbar],
  template: `<svge-toolbar slot="toolbar.main" />`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return { fixture, registry: TestBed.inject(MenuContributionRegistry) };
}

describe('SvgeToolbar — registry-driven rendering', () => {
  it('renders nothing when registry is empty for the slot', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
  });

  it('renders one button per visible contribution for the slot', () => {
    const { fixture, registry } = setup();
    registry.register({ id: 'a', slot: 'toolbar.main', label: 'A', run: () => undefined });
    registry.register({ id: 'b', slot: 'toolbar.main', label: 'B', run: () => undefined });
    registry.register({
      id: 'c',
      slot: 'sidebar.left',
      label: 'C',
      run: () => undefined,
    });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(2); // A + B; C is in another slot
    expect(buttons[0].getAttribute('aria-label')).toBe('A');
  });

  it('respects the disabled signal on each contribution', () => {
    const { fixture, registry } = setup();
    const disabledA = signal(true);
    registry.register({
      id: 'a',
      slot: 'toolbar.main',
      label: 'A',
      disabled: disabledA,
      run: () => undefined,
    });
    registry.register({ id: 'b', slot: 'toolbar.main', label: 'B', run: () => undefined });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
    disabledA.set(false);
    fixture.detectChanges();
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('click activates the contribution.run()', () => {
    const { fixture, registry } = setup();
    let count = 0;
    registry.register({
      id: 'a',
      slot: 'toolbar.main',
      label: 'A',
      run: () => {
        count += 1;
      },
    });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    btn.click();
    expect(count).toBe(1);
    btn.click();
    expect(count).toBe(2);
  });

  it('shows icon when provided, falls back to text label otherwise', () => {
    const { fixture, registry } = setup();
    registry.register({
      id: 'a',
      slot: 'toolbar.main',
      label: 'Group',
      icon: 'folder',
      run: () => undefined,
    });
    registry.register({ id: 'b', slot: 'toolbar.main', label: 'Plain', run: () => undefined });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].querySelector('mat-icon')?.textContent?.trim()).toBe('folder');
    expect(buttons[1].querySelector('.text-fallback')?.textContent?.trim()).toBe('Plain');
  });

  it('orders contributions by `order` (lower first)', () => {
    const { fixture, registry } = setup();
    registry.register({
      id: 'z',
      slot: 'toolbar.main',
      label: 'Z',
      order: 200,
      run: () => undefined,
    });
    registry.register({
      id: 'a',
      slot: 'toolbar.main',
      label: 'A',
      order: 50,
      run: () => undefined,
    });
    fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('button')).map((b) =>
      (b as HTMLElement).getAttribute('aria-label'),
    );
    expect(labels).toEqual(['A', 'Z']);
  });
});
