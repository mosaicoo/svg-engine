import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HELP_LINKS, provideSvgeHelpLinks, SVGE_HELP_LINKS } from './help-links.config';

describe('SVGE_HELP_LINKS / provideSvgeHelpLinks (D-096)', () => {
  it('defaults: docs links are origin-relative; report issue is absolute', () => {
    expect(DEFAULT_HELP_LINKS.documentation).toBe('/docs/documentation');
    expect(DEFAULT_HELP_LINKS.tutorials).toBe('/docs/tutorials');
    expect(DEFAULT_HELP_LINKS.pluginDevelopment).toBe('/docs/plugin-development');
    // Report Issue is an external (absolute) destination, not an app page.
    expect(DEFAULT_HELP_LINKS.reportIssue.startsWith('http')).toBe(true);
  });

  it('the token resolves to the defaults when nothing is provided', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(SVGE_HELP_LINKS)).toEqual(DEFAULT_HELP_LINKS);
  });

  it('provideSvgeHelpLinks merges a partial override over the defaults', () => {
    TestBed.configureTestingModule({
      providers: [
        provideSvgeHelpLinks({
          documentation: 'https://docs.example.com/svg',
          reportIssue: 'mailto:support@example.com',
        }),
      ],
    });
    const links = TestBed.inject(SVGE_HELP_LINKS);
    expect(links.documentation).toBe('https://docs.example.com/svg');
    expect(links.reportIssue).toBe('mailto:support@example.com');
    // Untouched keys keep their defaults.
    expect(links.tutorials).toBe(DEFAULT_HELP_LINKS.tutorials);
    expect(links.pluginDevelopment).toBe(DEFAULT_HELP_LINKS.pluginDevelopment);
  });
});
