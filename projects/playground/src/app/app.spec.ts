import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App layout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the playground header', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header h1')?.textContent).toContain('SVGEngine Playground');
  });

  it('renders nav links to home and shell-demo', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.app-nav a'),
    ) as HTMLAnchorElement[];
    const hrefs = links.map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.length).toBe(2);
    expect(hrefs.some((h) => h === '/' || h === '')).toBe(true);
    expect(hrefs.some((h) => h.endsWith('shell-demo'))).toBe(true);
  });
});
