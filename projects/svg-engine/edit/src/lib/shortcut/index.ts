export {
  // parseCombo / comboMatches / ParsedCombo: anunciados na referência pública
  // (09-api-publica.md) como helpers puros de combo — mantidos exportados.
  comboMatches,
  parseCombo,
  type ParsedCombo,
  type Shortcut,
  type ShortcutContext,
} from './shortcut';
export { ShortcutRegistry } from './shortcut-registry.service';
export { ShortcutService } from './shortcut.service';
export { builtinEditorShortcutsPlugin } from './builtin-editor-shortcuts.plugin';
