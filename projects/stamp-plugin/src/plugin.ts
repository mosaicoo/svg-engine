import { AUTO_PARENT, CommandBus, createEllipse, InsertNodeCommand } from 'svg-engine/core';
import {
  type EditorPlugin,
  PLUGIN_API_VERSION,
  type Tool,
  type ToolContext,
  type ToolPointerEvent,
  ToolRegistry,
} from 'svg-engine/edit';

/**
 * **Fase 3 spike — STAMP como plugin compilado carregado via Native
 * Federation.**
 *
 * Diferente do `mosaicoo-hello` (Fase 2, autônomo), este plugin **importa
 * valores do engine** (`AUTO_PARENT`, `CommandBus`, `createEllipse`,
 * `InsertNodeCommand`, `ToolRegistry`) e registra uma **tool de verdade**.
 * Só funciona se o `svg-engine` + Angular do host forem **compartilhados**
 * (singletons) — senão `ctx.injector.get(ToolRegistry)` resolveria uma
 * classe diferente da do host e quebraria. É exatamente o que o spike
 * prova: o remote é buildado à parte, mas no runtime usa as MESMAS classes
 * do host via federation.
 *
 * Versão enxuta (sem `optionsComponent`/Material): carimba um círculo de
 * raio/cor fixos no ponteiro. O contrato de opções (`<svge-tool-options>`)
 * é featurização à parte, fora do escopo do spike.
 */

const STAMP_TOOL_ID = 'tech.mosaicoo.stamp.tool';

class StampTool implements Tool {
  readonly id = STAMP_TOOL_ID;
  readonly label = 'Stamp (remote)';
  readonly icon = 'radio_button_checked';
  readonly cursor = 'crosshair';
  readonly shortcut = 'k';

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const bus = ctx.injector.get(CommandBus);
    const r = 24;
    const node = createEllipse(
      { cx: event.docPoint.x, cy: event.docPoint.y, rx: r, ry: r },
      { style: { fill: '#4f46e5', stroke: '#222', strokeWidth: 1 } },
    );
    // AUTO_PARENT roteia para a página ativa (D-079) via CommandBus.
    bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
  }
}

const stampPlugin: EditorPlugin = {
  id: 'tech.mosaicoo.stamp',
  name: 'Mosaicoo Stamp (federated remote)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  description: 'Tool de carimbo carregada como remote Native Federation (Fase 3 spike).',
  author: 'Mosaicoo',
  icon: 'radio_button_checked',
  category: 'tool',

  install(ctx) {
    // Prova de que o código remoto rodou usando o engine COMPARTILHADO.
    console.info(
      '[stamp-remote] install() — registrando StampTool via svg-engine compartilhado (Fase 3).',
    );
    ctx.track(ctx.injector.get(ToolRegistry).register(new StampTool()));
  },
};

export default stampPlugin;
