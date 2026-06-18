import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { type Command, CommandBus, HistoryService } from 'svg-engine/core';
import { SvgeHistoryPanel } from './history-panel.component';

/**
 * A minimal command — the panel only reads `label` and drives
 * `CommandBus.goto`; it never calls `execute`/`undo`, so trivial
 * implementations suffice. We populate the history via the
 * `HistoryService` public API directly (no execution needed).
 */
function fakeCommand(label: string): Command {
  return { id: label, label, execute: () => ({ ok: true }), undo: () => ({ ok: true }) };
}

function setup(): {
  fixture: ReturnType<typeof TestBed.createComponent<SvgeHistoryPanel>>;
  history: HistoryService;
  bus: CommandBus;
} {
  TestBed.configureTestingModule({ imports: [SvgeHistoryPanel] });
  const history = TestBed.inject(HistoryService);
  const bus = TestBed.inject(CommandBus);
  history.clear();
  const fixture = TestBed.createComponent(SvgeHistoryPanel);
  fixture.detectChanges();
  return { fixture, history, bus };
}

function rows(fixture: ReturnType<typeof TestBed.createComponent>): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.row'));
}

function labels(fixture: ReturnType<typeof TestBed.createComponent>): string[] {
  return rows(fixture).map((r) => r.querySelector('.label')?.textContent?.trim() ?? '');
}

describe('SvgeHistoryPanel (D-093)', () => {
  it('shows only the Open baseline when history is empty', () => {
    const { fixture } = setup();
    expect(labels(fixture)).toEqual(['Open']);
    expect(rows(fixture)[0]!.classList.contains('current')).toBe(true);
  });

  it('renders one row per command, with the latest applied as current', () => {
    const { fixture, history } = setup();
    history.push(fakeCommand('Insert rectangle'));
    history.push(fakeCommand('Move'));
    fixture.detectChanges();

    expect(labels(fixture)).toEqual(['Open', 'Insert rectangle', 'Move']);
    const rs = rows(fixture);
    expect(rs[2]!.classList.contains('current')).toBe(true);
    expect(rs[0]!.classList.contains('current')).toBe(false);
  });

  it('shows the redo branch as dimmed future rows after an undo', () => {
    const { fixture, history } = setup();
    history.push(fakeCommand('A'));
    history.push(fakeCommand('B'));
    history.commitUndo(); // B moves to the redo stack — a "future" state
    fixture.detectChanges();

    expect(labels(fixture)).toEqual(['Open', 'A', 'B']);
    const rs = rows(fixture);
    expect(rs[1]!.classList.contains('current')).toBe(true); // A is the current state
    expect(rs[2]!.classList.contains('future')).toBe(true); // B is the redo branch
  });

  it('time-travels via CommandBus.goto when a row is clicked', () => {
    const { fixture, history, bus } = setup();
    history.push(fakeCommand('A'));
    history.push(fakeCommand('B'));
    fixture.detectChanges();

    const spy = vi.spyOn(bus, 'goto').mockImplementation(() => 0);
    rows(fixture)[0]!.click(); // "Open" baseline → depth 0
    expect(spy).toHaveBeenCalledWith(0);
    rows(fixture)[1]!.click(); // "A" → depth 1
    expect(spy).toHaveBeenCalledWith(1);
  });
});
