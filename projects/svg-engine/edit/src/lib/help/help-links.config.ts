import { InjectionToken, type Provider } from '@angular/core';

/**
 * **D-096** — destinations for the Help menu's external links
 * (Documentation, Tutorials, Plugin Development, Report Issue). The built-in
 * Help handlers open these in a new tab.
 *
 * **Host-independent by default.** The three docs links are RELATIVE paths
 * (`/docs/…`), so the browser resolves them against the **running app's own
 * origin** — `https://svgstudio.mosaicoo.tech/docs/documentation` today,
 * whatever the deploy origin is tomorrow, with no domain hard-coded.
 * `reportIssue` defaults to an ABSOLUTE external URL because an issue tracker
 * is not a page of the app itself.
 *
 * **Embeddable override.** `svg-engine` is a library mounted inside
 * third-party hosts, where a relative `/docs/…` would resolve to the HOST's
 * origin (not the docs site). Such consumers — and anyone who moves the docs
 * elsewhere — override via {@link provideSvgeHelpLinks} with absolute URLs.
 */
export interface SvgeHelpLinks {
  readonly documentation: string;
  readonly tutorials: string;
  readonly pluginDevelopment: string;
  readonly reportIssue: string;
}

/**
 * Built-in defaults. Docs links are origin-relative (resolve against the
 * current app host); Report Issue points at the public issue tracker.
 */
export const DEFAULT_HELP_LINKS: SvgeHelpLinks = {
  documentation: '/docs/documentation',
  tutorials: '/docs/tutorials',
  pluginDevelopment: '/docs/plugin-development',
  reportIssue: 'https://github.com/mosaicoo/svg-engine/issues/new',
};

/** DI token holding the resolved {@link SvgeHelpLinks}. Defaults to {@link DEFAULT_HELP_LINKS}. */
export const SVGE_HELP_LINKS = new InjectionToken<SvgeHelpLinks>('SVGE_HELP_LINKS', {
  providedIn: 'root',
  factory: () => DEFAULT_HELP_LINKS,
});

/**
 * Override some or all Help link destinations — merges over the defaults, so
 * pass only what differs. Provide at app root (or any injector hosting the
 * Help menu), typically in the consuming app's `app.config.ts`:
 *
 * ```ts
 * provideSvgeHelpLinks({
 *   documentation: 'https://docs.example.com/svg',
 *   reportIssue: 'mailto:support@example.com?subject=SVG%20Studio',
 * })
 * ```
 */
export function provideSvgeHelpLinks(links: Partial<SvgeHelpLinks>): Provider {
  return { provide: SVGE_HELP_LINKS, useValue: { ...DEFAULT_HELP_LINKS, ...links } };
}
