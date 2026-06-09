export {
  // comboMatches / parseCombo / ParsedCombo: parsing interno de combos de
  // teclado, consumido só pelo ShortcutService (import relativo). Internos.
  type Shortcut,
  type ShortcutContext,
} from './shortcut';
export { ShortcutRegistry } from './shortcut-registry.service';
export { ShortcutService } from './shortcut.service';
export { builtinEditorShortcutsPlugin } from './builtin-editor-shortcuts.plugin';
