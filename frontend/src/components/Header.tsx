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
    if (pathname === "/shop") setQuery(searchParams.get("q") ?? "");
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
    const cleanQuery = query.trim();
    const suffix = cleanQuery ? "?q=" + encodeURIComponent(cleanQuery) : "";
    setMobileOpen(false);
    router.push("/shop" + suffix);
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[4.75rem] items-center gap-4 lg:gap-7">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="beFitBeStrong home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-xs font-black tracking-[-0.08em] text-primary transition-transform group-hover:-rotate-2">
              BFS
            </span>
            <span className="hidden sm:block">
              <span className="block text-base font-bold leading-none tracking-tight">beFitBeStrong</span>
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Built for the work</span>
            </span>
          </Link>

          <SearchForm query={query} onQueryChange={setQuery} onSubmit={handleSearch} className="hidden min-w-0 flex-1 lg:block" />

          <div className="ml-auto hidden items-center gap-1 lg:flex">
            {status === "authenticated" && user ? (
              <>
                {user.role === "ADMIN" && <HeaderLink href="/admin" label="Admin" icon={ShieldCheck} />}
                <HeaderIconLink href="/account/wishlist" label={`Wishlist (${wishlistCount} items)`}>
                  <Heart className="h-[18px] w-[18px]" />
                  <CountBadge count={wishlistCount} />
                </HeaderIconLink>
                <Link href="/account" className="group inline-flex h-11 items-center gap-2 rounded-xl px-3 text-left transition hover:bg-muted" aria-label="Open account">
                  <UserRound className="h-[18px] w-[18px] text-muted-foreground group-hover:text-foreground" />
                  <span className="max-w-28"><span className="block text-[10px] leading-none text-muted-foreground">Account</span><span className="mt-1 block truncate text-xs font-semibold leading-none">{displayName}</span></span>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold transition hover:bg-muted">Log in</Link>
                <Link href="/signup" className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95">Create account</Link>
              </>
            )}
            <CartButton cartCount={cartCount} onClick={openCart} />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <button type="button" onClick={openCart} className="relative grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background transition hover:opacity-90" aria-label={`Cart (${cartCount} items)`}>
              <ShoppingBag className="h-[18px] w-[18px]" />
              <CountBadge count={cartCount} dark />
            </button>
            <button type="button" onClick={() => setMobileOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-foreground transition hover:bg-muted" aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? "Close menu" : "Open menu"}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <nav className="hidden h-11 items-center gap-1 border-t border-border/70 lg:flex" aria-label="Product categories">
          <NavLink href="/shop" active={pathname === "/shop"}>Shop all</NavLink>
          <NavLink href="/bundles" active={pathname.startsWith("/bundles")} emphasis>Bundles</NavLink>
          {categories.map((category) => <NavLink key={category.slug} href={`/shop?category=${category.slug}`} active={pathname === "/shop" && searchParams.get("category") === category.slug}>{category.name}</NavLink>)}
          <span className="ml-auto text-[11px] font-medium text-muted-foreground">Delivery availability checked by PIN</span>
        </nav>
      </div>

      {mobileOpen && (
        <div id="mobile-navigation" className="border-t border-border bg-background lg:hidden">
          <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
            <SearchForm query={query} onQueryChange={setQuery} onSubmit={handleSearch} />
            <nav aria-label="Mobile shop navigation">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Shop</p>
              <div className="grid gap-1 sm:grid-cols-2">
                <MobileLink href="/shop" label="Shop all products" />
                <MobileLink href="/bundles" label="Bundles & savings" />
                {categories.map((category) => <MobileLink key={category.slug} href={`/shop?category=${category.slug}`} label={category.name} />)}
              </div>
            </nav>
            <div className="border-t border-border pt-4">
              {status === "authenticated" && user ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <MobileAction href="/account" icon={UserRound} label={displayName} />
                  <MobileAction href="/account/orders" icon={ShoppingBag} label="Your orders" />
                  <MobileAction href="/account/wishlist" icon={Heart} label={`Wishlist${wishlistCount ? ` (${wishlistCount})` : ""}`} />
                  {user.role === "ADMIN" && <MobileAction href="/admin" icon={ShieldCheck} label="Admin panel" />}
                  <button type="button" onClick={handleLogout} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background transition hover:opacity-90 sm:col-span-2"><LogOut className="h-4 w-4" /> Log out</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2"><Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold transition hover:bg-muted">Log in</Link><Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-95">Create account</Link></div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function SearchForm({ query, onQueryChange, onSubmit, className = "" }: { query: string; onQueryChange: (value: string) => void; onSubmit: (event: FormEvent) => void; className?: string }) {
  return <form onSubmit={onSubmit} className={className} role="search"><label className="group relative block"><span className="sr-only">Search products</span><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition group-focus-within:text-foreground" /><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search supplements, equipment, apparel…" className="h-11 w-full rounded-xl border border-transparent bg-[#f5f3ee] pl-11 pr-12 text-sm outline-none transition focus:border-black/15 focus:bg-background focus:ring-2 focus:ring-primary/25" /><button type="submit" className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-foreground text-background transition hover:opacity-90" aria-label="Search"><Search className="h-3.5 w-3.5" /></button></label></form>;
}

function HeaderLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof ShieldCheck }) {
  return <Link href={href} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"><Icon className="h-4 w-4" />{label}</Link>;
}

function HeaderIconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return <Link href={href} aria-label={label} title={label} className="relative grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">{children}</Link>;
}

function CountBadge({ count, dark = false }: { count: number; dark?: boolean }) {
  return <span className={`absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ${dark ? "bg-primary text-primary-foreground ring-2 ring-foreground" : "bg-primary text-primary-foreground"}`}>{count > 99 ? "99+" : count}</span>;
}

function CartButton({ cartCount, onClick }: { cartCount: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="ml-1 inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-3.5 text-sm font-semibold text-background transition hover:opacity-90" aria-label={`Cart (${cartCount} items)`}><ShoppingBag className="h-4 w-4" />Cart<CountBadge count={cartCount} dark /></button>;
}

function NavLink({ href, active, emphasis, children }: { href: string; active?: boolean; emphasis?: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold transition ${active ? "bg-foreground text-background" : emphasis ? "bg-primary text-primary-foreground hover:brightness-95" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{children}</Link>;
}

function MobileLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex h-11 items-center justify-between rounded-xl px-3 text-sm font-medium transition hover:bg-muted">{label}<ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>;
}

function MobileAction({ href, icon: Icon, label }: { href: string; icon: typeof UserRound; label: string }) {
  return <Link href={href} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold transition hover:bg-muted"><Icon className="h-4 w-4" />{label}</Link>;
}