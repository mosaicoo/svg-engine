/** A 2D point in document coordinates. Immutable. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export const ORIGIN: Point = Object.freeze({ x: 0, y: 0 });
