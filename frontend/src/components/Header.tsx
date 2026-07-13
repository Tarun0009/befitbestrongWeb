"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Heart,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useLogoutMutation } from "@/lib/authApi";
import { cartApi, useGetCartQuery } from "@/lib/cartApi";
import { useGetCategoriesQuery } from "@/lib/catalogApi";
import { openDrawer } from "@/features/cart/cartSlice";
import { wishlistApi, useGetWishlistQuery } from "@/features/wishlist/wishlistApi";

const FALLBACK_CATEGORIES = [
  { name: "Supplements", slug: "supplements" },
  { name: "Equipment", slug: "equipment" },
  { name: "Apparel", slug: "apparel" },
  { name: "Accessories", slug: "accessories" },
];

export function Header() {
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout] = useLogoutMutation();
  const dispatch = useAppDispatch();
  const { data: cart } = useGetCartQuery();
  const { data: categoryData } = useGetCategoriesQuery();
  const { data: wishlist } = useGetWishlistQuery(user?.uid ?? "", {
    skip: status !== "authenticated" || !user?.uid,
  });
  const cartCount = cart?.count ?? 0;
  const wishlistCount = wishlist?.productIds.length ?? 0;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  const categories = useMemo(() => {
    const available = categoryData?.items
      .filter((category) => category.productCount > 0)
      .slice(0, 5);
    return available?.length ? available : FALLBACK_CATEGORIES;
  }, [categoryData]);

  const displayName =
    user?.name?.trim() || user?.email.split("@")[0] || "Your account";

  useEffect(() => {
    if (pathname === "/shop") {
      setQuery(searchParams.get("q") ?? "");
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    const cleanQuery = query.trim();
    if (cleanQuery) params.set("q", cleanQuery);
    setMobileOpen(false);
    const suffix = params.toString();
    router.push("/shop" + (suffix ? "?" + suffix : ""));
  }

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Best-effort: proceed with client sign-out anyway.
    }
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Firebase not configured: ignore.
    }
    dispatch(cartApi.util.invalidateTags(["Cart"]));
    dispatch(wishlistApi.util.resetApiState());
    setMobileOpen(false);
    router.push("/");
  }

  function openCart() {
    setMobileOpen(false);
    dispatch(openDrawer());
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 shadow-[0_1px_0_rgba(0,0,0,0.02)] backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <div className="relative mx-auto flex h-[4.5rem] max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="beFitBeStrong home"
        >
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-foreground text-xs font-black tracking-[-0.08em] text-primary transition-transform group-hover:-rotate-2">
            BFS
          </span>
          <span className="hidden sm:block">
            <span className="block text-base font-bold leading-none tracking-tight">
              beFitBeStrong
            </span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Built for the work
            </span>
          </span>
        </Link>

        <SearchForm
          query={query}
          onQueryChange={setQuery}
          onSubmit={handleSearch}
          className="mx-auto hidden w-full max-w-xl lg:block"
        />

        <div className="ml-auto hidden items-center gap-1 lg:flex">
          {status === "authenticated" && user ? (
            <>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Admin
                </Link>
              )}
              <Link
                href="/account/wishlist"
                className="relative grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={"Wishlist (" + wishlistCount + " items)"}
                title="Wishlist"
              >
                <Heart className="h-4 w-4" />
                {wishlistCount > 0 && (
                  <span className="absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {wishlistCount > 99 ? "99+" : wishlistCount}
                  </span>
                )}
              </Link>
              <Link
                href="/account"
                className="flex h-10 max-w-40 items-center gap-2 rounded-lg px-3 hover:bg-muted"
              >
                <UserRound className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[10px] leading-none text-muted-foreground">
                    Welcome back
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold leading-none">
                    {displayName}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95"
              >
                Create account
              </Link>
            </>
          )}

          <CartButton cartCount={cartCount} onClick={openCart} />
        </div>

        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1 sm:right-6 lg:hidden">
          <button
            type="button"
            onClick={openCart}
            className="relative grid h-10 w-10 place-items-center rounded-lg bg-foreground text-background hover:opacity-90"
            aria-label={"Cart (" + cartCount + " items)"}
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="hidden border-t border-border/70 lg:block">
        <nav className="mx-auto flex h-11 max-w-6xl items-center gap-1 px-6" aria-label="Product categories">
          <Link
            href="/shop"
            className="mr-2 inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-semibold uppercase tracking-wider text-background hover:opacity-90"
          >
            Shop all
          </Link>
          <Link
            href="/bundles"
            className="inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold text-primary-foreground bg-primary hover:brightness-95"
          >
            Bundles
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={"/shop?category=" + category.slug}
              className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-muted"
            >
              {category.name}
            </Link>
          ))}
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            Genuine products · Fast dispatch · Easy returns
          </span>
        </nav>
      </div>

      {mobileOpen && (
        <div
          id="mobile-navigation"
          className="border-t border-border bg-background lg:hidden"
        >
          <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
            <SearchForm
              query={query}
              onQueryChange={setQuery}
              onSubmit={handleSearch}
            />

            <nav aria-label="Mobile navigation">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Shop by category
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                <MobileLink href="/shop" label="Shop all products" />
                <MobileLink href="/bundles" label="Save with bundles" />

          {categories.map((category) => (
                  <MobileLink
                    key={category.slug}
                    href={"/shop?category=" + category.slug}
                    label={category.name}
                  />
                ))}
              </div>
            </nav>

            <div className="border-t border-border pt-4">
              {status === "authenticated" && user ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    href="/account"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
                  >
                    <UserRound className="h-4 w-4" />
                    {displayName}
                  </Link>
                  {user.role === "ADMIN" && (
                    <Link
                      href="/admin"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Admin panel
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-semibold text-background hover:opacity-90"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-muted"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:brightness-95"
                  >
                    Create account
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function SearchForm({
  query,
  onQueryChange,
  onSubmit,
  className = "",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} className={className} role="search">
      <label className="relative block">
        <span className="sr-only">Search products</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search supplements, equipment, apparel…"
          className="h-11 w-full rounded-lg border border-border bg-muted/45 pl-10 pr-20 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-background focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90"
        >
          Search
        </button>
      </label>
    </form>
  );
}

function CartButton({
  cartCount,
  onClick,
}: {
  cartCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-3.5 text-sm font-semibold text-background hover:opacity-90"
      aria-label={"Cart (" + cartCount + " items)"}
    >
      <ShoppingBag className="h-4 w-4" />
      Cart
      <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
        {cartCount > 99 ? "99+" : cartCount}
      </span>
    </button>
  );
}

function MobileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center justify-between rounded-lg px-3 text-sm font-medium hover:bg-muted"
    >
      {label}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}






