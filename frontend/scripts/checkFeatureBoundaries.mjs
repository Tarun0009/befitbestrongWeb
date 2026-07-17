import { readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const legacyLibApis = new Set([
  "adminAnalyticsApi.ts",
  "authApi.ts",
  "cartApi.ts",
  "catalogApi.ts",
  "ordersApi.ts",
  "siteConfigApi.ts",
]);

const libEntries = await readdir(path.join(root, "src", "lib"), {
  withFileTypes: true,
});
const unexpectedLibApis = libEntries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith("Api.ts") &&
      !legacyLibApis.has(entry.name),
  )
  .map((entry) => `src/lib/${entry.name}`);

const e2eEntries = await readdir(path.join(root, "e2e"), {
  withFileTypes: true,
});
const rootLevelSpecs = e2eEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
  .map((entry) => `e2e/${entry.name}`);

const violations = [...unexpectedLibApis, ...rootLevelSpecs];
if (violations.length > 0) {
  process.stderr.write(
    [
      "Feature-boundary violations:",
      ...violations.map((file) => `- ${file}`),
      "Place feature APIs under src/features/<feature> and specs under e2e/<feature>.",
    ].join("\n") + "\n",
  );
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({
    ok: true,
    protectedRules: ["no-new-lib-feature-apis", "feature-owned-e2e-specs"],
    legacyApiMigrationCount: legacyLibApis.size,
  }) + "\n",
);
