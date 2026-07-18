import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-start justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-emphasis">
        404
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        We could not find that page.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
        The link may be outdated, the product may no longer be available, or the URL may be incorrect.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/shop" className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
          Browse the shop
        </Link>
        <Link href="/support" className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
          Visit support
        </Link>
      </div>
    </main>
  );
}
