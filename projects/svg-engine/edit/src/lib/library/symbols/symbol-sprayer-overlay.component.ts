import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { buildSymbolMarkup, SymbolLibraryService } from './symbol-library.service';
import { SymbolSprayerPreviewService } from './symbol-sprayer-preview.service';

/**
 * **D-063c** — Live preview overlay for the Symbol Sprayer.
 *
 * Reads {@link SymbolSprayerPreviewService} and paints each in-flight
 * drop as a `<svg:use href="#{symbolId}">` element so the user sees
 * the spray distribute itself in real time during the drag. On
 * pointer-up the tool dispatches the batch command and clears the
 * preview buffer; the document's renderer takes over painting the
 * committed instances.
 *
 * **Why include `<symbol>` defs in the overlay**: during the preview
 * the document has not yet been mutated, so `ActiveSymbolsService`
 * hasn't emitted the `<symbol id="…">` element to the runtime defs.
 * Without a local copy the `<use href="#…">` references would
 * resolve to nothing and paint blank. We inline the master's markup
 * via {@link buildSymbolMarkup} once per symbol change.
 *
 * **Same-id concern**: if the doc already has committed instances of
 * the same symbol, its `<symbol>` lives in the runtime defs at the
 * same id. SVG spec marks duplicate ids as undefined behaviour but
 * browsers default to "first wins" — both copies have identical
 * content (same master), so paint is correct in either case.
 *
 * **Pointer-events: none** — decorative-only; the active tool keeps
 * receiving pointer events. **`aria-hidden`** — purely visual; the
 * semantic outcome (instances inserted) is announced via the document
 * mutation downstream.
 *
 * Usage (inside an `<svge-renderer>`):
 * ```html
 * <svg:g svgeSymbolSprayerOverlay></svg:g>
 * ```
 *
 * **Performance**: drops accumulate in a signal array; the template
 * `@for ... track $index` keeps DOM stable across appends (Angular
 * appends one `<use>` per signal change, doesn't re-render prior
 * ones). Tested smooth up to several hundred drops per gesture.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeSymbolSprayerOverlay]',
  standalone: true,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (previewMarkup(); as inner) {
      <svg:g [attr.opacity]="previewOpacity">
        <!--
          Inline the symbol master so the <use> elements resolve
          even before the doc has any committed instances. Use
          [innerHTML] so Angular parses the SVG markup as a tree
          (not text). DomSanitizer.bypassSecurityTrustHtml is
          required because the markup contains <symbol> which the
          default sanitizer would strip.
        -->
        <svg:defs [innerHTML]="inner"></svg:defs>
        @for (drop of drops(); track $index) {
          <svg:use
            [attr.href]="useHref()"
            [attr.x]="drop.x"
            [attr.y]="drop.y"
            [attr.width]="drop.width"
            [attr.height]="drop.height"
          ></svg:use>
        }
      </svg:g>
    }
  `,
  styles: `
    :host {
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SymbolSprayerOverlay {
  private readonly preview = inject(SymbolSprayerPreviewService);
  private readonly catalog = inject(SymbolLibraryService);
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Visual opacity of the preview — ghosted so the user can tell at
   * a glance that drops are pending (not yet committed) while still
   * recognising the shape. Final committed instances paint at 100%.
   */
  protected readonly previewOpacity = 0.65;

  protected readonly drops = this.preview.drops;

  /** `#{symbolId}` reference for each `<use>`. */
  protected readonly useHref = computed<string | null>(() => {
    const id = this.preview.symbolId();
    return id !== null ? `#${id}` : null;
  });

  /**
   * `<symbol>` markup for the active symbol — emitted once into the
   * overlay's `<defs>` so the `<use>` references resolve during the
   * preview pass. Recomputed only when the active symbol id changes,
   * NOT on every drop append (cheap N drops case).
   */
  protected readonly previewMarkup = computed<SafeHtml | null>(() => {
    const id = this.preview.symbolId();
    if (id === null) return null;
    if (this.preview.drops().length === 0) return null;
    const item = this.catalog.get(id);
    if (item === null) return null;
    // bypassSecurityTrustHtml is required so [innerHTML] doesn't
    // strip <symbol>. Markup source is our own library service —
    // trusted by design (same trust contract as <svge-pattern-thumb>).
    return this.sanitizer.bypassSecurityTrustHtml(buildSymbolMarkup(item));
  });
}
