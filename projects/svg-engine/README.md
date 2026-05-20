# svg-engine

> Headless-first, plugin-extensible **SVG editor library** for Angular v21+.
> Render, manipulate and optimize SVG inside any Angular app.

[![npm version](https://img.shields.io/npm/v/svg-engine.svg)](https://www.npmjs.com/package/svg-engine)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Angular](https://img.shields.io/badge/Angular-21%2B-DD0031.svg)](https://angular.dev/)

`svg-engine` ships **6 secondary entry points** so you only pay for what
you use. The model + commands + renderer + editor primitives are
**headless** (zero Material / CDK dependency). Material UI panels are
**opt-in** via a separate entry point — keep your bundle lean if you
build your own UI on top.

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
npm install svg-engine
```

### Peer dependencies

The library declares Angular as peer (you bring your own):

```json
{
  "@angular/common": "^21.2.0",
  "@angular/core": "^21.2.0",
  "@angular/material": "^21.2.0",
  "@angular/cdk": "^21.2.0"
}
```

`@angular/material` and `@angular/cdk` are **optional** — only required
if you import from `svg-engine/ui`.

`polygon-clipping` is bundled as a regular dependency (used by the
pathfinder boolean operations in `svg-engine/core`).

---

## Entry points

| Package               | What's inside                                                                                                                     | Material? |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `svg-engine/core`     | Immutable `SvgDocument` model, 9 node types, commands, undo/redo history, geometry, tree ops, anchor + pathfinder commands        | ❌        |
| `svg-engine/render`   | `<svge-renderer>`, per-type directives, `ViewportService`, pluggable `NodeRendererRegistry`, `screenToDoc` util                   | ❌        |
| `svg-engine/io`       | `ImporterRegistry` / `ExporterRegistry` + types, `svgImporter`, `svgExporter`, `pngExporter`, `renderPng`                         | ❌        |
| `svg-engine/optimize` | `Optimizer` + `OptimizerRegistry`, 3 built-in passes (precision rounding / drop defaults / prune empty groups), `OptimizeCommand` | ❌        |
| `svg-engine/edit`     | Selection, transform, marquee, snap, alignment, anchor editor, pathfinder UI, plugin scaffolding, tool registry, pointer helpers  | ❌        |
| `svg-engine/ui`       | `<svge-editor>`, `<svge-layers-panel>`, `<svge-inspector>`, color picker, color palette, rulers, theme toggle, source viewer      | ✅        |

---

## Quick start — render-only viewer

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { SvgeRenderer } from 'svg-engine/render';
import { createRect, createGroup, type SvgDocument } from 'svg-engine/core';

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
} from 'svg-engine/edit';
import { SvgeEditor } from 'svg-engine/ui';

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
import { builtinOptimizersPlugin, OptimizeCommand, OptimizerRegistry } from 'svg-engine/optimize';
import { svgImporter, svgExporter } from 'svg-engine/io';
import { CommandBus, EditorStateService } from 'svg-engine/core';

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
import type { EditorPlugin } from 'svg-engine/edit';
import { ToolRegistry, PLUGIN_API_VERSION } from 'svg-engine/edit';

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
- **Test coverage**: 978+ specs across 72 files (Vitest).
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
