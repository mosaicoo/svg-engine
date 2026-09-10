# 01 — Overview

## What SVGEngine is

An Angular library for **rendering, manipulating and optimizing SVG**, with a
complete visual editor layer on top. It is published as
[`@mosaicoo/svg-engine`](https://www.npmjs.com/package/@mosaicoo/svg-engine) and
is designed to be embedded inside other applications rather than run as one.

## The engine is the product

The product is the **headless engine** — the entry points that carry no
mandatory UI. The ready-made Material interface (`<svge-shell-pro>` and its
companions) is an opt-in convenience layer that a consumer can replace
entirely.

This shapes the library concretely:

- The headless entry points never import `@angular/material` or
  `@angular/cdk`. That boundary is enforced, not merely intended.
- Performance is measured against the headless engine, not against the shell.
- The API documentation treats the headless surface as the primary contract.
- The dependencies of the headless entry points are kept deliberately small.

## Entry points

The package ships as a single npm package with nine secondary entry points.
Consuming one does not pull in the others.

| Entry point         | What it provides                                                     |
| ------------------- | -------------------------------------------------------------------- |
| `core`              | The document model, commands, history and editor state               |
| `render`            | `<svge-renderer>` and the per-type rendering directives              |
| `io`                | SVG import and export, PNG export, code generators                   |
| `optimize`          | The optimization pipeline and its built-in passes                    |
| `edit`              | Tools, selection, gestures, libraries, effects and the plugin system |
| `ui`                | Material components: panels, dialogs, toolbars and the shells        |
| `ai/nlu`            | Natural-language command resolution                                  |
| `ai/nlu-ui`         | Material input surface for natural-language commands                 |
| `ai/nlu-voice-wasm` | Local speech recognition, running entirely in the browser            |

Only `ui` and `ai/nlu-ui` depend on Angular Material.

## Four ways to consume it

The library is designed so that all four of these work without compromising
each other.

| Approach           | What you import                                             | UI involved                   |
| ------------------ | ----------------------------------------------------------- | ----------------------------- |
| **Headless**       | `core`, `render`, `io`, `optimize`, `edit`                  | None — you build your own     |
| **Complete shell** | `ui` — `<svge-shell-pro>` or `<svge-editor [shell]="true">` | A full editor                 |
| **Partial shell**  | `ui`, choosing individual components                        | Whichever pieces you pick     |
| **Canvas only**    | `render`, optionally `edit` for gestures                    | The canvas, with pan and zoom |

## What the library implements

**Document model.** Ten node types — rectangle, ellipse, line, polygon,
polyline, path, text, image, group and symbol use. The model is immutable:
every mutation produces a new tree with structural sharing.

**Commands and history.** Every mutation goes through a command bus that routes
through the history service, so undo and redo come for free. State is scoped per
editor, so several editors can coexist on a page.

**Rendering.** One component per node type, a viewport service, and a registry
that lets a consumer replace how any node type is drawn.

**Import, export and optimization.** A deterministic SVG importer and exporter,
PNG export at several scales, and an optimization pipeline with built-in passes
that never alter what the document renders.

**Editing.** Drawing and selection tools, a path and anchor editor, boolean
operations, path operations, alignment and distribution, multi-page artboards, a
non-destructive animation timeline, effects, and libraries of shapes, palettes,
gradients, patterns, symbols and brushes.

**Extensibility.** A plugin system covering tools, libraries, effects,
optimizers, importers, exporters, menus, keyboard shortcuts and code
generators. Plugins can be installed at runtime.

**Natural language.** An optional layer that resolves typed or spoken commands
into editor actions, with rule-based resolution and optional escalation to a
language model. Speech recognition can run locally in the browser.

## Applications in this workspace

Neither application is the distributed product.

- `projects/playground/` — a sandbox that demonstrates each way of consuming the
  library, plus a performance harness.
- `projects/svg-studio/` — a standalone editor built on the professional shell.

## Requirements

- **Angular 21** and **Angular Material 21** (Material only for `ui` and
  `ai/nlu-ui`).
- **TypeScript** in `strict` mode.
- SVG is handled through the native SVG DOM with the library's own abstraction
  layer over it.

## Design principles

1. **Headless first** — the model, engine and optimization never depend on a UI
   choice.
2. **Immutable model** — mutations produce new trees; undo is snapshot and
   replay.
3. **Signal-first** — reactive state is expressed with signals and computed
   values, never as subjects in the public API.
4. **Command pattern** — every mutation is a command, which is what makes
   history universal.
5. **Small, focused components** — composition over inheritance.
6. **Strong typing** — `strict`, no `any`, discriminated unions for variants.
7. **A versioned public API** — an explicit surface, guarded by a snapshot test.
8. **Accessibility** — WCAG AA as the minimum across the interface.
9. **Performance and extensibility** as first-class requirements.

## See also

- [02 — Architecture](02-arquitetura.md)
- [06 — Editor components](06-componentes-editor-svg.md)
- [09 — Public API](09-api-publica.md)
- [10 — Plugin author guide](10-guia-plugin.md)
- [12 — Plugin management](12-gerenciamento-de-plugins.md)

Full usage documentation is published at
<https://mosaicoo.github.io/svgengine-site>.
