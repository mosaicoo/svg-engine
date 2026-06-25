import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { EditorStateService } from '@mosaicoo/svg-engine/core';
import { ActivePageService } from '@mosaicoo/svg-engine/edit';
import {
  type CodeGenerator,
  CodeGeneratorRegistry,
  type CodeGeneratorOptionSpec,
  type CodeGeneratorOptionValue,
  type CodeGeneratorOptions,
  type CodeGeneratorSelectOption,
  type CodeGeneratorTextOption,
  resolveCodeGeneratorOptionDefaults,
  toPascalCaseComponentName,
} from '@mosaicoo/svg-engine/io';
import { OptimizerRegistry } from '@mosaicoo/svg-engine/optimize';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * **D-110 — `<svge-code-generator-dialog>`.** Preview-and-copy surface for
 * the {@link CodeGenerator}s registered in {@link CodeGeneratorRegistry}
 * (React JSX / React Component / Data URI). The user's requested model: code
 * is **reviewed then copied**, like the SVG source viewer — *not* configured
 * and batch-downloaded like the asset-export panel.
 *
 * **Layout** (reuses `<svge-dialog-shell>`): a format dropdown + an "Optimize
 * first" toggle + the selected generator's declarative options (rendered
 * generically from its {@link CodeGenerator.options} specs), then a live code
 * preview. Copy is the primary action (header); Download is secondary
 * (footer).
 *
 * **Live**: the preview `computed` reads `state.document()` and the option
 * signals, so it refreshes as the user edits the canvas or tweaks options.
 *
 * **Optimize first**: when toggled, the {@link OptimizerRegistry} pipeline
 * runs on the (page-scoped) document BEFORE the generator — integrating the
 * existing optimization passes into the code output, as requested.
 *
 * **Multi-editor (D-042/D-043)**: opened via {@link SvgeCodeGeneratorDialogService}
 * with the active editor's injector so `inject(EditorStateService)` resolves
 * the scoped document, not the empty root.
 */
@Component({
  selector: 'svge-code-generator-dialog',
  standalone: true,
  imports: [
    SvgeDialogShell,
    MatIcon,
    MatIconButton,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltip,
  ],
  template: `
    <svge-dialog-shell icon="code_blocks" title="Generate Code" [subtitle]="subtitleText()">
      <!-- Header action: Copy (primary) -->
      <button
        svgeDialogHeaderActions
        mat-icon-button
        type="button"
        [disabled]="output().length === 0"
        [matTooltip]="copied() ? 'Copied!' : 'Copy to clipboard'"
        [attr.aria-label]="copied() ? 'Copied' : 'Copy generated code to clipboard'"
        (click)="copyToClipboard()"
      >
        <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
      </button>

      <!-- Controls row: format + optimize toggle -->
      <div class="controls">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="format-field">
          <mat-label>Format</mat-label>
          <mat-select [value]="selectedId()" (selectionChange)="selectGenerator($event.value)">
            @for (g of generators(); track g.id) {
              <mat-option [value]="g.id">{{ g.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-checkbox
          class="optimize-toggle"
          [checked]="optimizeFirst()"
          (change)="optimizeFirst.set($event.checked)"
          matTooltip="Run the optimizer pipeline before generating"
        >
          Optimize first
        </mat-checkbox>
      </div>

      <!-- Per-generator options (rendered from declarative specs) -->
      @if (currentOptions().length > 0) {
        <div class="options">
          @for (opt of currentOptions(); track opt.key) {
            @switch (opt.kind) {
              @case ('boolean') {
                <mat-checkbox
                  [checked]="boolValue(opt.key)"
                  (change)="setOption(opt.key, $event.checked)"
                  [matTooltip]="opt.hint ?? ''"
                >
                  {{ opt.label }}
                </mat-checkbox>
              }
              @case ('text') {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="opt-field">
                  <mat-label>{{ opt.label }}</mat-label>
                  <input
                    matInput
                    [value]="strValue(opt.key)"
                    [placeholder]="textOf(opt).placeholder ?? ''"
                    (input)="setOption(opt.key, inputValue($event))"
                  />
                </mat-form-field>
              }
              @case ('select') {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="opt-field">
                  <mat-label>{{ opt.label }}</mat-label>
                  <mat-select
                    [value]="strValue(opt.key)"
                    (selectionChange)="setOption(opt.key, $event.value)"
                  >
                    @for (c of selectOf(opt).choices; track c.value) {
                      <mat-option [value]="c.value">{{ c.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
            }
          }
        </div>
      }

      <!-- Preview -->
      @if (errorMessage(); as err) {
        <p class="error" role="alert">{{ err }}</p>
      } @else {
        <pre class="source" role="region" aria-label="Generated code" tabindex="0"><code>{{
          output()
        }}</code></pre>
      }

      <!-- Footer status + Download -->
      <span svgeDialogFooterStatus aria-live="polite">
        {{ byteCount() }} bytes · {{ lineCount() }} lines
      </span>
      <button
        svgeDialogFooterActions
        mat-stroked-button
        type="button"
        [disabled]="output().length === 0"
        (click)="download()"
      >
        <mat-icon>download</mat-icon>
        Download
      </button>
    </svge-dialog-shell>
  `,
  styles: `
    .controls {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      flex: 0 0 auto;
    }
    .format-field {
      min-width: 200px;
    }
    .options {
      display: flex;
      align-items: center;
      gap: 0.75rem 1rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
      flex: 0 0 auto;
    }
    .opt-field {
      min-width: 160px;
    }
    .source {
      margin: 0.5rem 0 0;
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
      flex: 1 1 auto;
      min-height: 0;
      outline-offset: -2px;
    }
    .source:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
    }
    .error {
      margin: 0.5rem 0 0;
      padding: 0.5rem 0.75rem;
      border-radius: 0.35rem;
      background: var(--mat-sys-error-container, #fde7e9);
      color: var(--mat-sys-on-error-container, #5a1014);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeCodeGeneratorDialog {
  private readonly registry = inject(CodeGeneratorRegistry);
  private readonly state = inject(EditorStateService);
  private readonly activePage = inject(ActivePageService);
  private readonly optimizers = inject(OptimizerRegistry);
  private readonly doc = inject(DOCUMENT);

  /** Registered generators, in display order (reactive). */
  protected readonly generators = computed(() => this.registry.generators());

  /** Currently selected generator id. */
  protected readonly selectedId = signal<string | null>(null);

  /** Editable option values for the selected generator. */
  private readonly optionValues = signal<CodeGeneratorOptions>({});

  /** Whether to run the optimizer pipeline before generating. */
  protected readonly optimizeFirst = signal(false);

  /** Transient "Copied!" indicator. */
  protected readonly copied = signal(false);

  protected readonly selectedGenerator = computed<CodeGenerator | null>(() => {
    const id = this.selectedId();
    return id === null ? null : this.registry.get(id);
  });

  protected readonly currentOptions = computed<readonly CodeGeneratorOptionSpec[]>(
    () => this.selectedGenerator()?.options ?? [],
  );

  /** Generate result — code + optional error — recomputed reactively. */
  private readonly result = computed<{ code: string; error: string | null }>(() => {
    const gen = this.selectedGenerator();
    if (gen === null) {
      return { code: '', error: 'No code generators are registered.' };
    }
    try {
      let document = this.activePage.effectiveExportDoc(this.state.document());
      if (this.optimizeFirst()) {
        document = this.optimizers.runPipeline(document);
      }
      return { code: gen.generate(document, this.optionValues()), error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { code: '', error: `Generation failed: ${msg}` };
    }
  });

  protected readonly output = computed(() => this.result().code);
  protected readonly errorMessage = computed(() => this.result().error);

  protected readonly subtitleText = computed<string>(() => {
    const gen = this.selectedGenerator();
    return gen === null ? 'No generators' : `Live preview — ${gen.name} (.${gen.extension})`;
  });

  protected readonly byteCount = computed(() => new Blob([this.output()]).size);
  protected readonly lineCount = computed(() => {
    const src = this.output();
    if (src.length === 0) return 0;
    let n = 1;
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
    return n;
  });

  constructor() {
    const gens = this.registry.generators();
    if (gens.length > 0) this.selectGenerator(gens[0]!.id);
  }

  protected selectGenerator(id: string): void {
    this.selectedId.set(id);
    const gen = this.registry.get(id);
    const defaults = gen === null ? {} : resolveCodeGeneratorOptionDefaults(gen);
    // Pre-fill the component name from the active page (nicer than "Icon").
    if ('componentName' in defaults) {
      defaults['componentName'] = this.suggestedComponentName();
    }
    this.optionValues.set(defaults);
  }

  protected setOption(key: string, value: CodeGeneratorOptionValue): void {
    this.optionValues.set({ ...this.optionValues(), [key]: value });
  }

  protected boolValue(key: string): boolean {
    return this.optionValues()[key] === true;
  }

  protected strValue(key: string): string {
    const v = this.optionValues()[key];
    return v === undefined ? '' : String(v);
  }

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  /** Cast helpers — `@switch (opt.kind)` doesn't narrow `opt` in templates. */
  protected textOf(opt: CodeGeneratorOptionSpec): CodeGeneratorTextOption {
    return opt as CodeGeneratorTextOption;
  }
  protected selectOf(opt: CodeGeneratorOptionSpec): CodeGeneratorSelectOption {
    return opt as CodeGeneratorSelectOption;
  }

  private suggestedComponentName(): string {
    const name =
      this.activePage.activePage()?.metadata.name ??
      this.state.document().root.metadata.name ??
      'Icon';
    return toPascalCaseComponentName(name);
  }

  protected async copyToClipboard(): Promise<void> {
    const text = this.output();
    if (text.length === 0) return;
    const ok = await writeClipboard(text);
    if (!ok) return;
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected download(): void {
    const gen = this.selectedGenerator();
    if (gen === null) return;
    const code = this.output();
    if (code.length === 0) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.doc.createElement('a');
    a.href = url;
    a.download = this.downloadFilename(gen);
    a.click();
    URL.revokeObjectURL(url);
  }

  private downloadFilename(gen: CodeGenerator): string {
    const nameOpt = this.optionValues()['componentName'];
    const base =
      typeof nameOpt === 'string' && nameOpt.trim().length > 0
        ? toPascalCaseComponentName(nameOpt)
        : 'icon';
    return `${base}.${gen.extension}`;
  }
}

/**
 * Copy `text` to the clipboard with a graceful fallback for insecure
 * contexts / older browsers. Returns `true` on success. Mirrors the helper in
 * the SVG source dialog.
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
