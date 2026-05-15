/**
 * Branded type for SVG node identifiers. A `NodeId` is a `string` at runtime
 * but is not assignable from arbitrary strings without going through
 * {@link toNodeId} or {@link generateNodeId}, preventing accidental misuse
 * across API boundaries.
 */
export type NodeId = string & { readonly __nodeIdBrand: never };

/**
 * Coerce a plain string into a {@link NodeId}. Use this when reading IDs
 * from external sources (parsed SVG, persisted documents, etc.). Caller is
 * responsible for ensuring uniqueness within the document scope.
 */
export function toNodeId(value: string): NodeId {
  return value as NodeId;
}

/**
 * Generate a fresh, globally-unique {@link NodeId}. Uses
 * {@link Crypto.randomUUID} when available; falls back to a timestamped
 * counter otherwise (test environments without crypto).
 */
export function generateNodeId(): NodeId {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID() as NodeId;
  }
  return fallbackId() as NodeId;
}

let fallbackCounter = 0;

function fallbackId(): string {
  fallbackCounter += 1;
  return `node-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}
