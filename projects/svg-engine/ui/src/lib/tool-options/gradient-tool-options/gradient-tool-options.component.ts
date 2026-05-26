import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-C** — Options bar for the Gradient tool. **Intentionally
 * minimal** because the bulk of the gradient editing UX moved out of
 * the tool itself per D-058:
 *
 * - `<svge-gradient-overlay>` (canvas) — draggable stop dots + axis,
 *   click-to-insert, color pop-out. Visible whenever a node with a
 *   gradient fill is selected, regardless of active tool.
 * - `<svge-gradient-editor>` (Properties panel "Composition" tab) —
 *   stop list with offset/delete/Reverse + Linear/Radial toggle.
 *
 * The Gradient tool is now mainly a "focus router" (clicking a shape
 * with this tool scrolls the matching gradient into view in the
 * Libraries panel). So the options bar surfaces a brief hint pointing
 * users to where the actual edit controls live — better than a blank
 * bar that suggests features are missing.
 */
@Component({
  selector: 'svge-gradient-tool-options',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <mat-icon class="hint-icon" aria-hidden="true">info_outline</mat-icon>
      <span class="hint">
        Select a shape with a gradient fill to edit stops via the canvas overlay or the
        <strong>Composition</strong>
        tab in the Properties panel.
      </span>
    </span>
    <span class="opt-spacer"></span>
  `,
  styles: `
    ${TOOL_OPT_SHARED_STYLES}
    .hint {
      font-size: 12px;
      opacity: 0.75;
    }
    .hint-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      opacity: 0.55;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeGradientToolOptions {}
