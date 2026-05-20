/**
 * Anything that needs explicit cleanup. Each `register*()` method on a
 * capability registry (Tool, Optimizer, Importer, Palette, ...) returns
 * a `Disposable` so that the plugin scaffolding's `uninstall` can remove
 * every contribution the plugin made — without the plugin author having
 * to track them manually. Plugins call `ctx.track(d)` to opt into
 * automatic disposal.
 *
 * **Why this lives in `core`** (was previously in `edit/lib/plugin`):
 * the `Disposable` shape is the SHARED contract between registries
 * across multiple entry points — `svg-engine/io` (Importer/Exporter
 * registries), `svg-engine/optimize` (Optimizer registry), and
 * `svg-engine/edit` (Tool, Palette, Menu, Shortcut, etc.) all return
 * `Disposable` from their `register()` methods. Putting it in /core
 * lets every entry point declare its registries' contract without
 * importing from /edit.
 */
export interface Disposable {
  dispose(): void;
}
