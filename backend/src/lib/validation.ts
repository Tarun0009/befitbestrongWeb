import { z } from "zod";

/** User-supplied media links are references only; the API never accepts or
 * stores executable file uploads. Restrict them to ordinary web origins. */
export const safeHttpUrl = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use http or https");

export const safeNavigationHref = z.union([
  z.string().trim().max(2_048).regex(/^\/(?!\/)/),
  safeHttpUrl,
]);

export function requireAtLeastOneField<Schema extends z.AnyZodObject>(
  schema: Schema,
) {
  return schema.refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
}
