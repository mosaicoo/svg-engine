import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-D** — Options bar for the Direct Select tool. No
 * editable controls in v1 — the AnchorOverlay handles all
 * direct-anchor interactions and persists settings via its own
 * service. The bar exists to give the tool a consistent header
 * + hint at the modifier keys.
 */
@Component({
  selector: 'svge-direct-select-options',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <mat-icon class="hint-icon" aria-hidden="true">info_outline</mat-icon>
      <span class="hint">
        Drag an anchor to move it. <strong>Double-click a segment</strong> to add an anchor where
        you click; <strong>double-click an anchor</strong> to cycle its type (cusp ↔ smooth ↔
        symmetric). <strong>Alt</strong>+click a segment adds one at the midpoint.
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
export class SvgeDirectSelectOptions {}
