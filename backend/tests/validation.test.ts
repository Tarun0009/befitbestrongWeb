import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { requireAtLeastOneField } from "../src/lib/validation.js";

describe("partial update validation", () => {
  const patchSchema = requireAtLeastOneField(
    z
      .object({
        name: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .strict(),
  );

  it("accepts a focused one-field patch", () => {
    expect(patchSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("rejects empty patches", () => {
    expect(() => patchSchema.parse({})).toThrow();
  });

  it("rejects unknown fields instead of silently making a no-op write", () => {
    expect(() => patchSchema.parse({ typo: true })).toThrow();
  });
});
