/*
 * Public API surface of `svg-engine/core`.
 *
 * This entry point exposes the **headless engine**: data model, immutable
 * tree operations, document type, command pattern and Angular signal-based
 * services. It has **no dependency on `@angular/material` or `@angular/cdk`**
 * (D-017) and can be consumed by:
 *   - The full editor (`svg-engine/edit` + `svg-engine/ui`).
 *   - A read-only viewer (`svg-engine/render`).
 *   - Headless usages: programmatic SVG construction, server-side
 *     rendering pipelines, CLI optimizers, etc.
 *
 * Surface stability follows SemVer once the library reaches `1.0.0`
 * (see `docs/09-api-publica.md`).
 */

// Types
export * from './lib/types';

// Model (interfaces + factories)
export * from './lib/model';

// Geometry helpers (scale-bake — Bloco 4-Resize-Proper)
export * from './lib/geometry';

// Immutable tree operations
export * from './lib/tree';

// Document
export * from './lib/document';

// Command pattern
export * from './lib/commands';

// Services (Angular DI)
export * from './lib/state';
export * from './lib/history';
export * from './lib/command-bus';

// D-073 — History Snapshots (named restorable checkpoints)
export * from './lib/snapshots';
