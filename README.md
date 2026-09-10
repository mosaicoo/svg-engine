<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="projects/svg-engine/brand/svg-engine-logo-dark.svg">
    <img alt="SVGEngine" src="projects/svg-engine/brand/svg-engine-logo.svg" width="360">
  </picture>
</p>

# SVGEngine

An embeddable, headless-first SVG editor built on Angular v21 signals.
**Nine** lazy-loaded entry points let you pick **exactly** what you need —
from a ~30 kB read-only viewer to a full Material-styled editor with path
editing, boolean operations, pages/artboards, effects, libraries and an
optional AI/natural-language command layer.

> Published as [`@mosaicoo/svg-engine`](https://www.npmjs.com/package/@mosaicoo/svg-engine)
> under **Apache-2.0**. **3012 specs across 227 files** pass on every change
> (Vitest, 1 skipped). See [Project status](#project-status).
>
> The editor covers a professional feature set:
>
> - **Drawing**: Select/Direct-Select, Pen, Pencil, Rectangle/Ellipse/
>   Polygon (+ star), Text (rich-text runs, variable fonts, text-on-path),
>   Eyedropper, Knife, Smooth, Gradient, Width, Symbol Sprayer
> - **Geometry**: Path/Anchor editor (cusp/smooth/symmetric) + Pathfinder
>   boolean ops (Union/Intersect/Subtract/Exclude/Divide) + Path ops
>   (Simplify/Split/Join/Reverse/Outline Stroke/Offset) + Live Corners +
>   compound paths
> - **Document**: Pages/artboards, Layers, Smart Objects, Symbols/instances,
>   version Snapshots, auto-save + recovery
> - **Style**: non-destructive Effects/filters (chainable), gradients
>   (inline editor), patterns, a Libraries system (shapes / palettes /
>   gradients / patterns / symbols / brushes / graphic-styles / templates)
> - **Productivity**: Find & Replace, Align/Distribute, customizable
>   keyboard shortcuts, Auto-trace (raster→vector), Code Generators
>   (React/Data-URI), per-asset Export, animation Timeline
> - **AI (opt-in)**: natural-language command input + voice (on-device
>   Whisper via `@huggingface/transformers`)
> - **Accessibility**: ARIA + keyboard nav across every overlay/panel
> - **Performance**: opt-in viewport culling; 60 fps pan/zoom at 1k+ nodes

---

## Design

SVGEngine is a plugin-extensible editor core: the model, rendering, editing
services and the Material UI are **separate entry points**, so an application
composes only what it needs.

### Architectural guarantees

- **Headless boundary**: `@mosaicoo/svg-engine/core`, `render`, and `edit`
  have **zero dependency on `@angular/material` or `@angular/cdk`**. The
  Material UI lives only in `@mosaicoo/svg-engine/ui`, which is opt-in.
- **Immutable model**: every mutation produces a new tree (structural
  sharing). Undo is a snapshot + replay, not a delta system.
- **Signal-first**: all reactive state is `signal` / `computed`. No
  Subjects in the public API.
- **Command pattern**: every mutation goes through `CommandBus` which
  routes through `HistoryService` — automatic undo for free.
- **OnPush everywhere**: every component in the library is
  `ChangeDetectionStrategy.OnPush`. CD audit is part of CI discipline.

---

## Install

```bash
npm install @mosaicoo/svg-engine @angular/core@^21
```

Optional UI peer dependencies (only when consuming `@mosaicoo/svg-engine/ui`):

```bash
npm install @angular/material@^21 @angular/cdk@^21
```

---

## 30-second quickstart — read-only viewer

```ts
import { Component } from '@angular/core';
import { SvgeRenderer } from '@mosaicoo/svg-engine/render';
import { createRect, createGroup, type SvgDocument } from '@mosaicoo/svg-engine/core';

@Component({
  standalone: true,
  imports: [SvgeRenderer],
  template: ` <svge-renderer [tree]="doc.root" [viewBox]="doc.viewBox" /> `,
})
export class MyViewer {
  protected readonly doc: SvgDocument = {
    id: 'demo' as never,
    viewBox: { x: 0, y: 0, width: 200, height: 100 },
    root: createGroup([
      createRect({ x: 10, y: 10, width: 80, height: 60 }, { style: { fill: '#90caf9' } }),
    ]),
  };
}
```

That's the full surface for read-only rendering. ~30 kB bundle, no
Material, no editing services loaded.

---

## 1-minute customize — add an SVG file picker

Drop in the IO plugin and use the registry:

```ts
// app.config.ts
import { provideSvgEnginePlugin, builtinIoPlugin } from '@mosaicoo/svg-engine/edit';
providers: [provideSvgEnginePlugin(builtinIoPlugin)];

// any component
private readonly importers = inject(ImporterRegistry);
async loadFile(file: File) {
  const importer = this.importers.byMediaType('image/svg+xml');
  const result = importer?.import(await file.text());
  if (result?.ok) this.state.resetDocument(result.document);
}
```

Sanitization (`<script>` / `on*` handlers / `javascript:` hrefs all
dropped) is automatic. `<defs>`/`<clipPath>` round-trip as opaque
fragments so gradients and clip-paths survive save → load.

---

## Full editor shell

For the Material-styled drop-in editor:

```ts
import { SvgeEditor } from '@mosaicoo/svg-engine/ui';

// template
<svge-editor [title]="'My drawing'">
  <svg:g svgeSelectionOverlay></svg:g>
  <svg:g svgeRotationPivot></svg:g>
  <svg:g svgeMarquee></svg:g>
  <svg:g svgeSnapGuides></svg:g>
</svge-editor>;
```

Composes the toolbar (undo/redo/zoom/reset), background, renderer, and
projects the overlays as `<ng-content>` so you stay in control of which
gestures are enabled.

See `projects/playground/src/app/pages/shell-demo/` for a working
example.

---

## Entry points at a glance

| Package                                  | What's in it                                                                                                                                                                       | Material? |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `@mosaicoo/svg-engine/core`              | model, commands (incl. anchor + pathfinder), history, state, geometry, tree ops, `Disposable`, transform parser                                                                    | ❌        |
| `@mosaicoo/svg-engine/render`            | `<svge-renderer>`, per-type directives, viewport, node-renderer registry                                                                                                           | ❌        |
| `@mosaicoo/svg-engine/io`                | `Importer`/`Exporter` registries + types, `svgImporter`, `svgExporter`, `pngExporter`, `renderPng`                                                                                 | ❌        |
| `@mosaicoo/svg-engine/optimize`          | `Optimizer` type + `OptimizerRegistry`, 3 built-in passes (precision/dropDefaults/pruneEmptyGroups), `OptimizeCommand`                                                             | ❌        |
| `@mosaicoo/svg-engine/edit`              | selection, transform, marquee, snap, alignment, anchor editor, pathfinder, pages, animation, snapshots, effects, libraries, autotrace, tools, plugin scaffolding, viewport culling | ❌        |
| `@mosaicoo/svg-engine/ui`                | `<svge-editor>`/`<svge-shell-pro>`, layers panel, inspector, toolbar, status bar, rulers, palette, color picker, dialogs, theme toggle                                             | ✅        |
| `@mosaicoo/svg-engine/ai/nlu`            | Natural-language command engine (intents, dictionaries PT/EN, fuzzy match, slot extraction); headless                                                                              | ❌        |
| `@mosaicoo/svg-engine/ai/nlu-ui`         | `<svge-nlu-input>` — text/voice command box bound to the NLU engine                                                                                                                | ✅        |
| `@mosaicoo/svg-engine/ai/nlu-voice-wasm` | On-device speech-to-text provider (Whisper via `@huggingface/transformers`)                                                                                                        | ❌        |
| `playground` (app)                       | reference consumer + `/perf` benchmark harness                                                                                                                                     | ✅        |

Each entry point is independently lazy-loadable. Consuming `core` does
**not** drag in `render`, `io`, `optimize`, `edit`, `ui`, or `ai/*`. The
`ai/*` trio is fully opt-in — none of the editor depends on it.

> `@mosaicoo/svg-engine/io` and `@mosaicoo/svg-engine/optimize` are dedicated
> entry points, so an application can import, optimize or convert documents
> without pulling the editor in. `@mosaicoo/svg-engine/edit` re-exports their
> public API, so imports through `edit` keep working.

---

## Plugin extensibility

A dozen plugin categories let third parties contribute capabilities
without forking the core:

| #   | Category            | Registry                                        |
| --- | ------------------- | ----------------------------------------------- |
| 1   | Node renderers      | `NodeRendererRegistry`                          |
| 2   | Tools               | `ToolRegistry`                                  |
| 3   | Optimizers          | `OptimizerRegistry`                             |
| 4   | Importers           | `ImporterRegistry`                              |
| 5   | Exporters           | `ExporterRegistry`                              |
| 6   | Effects / filters   | `EffectRegistry`                                |
| 7   | Libraries (assets)  | `LibraryRegistry` (shapes/palettes/gradients/…) |
| 8   | Palettes / swatches | `PaletteRegistry`                               |
| 9   | Menus + shortcuts   | `MenuContributionRegistry` + `ShortcutRegistry` |
| 10  | NLU intents         | `NaturalLanguageService` (auto-discovers menus) |
| 11  | Code generators     | `CodeGeneratorRegistry`                         |
| 12  | Tool options panels | `ToolOptionsRegistry`                           |

Every registry returns `Disposable` so plugin uninstall reverses every
contribution automatically. Detailed walkthrough in
[`docs/10-guia-plugin.md`](docs/10-guia-plugin.md).

---

## Built-in plugins shipped with the library

A non-exhaustive sample of the built-in plugins (see `docs/06`/`docs/09`
for the full list):

| Plugin                                                                                                                                             | Source                        | Purpose                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| `selectToolPlugin`                                                                                                                                 | `@mosaicoo/svg-engine/edit`   | Select + Direct-Select pointer/marquee tools             |
| `pencilToolPlugin` / `penToolPlugin`                                                                                                               | `@mosaicoo/svg-engine/edit`   | Freehand + Bézier path drawing                           |
| `shapeToolsPlugin`                                                                                                                                 | `@mosaicoo/svg-engine/edit`   | Rectangle / Ellipse / Polygon (+ star)                   |
| `textToolPlugin`                                                                                                                                   | `@mosaicoo/svg-engine/edit`   | Inline text editing (rich-text runs)                     |
| `extraToolsPlugin`                                                                                                                                 | `@mosaicoo/svg-engine/edit`   | Eyedropper / Knife / Smooth / Gradient / Width / Sprayer |
| `builtinIoPlugin` / `pngExporterPlugin`                                                                                                            | `@mosaicoo/svg-engine/edit`   | Sanitized SVG import + deterministic SVG/PNG export      |
| `builtinOptimizersPlugin`                                                                                                                          | `@mosaicoo/svg-engine/edit`   | Precision rounding, drop defaults, prune empty groups    |
| `builtinEffectsPlugin`                                                                                                                             | `@mosaicoo/svg-engine/edit`   | Non-destructive, chainable filter effects                |
| `builtinShapesPlugin` / `…GradientsPlugin` / `…PatternsPlugin` / `…SymbolsPlugin` / `…BrushesPlugin` / `…GraphicStylesPlugin` / `…TemplatesPlugin` | `@mosaicoo/svg-engine/edit`   | Library asset families                                   |
| `builtinMenuContributionsPlugin`                                                                                                                   | `@mosaicoo/svg-engine/edit`   | File/Edit/Object/Path/View menu commands + shortcuts     |
| `builtinUiMenuContributionsPlugin`                                                                                                                 | `@mosaicoo/svg-engine/ui`     | UI-only commands (View Source, Trace Image, dialogs)     |
| `builtinNluPlugin`                                                                                                                                 | `@mosaicoo/svg-engine/ai/nlu` | Natural-language shape/style/command intents             |
| `selectionNudgePlugin`                                                                                                                             | `@mosaicoo/svg-engine/edit`   | Arrow-key nudge for keyboard accessibility               |

Provision them at bootstrap:

```ts
providers: [
  provideSvgEnginePlugin(selectToolPlugin),
  provideSvgEnginePlugin(builtinIoPlugin),
  provideSvgEnginePlugin(selectionNudgePlugin),
];
```

---

## Path/Anchor editor & Pathfinder

The Direct Select tool (`A`) reveals each path's anchors as draggable
squares. Three anchor kinds with Illustrator/Affinity-equivalent
behavior:

- **Cusp** — independent handles (sharp corner)
- **Smooth** — handles colinear, different lengths (asymmetric curve)
- **Symmetric** — handles mirrored (perfectly round curve)

```ts
// Programmatic — same commands the UI dispatches
import { CommandBus, ConvertAnchorTypeCommand, MoveAnchorCommand } from '@mosaicoo/svg-engine/core';

bus.dispatch(new MoveAnchorCommand(ref, { x: 100, y: 50 }, 'point'));
bus.dispatch(new ConvertAnchorTypeCommand(ref, 'symmetric'));
```

**Gestures**: pointer-drag moves; Alt+click on a curve segment inserts
an anchor mid-segment; double-click cycles the anchor's kind; Delete
removes selected anchors. Every gesture also has a keyboard
equivalent (arrow keys nudge, Enter cycles, Delete removes) — the
overlay is fully usable without a mouse.

**Pathfinder** (Martinez algorithm via `polygon-clipping`): 5 boolean
ops applied to ≥2 selected shapes. `Divide` returns one path per
non-overlapping region; each region inherits its originating input's
style (intersection slivers fall back to operand A — the top-of-stack
Illustrator convention).

```ts
import { UnionCommand, DivideCommand } from '@mosaicoo/svg-engine/core';
bus.dispatch(new UnionCommand([nodeAId, nodeBId, nodeCId]));
bus.dispatch(new DivideCommand([rectId, circleId])); // each region a separate path
```

---

## Accessibility

Every interactive surface — overlays, panels, handles — implements
the WAI-ARIA Authoring Practices for its role. Highlights:

- **Path editor**: anchor squares and handle knobs have `role="button"`
  - `aria-label="Anchor X of N, <kind> point"` + `aria-pressed` for
    selection + keyboard handlers (arrow keys nudge 1/10 units, Enter
    cycles the kind, Delete removes via the playground handler)
- **Selection handles**: 8 resize anchors with `aria-label="Resize
handle, top-left corner"` etc. + `aria-keyshortcuts` + arrow-key
  handlers that route through the same `startResize/updateResize/
endResize` API as pointer drag. Rotation handle rotates 1° per
  arrow press (15° with Shift)
- **Rotation pivot**: `aria-haspopup="menu"` + `aria-expanded` on the
  crosshair; popover dots are `role="menuitemradio"` + `aria-checked`
  for the active anchor + keyboard-activatable
- **Layers panel**: `role="tree"` with per-row `role="treeitem"` +
  `aria-level` + `aria-expanded` on groups + `aria-label` describing
  state ("layer-name, locked, hidden"). ArrowRight expands, ArrowLeft
  collapses (per Tree pattern §3.16)
- **Guides**: `role="slider"` with `aria-valuemin/valuenow/valuemax`,
  arrow keys move, Delete removes
- **Toolbar / Inspector**: `role="toolbar"` / `role="region"` with
  `aria-label`; `aria-keyshortcuts` propagated from each
  `MenuContribution.shortcut`

Decorative overlays (snap-guides, grid, page outline, marquee,
hover/bbox outlines, handle stems) are marked `aria-hidden="true"`
so screen-readers don't announce hundreds of unnamed graphics.

---

## Performance characteristics

Measured against synthetic documents and real-world Illustrator exports.

Target: **60 fps in pan/zoom at 1k+ nodes** — met with margin:

| Nodes  | Pan/Zoom FPS | Reset → paint |
| ------ | ------------ | ------------- |
| 1 000  | 161          | <50 ms        |
| 2 000  | 114          | 67 ms         |
| 5 000  | 41           | 170 ms        |
| 7 800  | 14 \*        | 223 ms        |
| 16 300 | 22 \*        | 364 ms        |

\* Real Illustrator output with dense fill across the viewport. Beyond
the roadmap target; limited by browser SVG paint cost. Opt-in
viewport culling (`[svgeViewportCulling]` directive) helps sparse docs
significantly; dense docs are bound by what the browser must paint.

Numbers from `/perf` route in the playground (Mulberry32-seeded synth
docs + file picker for real samples).

---

## Development

```bash
npm install
npm run build:lib                  # build the library (ng-packagr, 9 entry points)
npm start                          # serve the playground on :4200
npm run test:lib                   # vitest — ~2950 specs across 223 files
npm run lint                       # eslint + angular-eslint
npm run pack:lib                   # ng-packagr build + npm pack --dry-run
npm run e2e                        # Playwright E2E (auto-starts the playground)
```

### Testing layers

- **Unit + integration** (Vitest, `npm run test:lib`): the fast base of the
  pyramid — ~2950 specs covering model/commands/render/io/edit logic in a
  headless DOM.
- **End-to-end** (Playwright, `npm run e2e`): a thin top layer that drives the
  `playground` in a **real browser** for journeys headless specs can't reach
  (pointer-drag on the canvas, rendering, navigation, keyboard, downloads).
  `playwright.config.ts` auto-starts the dev server; specs live in `e2e/`.
  Run `npx playwright install chromium` once. The E2E suite **adds** coverage
  — it does not replace any Vitest spec.

Project layout follows the standard Angular workspace:

- `projects/svg-engine/{core,render,io,optimize,edit,ui}/` + `ai/{nlu,nlu-ui,nlu-voice-wasm}/` — nine secondary entry points
- `projects/playground/` — reference application (the editor's showcase)
- `projects/svg-studio/` — standalone studio app
- `e2e/` — Playwright end-to-end specs + Page Objects + helpers
- `docs/` — architecture, component catalogue, public API surface, plugin guides

---

## Documentation

The full documentation — guides, usage and API reference — is published in
**English, Portuguese and Spanish** at:

**https://mosaicoo.github.io/svgengine-site**

Other references in this repository:

| Document                                   | Purpose                                                 |
| ------------------------------------------ | ------------------------------------------------------- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)       | Development setup, tests, commit and pull-request rules |
| [`CHANGELOG.md`](CHANGELOG.md)             | Released versions and their changes                     |
| [`SECURITY.md`](SECURITY.md)               | Supported versions and how to report a vulnerability    |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Expected behaviour in the project spaces                |

The `docs/` directory holds design notes on the library itself — architecture,
the component catalogue, the public API surface and the plugin guides. They are
written in Portuguese and aimed at people working on the library rather than at
people integrating it.

The decision log, the change history and the roadmap are maintainer working
material and are not distributed with the repository. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for what the `D-nnn` markers in the
source mean.

---

## Requirements

| Requirement              | Version                                        |
| ------------------------ | ---------------------------------------------- |
| Angular                  | `^21.2.0` (`@angular/common`, `@angular/core`) |
| Angular Material and CDK | `^21.2.0` — only for `@mosaicoo/svg-engine/ui` |
| Node.js                  | 22 (development and build)                     |

`@mosaicoo/svg-engine/ui` renders Angular Material components, so the host
application must provide a Material theme. The remaining entry points have no
UI dependency.

Local speech recognition (`@mosaicoo/svg-engine/ai/nlu-voice-wasm`) additionally
requires `@huggingface/transformers` `^4.2.0`. It is opt-in — nothing else in
the library depends on it.

---

## Project status

SVGEngine is published on npm and used in production applications. It is in the
`0.x` series: the public API is stable in day-to-day use, but exports may still
change between minor versions. Full Semantic Versioning guarantees start at
`1.0.0`. Every entry point's public surface is covered by a snapshot test, so
API changes are always deliberate and visible in review.

---

## Contributing

Contributions are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the
development setup, the checks a change must pass, and the pull-request process.
Participation is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

---

## Security

Do not report vulnerabilities through public issues. [`SECURITY.md`](SECURITY.md)
describes the private reporting process and what is in scope.

---

## Support

- **Bugs and feature requests:** [open an issue](https://github.com/mosaicoo/svg-engine/issues/new/choose)
- **Documentation:** https://mosaicoo.github.io/svgengine-site

---

## License

[Apache License 2.0](LICENSE) — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
Copyright © 2026 Mosaicoo.
