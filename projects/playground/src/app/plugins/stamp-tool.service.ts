import { Injectable, signal } from '@angular/core';

/** Color presets for the Stamp tool (D-038 Phase 3 showcase). */
export type StampColor = 'red' | 'blue' | 'green';

const COLOR_HEX: Readonly<Record<StampColor, string>> = {
  red: '#e53935',
  blue: '#1e88e5',
  green: '#43a047',
};

/**
 * State for the playground-only **Stamp Tool** — demonstrates the
 * D-038 Phase 3 `Tool.optionsComponent` flow end-to-end.
 *
 * Held outside the tool itself so the options component can mutate it
 * without coupling to the tool's internal class. Standard DI shape
 * lets `<svge-tool-options>` instantiate the options component with
 * normal injection and have it pick this up.
 *
 * **Not part of the library** — this lives in the playground because
 * the Stamp tool is a demo. Real consumers would have their own
 * state services per tool.
 */
@Injectable({ providedIn: 'root' })
export class StampToolService {
  private readonly _radius = signal<number>(10);
  private readonly _color = signal<StampColor>('blue');

  readonly radius = this._radius.asReadonly();
  readonly color = this._color.asReadonly();

  setRadius(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this._radius.set(value);
  }

  setColor(value: StampColor): void {
    this._color.set(value);
  }

  /** Resolve current color to an SVG hex string. */
  resolvedHex(): string {
    return COLOR_HEX[this._color()];
  }
}
