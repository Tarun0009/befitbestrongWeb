import { randomUUID } from "node:crypto";
import type { ChainableCommander } from "ioredis";
import { redis } from "../../config/redis.js";

const REVISION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface CartRevisionOwner {
  type: "user" | "guest";
  id: string;
}

export function cartRevisionKey(owner: CartRevisionOwner): string {
  return `cart:${owner.type}:${owner.id}:revision`;
}

export async function getCartRevision(owner: CartRevisionOwner): Promise<string> {
  const key = cartRevisionKey(owner);
  const stored = await redis.get(key);
  if (stored) return stored;

  const candidate = randomUUID();
  const inserted = await redis.set(
    key,
    candidate,
    "EX",
    REVISION_TTL_SECONDS,
    "NX",
  );
  return inserted ? candidate : (await redis.get(key)) ?? candidate;
}

export function appendCartRevision(
  pipeline: ChainableCommander,
  owner: CartRevisionOwner,
): ChainableCommander {
  const key = cartRevisionKey(owner);
  pipeline.set(key, randomUUID(), "EX", REVISION_TTL_SECONDS);
  return pipeline;
}

export async function bumpCartRevision(owner: CartRevisionOwner): Promise<void> {
  await appendCartRevision(redis.multi(), owner).exec();
}
