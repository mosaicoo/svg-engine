import { Injectable, signal, type Signal } from '@angular/core';
import type { Disposable } from '@mosaicoo/svg-engine/core';

import type { ActionCanonical } from './dictionaries/actions';
import type { NluShapeKind } from './dictionaries/shapes';

/**
 * **`NluDictionaryRegistry`** — D-046 review-10 (Sprint 2.B / H5).
 *
 * Service injetável que permite consumers ESTENDEREM o vocabulário NLU
 * em runtime, sem editar os arquivos source dos dicts built-in
 * (`colors-*.ts`, `shapes-*.ts`, `actions-*.ts`).
 *
 * **Motivação**: aplicações de domínio (fluxograma, BPMN, UML, mapas)
 * têm vocabulário próprio ("swimlane", "decision", "actor", "use-case").
 * Sem este registry, a única forma de cobrir é editar source ou
 * registrar 20+ intents customizados duplicados.
 *
 * **API**:
 * - `registerColor(name, hex)` — adiciona "vibrant-blue" → "#1e90ff"
 * - `registerShape(name, kind)` — adiciona "actor" → 'circle' alias
 * - `registerAction(word, canonical)` — adiciona "compor" → 'create'
 * - `resolveColor` / `resolveShape` / `resolveAction` — consultam
 *   dinâmico ANTES dos built-in (override permitido)
 *
 * **Multi-editor (D-042)**: singleton root-provided, mas extensions
 * são compartilhadas entre todos os editors. Plugins por-editor
 * podem usar `track(disposable)` pra cleanup.
 *
 * **Estado atual** (Fase 1): este registry é OPCIONAL. O parser
 * (`slot-extractor`, `menu-intent-discovery`) ainda consulta dicts
 * estáticos diretamente. Integração com este registry fica como
 * Sprint futuro (refactor de `resolveColorName` pra usar override
 * dinâmico, etc).
 */
@Injectable({ providedIn: 'root' })
export class NluDictionaryRegistry {
  private readonly _colors = signal<ReadonlyMap<string, string>>(new Map());
  private readonly _shapes = signal<ReadonlyMap<string, NluShapeKind>>(new Map());
  private readonly _actions = signal<ReadonlyMap<string, ActionCanonical>>(new Map());

  /** Snapshot reativo das cores customizadas. */
  readonly colors: Signal<ReadonlyMap<string, string>> = this._colors.asReadonly();
  /** Snapshot reativo das shapes customizadas. */
  readonly shapes: Signal<ReadonlyMap<string, NluShapeKind>> = this._shapes.asReadonly();
  /** Snapshot reativo das actions customizadas. */
  readonly actions: Signal<ReadonlyMap<string, ActionCanonical>> = this._actions.asReadonly();

  /**
   * Adiciona uma entrada de cor customizada. Retorna `Disposable` pra
   * remover (em geral trackeada por plugin via `ctx.track()`).
   *
   * @param name nome normalizado (lowercase, sem acento). Conflitos
   *   com built-in fazem **override** silencioso (consumer tem prioridade).
   * @param hex CSS color (`#rrggbb`, `rgb(...)`, keyword) ou `'none'`/`'transparent'`.
   */
  registerColor(name: string, hex: string): Disposable {
    return this.registerEntry(this._colors, name, hex, 'color');
  }

  /**
   * Adiciona uma entrada de shape customizada (alias semântico).
   *
   * @param name nome normalizado.
   * @param kind {@link NluShapeKind} canonical.
   */
  registerShape(name: string, kind: NluShapeKind): Disposable {
    return this.registerEntry(this._shapes, name, kind, 'shape');
  }

  /**
   * Adiciona uma palavra de ação customizada → canonical existente.
   *
   * @param word palavra normalizada.
   * @param canonical {@link ActionCanonical} existente.
   */
  registerAction(word: string, canonical: ActionCanonical): Disposable {
    return this.registerEntry(this._actions, word, canonical, 'action');
  }

  /**
   * Resolve cor consultando PRIMEIRO o registry dinâmico (consumer
   * tem prioridade), DEPOIS o dict estático built-in. Retorna `null`
   * quando não encontra.
   */
  resolveColor(name: string): string | null {
    return this._colors().get(name) ?? null;
  }

  /** Resolve shape no registry dinâmico (null se não encontrar). */
  resolveShape(name: string): NluShapeKind | null {
    return this._shapes().get(name) ?? null;
  }

  /** Resolve action canonical no registry dinâmico (null se não). */
  resolveAction(word: string): ActionCanonical | null {
    return this._actions().get(word) ?? null;
  }

  /**
   * Helper genérico — registra entrada com validação básica e retorna
   * Disposable. Não-throw em conflito (override silencioso).
   */
  private registerEntry<V>(
    sig: ReturnType<typeof signal<ReadonlyMap<string, V>>>,
    key: string,
    value: V,
    kind: 'color' | 'shape' | 'action',
  ): Disposable {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`NluDictionaryRegistry.register${kind}: key must be non-empty string`);
    }
    const current = sig();
    const next = new Map(current);
    next.set(key, value);
    sig.set(next);
    return {
      dispose: () => {
        const c = sig();
        if (!c.has(key)) return;
        const n = new Map(c);
        n.delete(key);
        sig.set(n);
      },
    };
  }
}
