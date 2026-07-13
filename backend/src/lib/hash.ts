/**
 * Compact deterministic hash for cache key generation.
 *
 * Isolated from cache.ts so it can be imported without dragging in the Redis
 * connection at module load — useful for unit tests and for any consumer that
 * only needs the key derivation, not the store.
 */
export function stableHash(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as object).sort());
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
