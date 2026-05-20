import { capturePointer, isEditableTarget, releasePointer } from './index';

/**
 * Build a minimal `PointerEvent`-shaped object for the capture/release
 * helpers. Real `PointerEvent` requires the constructor (jsdom has it
 * but it's noisy to use), so we synthesize the shape — the helpers
 * only read `target` and `pointerId`.
 */
function makePointerEvent(target: unknown, pointerId = 7): PointerEvent {
  return { target, pointerId } as unknown as PointerEvent;
}

describe('capturePointer — defensive guards', () => {
  it('no-ops when target is null', () => {
    expect(() => capturePointer(makePointerEvent(null))).not.toThrow();
  });

  it('no-ops when target is not an Element (e.g., document, text node)', () => {
    expect(() => capturePointer(makePointerEvent({ tagName: 'NOT_ELEMENT' }))).not.toThrow();
  });

  it('no-ops when setPointerCapture is missing', () => {
    const el = document.createElement('div');
    // setPointerCapture exists on Element prototype in jsdom — explicitly
    // shadow with undefined to exercise the missing-method guard.
    Object.defineProperty(el, 'setPointerCapture', { value: undefined, configurable: true });
    expect(() => capturePointer(makePointerEvent(el))).not.toThrow();
  });

  it('calls setPointerCapture with the event.pointerId when available', () => {
    const el = document.createElement('div');
    const calls: number[] = [];
    Object.defineProperty(el, 'setPointerCapture', {
      value: (id: number) => {
        calls.push(id);
      },
      configurable: true,
    });
    capturePointer(makePointerEvent(el, 42));
    expect(calls).toEqual([42]);
  });

  it('swallows errors thrown by the browser implementation', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'setPointerCapture', {
      value: () => {
        throw new Error('Safari rejected capture');
      },
      configurable: true,
    });
    expect(() => capturePointer(makePointerEvent(el))).not.toThrow();
  });
});

describe('releasePointer — defensive guards', () => {
  it('no-ops when target is null', () => {
    expect(() => releasePointer(makePointerEvent(null))).not.toThrow();
  });

  it('no-ops when releasePointerCapture is missing', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'releasePointerCapture', { value: undefined, configurable: true });
    expect(() => releasePointer(makePointerEvent(el))).not.toThrow();
  });

  it('calls releasePointerCapture with the event.pointerId when available', () => {
    const el = document.createElement('div');
    const calls: number[] = [];
    Object.defineProperty(el, 'releasePointerCapture', {
      value: (id: number) => {
        calls.push(id);
      },
      configurable: true,
    });
    releasePointer(makePointerEvent(el, 99));
    expect(calls).toEqual([99]);
  });

  it('swallows errors thrown by the browser implementation', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'releasePointerCapture', {
      value: () => {
        throw new Error('reject');
      },
      configurable: true,
    });
    expect(() => releasePointer(makePointerEvent(el))).not.toThrow();
  });
});

describe('isEditableTarget', () => {
  it('returns false for null target', () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it('returns false for non-HTMLElement (e.g., document)', () => {
    expect(isEditableTarget(document as unknown as EventTarget)).toBe(false);
  });

  it('returns true for INPUT', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
  });

  it('returns true for TEXTAREA', () => {
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
  });

  it('returns true for SELECT (consumes letter keys for option nav)', () => {
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
  });

  it('returns true for contenteditable elements', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    // jsdom's contenteditable hook may or may not flip isContentEditable
    // automatically; force the property for the test.
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
    expect(isEditableTarget(el)).toBe(true);
  });

  it('returns false for a non-editable element (DIV)', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
  });

  it('returns false for BUTTON (Enter/Space are browser activation, not shortcut conflict)', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
  });
});
