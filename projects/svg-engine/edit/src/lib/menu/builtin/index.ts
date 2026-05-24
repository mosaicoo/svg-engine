export { builtinMenuContributionsPlugin } from './builtin-menu-contributions.plugin';
// D-052: Insert menu (shapes/text/image) — separate plugin so consumers
// can opt-in/out independently of the general menu-contributions plugin.
export { builtinInsertMenuPlugin } from './builtin-insert-menu.plugin';
// D-054 + D-056: Advanced edit menu items (compound paths + live boolean).
export { builtinAdvancedEditMenuPlugin } from './builtin-advanced-edit-menu.plugin';
