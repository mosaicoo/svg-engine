import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MenuContributionRegistry } from 'svg-engine/edit';
import { MENU_SLOT, SvgeMenuBar } from './menu-bar.component';

@Component({
  standalone: true,
  imports: [SvgeMenuBar],
  template: `<svge-menu-bar [slots]="slots()" />`,
})
class TestHost {
  readonly slots = signal<readonly string[]>([
    MENU_SLOT.FILE,
    MENU_SLOT.EDIT,
    MENU_SLOT.VIEW,
    MENU_SLOT.OBJECT,
    MENU_SLOT.HELP,
  ]);
}

function findMenuButton(host: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll<HTMLButtonElement>('button[mat-button]')).find(
      (b) => b.textContent?.trim() === label,
    ) ?? null
  );
}

describe('SvgeMenuBar — render', () => {
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

  it('renders one trigger button per slot (5 default menus)', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button[mat-button]');
    expect(buttons.length).toBe(5);
  });

  it('uses humanized labels for each canonical slot', () => {
    expect(findMenuButton(fixture.nativeElement, 'File')).not.toBeNull();
    expect(findMenuButton(fixture.nativeElement, 'Edit')).not.toBeNull();
    expect(findMenuButton(fixture.nativeElement, 'View')).not.toBeNull();
    expect(findMenuButton(fixture.nativeElement, 'Object')).not.toBeNull();
    expect(findMenuButton(fixture.nativeElement, 'Help')).not.toBeNull();
  });

  it('hides menus by filtering the [slots] input', () => {
    fixture.componentInstance.slots.set([MENU_SLOT.FILE, MENU_SLOT.EDIT]);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button[mat-button]');
    expect(buttons.length).toBe(2);
    expect(findMenuButton(fixture.nativeElement, 'View')).toBeNull();
  });

  it('host has role="menubar" for accessibility', () => {
    const host = fixture.nativeElement.querySelector('svge-menu-bar')!;
    expect(host.getAttribute('role')).toBe('menubar');
    expect(host.getAttribute('aria-label')).toBe('Editor menu bar');
  });
});

describe('SvgeMenuBar — MenuContributionRegistry integration', () => {
  let fixture: ComponentFixture<TestHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideNoopAnimations()],
    });
  });

  it('renders contributions from menu.file when the File menu opens', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    let opened = 0;
    reg.register({
      id: 'test.file.open',
      slot: MENU_SLOT.FILE,
      label: 'Open',
      shortcut: 'Ctrl+O',
      run() {
        opened += 1;
      },
    });
    fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    // Open the File menu
    findMenuButton(fixture.nativeElement, 'File')!.click();
    fixture.detectChanges();
    // Material renders the menu items into the overlay container.
    const overlay = document.querySelector('.mat-mdc-menu-content')!;
    const item = overlay.querySelector<HTMLButtonElement>('button[mat-menu-item]')!;
    expect(item.textContent).toContain('Open');
    expect(item.textContent).toContain('Ctrl+O');
    item.click();
    expect(opened).toBe(1);
  });

  it('supports submenus via the parentId field', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register({
      id: 'test.edit.transform',
      slot: MENU_SLOT.EDIT,
      label: 'Transform',
      run() {
        /* parent — run is ignored when it has children */
      },
    });
    reg.register({
      id: 'test.edit.transform.rotate',
      slot: MENU_SLOT.EDIT,
      label: 'Rotate 90°',
      parentId: 'test.edit.transform',
      run() {
        /* leaf */
      },
    });
    fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    findMenuButton(fixture.nativeElement, 'Edit')!.click();
    fixture.detectChanges();
    // Parent appears as a menu item with a submenu trigger (no run on click).
    const parents = document.querySelectorAll<HTMLButtonElement>('button[mat-menu-item]');
    const parentItem = Array.from(parents).find((b) => b.textContent?.includes('Transform'));
    expect(parentItem).toBeDefined();
    expect(parentItem!.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('renders a divider when contribution has divider:true', () => {
    const reg = TestBed.inject(MenuContributionRegistry);
    reg.register({
      id: 'test.file.opena',
      slot: MENU_SLOT.FILE,
      label: 'A',
      order: 10,

      run() {
        /* test stub */
      },
    });
    reg.register({
      id: 'test.file.div',
      slot: MENU_SLOT.FILE,
      label: '---',
      order: 20,
      divider: true,

      run() {
        /* test stub */
      },
    });
    reg.register({
      id: 'test.file.openb',
      slot: MENU_SLOT.FILE,
      label: 'B',
      order: 30,

      run() {
        /* test stub */
      },
    });
    fixture = TestBed.createComponent(TestHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    findMenuButton(fixture.nativeElement, 'File')!.click();
    fixture.detectChanges();
    const dividers = document.querySelectorAll('mat-divider');
    expect(dividers.length).toBeGreaterThanOrEqual(1);
  });
});
