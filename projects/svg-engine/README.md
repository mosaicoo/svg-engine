<p align="center">
  <img src="https://raw.githubusercontent.com/mosaicoo/svg-engine/main/projects/svg-engine/brand/og.png" alt="SVGEngine" width="640">
</p>

# svg-engine

> Headless-first, plugin-extensible **SVG editor library** for Angular v21+.
> Render, manipulate and optimize SVG inside any Angular app.

[![npm version](https://img.shields.io/npm/v/@mosaicoo/svg-engine.svg)](https://www.npmjs.com/package/@mosaicoo/svg-engine)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Angular](https://img.shields.io/badge/Angular-21%2B-DD0031.svg)](https://angular.dev/)

`@mosaicoo/svg-engine` ships **9 secondary entry points** so you only pay for what
you use. The model + commands + renderer + editor primitives are
**headless** (zero Material / CDK dependency). Material UI panels are
**opt-in** via a separate entry point — keep your bundle lean if you
build your own UI on top. An optional **AI / natural-language** layer
(`ai/nlu`, `ai/nlu-ui`, `ai/nlu-voice-wasm`) is fully separate — nothing
in the editor depends on it.

---

## Three use cases

The library is designed around three discrete workflows (D-016):

| Use case     | Entry points needed                                | Material? |
| ------------ | -------------------------------------------------- | --------- |
| **Render**   | `core` + `render`                                  | ❌        |
| **Optimize** | `core` + `io` + `optimize`                         | ❌        |
| **Edit**     | `core` + `render` + `edit` (+ `ui` if you want it) | optional  |

Each entry point is independently tree-shakeable.

---

## Install

```sh
npm install @mosaicoo/svg-engine
```

### Peer dependencies

The library declares Angular as peer (you bring your own):

```json
{
  "@angular/common": "^21.2.0",
  "@angular/core": "^21.2.0",
  "@angular/material": "^21.2.0",
  "@angular/cdk": "^21.2.0",
  "@huggingface/transformers": "^4.2.0"
}
```

`@angular/material` and `@angular/cdk` are **optional** — only required
if you import from `@mosaicoo/svg-engine/ui`. `@huggingface/transformers` is also
**optional** — only required for `@mosaicoo/svg-engine/ai/nlu-voice-wasm`
(on-device speech-to-text).

`polygon-clipping` is bundled as a regular dependency (used by the
pathfinder boolean operations in `@mosaicoo/svg-engine/core`).

---

## Entry points

| Package                                  | What's inside                                                                                                                                                    | Material? |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `@mosaicoo/svg-engine/core`              | Immutable `SvgDocument` model, 9 node types, commands, undo/redo history, geometry, tree ops, anchor + pathfinder commands                                       | ❌        |
| `@mosaicoo/svg-engine/render`            | `<svge-renderer>`, per-type directives, `ViewportService`, pluggable `NodeRendererRegistry`, `screenToDoc` util                                                  | ❌        |
| `@mosaicoo/svg-engine/io`                | `ImporterRegistry` / `ExporterRegistry` + types, `svgImporter`, `svgExporter`, `pngExporter`, `renderPng`                                                        | ❌        |
| `@mosaicoo/svg-engine/optimize`          | `Optimizer` + `OptimizerRegistry`, 3 built-in passes (precision rounding / drop defaults / prune empty groups), `OptimizeCommand`                                | ❌        |
| `@mosaicoo/svg-engine/edit`              | Selection, transform, marquee, snap, alignment, anchor editor, pathfinder, pages, animation, snapshots, effects, libraries, autotrace, tools, plugin scaffolding | ❌        |
| `@mosaicoo/svg-engine/ui`                | `<svge-editor>` / `<svge-shell-pro>`, layers panel, inspector, toolbar, status bar, color picker, palette, rulers, dialogs, theme toggle                         | ✅        |
| `@mosaicoo/svg-engine/ai/nlu`            | Natural-language command engine (intents, PT/EN dictionaries, fuzzy match); headless                                                                             | ❌        |
| `@mosaicoo/svg-engine/ai/nlu-ui`         | `<svge-nlu-input>` — text/voice command box                                                                                                                      | ✅        |
| `@mosaicoo/svg-engine/ai/nlu-voice-wasm` | On-device speech-to-text (Whisper via `@huggingface/transformers`)                                                                                               | ❌        |

---

## Quick start — render-only viewer

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { SvgeRenderer } from '@mosaicoo/svg-engine/render';
import { createRect, createGroup, type SvgDocument } from '@mosaicoo/svg-engine/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SvgeRenderer],
  template: `<svge-renderer [tree]="doc.root" [viewBox]="doc.viewBox" />`,
})
class App {
  doc: SvgDocument = {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(
      [createRect({ x: 10, y: 10, width: 80, height: 80 }, { style: { fill: '#1976d2' } })],
      { id: 'root' as never },
    ),
  };
}

bootstrapApplication(App);
```

## Quick start — full editor (drop-in shell)

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Component } from '@angular/core';
import {
  Marquee,
  RotationPivot,
  SelectionOverlay,
  SnapGuides,
  provideSvgEnginePlugin,
  selectToolPlugin,
} from '@mosaicoo/svg-engine/edit';
import { SvgeEditor } from '@mosaicoo/svg-engine/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SvgeEditor, SelectionOverlay, RotationPivot, Marquee, SnapGuides],
  template: `
    <svge-editor title="My editor">
      <svg:g svgeSelectionOverlay></svg:g>
      <svg:g svgeRotationPivot></svg:g>
      <svg:g svgeMarquee></svg:g>
      <svg:g svgeSnapGuides></svg:g>
    </svge-editor>
  `,
})
class App {}

bootstrapApplication(App, {
  providers: [provideAnimationsAsync(), provideSvgEnginePlugin(selectToolPlugin)],
});
```

## Quick start — optimize SVG without the editor

```ts
import { TestBed } from '@angular/core/testing';
import {
  builtinOptimizersPlugin,
  OptimizeCommand,
  OptimizerRegistry,
} from '@mosaicoo/svg-engine/optimize';
import { svgImporter, svgExporter } from '@mosaicoo/svg-engine/io';
import { CommandBus, EditorStateService } from '@mosaicoo/svg-engine/core';

const state = TestBed.inject(EditorStateService);
const reg = TestBed.inject(OptimizerRegistry);
const bus = TestBed.inject(CommandBus);

// 1. Import
const result = svgImporter.import(rawSvgString);
if (!result.ok) throw new Error(result.error);
state.setDocument(result.document);

// 2. Run conservative optimizations (precision / drop defaults / prune empty groups)
bus.dispatch(new OptimizeCommand(reg));

// 3. Export — deterministic, byte-stable output
const optimizedSvg = svgExporter.export(state.document());
```

---

## Plugin extensibility (D-020 / D-023)

Plugins are first-class. The library ships 9 contribution categories
already plumbed (tools, importers, exporters, optimizers, palettes,
menu items, shortcuts, renderers, effects). Your plugin implements the
`EditorPlugin` interface and gets installed via DI:

```ts
import type { EditorPlugin } from '@mosaicoo/svg-engine/edit';
import { ToolRegistry, PLUGIN_API_VERSION } from '@mosaicoo/svg-engine/edit';

export const myPlugin: EditorPlugin = {
  id: 'com.acme.tools.lasso',
  name: 'Lasso Tool',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const tools = ctx.injector.get(ToolRegistry);
    ctx.track(
      tools.register({
        id: 'com.acme.lasso',
        label: 'Lasso',
        shortcut: 'L',
        onPointerDown(e) {
          /* ... */
        },
        onPointerMove(e) {
          /* ... */
        },
        onPointerUp(e) {
          /* ... */
        },
      }),
    );
  },
};

// In your app config:
// providers: [provideSvgEnginePlugin(myPlugin)]
```

See `docs/10-guia-plugin.md` in the repository for end-to-end recipes.

---

## Status

- **Version**: `0.1.0` — pre-1.0; APIs may have **documented** breaking
  changes on minor bumps. SemVer-stable from `1.0.0`.
- **Test coverage**: ~2950 specs across 223 files (Vitest).
- **Browser support**: modern evergreens (Chrome, Edge, Firefox,
  Safari 15+). Polyfills not required as of 2026 baseline.

---

## Documentation

The full design documentation, decision log and component catalog live
in the repository under [`docs/`](https://github.com/mosaicoo/svg-engine/tree/main/docs):

- `01-visao-geral.md` — vision & three use cases
- `02-arquitetura.md` — runtime architecture
- `04-decisoes-tecnicas.md` — every architectural decision with rationale
- `06-componentes-editor-svg.md` — component catalog per entry point
- `09-api-publica.md` — full public API surface
- `10-guia-plugin.md` — plugin authoring guide

---

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) — see
[LICENSE](https://github.com/mosaicoo/svg-engine/blob/main/LICENSE) and
[NOTICE](https://github.com/mosaicoo/svg-engine/blob/main/NOTICE).

Copyright © 2026 Mosaicoo.
