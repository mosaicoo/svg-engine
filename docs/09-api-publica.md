# 09 — Public API

## What this document is

A guide to the public surface: which entry point to reach for, what the central
types and services are for, and which contracts a third party implements to
extend the editor.

It is deliberately **not** an exhaustive list of exports. That list is generated
and machine-checked (see [The guard-rail](#the-guard-rail)) and currently holds
well over a thousand symbols. A hand-maintained copy of it would only drift.
For the complete surface read the snapshot or the shipped `.d.ts` declarations;
to understand what to use, read this.

## Versioning and stability

The public API is everything each entry point exports. Anything not exported
from an entry point is internal and may change in any release, even when a type
makes it reachable.

While the package is in `0.x`, breaking changes ship as a minor bump and are
recorded in the changelog; patch releases never change the public API. Full
Semantic Versioning guarantees begin at `1.0.0`.

## Entry points

Nine secondary entry points. Importing one does not pull in the others.

| Entry point         | Reach for it when you need                             | Angular Material |
| ------------------- | ------------------------------------------------------ | ---------------- |
| `core`              | The document model, commands, history and editor state | no               |
| `render`            | To draw a document                                     | no               |
| `io`                | To import, export or generate code from a document     | no               |
| `optimize`          | To shrink or clean a document                          | no               |
| `edit`              | Interaction: tools, selection, gestures, plugins       | no               |
| `ui`                | Ready-made panels, dialogs and shells                  | **yes**          |
| `ai/nlu`            | To resolve natural-language commands                   | no               |
| `ai/nlu-ui`         | A ready-made input for those commands                  | **yes**          |
| `ai/nlu-voice-wasm` | Speech recognition running in the browser              | no               |

### `core` — the model and the engine

The document is an immutable tree: every mutation produces a new one, which is
what makes history cheap.

| Symbol                                                                   | Purpose                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `SvgDocument`                                                            | A document: viewBox, root group, optional defs, export preferences |
| `SvgNode`                                                                | Discriminated union of the ten node types                          |
| `createRect`, `createEllipse`, `createPath`, `createText`, `createGroup` | Build nodes without writing literals by hand                       |
| `createEmptyDocument`                                                    | A document to start from                                           |
| `Command`                                                                | The contract every mutation implements                             |
| `CommandBus`                                                             | Dispatches commands and routes them through history                |
| `HistoryService`                                                         | Undo and redo                                                      |
| `EditorStateService`                                                     | Holds the current document as a signal                             |

Mutating a document means dispatching a command, never writing to the tree.
That is what gives undo and redo for free.

### `render` — drawing

| Symbol                 | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `SvgeRenderer`         | The canvas component: give it a document, it paints it |
| `ViewportService`      | Pan, zoom and the coordinate conversions around them   |
| `NodeRendererRegistry` | Replace how any node type is drawn                     |

`SvgeRenderer` is read-only on its own. Interaction comes from directives in
`edit` applied to it, which keeps rendering usable without the editor.

### `io` — import, export, code generation

| Symbol                                                             | Purpose                                          |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| `svgImporter`                                                      | Parses SVG into a document, sanitizing the input |
| `svgExporter`                                                      | Serializes a document back to SVG                |
| `pngExporter`, `svgzExporter`                                      | Raster and compressed output                     |
| `reactJsxGenerator`, `reactComponentGenerator`, `dataUriGenerator` | Turn a document into code                        |
| `Importer`, `Exporter`, `CodeGenerator`                            | Implement one to add your own format             |
| `ImporterRegistry`, `ExporterRegistry`, `CodeGeneratorRegistry`    | Register it                                      |

### `optimize` — shrinking and cleaning

| Symbol                                                                     | Purpose                                   |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `Optimizer`                                                                | The contract a pass implements            |
| `OptimizerRegistry`                                                        | Register passes and run the pipeline      |
| `OptimizeCommand`                                                          | Run the pipeline as one undoable step     |
| `precisionOptimizer`, `dropDefaultsOptimizer`, `pruneEmptyGroupsOptimizer` | Conservative passes, on by default        |
| `stripAuthoredTitlesOptimizer`, `stripAuthoredIdsOptimizer`                | Opt-in passes that drop authored metadata |

The default passes never change what a document renders.

### `edit` — interaction and extension

The largest entry point, and the one a consumer extends.

| Symbol                             | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `SelectionService`                 | What is selected, and how selection changes            |
| `LayersService`                    | Layer visibility, locking and ordering                 |
| `WorkspaceService`                 | Pages, grid, guides and workspace settings             |
| `Tool`                             | The contract an interactive tool implements            |
| `EditorPlugin`, `PluginContext`    | The plugin contract, and what a plugin receives        |
| `PluginManagerService`             | Enable, disable and uninstall plugins at runtime       |
| `provideSvgEngineEditorBuiltins()` | Install the built-in editor in one call                |
| `provideSvgEngineEditorScope()`    | Scope editor state so several editors can coexist      |
| `provideSvgEnginePlugin()`         | Register your own plugin                               |
| `providePluginLoader()`            | Supply the module loader for externally hosted plugins |

### `ui` — the ready-made interface

| Symbol                                                              | Purpose                                           |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `SvgeShellPro`                                                      | A complete editor, dropped in as one component    |
| `SvgeEditor`                                                        | A configurable editor: individual parts on or off |
| `SvgeToolbar`, `SvgeInspector`, `SvgePluginManager`, `SvgeTimeline` | Individual panels, when composing your own layout |

Everything here renders Angular Material, so the host application must provide
a Material theme.

### `ai/nlu`, `ai/nlu-ui`, `ai/nlu-voice-wasm`

| Symbol                   | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `NaturalLanguageService` | Resolves a phrase into an editor action |
| `builtinNluPlugin`       | The built-in rule-based intents         |

Resolution is rule-based, with optional escalation to a language model that the
host configures. Speech recognition runs locally in the browser.

## Extension contracts

These are the interfaces a third party implements. They are the part of the API
most worth keeping stable, and the plugin system is built on them.

| Contract                | Registered through                      | Adds                                |
| ----------------------- | --------------------------------------- | ----------------------------------- |
| `EditorPlugin`          | `provideSvgEnginePlugin()`              | Anything: a plugin bundles the rest |
| `Tool`                  | `ToolRegistry`                          | An interactive tool                 |
| `Importer` / `Exporter` | `ImporterRegistry` / `ExporterRegistry` | A file format                       |
| `CodeGenerator`         | `CodeGeneratorRegistry`                 | A code output format                |
| `Optimizer`             | `OptimizerRegistry`                     | An optimization pass                |

The editor's own features are built on these same registries, so a plugin
reaches exactly what the built-ins reach.

Other registries available through `PluginContext`: `EffectRegistry`,
`LibraryRegistry`, `PaletteRegistry`, `MenuContributionRegistry`,
`ShortcutRegistry`, `AssetExportRegistry`.

## What is not part of the public contract

Not everything reachable is a promise. Three things sit outside the stable
surface on purpose:

- **Not exported.** Internals used within a single entry point. They cannot be
  imported and carry no guarantee.
- **Marked `@internal`.** Exported only because one entry point needs them from
  another. They appear in the type declarations, but they are plumbing.
- **Built-in presets.** The specific shapes, palettes, brushes and effects that
  ship. The registries holding them are contract; the presets are content and
  may change.

## The guard-rail

Every entry point's exported surface is recorded in
`projects/svg-engine/api-surface/public-api.snapshot.json` and compared on every
test run. An export that appears, disappears or is renamed fails the suite until
the snapshot is regenerated deliberately:

    UPDATE_API_SNAPSHOT=1 npm run test:lib

The diff is then reviewed like any other change. This is why an API change is
always intentional, and why this document does not list the surface by hand.

## See also

- [01 — Overview](01-visao-geral.md)
- [02 — Architecture](02-arquitetura.md)
- [10 — Plugin author guide](10-guia-plugin.md)

Usage documentation, with examples, is published at
<https://mosaicoo.github.io/svgengine-site>.
