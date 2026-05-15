import { TestBed } from '@angular/core/testing';
import { type Command, ok } from '../commands/command';
import { HistoryService } from './history.service';

function noopCommand(label: string): Command {
  return {
    id: label,
    label,
    execute: () => ok(),
    undo: () => ok(),
  };
}

describe('HistoryService', () => {
  let history: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    history = TestBed.inject(HistoryService);
  });

  it('starts empty', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.peekUndo()).toBeNull();
    expect(history.peekRedo()).toBeNull();
  });

  describe('push', () => {
    it('moves a command onto the undo stack', () => {
      const a = noopCommand('A');
      history.push(a);
      expect(history.canUndo()).toBe(true);
      expect(history.peekUndo()).toBe(a);
    });

    it('clears the redo stack', () => {
      const a = noopCommand('A');
      const b = noopCommand('B');
      history.push(a);
      history.commitUndo();
      expect(history.canRedo()).toBe(true);
      history.push(b);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('commitUndo / commitRedo', () => {
    it('moves top of undo onto redo', () => {
      const a = noopCommand('A');
      history.push(a);
      history.commitUndo();
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);
      expect(history.peekRedo()).toBe(a);
    });

    it('moves top of redo back onto undo', () => {
      const a = noopCommand('A');
      history.push(a);
      history.commitUndo();
      history.commitRedo();
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      expect(history.peekUndo()).toBe(a);
    });

    it('is a no-op when respective stack is empty', () => {
      history.commitUndo(); // no throw
      history.commitRedo(); // no throw
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('clear', () => {
    it('empties both stacks', () => {
      history.push(noopCommand('A'));
      history.push(noopCommand('B'));
      history.commitUndo();
      history.clear();
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('setMaxSize', () => {
    it('drops oldest entries when the cap shrinks below current size', () => {
      const cmds = [noopCommand('A'), noopCommand('B'), noopCommand('C')];
      cmds.forEach((c) => history.push(c));
      history.setMaxSize(2);
      const stack = history.undoStack();
      expect(stack.map((c) => c.label)).toEqual(['B', 'C']);
    });

    it('keeps the cap when pushing more than max', () => {
      history.setMaxSize(2);
      ['A', 'B', 'C', 'D'].forEach((l) => history.push(noopCommand(l)));
      const stack = history.undoStack();
      expect(stack.map((c) => c.label)).toEqual(['C', 'D']);
    });

    it('throws on invalid size', () => {
      expect(() => history.setMaxSize(0)).toThrow();
      expect(() => history.setMaxSize(-1)).toThrow();
      expect(() => history.setMaxSize(Number.NaN)).toThrow();
    });
  });
});
