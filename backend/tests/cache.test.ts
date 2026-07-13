import { describe, expect, it } from "@jest/globals";
import { stableHash } from "../src/lib/hash.js";

describe("stableHash", () => {
  it("is deterministic for the same object", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ a: 1, b: 2 }));
  });

  it("is key-order independent", () => {
    // Search & catalog cache keys must not depend on the order the client
    // sent the params in — that would fragment the cache pointlessly.
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it("distinguishes different values", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("distinguishes different keys with the same values", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ b: 1 }));
  });

  it("produces a compact base36 string", () => {
    const h = stableHash({ q: "cotton", page: 1, limit: 12 });
    // hash is toString(36) of a 32-bit int → max 7 chars.
    expect(h).toMatch(/^[0-9a-z]{1,7}$/);
  });
});
