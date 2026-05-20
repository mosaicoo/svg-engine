/*
 * Public API surface of `svg-engine/optimize`.
 *
 * Headless SVG optimization pipeline — the third of the three explicit
 * use cases (D-016). Consumers that need to shrink/clean SVG documents
 * without instantiating any editor UI import directly from here.
 *
 * Zero deps on `@angular/material` or `@angular/cdk` (D-017).
 *
 * **What's here**:
 * - `Optimizer` type (the contract)
 * - `OptimizerRegistry` service
 * - `precisionOptimizer` / `dropDefaultsOptimizer` /
 *   `pruneEmptyGroupsOptimizer` (3 built-in conservative passes)
 * - `OptimizeCommand` (wraps `runPipeline` as a single undo entry —
 *   used by the editor; safe to ignore from headless usage)
 *
 * **What's NOT here** (lives in `svg-engine/edit`):
 * - `builtinOptimizersPlugin` — the `EditorPlugin` wrapper that
 *   auto-registers the 3 passes at boot. Headless consumers register
 *   passes directly via `OptimizerRegistry.register()` or just call
 *   each `optimize()` function in sequence.
 */

export { type Optimizer } from './lib/optimizer';
export { OptimizerRegistry } from './lib/optimizer-registry.service';
export {
  dropDefaultsOptimizer,
  precisionOptimizer,
  pruneEmptyGroupsOptimizer,
} from './lib/builtin-optimizers';
export { OptimizeCommand } from './lib/optimize.command';
