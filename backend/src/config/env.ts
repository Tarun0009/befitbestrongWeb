import "dotenv/config";
import { backendEnvSchema } from "./envSchema.js";

const parsed = backendEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
