import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { type Tool, ToolHostService, ToolRegistry } from 'svg-engine/edit';
import { SvgeToolOptions } from './tool-options.component';
import { ToolOptionsRegistry } from './tool-options-registry.service';

/** A throwaway component that renders identifiable text so we can assert it mounted. */
@Component({
  standalone: true,
  template: `<span class="my-stamp-options">stamp options</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StubOptionsComponent {}

/** A throwaway "tool" with the optional options-component field. */
class StubTool implements Tool {
  readonly id = 'stub.tool';
  readonly label = 'Stub';
  readonly icon = 'star';
  readonly optionsComponent = StubOptionsComponent;
}

/** A tool WITHOUT optionsComponent — used to test the empty/placeholder branches. */
class StubToolNoOptions implements Tool {
  readonly id = 'stub.tool.no-opts';
  readonly label = 'Stub (no options)';
  readonly icon = 'block';
}

describe('SvgeToolOptions — renders active tool optionsComponent', () => {
  let fixture: ComponentFixture<SvgeToolOptions>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    TestBed.inject(ToolRegistry).register(new StubTool());
    TestBed.inject(ToolHostService).activate('stub.tool');
    fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.detectChanges();
  });

  it('mounts the active tool optionsComponent via ngComponentOutlet', () => {
    const stamp = fixture.nativeElement.querySelector('.my-stamp-options');
    expect(stamp).not.toBeNull();
    expect(stamp.textContent).toContain('stamp options');
  });

  it('shows the active tool label + icon next to the options strip', () => {
    expect(fixture.nativeElement.querySelector('.tool-label').textContent).toContain('Stub');
    expect(fixture.nativeElement.querySelector('.tool-icon mat-icon').textContent).toContain(
      'star',
    );
  });

  it('re-renders when the active tool changes', () => {
    TestBed.inject(ToolRegistry).register(new StubToolNoOptions());
    TestBed.inject(ToolHostService).activate('stub.tool.no-opts');
    fixture.detectChanges();
    // No options component now → placeholder (default off) → bar collapses
    expect(fixture.nativeElement.querySelector('.my-stamp-options')).toBeNull();
    expect(fixture.nativeElement.querySelector('.bar')).toBeNull();
  });
});

describe('SvgeToolOptions — placeholder fallback', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    TestBed.inject(ToolRegistry).register(new StubToolNoOptions());
    TestBed.inject(ToolHostService).activate('stub.tool.no-opts');
  });

  it('hides the bar when active tool has no optionsComponent (default)', () => {
    const fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bar')).toBeNull();
  });

  it('shows placeholder when [showPlaceholder]=true and tool has no optionsComponent', () => {
    const fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.componentRef.setInput('showPlaceholder', true);
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector('.bar.placeholder');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('No options for this tool');
  });
});

describe('SvgeToolOptions — host ARIA', () => {
  it('updates aria-label with the active tool label', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    TestBed.inject(ToolRegistry).register(new StubTool());
    TestBed.inject(ToolHostService).activate('stub.tool');
    const fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('toolbar');
    expect(host.getAttribute('aria-label')).toContain('Stub');
  });
});

/**
 * **TOOL-OPT-A1** — verify the registry takes precedence over the
 * Tool's own `optionsComponent`. This is how built-in tools (defined
 * in `svg-engine/edit` and therefore unable to reference Material UI
 * classes per D-017) get their options bar — UI registers the
 * component under the tool's id at bootstrap.
 */
@Component({
  standalone: true,
  template: `<span class="from-registry">registry component</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RegistryComponent {}

describe('SvgeToolOptions — ToolOptionsRegistry precedence (TOOL-OPT-A1)', () => {
  it('registry binding wins over tool.optionsComponent for the same id', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    TestBed.inject(ToolRegistry).register(new StubTool());
    TestBed.inject(ToolOptionsRegistry).register('stub.tool', RegistryComponent);
    TestBed.inject(ToolHostService).activate('stub.tool');
    const fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.detectChanges();
    // Registry-provided component appears
    expect(fixture.nativeElement.querySelector('.from-registry')).not.toBeNull();
    // Tool-bound `StubOptionsComponent` is NOT used when registry wins
    expect(fixture.nativeElement.querySelector('.my-stamp-options')).toBeNull();
  });

  it('falls back to tool.optionsComponent when registry has no entry', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    TestBed.inject(ToolRegistry).register(new StubTool());
    TestBed.inject(ToolHostService).activate('stub.tool');
    const fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.my-stamp-options')).not.toBeNull();
  });

  it('renders registry-only options when the tool itself has no optionsComponent', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    TestBed.inject(ToolRegistry).register(new StubToolNoOptions());
    TestBed.inject(ToolOptionsRegistry).register('stub.tool.no-opts', RegistryComponent);
    TestBed.inject(ToolHostService).activate('stub.tool.no-opts');
    const fixture = TestBed.createComponent(SvgeToolOptions);
    fixture.detectChanges();
    // Registry covers the tool that wouldn't otherwise have options.
    expect(fixture.nativeElement.querySelector('.from-registry')).not.toBeNull();
    // No placeholder either — registry binding satisfies the activeOptionsComponent computed.
    expect(fixture.nativeElement.querySelector('.bar.placeholder')).toBeNull();
  });
});

describe('SvgeToolOptions — wrapper sanity (signal-based input)', () => {
  /** Sanity check that the [showPlaceholder] input is a real signal binding. */
  @Component({
    standalone: true,
    imports: [SvgeToolOptions],
    template: `<svge-tool-options [showPlaceholder]="show()" />`,
  })
  class Host {
    readonly show = signal(false);
  }

  it('flips on dynamic [showPlaceholder] when no options component active', () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    });
    TestBed.inject(ToolRegistry).register(new StubToolNoOptions());
    TestBed.inject(ToolHostService).activate('stub.tool.no-opts');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bar')).toBeNull();
    fixture.componentInstance.show.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.bar.placeholder')).not.toBeNull();
  });
});
