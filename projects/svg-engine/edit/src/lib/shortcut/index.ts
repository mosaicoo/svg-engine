export {
  // parseCombo / comboMatches / ParsedCombo: anunciados na referência pública
  // (09-api-publica.md) como helpers puros de combo — mantidos exportados.
  comboFromEvent,
  comboMatches,
  formatCombo,
  parseCombo,
  type ParsedCombo,
  type Shortcut,
  type ShortcutContext,
  validateCombo,
} from './shortcut';
export { ShortcutRegistry } from './shortcut-registry.service';
export { ShortcutService } from './shortcut.service';
export {
  KeybindingsService,
  type KeybindingOverrides,
  type KeybindingView,
} from './keybindings.service';
export { builtinEditorShortcutsPlugin } from './builtin-editor-shortcuts.plugin';
