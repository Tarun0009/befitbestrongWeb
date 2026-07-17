import { z } from "zod";

export function requireAtLeastOneField<Schema extends z.AnyZodObject>(
  schema: Schema,
) {
  return schema.refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
}
