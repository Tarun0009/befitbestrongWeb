import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";

/**
 * Admin analytics — read-only aggregate endpoints for the dashboard.
 *
 * Uses `$queryRaw` with parameterized SQL. All these queries are cheap on
 * demo data; on real volumes they'd benefit from a covering index on
 * (Order.status, createdAt) — already in place from the Phase 6 migration.
 */

const router = Router();

// GET /admin/analytics/summary
// Returns everything the dashboard needs in one round-trip: today's revenue,
// order counts by status (all-time), low-stock variant count.
router.get("/analytics/summary", async (_req, res, next) => {
  try {
    // Start of today in the DB's timezone. Postgres date_trunc keeps this
    // cheap without needing a JS Date round-trip.
    type TodayRow = { revenue: bigint | null; count: bigint };
    const todayRows = await prisma.$queryRaw<TodayRow[]>`
      SELECT
        COALESCE(SUM(o.total - COALESCE(r.refunded, 0)), 0)::bigint AS revenue,
        COUNT(*)::bigint AS count
      FROM "Order" o
      LEFT JOIN (
        SELECT "orderId", SUM(amount)::bigint AS refunded
        FROM "RefundIntent"
        WHERE status = 'PROCESSED'
        GROUP BY "orderId"
      ) r ON r."orderId" = o.id
      WHERE o.status IN ('PAID', 'SHIPPED', 'DELIVERED')
        AND o."createdAt" >= date_trunc('day', now())
    `;

    // GROUP BY on the enum. Emits a row per status; missing statuses are 0.
    type StatusRow = { status: string; count: bigint };
    const statusRows = await prisma.$queryRaw<StatusRow[]>`
      SELECT status::text AS status, COUNT(*)::bigint AS count
      FROM "Order"
      GROUP BY status
    `;

    // Low-stock threshold is arbitrary (5). Return both the count and the
    // top-N offenders for the dashboard alert card.
    type LowStockRow = {
      id: string;
      sku: string;
      stock: number;
      size: string | null;
      color: string | null;
      product_id: string;
      product_name: string;
      product_slug: string;
    };
    const lowStock = await prisma.$queryRaw<LowStockRow[]>`
      SELECT
        v."id",
        v."sku",
        v."stock",
        v."size",
        v."color",
        p."id"   AS product_id,
        p."name" AS product_name,
        p."slug" AS product_slug
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      WHERE p."active" = true AND v."stock" < 5
      ORDER BY v."stock" ASC, p."name" ASC
      LIMIT 10
    `;

    const lowStockCountRow = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      WHERE p."active" = true AND v."stock" < 5
    `;

    const [todayRow] = todayRows;
    const revenueToday = Number(todayRow?.revenue ?? 0);
    const ordersToday = Number(todayRow?.count ?? 0);

    const ordersByStatus: Record<string, number> = {};
    for (const r of statusRows) {
      ordersByStatus[r.status] = Number(r.count);
    }

    res.json({
      revenueToday,
      ordersToday,
      ordersByStatus,
      lowStockCount: Number(lowStockCountRow[0]?.count ?? 0),
      lowStockItems: lowStock.map((r) => ({
        variantId: r.id,
        sku: r.sku,
        stock: r.stock,
        size: r.size,
        color: r.color,
        product: {
          id: r.product_id,
          name: r.product_name,
          slug: r.product_slug,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/analytics/top-products?days=30
// Top-selling products by units sold in the window. Filters to statuses that
// represent a real sale (PAID+), joins OrderItem to Order for the date filter.
router.get("/analytics/top-products", async (req, res, next) => {
  try {
    const q = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        limit: z.coerce.number().int().min(1).max(20).default(5),
      })
      .parse(req.query);

    // CTE aggregates units + revenue per product in the window; the outer
    // SELECT uses a window function to compute each product's share of the
    // total — cheap way to power a "share of top sellers" chart.
    type Row = {
      product_id: string;
      name: string;
      slug: string;
      units_sold: bigint;
      revenue: bigint;
      pct_of_top: number | null;
    };
    const rows = await prisma.$queryRaw<Row[]>`
      WITH sold AS (
        SELECT
          v."productId"              AS product_id,
          p."name"                   AS name,
          p."slug"                   AS slug,
          SUM(oi."quantity")::bigint AS units_sold,
          SUM(oi."subtotal")::bigint AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o           ON o."id" = oi."orderId"
        JOIN "ProductVariant" v  ON v."id" = oi."variantId"
        JOIN "Product" p         ON p."id" = v."productId"
        WHERE o."status" IN ('PAID', 'SHIPPED', 'DELIVERED')
          AND o."createdAt" >= now() - (${q.days} * INTERVAL '1 day')
        GROUP BY v."productId", p."name", p."slug"
      )
      SELECT
        product_id,
        name,
        slug,
        units_sold,
        revenue,
        units_sold::float / NULLIF(SUM(units_sold) OVER (), 0) * 100 AS pct_of_top
      FROM sold
      ORDER BY units_sold DESC
      LIMIT ${q.limit}
    `;

    res.json({
      days: q.days,
      items: rows.map((r) => ({
        productId: r.product_id,
        name: r.name,
        slug: r.slug,
        unitsSold: Number(r.units_sold),
        revenue: Number(r.revenue),
        pctOfTop: r.pct_of_top === null ? 0 : Number(r.pct_of_top),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
