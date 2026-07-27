import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nextConfigDirectory = dirname(
  require.resolve("eslint-config-next/package.json"),
);
const compat = new FlatCompat({
  baseDirectory: currentDirectory,
  resolvePluginsRelativeTo: nextConfigDirectory,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "blob-report/**",
      "coverage/**",
      "next-env.d.ts",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
