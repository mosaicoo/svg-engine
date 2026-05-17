import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ThemeService, type Theme } from './theme.service';

/**
 * Single-button theme cycler (D-012 part 2 — Bloco 4i). Click cycles
 * through `light → dark → system`. Icon reflects the user's chosen
 * variant (NOT the resolved one — the user wants to see "what I
 * picked", not "what the system gave me").
 *
 * Tooltip shows the current variant + a hint at the next one,
 * matching the GitHub / Slack convention.
 *
 * Embeds inside any Material toolbar (`<mat-toolbar>`,
 * `<svge-toolbar>`, or a plain `<div>`).
 */
@Component({
  selector: 'svge-theme-toggle',
  standalone: true,
  imports: [MatIconButton, MatIcon, MatTooltip],
  template: `
    <button
      mat-icon-button
      type="button"
      [matTooltip]="tooltipText()"
      matTooltipPosition="below"
      [attr.aria-label]="ariaLabel()"
      (click)="theme.cycle()"
    >
      <mat-icon>{{ icon() }}</mat-icon>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeThemeToggle {
  protected readonly theme = inject(ThemeService);

  protected readonly icon = computed(() => iconFor(this.theme.theme()));
  protected readonly tooltipText = computed(() => {
    const cur = this.theme.theme();
    const next = nextOf(cur);
    return `Theme: ${humanize(cur)} (click for ${humanize(next)})`;
  });
  protected readonly ariaLabel = computed(
    () => `Theme: ${humanize(this.theme.theme())}, click to cycle`,
  );
}

function iconFor(theme: Theme): string {
  switch (theme) {
    case 'light':
      return 'light_mode';
    case 'dark':
      return 'dark_mode';
    case 'system':
      return 'brightness_auto';
  }
}

function nextOf(theme: Theme): Theme {
  if (theme === 'light') return 'dark';
  if (theme === 'dark') return 'system';
  return 'light';
}

function humanize(theme: Theme): string {
  switch (theme) {
    case 'light':
      return 'Light';
    case 'dark':
      return 'Dark';
    case 'system':
      return 'System';
  }
}
