/**
 * Optimize plugin barrel — backward-compatibility re-exports.
 *
 * Optimizer primitives (registry, types, built-in passes, OptimizeCommand)
 * moved to the dedicated `svg-engine/optimize` entry point. This barrel
 * re-exports them so consumers that imported from `svg-engine/edit`
 * continue to compile. The plugin wrapper (`builtinOptimizersPlugin`)
 * remains here because it depends on the `EditorPlugin` scaffolding
 * owned by `svg-engine/edit`.
 */
export {
  type Optimizer,
  OptimizerRegistry,
  dropDefaultsOptimizer,
  precisionOptimizer,
  pruneEmptyGroupsOptimizer,
  stripAuthoredTitlesOptimizer,
  OptimizeCommand,
} from 'svg-engine/optimize';
export { builtinOptimizersPlugin } from './builtin-optimizers.plugin';
