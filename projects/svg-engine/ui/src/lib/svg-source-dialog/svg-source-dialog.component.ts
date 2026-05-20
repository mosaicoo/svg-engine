import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { EditorStateService, type SvgDocument } from 'svg-engine/core';
import { ExporterRegistry, type Exporter, svgExporter } from 'svg-engine/io';

/**
 * Source-code viewer for the **current editor document** rendered as
 * serialized SVG XML. Reads through {@link ExporterRegistry} so any
 * plugin-contributed SVG exporter takes precedence over the builtin one;
 * falls back to the {@link svgExporter} import when nothing is registered
 * (e.g., the consumer mounted this dialog without `builtinIoPlugin`).
 *
 * **Why a dialog (not a sidebar panel)**: source view is a debugging /
 * inspection surface — most users only open it occasionally. A modal
 * dialog avoids permanently squeezing the layout and gives the source
 * generous breathing room (full-height `<pre>`). Pattern matches
 * Inkscape's "XML Editor" window and Boxy SVG's source pane.
 *
 * **Live updates**: the source `computed` reads `state.document()`, so
 * the displayed XML refreshes automatically as the user edits the
 * canvas with the dialog open (move/rotate/style change/etc.). Useful
 * during development to "see the diff" of a single command.
 *
 * **Why no syntax highlighting**: keeps this component zero-dep beyond
 * Material. The deterministic exporter (`svgExporter`) already produces
 * stable, readable output with canonical attribute order — the visual
 * benefit of highlighting wouldn't justify dragging Prism / Highlight.js
 * into the bundle. Consumers wanting fancy rendering can wrap this
 * component or roll their own using the same exporter.
 *
 * **Copy to clipboard**: uses the modern `navigator.clipboard.writeText`
 * API with a graceful fallback to `document.execCommand('copy')` for
 * non-secure contexts (HTTP / older browsers). UI feedback via a
 * transient "Copied!" label shown for ~1500ms.
 */
@Component({
  selector: 'svge-svg-source-dialog',
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatIconButton,
    MatIcon,
    MatTooltip,
  ],
  template: `
    <h2 mat-dialog-title class="header">
      <mat-icon aria-hidden="true">code</mat-icon>
      <span>SVG source</span>
      <span class="spacer"></span>
      <button
        mat-icon-button
        type="button"
        [matTooltip]="copied() ? 'Copied!' : 'Copy to clipboard'"
        [attr.aria-label]="copied() ? 'Copied' : 'Copy SVG source to clipboard'"
        (click)="copyToClipboard()"
      >
        <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
      </button>
      <button
        mat-icon-button
        type="button"
        mat-dialog-close
        matTooltip="Close"
        aria-label="Close SVG source dialog"
      >
        <mat-icon>close</mat-icon>
      </button>
    </h2>
    <mat-dialog-content class="content">
      @if (errorMessage(); as err) {
        <p class="error" role="alert">{{ err }}</p>
      } @else {
        <pre
          class="source"
          role="region"
          aria-label="Exported SVG source code"
          tabindex="0"
        ><code>{{ source() }}</code></pre>
        <p class="meta" aria-live="polite">{{ byteCount() }} bytes · {{ lineCount() }} lines</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="actions">
      <button mat-icon-button type="button" mat-dialog-close matTooltip="Close" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
      min-width: min(70vw, 720px);
      max-width: 90vw;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .content {
      max-height: 60vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 0;
    }
    .source {
      flex: 1 1 auto;
      min-height: 0;
      margin: 0;
      padding: 0.75rem 1rem;
      border-radius: 0.35rem;
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      color: var(--mat-sys-on-surface, inherit);
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
      white-space: pre;
      tab-size: 2;
      /* Focus ring for keyboard users navigating into the <pre>. */
      outline-offset: -2px;
    }
    .source:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
    }
    .meta {
      margin: 0;
      font-size: 11px;
      opacity: 0.6;
      align-self: flex-end;
      font-variant-numeric: tabular-nums;
    }
    .error {
      margin: 0;
      padding: 0.5rem 0.75rem;
      border-radius: 0.35rem;
      background: var(--mat-sys-error-container, #fde7e9);
      color: var(--mat-sys-on-error-container, #5a1014);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeSvgSourceDialog {
  private readonly state = inject(EditorStateService);
  private readonly exporters = inject(ExporterRegistry);

  /**
   * Pick the registered SVG exporter when available (plugin override
   * possible) or fall back to the builtin import. Computed so consumers
   * registering a custom exporter after dialog open get the new one
   * automatically.
   */
  private readonly resolvedExporter: Signal<Exporter> = computed(() => {
    const registered = this.exporters.byMediaType('image/svg+xml');
    return registered ?? svgExporter;
  });

  /**
   * Reactive serialization: re-runs whenever the document or the
   * registered exporter changes. `svgExporter.export(doc)` is guaranteed
   * to return `string` synchronously (SVG is a text format); if a third-
   * party exporter for `image/svg+xml` returns a Promise (unusual but
   * legal per `Exporter` union type), we surface an error rather than
   * pretending we have a value.
   */
  protected readonly source = computed<string>(() => {
    const doc: SvgDocument = this.state.document();
    const result = this.resolvedExporter().export(doc);
    if (typeof result !== 'string') {
      // Async exporter for image/svg+xml is theoretically possible but
      // not how any of our builtin or planned exporters behave. Surfacing
      // the limitation explicitly beats showing "[object Promise]".
      return '';
    }
    return result;
  });

  /** Async-exporter detection — drives the error banner in the template. */
  protected readonly errorMessage = computed<string | null>(() => {
    const result = this.resolvedExporter().export(this.state.document());
    if (typeof result !== 'string') {
      return 'The registered SVG exporter is asynchronous; live source preview requires a synchronous string exporter.';
    }
    return null;
  });

  protected readonly byteCount = computed(() => new Blob([this.source()]).size);
  protected readonly lineCount = computed(() => {
    const src = this.source();
    if (src.length === 0) return 0;
    let n = 1;
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
    return n;
  });

  /**
   * Transient "Copied!" indicator. Set true on a successful copy, reset
   * after ~1500ms so the UI doesn't accumulate stale state across
   * multiple copies.
   */
  protected readonly copied = signal(false);

  protected async copyToClipboard(): Promise<void> {
    const text = this.source();
    if (text.length === 0) return;
    const ok = await writeClipboard(text);
    if (!ok) return;
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}

/**
 * Copy `text` to the system clipboard with a graceful fallback for
 * insecure contexts and older browsers. Returns `true` on success.
 *
 * **Why both paths**: `navigator.clipboard.writeText` requires a secure
 * context (HTTPS or localhost). On HTTP staging environments, the API
 * is undefined and we degrade to the legacy `execCommand('copy')` trick
 * via a hidden textarea. Older browsers (and jsdom) lack both — we
 * return `false` without throwing so the caller can decide what to do
 * (we just skip the "Copied!" feedback).
 */
async function writeClipboard(text: string): Promise<boolean> {
  // Modern path (HTTPS / localhost). Wrapped in try because some browsers
  // throw on writeText calls outside a user gesture, even when the API
  // is present.
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy path.
  }
  // Legacy path: a transient textarea + execCommand. Works on HTTP and
  // some older browsers; deprecated but still widely supported in 2026.
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
