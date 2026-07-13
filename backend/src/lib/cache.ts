import { redis } from "../config/redis.js";
import { logger } from "../config/logger.js";

/**
 * Tag-based Redis cache.
 *
 * Every cached key is registered against one or more tags. Invalidating a tag
 * pipelines DEL for every key in that tag's set, then drops the tag set itself.
 *
 * Layout:
 *   cache:{key}                     -> JSON payload
 *   cache:tag:{tag}                 -> SET of cache:{key} entries
 */

const KEY_PREFIX = "cache:";
const TAG_PREFIX = "cache:tag:";

export interface CacheEntry<T> {
  data: T;
  cached: boolean;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(KEY_PREFIX + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err, key }, "cache: failed to parse cached JSON");
    await redis.del(KEY_PREFIX + key);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  opts: { ttlSec: number; tags?: string[] },
): Promise<void> {
  const fullKey = KEY_PREFIX + key;
  const payload = JSON.stringify(value);

  const pipeline = redis.multi();
  pipeline.set(fullKey, payload, "EX", opts.ttlSec);
  if (opts.tags?.length) {
    for (const tag of opts.tags) {
      pipeline.sadd(TAG_PREFIX + tag, fullKey);
      // Keep tag alive a bit longer than the longest possible cached key.
      pipeline.expire(TAG_PREFIX + tag, opts.ttlSec + 300);
    }
  }
  await pipeline.exec();
}

export async function cacheWrap<T>(
  key: string,
  ttlSec: number,
  tags: string[],
  loader: () => Promise<T>,
): Promise<CacheEntry<T>> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return { data: hit, cached: true };
  const data = await loader();
  await cacheSet(key, data, { ttlSec, tags });
  return { data, cached: false };
}

export async function invalidateTag(tag: string): Promise<number> {
  const tagKey = TAG_PREFIX + tag;
  const members = await redis.smembers(tagKey);
  if (members.length === 0) {
    await redis.del(tagKey);
    return 0;
  }
  const pipeline = redis.multi();
  for (const k of members) pipeline.del(k);
  pipeline.del(tagKey);
  await pipeline.exec();
  logger.info({ tag, cleared: members.length }, "cache: tag invalidated");
  return members.length;
}

export async function invalidateTags(tags: string[]): Promise<void> {
  await Promise.all(tags.map((t) => invalidateTag(t)));
}

// Re-export from the hash module so existing importers keep working.
export { stableHash } from "./hash.js";
