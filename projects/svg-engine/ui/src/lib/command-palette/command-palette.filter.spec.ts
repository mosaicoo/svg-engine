import { describe, expect, it } from 'vitest';
import {
  filterPaletteCommands,
  humanizeMenuSlot,
  type PaletteCommandLike,
  scorePaletteCommand,
} from './command-palette.filter';

describe('scorePaletteCommand', () => {
  it('scores an empty/whitespace query as 0 (match everything)', () => {
    expect(scorePaletteCommand('', { label: 'Group' })).toBe(0);
    expect(scorePaletteCommand('   ', { label: 'Group' })).toBe(0);
  });

  it('ranks exact > prefix > word-prefix > substring (case-insensitive)', () => {
    const exact = scorePaletteCommand('group', { label: 'Group' })!;
    const prefix = scorePaletteCommand('gro', { label: 'Group' })!;
    // 'pa' is NOT a label prefix of "Convert to Path" but the word
    // "Path" starts with it → word-prefix tier.
    const wordPrefix = scorePaletteCommand('pa', { label: 'Convert to Path' })!;
    // 'onv' is a mid-label substring of "Convert" (not a prefix, not a
    // word start) → substring tier.
    const substr = scorePaletteCommand('onv', { label: 'Convert' })!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(substr);
  });

  it('matches against group + keywords at a lower weight than the label', () => {
    const item: PaletteCommandLike = { label: 'Undo', group: 'Edit', keywords: 'Ctrl+Z revert' };
    const labelHit = scorePaletteCommand('und', item)!;
    const groupHit = scorePaletteCommand('edit', item)!;
    const keywordHit = scorePaletteCommand('revert', item)!;
    expect(labelHit).toBeGreaterThan(groupHit);
    expect(groupHit).toBeGreaterThan(0);
    expect(keywordHit).toBeGreaterThan(0);
  });

  it('falls back to a subsequence match for scattered characters', () => {
    // "cpt" is a subsequence of "Command Palette" (C…P…T) but not a substring.
    expect(scorePaletteCommand('cpt', { label: 'Command Palette' })).not.toBeNull();
    expect(scorePaletteCommand('zzz', { label: 'Command Palette' })).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(scorePaletteCommand('xyz', { label: 'Undo', group: 'Edit' })).toBeNull();
  });
});

describe('filterPaletteCommands', () => {
  const cmds: PaletteCommandLike[] = [
    { label: 'Undo', group: 'Edit' },
    { label: 'Redo', group: 'Edit' },
    { label: 'Group', group: 'Object' },
    { label: 'Ungroup', group: 'Object' },
    { label: 'Convert to Path', group: 'Path' },
  ];

  it('returns all items unchanged for an empty query (registry order)', () => {
    expect(filterPaletteCommands(cmds, '')).toEqual(cmds);
    expect(filterPaletteCommands(cmds, '   ')).toEqual(cmds);
  });

  it('filters out non-matches', () => {
    const out = filterPaletteCommands(cmds, 'group');
    expect(out.map((c) => c.label)).toEqual(['Group', 'Ungroup']);
  });

  it('ranks the exact/prefix match ahead of the substring match', () => {
    // "Group" (exact) must come before "Ungroup" (substring "group").
    const out = filterPaletteCommands(cmds, 'group');
    expect(out[0]!.label).toBe('Group');
    expect(out[1]!.label).toBe('Ungroup');
  });

  it('is stable for equal scores (keeps input order)', () => {
    // Both "Undo"/"Redo" match "Edit" via group only → same score → input order.
    const out = filterPaletteCommands(cmds, 'edit');
    expect(out.map((c) => c.label)).toEqual(['Undo', 'Redo']);
  });
});

describe('humanizeMenuSlot', () => {
  it('maps canonical menu slots to friendly names', () => {
    expect(humanizeMenuSlot('menu.file')).toBe('File');
    expect(humanizeMenuSlot('menu.object')).toBe('Object');
    expect(humanizeMenuSlot('menu.tools')).toBe('Tools');
  });

  it('title-cases the last segment of an unknown slot', () => {
    expect(humanizeMenuSlot('toolbar.main')).toBe('Main');
    expect(humanizeMenuSlot('context.canvas')).toBe('Canvas');
  });
});
