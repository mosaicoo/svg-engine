import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { toNodeId } from 'svg-engine/core';
import { LayersFilter } from './layers-filter.directive';
import { LayersService } from './layers.service';

@Component({
  standalone: true,
  imports: [LayersFilter],
  template: `
    <div svgeLayersFilter>
      <span data-node-id="alpha">A</span>
      <span data-node-id="beta">B</span>
      <span data-node-id="gamma">G</span>
    </div>
  `,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const svc = TestBed.inject(LayersService);
  svc.showAll();
  fixture.detectChanges();
  return { fixture, svc };
}

function el(host: HTMLElement, id: string): HTMLElement {
  const e = host.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
  if (e === null) throw new Error(`element ${id} not found`);
  return e;
}

const A = toNodeId('alpha');
const B = toNodeId('beta');

describe('LayersFilter directive', () => {
  it('does not modify display when nothing is hidden', () => {
    const { fixture } = setup();
    expect(el(fixture.nativeElement, 'alpha').style.display).toBe('');
  });

  it('hides matching descendants when an id is added to hiddenIds', () => {
    const { fixture, svc } = setup();
    svc.setVisible(A, false);
    fixture.detectChanges();
    expect(el(fixture.nativeElement, 'alpha').style.display).toBe('none');
    expect(el(fixture.nativeElement, 'beta').style.display).toBe('');
  });

  it('restores display when an id is removed from hiddenIds', () => {
    const { fixture, svc } = setup();
    svc.setVisible(A, false);
    fixture.detectChanges();
    expect(el(fixture.nativeElement, 'alpha').style.display).toBe('none');
    svc.setVisible(A, true);
    fixture.detectChanges();
    expect(el(fixture.nativeElement, 'alpha').style.display).toBe('');
  });

  it('handles multiple ids hidden simultaneously', () => {
    const { fixture, svc } = setup();
    svc.setVisible(A, false);
    svc.setVisible(B, false);
    fixture.detectChanges();
    expect(el(fixture.nativeElement, 'alpha').style.display).toBe('none');
    expect(el(fixture.nativeElement, 'beta').style.display).toBe('none');
    expect(el(fixture.nativeElement, 'gamma').style.display).toBe('');
  });

  it('preserves a pre-existing inline display when restoring', () => {
    const { fixture, svc } = setup();
    const beta = el(fixture.nativeElement, 'beta');
    beta.style.display = 'inline-block';
    svc.setVisible(B, false);
    fixture.detectChanges();
    expect(beta.style.display).toBe('none');
    svc.setVisible(B, true);
    fixture.detectChanges();
    expect(beta.style.display).toBe('inline-block');
  });

  it('does not match elements outside the directive host', () => {
    const { fixture, svc } = setup();
    // Add a stray sibling outside the directive host
    const stray = document.createElement('span');
    stray.setAttribute('data-node-id', 'alpha');
    fixture.nativeElement.appendChild(stray);
    svc.setVisible(A, false);
    fixture.detectChanges();
    expect(stray.style.display).toBe(''); // unaffected (outside host)
    expect(
      el(fixture.nativeElement.querySelector('div[svgelayersfilter]')!, 'alpha').style.display,
    ).toBe('none');
    fixture.nativeElement.removeChild(stray);
  });
});
