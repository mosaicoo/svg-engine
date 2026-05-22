/**
 * **Action dictionary — English.**
 *
 * Maps EN verbs (base form + common synonyms) to the canonical token
 * shared with PT. Keep entries minimal and synonyms commonly seen in
 * UI / spoken English; avoid archaic forms.
 *
 * **Key convention**: lowercase, no diacritics. Same canonical as PT
 * (verified by `ActionCanonical` type).
 */
import type { ActionCanonical } from './actions-canonical';

export const ACTION_DICTIONARY_EN: Readonly<Record<string, ActionCanonical>> = Object.freeze({
  // ── create ──────────────────────────────────────────────────
  create: 'create',
  add: 'create',
  draw: 'create',
  insert: 'create',
  put: 'create',
  place: 'create',
  generate: 'create',
  make: 'create',
  new: 'create',
  spawn: 'create',
  build: 'create',

  // ── delete ──────────────────────────────────────────────────
  delete: 'delete',
  remove: 'delete',
  erase: 'delete',
  clear: 'delete',
  eliminate: 'delete',
  destroy: 'delete',
  trash: 'delete',
  discard: 'delete',
  drop: 'delete',

  // ── select ──────────────────────────────────────────────────
  select: 'select',
  mark: 'select',
  choose: 'select',
  pick: 'select',
  focus: 'select',
  highlight: 'select',
  target: 'select',

  // ── select-all ──────────────────────────────────────────────
  all: 'select-all',
  everything: 'select-all',

  // ── deselect ────────────────────────────────────────────────
  deselect: 'deselect',
  unselect: 'deselect',
  unmark: 'deselect',
  unfocus: 'deselect',

  // ── group ───────────────────────────────────────────────────
  group: 'group',
  join: 'group',
  merge: 'group',
  unite: 'group',
  combine: 'group',
  bundle: 'group',

  // ── ungroup ─────────────────────────────────────────────────
  ungroup: 'ungroup',
  separate: 'ungroup',
  split: 'ungroup',
  detach: 'ungroup',
  break: 'ungroup',

  // ── undo ────────────────────────────────────────────────────
  undo: 'undo',
  revert: 'undo',
  rollback: 'undo',
  cancel: 'undo',
  back: 'undo',

  // ── redo ────────────────────────────────────────────────────
  redo: 'redo',
  repeat: 'redo',
  restore: 'redo',
  forward: 'redo',
  reapply: 'redo',

  // ── zoom-in ─────────────────────────────────────────────────
  zoomin: 'zoom-in',
  closer: 'zoom-in',
  magnify: 'zoom-in',
  enlarge: 'zoom-in',

  // ── zoom-out ────────────────────────────────────────────────
  zoomout: 'zoom-out',
  shrink: 'zoom-out',

  // ── zoom-reset ──────────────────────────────────────────────
  zoomreset: 'zoom-reset',
  reset: 'zoom-reset',
  fit: 'zoom-reset',

  // ── clipboard ───────────────────────────────────────────────
  copy: 'copy',
  paste: 'paste',
  cut: 'cut',
  duplicate: 'duplicate',
  clone: 'duplicate',
  dupe: 'duplicate',

  // ── transform ───────────────────────────────────────────────
  move: 'move',
  drag: 'move',
  shift: 'move',
  position: 'move',
  translate: 'move',
  nudge: 'move',
  rotate: 'rotate',
  spin: 'rotate',
  turn: 'rotate',
  twist: 'rotate',
  resize: 'resize',
  scale: 'resize',
  rescale: 'resize',
  adjust: 'resize',
  stretch: 'resize',
  flip: 'flip',
  mirror: 'flip',
  reflect: 'flip',
  reverse: 'flip',

  // ── alignment ───────────────────────────────────────────────
  align: 'align',
  distribute: 'distribute',
  space: 'distribute',
  spread: 'distribute',

  // ── z-order ─────────────────────────────────────────────────
  bring: 'bring-forward',
  raise: 'bring-forward',
  send: 'send-backward',
  lower: 'send-backward',

  // ── visibility ──────────────────────────────────────────────
  show: 'show',
  display: 'show',
  reveal: 'show',
  visible: 'show',
  unhide: 'show',
  hide: 'hide',
  conceal: 'hide',
  invisible: 'hide',
  toggle: 'toggle',
  switch: 'toggle',

  // ── path operations (pathfinder) ─────────────────────────────
  union: 'union',
  unify: 'union',
  weld: 'union',
  fuse: 'union',
  intersect: 'intersect',
  cross: 'intersect',
  subtract: 'subtract',
  minus: 'subtract',
  exclude: 'exclude',
  xor: 'exclude',
  divide: 'divide',
  slice: 'divide',

  // ── conversion ──────────────────────────────────────────────
  convert: 'convert',
  transform: 'convert',
  turninto: 'convert',

  // ── lock ────────────────────────────────────────────────────
  lock: 'lock',
  freeze: 'lock',
  unlock: 'unlock',
  unfreeze: 'unlock',

  // ── export / import ─────────────────────────────────────────
  export: 'export',
  download: 'export',
  save: 'export',
  saveas: 'export',
  import: 'import',
  load: 'import',
  open: 'import',
  upload: 'import',
});
