// Demo: prove tag-based cache invalidation works end-to-end.
// Simulates what happens when an admin calls PATCH /admin/products/:id.

import { invalidateCatalog } from "../src/modules/products/products.service.js";
import { redis } from "../src/config/redis.js";

async function main() {
  const before = await redis.keys("cache:*");
  console.log(`[demo] before: ${before.length} cache keys`);
  console.log(before.sort().map((k) => `  · ${k}`).join("\n"));

  console.log("\n[demo] calling invalidateCatalog() — same code the admin PATCH hits");
  await invalidateCatalog();

  const after = await redis.keys("cache:*");
  console.log(`\n[demo] after: ${after.length} cache keys`);
  console.log(after.sort().map((k) => `  · ${k}`).join("\n") || "  (empty)");

  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
