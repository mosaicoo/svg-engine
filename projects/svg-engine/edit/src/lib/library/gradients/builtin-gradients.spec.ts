import { BUILTIN_GRADIENTS } from './builtin-gradients';

/**
 * Locks in the built-in gradient set: the 6 originals + 15 geometry-
 * driven additions (5 horizontal, 5 vertical, 5 diagonal). Guards
 * against accidental count/id regressions and verifies the new items
 * emit the correct linear sweep vectors.
 */
describe('BUILTIN_GRADIENTS', () => {
  it('contains 21 gradients (6 originals + 15 additions)', () => {
    expect(BUILTIN_GRADIENTS).toHaveLength(21);
  });

  it('every id is unique and follows the reverse-DNS convention', () => {
    const ids = BUILTIN_GRADIENTS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith('svge.builtin.gradient.')).toBe(true);
    }
  });

  it('every gradient has a name, a valid kind, and at least 2 stops', () => {
    for (const g of BUILTIN_GRADIENTS) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.kind === 'linear' || g.kind === 'radial').toBe(true);
      expect(g.stops.length).toBeGreaterThanOrEqual(2);
      // Offsets are within 0..1 and the markup embeds the item id so
      // url(#id) references resolve.
      for (const s of g.stops) {
        expect(s.offset).toBeGreaterThanOrEqual(0);
        expect(s.offset).toBeLessThanOrEqual(1);
      }
      expect(g.buildMarkup()).toContain(`id="${g.id}"`);
    }
  });

  it('has exactly 19 linear and 2 radial gradients', () => {
    // Originals: 4 linear (grey, blue-sky, sunset, ocean) + 2 radial
    // (spotlight, neon). Additions: 15 linear (5 H + 5 V + 5 diagonal).
    // => 19 linear, 2 radial.
    const linear = BUILTIN_GRADIENTS.filter((g) => g.kind === 'linear');
    const radial = BUILTIN_GRADIENTS.filter((g) => g.kind === 'radial');
    expect(linear.length).toBe(19);
    expect(radial.length).toBe(2);
  });

  // ── Orientation correctness of the 15 geometry-driven additions ──────
  // The factory items carry an explicit `geometry`; buildGradientMarkup
  // emits x1/y1/x2/y2 from it. We assert the emitted vector matches the
  // intended sweep direction.
  function geometryOf(id: string) {
    const g = BUILTIN_GRADIENTS.find((it) => it.id === id);
    expect(g).toBeDefined();
    return g!.geometry;
  }

  it('horizontal additions sweep left → right (x2=1, y2=0)', () => {
    for (const id of [
      'svge.builtin.gradient.linear-sunrise',
      'svge.builtin.gradient.linear-mint',
      'svge.builtin.gradient.linear-grape',
      'svge.builtin.gradient.linear-ember',
      'svge.builtin.gradient.linear-steel',
    ]) {
      const geo = geometryOf(id);
      expect(geo).toEqual({ x1: 0, y1: 0, x2: 1, y2: 0 });
    }
  });

  it('vertical additions sweep top → bottom (x2=0, y2=1)', () => {
    for (const id of [
      'svge.builtin.gradient.linear-dusk',
      'svge.builtin.gradient.linear-forest',
      'svge.builtin.gradient.linear-sky-fade',
      'svge.builtin.gradient.linear-rose',
      'svge.builtin.gradient.linear-graphite',
    ]) {
      const geo = geometryOf(id);
      expect(geo).toEqual({ x1: 0, y1: 0, x2: 0, y2: 1 });
    }
  });

  it('diagonal additions sweep top-left → bottom-right (x2=1, y2=1)', () => {
    for (const id of [
      'svge.builtin.gradient.linear-aurora',
      'svge.builtin.gradient.linear-peachy',
      'svge.builtin.gradient.linear-deep-sea',
      'svge.builtin.gradient.linear-lava',
      'svge.builtin.gradient.linear-twilight',
    ]) {
      const geo = geometryOf(id);
      expect(geo).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    }
  });

  it('a vertical item emits y2=100% in its markup (buildGradientMarkup honors geometry)', () => {
    const g = BUILTIN_GRADIENTS.find((it) => it.id === 'svge.builtin.gradient.linear-forest')!;
    const markup = g.buildMarkup();
    expect(markup).toContain('y2="100%"');
    expect(markup).toContain('x2="0%"');
  });
});
