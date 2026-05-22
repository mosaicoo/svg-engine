# Fase 2 (ML) — Integração via `NluScorer`

> D-046 review-10 (Sprint 4). Documento prep para quando consumer decidir
> adicionar ML re-rank ao pipeline NLU.

## Contrato

O contrato é `interface NluScorer` em [`scorer.types.ts`](./scorer.types.ts):

```ts
interface NluScorer {
  readonly id: string;
  score(ctx: NluScoringContext): number;
}

interface NluScoringContext {
  readonly tokens: readonly string[];
  readonly partialScore: number; // score do candidato até este scorer
  readonly candidate: NluCandidate; // intent + slots já extraídos
}
```

## Caminho de migração (futuro)

Hoje o `NaturalLanguageService.parse()` computa scoring **inline** —
sem chamar nenhum `NluScorer`. Quando consumer/Anthropic decidir
implementar ML re-rank, o caminho é:

### Passo 1 — Refactor do service

```ts
// natural-language.service.ts (Fase 2)
@Injectable({ providedIn: 'root' })
export class NaturalLanguageService {
  private scorers: readonly NluScorer[] = []; // default vazio = só inline

  setScorers(scorers: readonly NluScorer[]): void {
    this.scorers = scorers;
  }

  parse(text: string, ctx: NluContext): readonly NluCandidate[] {
    // ... cálculo inline existente até `let score = ...` ...

    // **NOVO**: aplicar scorers extras em cadeia
    for (const scorer of this.scorers) {
      score = scorer.score({ tokens, partialScore: score, candidate });
    }
    score = Math.max(0, Math.min(1, score));

    // ... resto idêntico ...
  }
}
```

### Passo 2 — Entry point `svg-engine/ai/nlu-semantic`

Criar novo entry point seguindo o padrão `ai/nlu-ui`:

```
projects/svg-engine/ai/nlu-semantic/
├── ng-package.json
├── src/
│   ├── public-api.ts
│   └── lib/
│       ├── index.ts
│       ├── semantic-scorer.ts       — implementa NluScorer
│       └── embeddings.service.ts    — wrapper Transformers.js
└── tsconfig.lib.json
```

Adicionar entrada em `angular.json` + `tsconfig.json` paths.

### Passo 3 — `SemanticScorer` implementação

```ts
// nlu-semantic/src/lib/semantic-scorer.ts
import { pipeline } from '@xenova/transformers'; // 22 MB lazy
import type { NluScorer, NluScoringContext } from 'svg-engine/ai/nlu';

export class SemanticScorer implements NluScorer {
  readonly id = 'svge.nlu.scorer.semantic';
  private extractor: Awaited<ReturnType<typeof pipeline>> | null = null;
  private readonly intentEmbeddings = new Map<string, Float32Array>();

  async warmup(): Promise<void> {
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  async embedIntent(intentId: string, description: string): Promise<void> {
    if (this.extractor === null) await this.warmup();
    const emb = await this.extractor!(description, { pooling: 'mean', normalize: true });
    this.intentEmbeddings.set(intentId, emb.data);
  }

  score(ctx: NluScoringContext): number {
    if (this.extractor === null) return ctx.partialScore; // not ready
    const intentEmb = this.intentEmbeddings.get(ctx.candidate.intent.id);
    if (intentEmb === undefined) return ctx.partialScore;
    // Cosine similarity entre input embedding (computado sync ou
    // cacheado upstream) e intent description embedding.
    const sim = this.cosineSimilarity(/* ... */);
    // Boost proporcional à similaridade semântica
    return Math.min(1, ctx.partialScore + 0.15 * sim);
  }

  // ...
}
```

### Passo 4 — Consumer opt-in

```ts
// app.config.ts
import { provideAppInitializer, inject } from '@angular/core';
import { NaturalLanguageService } from 'svg-engine/ai/nlu';
import { SemanticScorer } from 'svg-engine/ai/nlu-semantic';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... outros providers ...
    SemanticScorer,
    provideAppInitializer(async () => {
      const nlu = inject(NaturalLanguageService);
      const scorer = inject(SemanticScorer);
      await scorer.warmup(); // baixa o modelo 22MB
      // Pre-embed descriptions de todos os intents registrados
      for (const intent of nlu.intents()) {
        if (intent.description) {
          await scorer.embedIntent(intent.id, intent.description);
        }
      }
      nlu.setScorers([scorer]);
    }),
  ],
};
```

## Trade-offs

| Aspecto            | Fase 1 (rule-based)        | Fase 2 (semantic scorer)           |
| ------------------ | -------------------------- | ---------------------------------- |
| Bundle             | ~50 KB                     | +22 MB (lazy, cached IndexedDB)    |
| Latência inicial   | ~1ms                       | ~50-200ms (warmup)                 |
| Latência por parse | ~1ms                       | +30-80ms (embedding + sim)         |
| Multilíngue        | PT/EN só                   | universal (MiniLM é multilingual)  |
| Paráfrases         | falha em "faz um quadrado" | resolve por similaridade semântica |
| Offline            | total                      | total após warmup                  |

## Por que NÃO implementamos agora

1. **Custo de dep não-aprovado**: `@xenova/transformers` adiciona ~22MB de
   modelo + ~300KB de runtime. Decisão arquitetural grande.
2. **Sem fixture-set ainda**: Fase 2 só faz sentido quando temos corpus
   de paráfrases reais que falham na Fase 1.
3. **Forward-compat existe**: `NluScorer` interface já está pronta. Quando
   for o momento, integração é localizada (1 service + 1 entry point).

## Critérios de aceite pra adoção

Acionar Fase 2 quando:

- > 20% dos comandos reais falham por paráfrase (medido em produção)
- Consumer está OK com bundle +22MB (apps desktop / PWAs offline)
- Há fixture-set de 50+ paráfrases pra validar ranking semântico
