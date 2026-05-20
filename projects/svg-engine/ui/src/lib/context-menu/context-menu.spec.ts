import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MenuContributionRegistry } from 'svg-engine/edit';
import { CONTEXT_MENU_SLOT, SvgeContextMenu } from './context-menu.component';
import { SvgeContextMenuService } from './context-menu.service';
import { SvgeContextMenuTrigger } from './context-menu-trigger.directive';

describe('SvgeContextMenu — content render', () => {
  let fixture: ComponentFixture<SvgeContextMenu>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    fixture = TestBed.createComponent(SvgeContextMenu);
    fixture.componentRef.setInput('slot', CONTEXT_MENU_SLOT.CANVAS);
    fixture.detectChanges();
  });

  it('shows "No actions available" when slot is empty / has no contributions', () => {
    const empty = fixture.nativeElement.querySelector('.empty');
    expect(empty?.textContent?.trim()).toBe('No actions available');
  });

  it('renders contributions from the registered slot', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    let ran = 0;
    reg.register({
      id: 'test.ctx.canvas.paste',
      slot: CONTEXT_MENU_SLOT.CANVAS,
      label: 'Paste',
      icon: 'content_paste',
      shortcut: 'Ctrl+V',
      run() {
        ran += 1;
      },
    });
    fixture.detectChanges();
    const item = fixture.nativeElement.querySelector('.item') as HTMLButtonElement | null;
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain('Paste');
    expect(item!.textContent).toContain('Ctrl+V');
    item!.click();
    expect(ran).toBe(1);
  });

  it('emits dismiss after running an item', async () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register({
      id: 'test.ctx.canvas.x',
      slot: CONTEXT_MENU_SLOT.CANVAS,
      label: 'X',
      run() {
        /* test */
      },
    });
    fixture.detectChanges();
    const dismissed = new Promise<void>((resolve) => {
      fixture.componentInstance.dismiss.subscribe(() => resolve());
    });
    (fixture.nativeElement.querySelector('.item') as HTMLButtonElement | null)!.click();
    await dismissed;
  });

  it('renders a divider when contribution has divider:true', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register({
      id: 'test.ctx.canvas.a',
      slot: CONTEXT_MENU_SLOT.CANVAS,
      label: 'A',
      order: 10,
      run() {
        /* test */
      },
    });
    reg.register({
      id: 'test.ctx.canvas.div',
      slot: CONTEXT_MENU_SLOT.CANVAS,
      label: '',
      order: 20,
      divider: true,
      run() {
        /* divider — never called */
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-divider')).not.toBeNull();
  });

  it('host has role="menu" + dynamic aria-label per slot', () => {
    // fixture.nativeElement IS the host element when the component is
    // created directly (no test host wrapper).
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('menu');
    expect(host.getAttribute('aria-label')).toContain('context.canvas');
  });
});

describe('SvgeContextMenuTrigger — directive', () => {
  @Component({
    standalone: true,
    imports: [SvgeContextMenuTrigger],
    template: `<div data-test-id="target" [svgeContextMenu]="slot()">Right-click me</div>`,
  })
  class TestHost {
    readonly slot = signal<string>(CONTEXT_MENU_SLOT.CANVAS);
  }

  let fixture: ComponentFixture<TestHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideNoopAnimations()],
    });
    fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(SvgeContextMenuService).close();
  });

  it('opens the context menu when host receives contextmenu', () => {
    const service = TestBed.inject(SvgeContextMenuService);
    const target = fixture.nativeElement.querySelector('[data-test-id="target"]')!;
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 50,
    });
    target.dispatchEvent(event);
    expect(service.isOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does NOT open when slot is empty (disabled state)', () => {
    fixture.componentInstance.slot.set('');
    fixture.detectChanges();
    const service = TestBed.inject(SvgeContextMenuService);
    const target = fixture.nativeElement.querySelector('[data-test-id="target"]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(service.isOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('service.close() dismisses the open menu', () => {
    const service = TestBed.inject(SvgeContextMenuService);
    service.open(CONTEXT_MENU_SLOT.CANVAS, { x: 0, y: 0 });
    expect(service.isOpen()).toBe(true);
    service.close();
    expect(service.isOpen()).toBe(false);
  });

  it('service.open() replaces any previously open menu (single-instance)', () => {
    const service = TestBed.inject(SvgeContextMenuService);
    service.open(CONTEXT_MENU_SLOT.CANVAS, { x: 0, y: 0 });
    service.open(CONTEXT_MENU_SLOT.NODE, { x: 50, y: 50 });
    // Still exactly one open
    expect(service.isOpen()).toBe(true);
    expect(document.querySelectorAll('svge-context-menu').length).toBe(1);
  });
});
