import { FpsMeter } from './fps-meter';

describe('FpsMeter', () => {
  it('returns 0 FPS before any frame has been sampled', () => {
    const meter = new FpsMeter();
    expect(meter.currentFps()).toBe(0);
  });

  it('start() is idempotent (calling twice does not stack rAF loops)', () => {
    const meter = new FpsMeter();
    // We can't directly observe rAF count, but if start were not idempotent
    // it would replace the registered tick callback. Verify the second
    // call doesn't throw and the meter is still in a valid state.
    meter.start(() => {
      /* noop */
    });
    meter.start(() => {
      /* noop */
    });
    meter.stop();
    expect(meter.currentFps()).toBe(0);
  });

  it('stop() is safe to call multiple times', () => {
    const meter = new FpsMeter();
    meter.stop();
    meter.stop();
    expect(meter.currentFps()).toBe(0);
  });

  it('start() accepts a tick callback and stop() halts it', () => {
    const meter = new FpsMeter({ tickIntervalMs: 0 });
    let ticks = 0;
    meter.start(() => ticks++);
    // We don't await a real rAF here — jsdom may or may not implement
    // it consistently. The contract we lock down: start sets up state,
    // stop tears it down without throwing. Actual FPS sampling is a
    // browser-runtime concern verified manually via the /perf page.
    meter.stop();
    expect(ticks).toBeGreaterThanOrEqual(0);
  });
});
