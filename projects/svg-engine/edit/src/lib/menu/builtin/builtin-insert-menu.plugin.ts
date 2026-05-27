import { type Injector } from '@angular/core';
import {
  CommandBus,
  createEllipse,
  createImage,
  createLine,
  createPath,
  createPolygon,
  createRect,
  createText,
  InsertNodeCommand,
  type Point,
  type SvgNode,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';

import { ActivePageService } from '../../pages/active-page.service';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import { SelectionService } from '../../selection/selection.service';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import type { MenuContributionContext } from '../menu-contribution';
import { MENU_SLOT } from '../menu-slots';

/**
 * **`builtinInsertMenuPlugin`** — **D-052** (Insert menu, padrão de
 * mercado).
 *
 * Popula `MENU_SLOT.INSERT` (`'menu.insert'`) com itens de inserção
 * imediata de shapes/texto/imagem, mirroring the convention shared by
 * Figma, Sketch, PowerPoint, Google Drawings, and Microsoft Word's
 * "Insert" tab.
 *
 * **Estrutura do menu**:
 *
 * ```
 * Insert
 * ├── Shape           ▶
 * │   ├── Rectangle
 * │   ├── Rounded Rectangle
 * │   ├── Ellipse / Circle
 * │   ├── Line
 * │   ├── Triangle
 * │   ├── Polygon (5 sides)
 * │   └── Star (5 points)
 * ├── ─────────────
 * ├── Text
 * └── Image…
 * ```
 *
 * **UX — diferença vs toolbar tools**:
 *
 * - **Toolbar tools** (R, E, Y, etc.) ATIVAM o tool e esperam o user
 *   arrastar no canvas para definir tamanho e posição (Illustrator
 *   convention).
 * - **Insert menu items** dropam um shape de tamanho default
 *   IMEDIATAMENTE no centro do viewport visível (Figma/PowerPoint/
 *   Google convention — "I want a rectangle now, default-sized, here").
 *
 * Ambos co-existem porque servem use cases diferentes: o user que
 * sabe o tamanho exato usa o toolbar tool; o user que só quer
 * adicionar rápido usa o menu Insert.
 *
 * **Posição da inserção**: centro do `ViewportService.viewBox()` —
 * acompanha o pan/zoom atual. Se o user está zoomed-in em um canto,
 * o shape aparece nesse canto (não no canto oposto fora da tela).
 *
 * **Tamanho default**: 25% da menor dimensão da viewBox visível
 * (clamped a `[40, 400]` doc-units). Mantém shapes visíveis
 * independente do nível de zoom — em zoom muito alto vira 40px
 * mínimo (suficiente para ver), em zoom muito baixo vira 400px
 * máximo (não polui a tela).
 *
 * **Estilo**: usa `DEFAULT_STYLE` (fill cinza claro, stroke escuro)
 * — o user troca via Inspector/Color Picker logo após inserir.
 *
 * **Comportamento pós-insert**: dispatch via `InsertNodeCommand`
 * (1 undo entry), depois `SelectionService.select(newId)` para o
 * shape aparecer já selecionado (Inspector mostra propriedades,
 * handles aparecem) — espelha o ShapeTool / TextTool flow.
 *
 * **Headless boundary (D-017)**: zero dependências de Material.
 * Plugin é registrável standalone via
 * `provideSvgEnginePlugin(builtinInsertMenuPlugin)`.
 *
 * **D-042/D-043 multi-editor safety**: handlers usam o `runCtx.injector`
 * fornecido pelo `<svge-menu-bar>` no momento do clique — operam no
 * escopo do editor ativo, não no root. Mesmo pattern do
 * `builtinMenuContributionsPlugin`.
 *
 * **Opt-in**: como o menu-contributions plugin, este NÃO é
 * auto-instalado. Consumers (incluindo o playground) explicitamente
 * provisionam via `provideSvgEnginePlugin(builtinInsertMenuPlugin)`.
 */
export const builtinInsertMenuPlugin: EditorPlugin = {
  id: 'svge.builtin.insert-menu',
  name: 'Built-in Insert menu (shapes/text/image) — D-052',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // ── Parent: Shape ▶ (submenu trigger; has no own run) ──────────
    //
    // Registers as a top-level Insert item with no `run` impact
    // (children → submenu). The label "Shape" stays singular to match
    // Figma / PowerPoint. Icon `category` is the Material 3 glyph
    // closest to "primitive shapes assortment".
    ctx.track(
      reg.register({
        id: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Shape',
        icon: 'category',
        order: 10,
        run() {
          /* submenu parent — children drive actual inserts */
        },
      }),
    );

    // ── Shape submenu children (parentId = 'svge.insert.shape') ────

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.rect',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Rectangle',
        icon: 'rectangle',
        order: 10,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createRect({ x: cx - size / 2, y: cy - size / 2, width: size, height: size }),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.rounded-rect',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Rounded rectangle',
        icon: 'crop_5_4',
        order: 20,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createRect({
              x: cx - size / 2,
              y: cy - size / 2,
              width: size,
              height: size,
              rx: size * 0.12,
              ry: size * 0.12,
            }),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.ellipse',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Ellipse / Circle',
        icon: 'circle',
        order: 30,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createEllipse({ cx, cy, rx: size / 2, ry: size / 2 }),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.line',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Line',
        icon: 'horizontal_rule',
        order: 40,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createLine({ x1: cx - size / 2, y1: cy, x2: cx + size / 2, y2: cy }),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.triangle',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Triangle',
        icon: 'change_history',
        order: 50,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createPolygon(regularPolygonPoints(cx, cy, size / 2, 3, -Math.PI / 2)),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.polygon',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Polygon (5 sides)',
        icon: 'pentagon',
        order: 60,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createPolygon(regularPolygonPoints(cx, cy, size / 2, 5, -Math.PI / 2)),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.shape.star',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Star (5 points)',
        icon: 'star',
        order: 70,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) => createPath(starPathD(cx, cy, size / 2, 5)));
        },
      }),
    );

    // ── Divider + Text + Image (top-level INSERT entries) ──────────

    ctx.track(
      reg.register({
        id: 'svge.insert.divider1',
        slot: MENU_SLOT.INSERT,
        label: '',
        order: 20,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.text',
        slot: MENU_SLOT.INSERT,
        label: 'Text',
        icon: 'text_fields',
        order: 30,
        run(runCtx) {
          insertShape(runCtx, (cx, cy, size) =>
            createText({
              x: cx,
              y: cy,
              content: 'Text',
              // Font-size scales with insertion size so the text is
              // legible at any zoom but not cartoonishly huge in a big
              // viewport. 30% of the size feels right for default-100.
              fontSize: Math.max(12, Math.round(size * 0.3)),
              textAnchor: 'middle',
            }),
          );
        },
      }),
    );

    ctx.track(
      reg.register({
        id: 'svge.insert.image',
        slot: MENU_SLOT.INSERT,
        label: 'Image…',
        icon: 'image',
        order: 40,
        run(runCtx) {
          insertImageViaFilePicker(runCtx);
        },
      }),
    );
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Centralized insert flow: resolves the active editor scope via the
 * dispatching UI's injector (D-042/D-043), computes the viewport
 * center + default size, lets `builder` produce the node, then
 * dispatches `InsertNodeCommand` and selects the result.
 *
 * **Why a single funnel**: every Insert > Shape item shares the same
 * "where to put it" + "single undo entry" + "select after" logic.
 * Centralizing prevents the next contributor from forgetting the
 * select-after step (which would leave the user with an inserted
 * but invisibly-selected shape).
 */
function insertShape(
  runCtx: MenuContributionContext | undefined,
  builder: (centerX: number, centerY: number, size: number) => SvgNode,
): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return; // shouldn't happen — UI always passes ctx

  const { centerX, centerY, size } = computeInsertPosition(injector);
  const node = builder(centerX, centerY, size);
  // PAGES-FIX-2: insert into the active page when one exists.
  const parentId = injector.get(ActivePageService).effectiveDrawTargetId();

  // InsertNodeCommand inserts at the end of root.children (top of the
  // stacking order). That's the expected behaviour for "insert" —
  // new shapes go above existing ones, matching every other vector
  // editor (Illustrator z-order convention).
  injector.get(CommandBus).dispatch(new InsertNodeCommand(parentId, node));
  injector.get(SelectionService).select(node.id);
}

/**
 * Resolve the (centerX, centerY, size) tuple for an insert. Center is
 * the **visible viewport's** center, NOT the document's center —
 * matters when the user is zoomed/panned into a corner. Otherwise the
 * shape would land outside the viewport and the user would have to
 * pan to find it (frustrating UX).
 *
 * Size is 25% of the smaller viewport dimension, clamped to
 * `[40, 400]` doc-units. The clamp prevents two failure modes:
 * - zoom in to 32× → unclamped size = 1px (invisible)
 * - zoom out to 0.05× → unclamped size = 4000px (fills the screen)
 */
function computeInsertPosition(injector: Injector): {
  centerX: number;
  centerY: number;
  size: number;
} {
  const viewport = injector.get(ViewportService);
  const vb = viewport.viewBox();
  const centerX = vb.x + vb.width / 2;
  const centerY = vb.y + vb.height / 2;
  const rawSize = Math.min(vb.width, vb.height) * 0.25;
  const size = Math.max(40, Math.min(400, rawSize));
  return { centerX, centerY, size };
}

/**
 * Browser-native image file picker → InsertNodeCommand with the
 * picked file embedded as a data URI. Mirrors the
 * `importSvgFromFile` pattern in `builtin-menu-contributions.plugin`
 * (no Material dialog → stays in `edit` headless boundary).
 *
 * **Why data URI and not a blob URL / external href**: data URI is
 * self-contained — the document round-trips through export → import
 * with the image intact, no broken external references. The trade-off
 * is document size; users who care about file size can switch to
 * an explicit asset upload later via the Asset Manager.
 *
 * **MIME types accepted**: any `image/*`. The browser's `<input
 * type="file" accept="image/*">` filters via the OS picker.
 */
function insertImageViaFilePicker(runCtx: MenuContributionContext | undefined): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return;
  if (typeof document === 'undefined') return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined || file === null) return;

      const reader = new FileReader();
      reader.onload = (): void => {
        const dataUri = reader.result;
        if (typeof dataUri !== 'string') return;
        // Use the same center+size sizing as shapes, but assume a
        // square placeholder. Real width/height can be inferred from
        // the loaded image's natural dimensions in a follow-up; for
        // now a square keeps the insert deterministic.
        const { centerX, centerY, size } = computeInsertPosition(injector);
        const node = createImage({
          x: centerX - size / 2,
          y: centerY - size / 2,
          width: size,
          height: size,
          href: dataUri,
          preserveAspectRatio: 'xMidYMid meet',
        });
        // PAGES-FIX-2: insert into the active page when one exists.
        const parentId = injector.get(ActivePageService).effectiveDrawTargetId();
        injector.get(CommandBus).dispatch(new InsertNodeCommand(parentId, node));
        injector.get(SelectionService).select(node.id);
      };
      reader.readAsDataURL(file);
    },
    { once: true },
  );
  document.body.appendChild(input);
  input.click();
}

/**
 * Generate vertex points for a regular polygon centered at `(cx, cy)`
 * with `radius` and `sides`. `startAngle` (radians) controls the
 * orientation — `-PI/2` puts the first vertex at the top (12 o'clock),
 * which is the standard upright orientation for triangles/pentagons.
 *
 * Pure function (no Angular dep) — also exported for potential future
 * use by tools / programmatic plugins.
 */
function regularPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startAngle: number,
): readonly Point[] {
  const out: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * 2 * Math.PI) / sides;
    out.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return out;
}

/**
 * Build a star path `d` attribute with `outerRadius` and `points`
 * outer vertices alternating with inner vertices at `outerRadius * 0.4`.
 * The 0.4 ratio matches the conventional "5-pointed star" silhouette
 * (Adobe Star tool default); tuning the ratio gives spikier or
 * chubbier stars.
 */
function starPathD(cx: number, cy: number, outerRadius: number, points: number): string {
  const innerRadius = outerRadius * 0.4;
  const startAngle = -Math.PI / 2;
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const a = startAngle + (i * Math.PI) / points;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}
