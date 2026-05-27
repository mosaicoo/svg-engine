import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { EditorStateService, type SvgDocument } from 'svg-engine/core';
import { ActivePageService } from 'svg-engine/edit';
import { ExporterRegistry, type Exporter, svgExporter } from 'svg-engine/io';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * Source-code viewer for the **current editor document** rendered as
 * serialized SVG XML. Reads through {@link ExporterRegistry} so any
 * plugin-contributed SVG exporter takes precedence over the builtin one;
 * falls back to the {@link svgExporter} import when nothing is registered
 * (e.g., the consumer mounted this dialog without `builtinIoPlugin`).
 *
 * **Layout standardized via `<svge-dialog-shell>`** — D-044 follow-up
 * (UI consistency sprint): inherits the canonical header (icon + title
 * + Copy action + Close X), body padding, and footer slot from the
 * shared shell. Sizing comes from `svgeDialogConfig('lg')` set in
 * {@link SvgeSvgSourceDialogService}.
 *
 * **Why a dialog (not a sidebar panel)**: source view is a debugging /
 * inspection surface — most users only open it occasionally. A modal
 * dialog avoids permanently squeezing the layout and gives the source
 * generous breathing room. Pattern matches Inkscape's "XML Editor"
 * window and Boxy SVG's source pane.
 *
 * **Live updates**: the source `computed` reads `state.document()`, so
 * the displayed XML refreshes automatically as the user edits the
 * canvas with the dialog open. Useful during development to "see the
 * diff" of a single command.
 *
 * **Why no syntax highlighting**: keeps this component zero-dep beyond
 * Material. The deterministic exporter (`svgExporter`) already produces
 * stable, readable output. Consumers wanting fancy rendering can wrap
 * this component or roll their own using the same exporter.
 *
 * **Copy to clipboard**: uses `navigator.clipboard.writeText` with a
 * graceful fallback to `document.execCommand('copy')` for non-secure
 * contexts (HTTP / older browsers). UI feedback via a transient
 * "Copied!" label shown for ~1500ms.
 */
@Component({
  selector: 'svge-svg-source-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatIconButton, MatIcon, MatTooltip],
  template: `
    <svge-dialog-shell icon="code" title="SVG source" [subtitle]="subtitleText()">
      <!-- Header actions: Copy button next to Close X -->
      <button
        svgeDialogHeaderActions
        mat-icon-button
        type="button"
        [matTooltip]="copied() ? 'Copied!' : 'Copy to clipboard'"
        [attr.aria-label]="copied() ? 'Copied' : 'Copy SVG source to clipboard'"
        (click)="copyToClipboard()"
      >
        <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
      </button>

      <!-- Body (default slot) -->
      @if (errorMessage(); as err) {
        <p class="error" role="alert">{{ err }}</p>
      } @else {
        <pre
          class="source"
          role="region"
          aria-label="Exported SVG source code"
          tabindex="0"
        ><code>{{ source() }}</code></pre>
      }

      <!-- Footer status: byte/line count (replaces in-body meta line) -->
      <span svgeDialogFooterStatus aria-live="polite">
        {{ byteCount() }} bytes · {{ lineCount() }} lines
      </span>
    </svge-dialog-shell>
  `,
  styles: `
    /* Internals only — header / footer / sizing live in <svge-dialog-shell>. */
    .source {
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
      /* Fill the dialog body vertically — when the user resizes the
         dialog taller, the source pane grows with it (no empty gap
         between content and footer). The shell's .dlg-body is a flex
         column, so this child opt-in is enough; no fixed max-height
         needed. */
      flex: 1 1 auto;
      min-height: 0;
      outline-offset: -2px;
    }
    .source:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
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
  // PAGES-FIX-4: when a page is active, the dialog shows only that
  // page's contents (with its viewBox). Multi-page docs are NOT
  // dumped as one big SVG full of `<g data-svge-kind="page">` —
  // each page is conceptually a standalone artboard from the
  // editor's perspective.
  private readonly activePage = inject(ActivePageService);

  /**
   * Pick the registered SVG exporter when available (plugin override
   * possible) or fall back to the builtin import.
   */
  private readonly resolvedExporter: Signal<Exporter> = computed(() => {
    const registered = this.exporters.byMediaType('image/svg+xml');
    return registered ?? svgExporter;
  });

  /**
   * Reactive serialization: re-runs whenever the document or the
   * registered exporter changes. SVG exporters return `string`
   * synchronously; async exporters surface an error message instead
   * of silently rendering `[object Promise]`.
   */
  protected readonly source = computed<string>(() => {
    const doc: SvgDocument = this.activePage.effectiveExportDoc(this.state.document());
    const result = this.resolvedExporter().export(doc);
    if (typeof result !== 'string') return '';
    return result;
  });

  protected readonly errorMessage = computed<string | null>(() => {
    const doc = this.activePage.effectiveExportDoc(this.state.document());
    const result = this.resolvedExporter().export(doc);
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
   * Subtitle shown under the title: surfaces the resolved exporter
   * name so the user knows whether they're looking at the built-in
   * SVG output or a plugin-contributed serializer. Falls back to a
   * neutral label when the exporter has no friendly name.
   */
  protected readonly subtitleText = computed<string>(() => {
    const exporter = this.resolvedExporter();
    return `Live export — ${exporter.name ?? exporter.id ?? 'SVG'}`;
  });

  /**
   * Transient "Copied!" indicator. Set true on a successful copy, reset
   * after ~1500ms so the UI doesn't accumulate stale state.
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
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy path.
  }
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
