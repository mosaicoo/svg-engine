# SVGEngine

An embeddable, headless-first SVG editor built on Angular v21 signals.
Four lazy-loaded entry points let you pick **exactly** what you need —
from a 30 kB read-only viewer to a full Material-styled editor with
path editing, boolean operations, and full keyboard accessibility.

> **Status**: pre-`1.0` (APIs hardening across Fase 6). Build is green,
> **884 tests passing across 65 spec files**. Public surface is
> documented in [`docs/09-api-publica.md`](docs/09-api-publica.md);
> changes recorded in
> [`docs/08-historico-de-alteracoes.md`](docs/08-historico-de-alteracoes.md).
>
> Latest milestones:
>
> - **Fase 6c** (acessibilidade): ARIA + keyboard nav completos em
>   overlays e panels (anchor editor, resize/rotation handles, pivot
>   picker, layers tree, guides, rulers)
> - **Bloco 6-PathEditor**: Path/Anchor Point editor (cusp/smooth/
>   symmetric cycle) + Pathfinder boolean ops (Union, Intersect,
>   Subtract, Exclude, Divide)
> - **Bloco 6b**: viewport culling opt-in; meta 60fps@1k atingida
>   (1k=161fps, 2k=114fps, 5k=41fps)

---

## Why another SVG editor?

Most existing libraries either:

- **Ship as a black-box widget** (you embed it as-is, hard to extend, drags
  its own UI stack), or
- **Ship as a pure parser/serializer** (no editing, no rendering, no UX).

SVGEngine sits in the middle: a **plugin-extensible editor core** (D-020,
D-023) where the model, rendering, editing services and Material UI are
**separate entry points**. You compose only what your app needs.

### Architectural guarantees (the hard rules)

- **Headless boundary (D-017)**: `svg-engine/core`, `render`, and `edit`
  have **zero dependency on `@angular/material` or `@angular/cdk`**. The
  Material UI lives only in `svg-engine/ui`, which is opt-in.
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
npm install svg-engine @angular/core@^21
```

Optional UI peer dependencies (only when consuming `svg-engine/ui`):

```bash
npm install @angular/material@^21 @angular/cdk@^21
```

---

## 30-second quickstart — read-only viewer

```ts
import { Component } from '@angular/core';
import { SvgeRenderer } from 'svg-engine/render';
import { createRect, createGroup, type SvgDocument } from 'svg-engine/core';

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
import { provideSvgEnginePlugin, builtinIoPlugin } from 'svg-engine/edit';
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
import { SvgeEditor } from 'svg-engine/ui';

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

| Package             | What's in it                                                                                                                            | Material? |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `svg-engine/core`   | model, commands (incl. anchor + pathfinder), history, state, geometry, tree ops                                                         | ❌        |
| `svg-engine/render` | `<svge-renderer>`, per-type directives, viewport, node-renderer registry                                                                | ❌        |
| `svg-engine/edit`   | selection, transform, marquee, snap, alignment, anchor editor, pathfinder UI, plugin scaffolding, tools, IO, optimize, viewport culling | ❌        |
| `svg-engine/ui`     | `<svge-editor>`, layers panel, inspector, toolbar, rulers, palette, theme toggle                                                        | ✅        |
| `playground` (app)  | reference consumer + `/perf` benchmark harness                                                                                          | ✅        |

Each entry point is independently lazy-loadable. Consuming `core` does
**not** drag in `render`, `edit`, or `ui`.

---

## Plugin extensibility (D-020, D-023)

Nine plugin categories let third parties contribute capabilities without
forking the core:

| #   | Category            | Registry                                        |
| --- | ------------------- | ----------------------------------------------- |
| 1   | Node renderers      | `NodeRendererRegistry`                          |
| 2   | Tools               | `ToolRegistry`                                  |
| 3   | Optimizers          | `OptimizerRegistry`                             |
| 4   | Importers           | `ImporterRegistry`                              |
| 5   | Exporters           | `ExporterRegistry`                              |
| 6   | Inspector panels    | `InspectorPanelRegistry` _(planned)_            |
| 7   | Effects / filters   | `EffectRegistry` _(planned)_                    |
| 8   | Palettes / swatches | `PaletteRegistry`                               |
| 9   | Menus + shortcuts   | `MenuContributionRegistry` + `ShortcutRegistry` |

Every registry returns `Disposable` so plugin uninstall reverses every
contribution automatically. Detailed walkthrough in
[`docs/10-guia-plugin.md`](docs/10-guia-plugin.md).

---

## Built-in plugins shipped with the library

| Plugin                    | Source            | Purpose                                                |
| ------------------------- | ----------------- | ------------------------------------------------------ |
| `selectToolPlugin`        | `svg-engine/edit` | Default pointer/marquee selection                      |
| `pencilToolPlugin`        | `svg-engine/edit` | Freehand path drawing                                  |
| `builtinIoPlugin`         | `svg-engine/edit` | SVG import (sanitized) + deterministic export          |
| `pngExporterPlugin`       | `svg-engine/edit` | Canvas-based PNG export (binary/async)                 |
| `builtinOptimizersPlugin` | `svg-engine/edit` | Precision rounding, drop defaults, prune empty groups  |
| `builtinPalettesPlugin`   | `svg-engine/edit` | Default greys, Material primary, Tailwind pastels      |
| `selectionNudgePlugin`    | `svg-engine/edit` | Arrow-key nudge for keyboard accessibility (Fase 6c-2) |

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
import { CommandBus, ConvertAnchorTypeCommand, MoveAnchorCommand } from 'svg-engine/core';

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
import { UnionCommand, DivideCommand } from 'svg-engine/core';
bus.dispatch(new UnionCommand([nodeAId, nodeBId, nodeCId]));
bus.dispatch(new DivideCommand([rectId, circleId])); // each region a separate path
```

---

## Accessibility (Fase 6c)

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

Measured against synthetic + real Illustrator output (see
[`docs/08-historico-de-alteracoes.md`](docs/08-historico-de-alteracoes.md)
2026-05-18 entry for the full tables).

Roadmap meta: **60 fps in pan/zoom at 1k+ nodes** — exceeded with margin:

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
npm run build -- svg-engine        # build the library (ng-packagr)
npm start                          # serve the playground on :4200
npm test                           # vitest, all 60 spec files
npm run lint                       # eslint + angular-eslint
```

Project layout follows the standard Angular workspace:

- `projects/svg-engine/{core,render,edit,ui}/` — five secondary entry points
- `projects/playground/` — reference application
- `docs/` — architecture, decisions, roadmap, history, public API, plugin guide

---

## Documentation map

| File                                                                       | Purpose                              |
| -------------------------------------------------------------------------- | ------------------------------------ |
| [`docs/01-visao-geral.md`](docs/01-visao-geral.md)                         | Vision, scope, non-goals             |
| [`docs/02-arquitetura.md`](docs/02-arquitetura.md)                         | Layering, entry-point structure      |
| [`docs/03-restricoes.md`](docs/03-restricoes.md)                           | Agent operational constraints        |
| [`docs/04-decisoes-tecnicas.md`](docs/04-decisoes-tecnicas.md)             | Numbered ADRs (D-001 … D-031)        |
| [`docs/05-roadmap.md`](docs/05-roadmap.md)                                 | Phase-by-phase delivery plan         |
| [`docs/06-componentes-editor-svg.md`](docs/06-componentes-editor-svg.md)   | Component catalogue                  |
| [`docs/08-historico-de-alteracoes.md`](docs/08-historico-de-alteracoes.md) | Detailed change log                  |
| [`docs/09-api-publica.md`](docs/09-api-publica.md)                         | Public API surface (SemVer contract) |
| [`docs/10-guia-plugin.md`](docs/10-guia-plugin.md)                         | Plugin author guide                  |

---

## License

TBD — to be set before `1.0.0`.
