import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Palette, PaletteRegistry } from '@mosaicoo/svg-engine/edit';
import { SvgeColorPalette } from './color-palette.component';

@Component({
  standalone: true,
  imports: [SvgeColorPalette],
  template: `
    <svge-color-palette [palettes]="palettesOverride()" (colorPicked)="emitted.push($event)" />
  `,
})
class TestHost {
  readonly palettesOverride = signal<readonly Palette[] | null>(null);
  readonly emitted: string[] = [];
}

function setup(initial?: readonly Palette[] | null) {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  if (initial !== undefined) fixture.componentInstance.palettesOverride.set(initial);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, registry: TestBed.inject(PaletteRegistry) };
}

describe('SvgeColorPalette — input palettes', () => {
  it('renders nothing when given an empty list', () => {
    const { fixture } = setup([]);
    expect(fixture.nativeElement.querySelectorAll('.palette').length).toBe(0);
  });

  it('renders one section per provided palette with the palette name', () => {
    const { fixture } = setup([
      { id: 'a', name: 'A', swatches: ['#ff0000'] },
      { id: 'b', name: 'Beta', swatches: ['#00ff00'] },
    ]);
    const headers = Array.from(
      fixture.nativeElement.querySelectorAll('.palette-name'),
    ) as HTMLElement[];
    expect(headers.map((h) => h.textContent?.trim())).toEqual(['A', 'Beta']);
  });

  it('renders one swatch button per color', () => {
    const { fixture } = setup([{ id: 'a', name: 'A', swatches: ['#f00', '#0f0', '#00f'] }]);
    const swatches = fixture.nativeElement.querySelectorAll('.swatch');
    expect(swatches.length).toBe(3);
  });
});

describe('SvgeColorPalette — falls back to PaletteRegistry when no input', () => {
  it('renders the registry snapshot when palettes input is null', () => {
    const { fixture, registry } = setup(null);
    registry.register({ id: 'fromreg', name: 'From Registry', swatches: ['#abcdef'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.palette-name')?.textContent?.trim()).toBe(
      'From Registry',
    );
  });
});

describe('SvgeColorPalette — colorPicked emission', () => {
  it('emits the raw CSS color string when a swatch is clicked', () => {
    const { fixture, host } = setup([
      { id: 'a', name: 'A', swatches: ['#ff0000', 'transparent', 'hsl(180 60% 75%)'] },
    ]);
    const swatches = Array.from(fixture.nativeElement.querySelectorAll('.swatch')) as HTMLElement[];
    swatches[0]!.click();
    swatches[1]!.click();
    swatches[2]!.click();
    expect(host.emitted).toEqual(['#ff0000', 'transparent', 'hsl(180 60% 75%)']);
  });
});

describe('SvgeColorPalette — transparent swatch treatment', () => {
  it('marks the transparent swatch with .transparent class + block icon', () => {
    const { fixture } = setup([{ id: 'a', name: 'A', swatches: ['transparent', '#ff0000'] }]);
    const swatches = Array.from(fixture.nativeElement.querySelectorAll('.swatch')) as HTMLElement[];
    expect(swatches[0]?.classList.contains('transparent')).toBe(true);
    expect(swatches[1]?.classList.contains('transparent')).toBe(false);
    expect(swatches[0]?.querySelector('mat-icon')?.textContent?.trim()).toBe('block');
  });

  it('uses the transparentLabel input for the transparent swatch aria-label', () => {
    @Component({
      standalone: true,
      imports: [SvgeColorPalette],
      template: `
        <svge-color-palette
          [palettes]="[{ id: 'x', name: 'X', swatches: ['transparent'] }]"
          transparentLabel="Sem preenchimento"
        />
      `,
    })
    class CustomLabelHost {}
    TestBed.configureTestingModule({ imports: [CustomLabelHost] });
    const fx = TestBed.createComponent(CustomLabelHost);
    document.body.appendChild(fx.nativeElement);
    fx.detectChanges();
    const sw = fx.nativeElement.querySelector('.swatch') as HTMLElement;
    expect(sw.getAttribute('aria-label')).toBe('Sem preenchimento');
  });
});
