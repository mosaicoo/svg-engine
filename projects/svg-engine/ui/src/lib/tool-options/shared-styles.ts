/**
 * **TOOL-OPT shared styles** — single source of truth for the visual
 * vocabulary used by every built-in tool option component (chips,
 * sliders, dividers, color swatches, reset button). Imported as a
 * string via Angular's `styles` field so each component embeds the
 * same look without duplication.
 *
 * **Why not a global stylesheet**: components use shadow-DOM-like
 * style encapsulation (ViewEncapsulation.Emulated by default), so
 * a global rule wouldn't reach `.opt-group` inside a component
 * template. Reusing the string keeps each component self-contained
 * while still sharing the visual language.
 */
export const TOOL_OPT_SHARED_STYLES = `
  :host {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1 1 auto;
    min-width: 0;
    /* DBLCLICK-FIX: bloquear seleção de texto em qualquer label/hint
       da barra de opções. Sem isso, dblclick em uma palavra dispara o
       menu de seleção nativo do Chromium (Translate/Search/Copy). */
    user-select: none;
    -webkit-user-select: none;
  }
  .opt-group {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: 0 0 auto;
  }
  .opt-label {
    font-size: 11px;
    font-weight: 500;
    opacity: 0.75;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .opt-divider {
    opacity: 0.3;
    font-weight: 200;
  }
  .opt-spacer {
    flex: 1 1 auto;
  }
  .chip-row {
    display: inline-flex;
    gap: 2px;
  }
  .chip {
    min-width: 28px;
    padding: 2px 6px;
    font-size: 11px;
    border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.18));
    background: transparent;
    color: inherit;
    border-radius: 4px;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .chip:hover {
    background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
  }
  .chip--active {
    background: var(--mat-sys-primary, #1976d2);
    color: var(--mat-sys-on-primary, #fff);
    border-color: var(--mat-sys-primary, #1976d2);
  }
  .opt-slider {
    width: 96px;
    flex: 0 0 auto;
  }
  .opt-action {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: 4px;
    opacity: 0.7;
  }
  .opt-action:hover {
    background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    opacity: 1;
  }
  .opt-action mat-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
  /* Color swatch: small clickable colored square that opens the
     native picker via a hidden <input type="color"> sibling. */
  .opt-color {
    position: relative;
    display: inline-block;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.25));
    cursor: pointer;
    overflow: hidden;
  }
  .opt-color input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  /* Compact toggle button (used for binary on/off — closePath,
     rubberBand, etc.). Renders as an icon-only square that lights
     up when active. */
  .opt-toggle {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.18));
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: 4px;
    opacity: 0.7;
  }
  .opt-toggle:hover {
    background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    opacity: 1;
  }
  .opt-toggle--active {
    background: var(--mat-sys-primary, #1976d2);
    color: var(--mat-sys-on-primary, #fff);
    border-color: var(--mat-sys-primary, #1976d2);
    opacity: 1;
  }
  .opt-toggle mat-icon {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
  /* Compact number input — looks like a chip but accepts typed values. */
  .opt-number {
    width: 48px;
    height: 26px;
    padding: 0 6px;
    font-size: 12px;
    text-align: center;
    border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.18));
    background: transparent;
    color: inherit;
    border-radius: 4px;
  }
`;
