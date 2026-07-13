import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { cacheWrap, stableHash } from "../../lib/cache.js";
import { CATALOG_LIST_TAG } from "../products/products.service.js";

/**
 * Postgres FTS-backed product search.
 *
 * The `tsv` column is a STORED generated tsvector (name weight A, description
 * weight B). Queries use `websearch_to_tsquery` so users can pass natural
 * syntax ("noise cancelling" -bluetooth OR wireless). Ranking uses ts_rank
 * against the weighted vector so name matches out-rank body-only matches.
 *
 * Filters (category slug, minPrice, maxPrice) are combined with the FTS
 * predicate. Sort is whitelisted before interpolation. Pagination supports
 * both cursor (keyset on the active sort column) and page/offset — cursor is
 * cheaper for infinite scroll; offset is convenient for admin/paged UI.
 */

export const SORTS = ["relevance", "newest", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export interface SearchParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: Sort;
  cursor?: string;
  page?: number;
  limit: number;
}

export interface SearchItem {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  dispatchHint: string | null;
  ratingAvg: number;
  ratingCount: number;
  currency: string;
  category: { id: string; name: string; slug: string };
  image: { url: string; alt: string | null } | null;
  rank: number | null;
}

export interface SearchResult {
  items: SearchItem[];
  total: number;
  page: number | null;
  limit: number;
  totalPages: number | null;
  nextCursor: string | null;
  sort: Sort;
  q: string | null;
}

interface RawRow {
  id: string;
  slug: string;
  name: string;
  base_price: number;
  compare_at_price: number | null;
  dispatch_hint: string | null;
  rating_avg: number;
  rating_count: number;
  currency: string;
  created_at: Date;
  category_id: string;
  category_name: string;
  category_slug: string;
  image_url: string | null;
  image_alt: string | null;
  rank: number | null;
}

interface Cursor {
  s: number | string; // sort-key value (rank, price, or ISO timestamp)
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Cursor;
    if (
      parsed &&
      (typeof parsed.s === "number" || typeof parsed.s === "string") &&
      typeof parsed.id === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveSort(q: string | undefined, sort: Sort | undefined): Sort {
  if (sort) return sort;
  return q ? "relevance" : "newest";
}

export async function searchProducts(params: SearchParams): Promise<SearchResult> {
  const q = params.q?.trim() || undefined;
  const sort = resolveSort(q, params.sort);
  // Relevance requires a query. If sort=relevance was requested without one,
  // fall back to newest so we don't return an arbitrary order.
  const effectiveSort: Sort = sort === "relevance" && !q ? "newest" : sort;

  const cacheKey = `search:v2:${stableHash({ ...params, sort: effectiveSort, q })}`;

  const result = await cacheWrap<SearchResult>(
    cacheKey,
    60, // short TTL — search results change with catalog + are user-facing
    [CATALOG_LIST_TAG],
    async () => {
      return runSearch({ ...params, sort: effectiveSort, q });
    },
  );

  return result.data;
}

async function runSearch(
  params: SearchParams & { sort: Sort; q: string | undefined },
): Promise<SearchResult> {
  const {
    q,
    category,
    minPrice,
    maxPrice,
    sort,
    cursor: cursorRaw,
    page,
    limit,
  } = params;

  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  const usingCursor = cursor !== null;

  const filters: Prisma.Sql[] = [Prisma.sql`p."active" = true`];

  if (q) {
    filters.push(
      Prisma.sql`p."tsv" @@ websearch_to_tsquery('english', ${q})`,
    );
  }
  if (category) {
    filters.push(Prisma.sql`c."slug" = ${category}`);
  }
  if (minPrice !== undefined) {
    filters.push(Prisma.sql`p."basePrice" >= ${minPrice}`);
  }
  if (maxPrice !== undefined) {
    filters.push(Prisma.sql`p."basePrice" <= ${maxPrice}`);
  }

  // Keyset predicate — compares (sortKey, id) against the cursor tuple. The
  // direction depends on sort (DESC → strictly less-than; ASC → greater-than).
  if (usingCursor && cursor) {
    if (sort === "relevance") {
      if (!q) throw new Error("relevance cursor requires q");
      filters.push(
        Prisma.sql`(ts_rank(p."tsv", websearch_to_tsquery('english', ${q})), p."id")
                   < (${Number(cursor.s)}, ${cursor.id})`,
      );
    } else if (sort === "newest") {
      filters.push(
        Prisma.sql`(p."createdAt", p."id") < (${new Date(String(cursor.s))}, ${cursor.id})`,
      );
    } else if (sort === "price_asc") {
      filters.push(
        Prisma.sql`(p."basePrice", p."id") > (${Number(cursor.s)}, ${cursor.id})`,
      );
    } else if (sort === "price_desc") {
      filters.push(
        Prisma.sql`(p."basePrice", p."id") < (${Number(cursor.s)}, ${cursor.id})`,
      );
    }
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;

  // Whitelisted ORDER BY — never interpolate user input into sort.
  // Tiebreaker direction matches the primary sort so keyset pagination via
  // tuple comparison ((sort_val, id) </> cursor) is a single-direction op.
  const orderSql = (() => {
    switch (sort) {
      case "relevance":
        return Prisma.sql`ORDER BY rank DESC, p."id" DESC`;
      case "price_asc":
        return Prisma.sql`ORDER BY p."basePrice" ASC, p."id" ASC`;
      case "price_desc":
        return Prisma.sql`ORDER BY p."basePrice" DESC, p."id" DESC`;
      case "newest":
      default:
        return Prisma.sql`ORDER BY p."createdAt" DESC, p."id" DESC`;
    }
  })();

  const rankSelect =
    sort === "relevance" && q
      ? Prisma.sql`ts_rank(p."tsv", websearch_to_tsquery('english', ${q})) AS rank`
      : Prisma.sql`NULL::real AS rank`;

  const offset = usingCursor ? 0 : Math.max(0, ((page ?? 1) - 1) * limit);

  // Fetch limit+1 so we know if there's a next page (drives nextCursor).
  const fetchLimit = limit + 1;

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      p."id",
      p."slug",
      p."name",
      p."basePrice"      AS base_price,
      p."compareAtPrice" AS compare_at_price,
      p."dispatchHint"   AS dispatch_hint,
      p."ratingAvg"      AS rating_avg,
      p."ratingCount"    AS rating_count,
      p."currency",
      p."createdAt"   AS created_at,
      p."categoryId"  AS category_id,
      c."name"        AS category_name,
      c."slug"        AS category_slug,
      (
        SELECT "url" FROM "ProductImage"
        WHERE "productId" = p."id"
        ORDER BY "position" ASC
        LIMIT 1
      ) AS image_url,
      (
        SELECT "alt" FROM "ProductImage"
        WHERE "productId" = p."id"
        ORDER BY "position" ASC
        LIMIT 1
      ) AS image_alt,
      ${rankSelect}
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    ${whereSql}
    ${orderSql}
    OFFSET ${offset}
    LIMIT ${fetchLimit}
  `;

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  const items: SearchItem[] = trimmed.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    basePrice: Number(r.base_price),
    compareAtPrice:
      r.compare_at_price === null ? null : Number(r.compare_at_price),
    dispatchHint: r.dispatch_hint,
    ratingAvg: Number(r.rating_avg),
    ratingCount: Number(r.rating_count),
    currency: r.currency,
    category: {
      id: r.category_id,
      name: r.category_name,
      slug: r.category_slug,
    },
    image: r.image_url
      ? { url: r.image_url, alt: r.image_alt ?? null }
      : null,
    rank: r.rank === null ? null : Number(r.rank),
  }));

  // Total count runs a matching WHERE against Product+Category (same filters,
  // no cursor predicate — cursor is for the paging window, not the universe).
  const totalRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE ${Prisma.join(
      [
        Prisma.sql`p."active" = true`,
        ...(q
          ? [
              Prisma.sql`p."tsv" @@ websearch_to_tsquery('english', ${q})`,
            ]
          : []),
        ...(category ? [Prisma.sql`c."slug" = ${category}`] : []),
        ...(minPrice !== undefined
          ? [Prisma.sql`p."basePrice" >= ${minPrice}`]
          : []),
        ...(maxPrice !== undefined
          ? [Prisma.sql`p."basePrice" <= ${maxPrice}`]
          : []),
      ],
      " AND ",
    )}
  `;
  const total = Number(totalRows[0]?.count ?? 0);

  // Build nextCursor from the last visible row on this page.
  let nextCursor: string | null = null;
  if (hasMore && trimmed.length > 0) {
    const lastRaw = trimmed[trimmed.length - 1]!;
    if (sort === "relevance") {
      nextCursor = encodeCursor({ s: Number(lastRaw.rank ?? 0), id: lastRaw.id });
    } else if (sort === "price_asc" || sort === "price_desc") {
      nextCursor = encodeCursor({ s: Number(lastRaw.base_price), id: lastRaw.id });
    } else {
      nextCursor = encodeCursor({
        s: new Date(lastRaw.created_at).toISOString(),
        id: lastRaw.id,
      });
    }
  }

  const usingCursorPaging = params.cursor !== undefined;

  return {
    items,
    total,
    page: usingCursorPaging ? null : page ?? 1,
    limit,
    totalPages: usingCursorPaging ? null : Math.max(1, Math.ceil(total / limit)),
    nextCursor,
    sort,
    q: q ?? null,
  };
}

