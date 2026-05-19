import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Focuses + selects the host input as soon as it is inserted in the
 * DOM. Replaces the HTML `autofocus` attribute which a11y lint
 * rejects (Angular template rule `no-autofocus`). Used by the Layer
 * Panel inline rename input so the user can type the new name
 * immediately after F2 / double-click — no extra Tab needed.
 *
 * Lives in its own file so the consuming component can import it
 * cleanly without a forward-reference hop (TypeScript "used before
 * declared" check trips when a `@Directive` follows a `@Component`
 * that lists it in `imports`).
 */
@Directive({
  selector: '[svgeRenameAutoFocus]',
  standalone: true,
})
export class RenameAutoFocus implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  ngAfterViewInit(): void {
    const input = this.el.nativeElement;
    if (typeof input.focus !== 'function') return;
    input.focus();
    // Selecting the existing text lets the user type a replacement
    // directly without first clearing — the universal rename UX.
    if (typeof input.select === 'function') input.select();
  }
}
