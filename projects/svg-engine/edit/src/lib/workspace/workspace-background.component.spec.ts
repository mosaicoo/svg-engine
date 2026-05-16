import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WorkspaceBackground } from './workspace-background.component';
import { WorkspaceService } from './workspace.service';

@Component({
  standalone: true,
  imports: [WorkspaceBackground],
  template: `
    <svge-workspace-background>
      <span class="content">CONTENT</span>
    </svge-workspace-background>
  `,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const ws = TestBed.inject(WorkspaceService);
  ws.resetBackground();
  fixture.detectChanges();
  return { fixture, ws };
}

function findBgDiv(host: HTMLElement): HTMLDivElement {
  const el = host.querySelector<HTMLDivElement>('div.bg');
  if (el === null) throw new Error('Background <div class="bg"> not found');
  return el;
}

describe('WorkspaceBackground component', () => {
  it('projects content (the renderer / children) inside the background', () => {
    const { fixture } = setup();
    const content = fixture.nativeElement.querySelector('.content');
    expect(content).not.toBeNull();
    expect(content?.textContent).toBe('CONTENT');
  });

  it('applies the transparent class by default (checkerboard)', () => {
    const { fixture } = setup();
    const div = findBgDiv(fixture.nativeElement);
    expect(div.classList.contains('transparent')).toBe(true);
    expect(div.style.backgroundColor).toBe('');
    expect(div.style.backgroundImage).toBe('');
  });

  it('removes the transparent class when set to solid', () => {
    const { fixture, ws } = setup();
    ws.setBackground({ kind: 'solid', color: 'rgb(255, 0, 0)' });
    fixture.detectChanges();
    const div = findBgDiv(fixture.nativeElement);
    expect(div.classList.contains('transparent')).toBe(false);
    expect(div.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('emits url(...) for image mode', () => {
    const { fixture, ws } = setup();
    ws.setBackground({ kind: 'image', href: '/bg.png' });
    fixture.detectChanges();
    const div = findBgDiv(fixture.nativeElement);
    expect(div.classList.contains('transparent')).toBe(false);
    // Browsers normalize url() differently; just check the key parts
    expect(div.style.backgroundImage).toContain('bg.png');
  });

  it('reverts to transparent when service resets', () => {
    const { fixture, ws } = setup();
    ws.setBackground({ kind: 'solid', color: '#000' });
    fixture.detectChanges();
    expect(findBgDiv(fixture.nativeElement).classList.contains('transparent')).toBe(false);
    ws.resetBackground();
    fixture.detectChanges();
    expect(findBgDiv(fixture.nativeElement).classList.contains('transparent')).toBe(true);
  });
});
