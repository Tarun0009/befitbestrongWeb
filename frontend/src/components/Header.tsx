"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
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
import { clearDeviceSessionToken } from "@/features/auth/deviceSession";
import { wishlistApi, useGetWishlistQuery } from "@/features/wishlist/wishlistApi";

const FALLBACK_CATEGORIES = [
  { name: "Supplements", slug: "supplements" },
  { name: "Equipment", slug: "equipment" },
  { name: "Apparel", slug: "apparel" },
  { name: "Accessories", slug: "accessories" },
];

export function Header() {
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();
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
  const [mobileSearchRequested, setMobileSearchRequested] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const isShopSection = pathname.startsWith("/shop");

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
    setMobileSearchRequested(false);
    setCategoriesOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && !categoriesOpen && !accountOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setMobileSearchRequested(false);
        setCategoriesOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountOpen, categoriesOpen, mobileOpen]);

  useEffect(() => {
    if (!categoriesOpen && !accountOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setCategoriesOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [accountOpen, categoriesOpen]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const cleanQuery = query.trim();
    const suffix = cleanQuery ? "?q=" + encodeURIComponent(cleanQuery) : "";
    setMobileOpen(false);
    setMobileSearchRequested(false);
    router.push("/shop" + suffix);
  }

  async function handleLogout() {
    if (loggingOut) return;
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
    clearDeviceSessionToken();
    dispatch(wishlistApi.util.resetApiState());
    setMobileOpen(false);
    setMobileSearchRequested(false);
    setAccountOpen(false);
    router.push("/");
  }

  function openCart() {
    setMobileOpen(false);
    setMobileSearchRequested(false);
    setAccountOpen(false);
    dispatch(openDrawer());
  }

  function openMobileSearch() {
    setCategoriesOpen(false);
    setAccountOpen(false);
    setMobileSearchRequested(true);
    setMobileOpen(true);
  }

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-border/80 bg-background/95 shadow-[0_1px_0_rgba(0,0,0,0.02)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/88"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[4.5rem] items-center gap-3 xl:gap-5">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="beFitBeStrong home"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-xs font-black tracking-[-0.08em] text-primary transition-transform group-hover:-rotate-2">
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

          <nav
            className="hidden shrink-0 items-center gap-0.5 lg:flex"
            aria-label="Primary navigation"
          >
            <NavLink href="/shop" active={isShopSection}>
              Shop
            </NavLink>
            <NavLink
              href="/bundles"
              active={pathname.startsWith("/bundles")}
              emphasis
            >
              Bundles
            </NavLink>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  setCategoriesOpen((open) => !open);
                }}
                aria-expanded={categoriesOpen}
                aria-haspopup="menu"
                aria-controls="desktop-category-menu"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Categories
                <ChevronDown
                  className={
                    "h-4 w-4 transition-transform " +
                    (categoriesOpen ? "rotate-180" : "")
                  }
                />
              </button>
              {categoriesOpen && (
                <CategoryMenu
                  categories={categories}
                  onClose={() => setCategoriesOpen(false)}
                />
              )}
            </div>
          </nav>

          <SearchForm
            query={query}
            onQueryChange={setQuery}
            onSubmit={handleSearch}
            className="hidden min-w-0 flex-1 lg:block"
          />

          <div className="ml-auto hidden shrink-0 items-center gap-1 lg:flex">
            {status === "authenticated" && user ? (
              <>
                <HeaderIconLink
                  href="/account/wishlist"
                  label={"Wishlist (" + wishlistCount + " items)"}
                >
                  <Heart className="h-[18px] w-[18px]" />
                  <CountBadge count={wishlistCount} />
                </HeaderIconLink>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoriesOpen(false);
                      setAccountOpen((open) => !open);
                    }}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    aria-controls="desktop-account-menu"
                    className="group inline-flex h-11 max-w-40 items-center gap-2 rounded-xl px-2.5 text-left transition hover:bg-muted"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold uppercase text-foreground">
                      {displayName.slice(0, 1)}
                    </span>
                    <span className="hidden min-w-0 xl:block">
                      <span className="block text-[10px] leading-none text-muted-foreground">
                        Account
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold leading-none">
                        {displayName}
                      </span>
                    </span>
                    <ChevronDown
                      className={
                        "hidden h-3.5 w-3.5 text-muted-foreground transition-transform xl:block " +
                        (accountOpen ? "rotate-180" : "")
                      }
                    />
                  </button>
                  {accountOpen && (
                    <AccountMenu
                      displayName={displayName}
                      email={user.email}
                      isAdmin={user.role === "ADMIN"}
                      loggingOut={loggingOut}
                      onLogout={handleLogout}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold transition hover:bg-muted"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
                >
                  Create account
                </Link>
              </>
            )}
            <CartButton cartCount={cartCount} onClick={openCart} />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <button
              type="button"
              onClick={openMobileSearch}
              className="grid h-10 w-10 place-items-center rounded-xl text-foreground transition hover:bg-muted"
              aria-label="Search products"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={openCart}
              className="relative grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background transition hover:opacity-90"
              aria-label={"Cart (" + cartCount + " items)"}
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              <CountBadge count={cartCount} dark />
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileSearchRequested(false);
                setCategoriesOpen(false);
                setAccountOpen(false);
                setMobileOpen((open) => !open);
              }}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-foreground transition hover:bg-muted"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-navigation"
          className="max-h-[calc(100vh-4.5rem)] overflow-y-auto border-t border-border bg-background lg:hidden"
        >
          <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
            <SearchForm
              query={query}
              onQueryChange={setQuery}
              onSubmit={handleSearch}
              autoFocus={mobileSearchRequested}
            />
            <nav aria-label="Mobile shop navigation">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Shop
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                <MobileLink href="/shop" label="Shop all products" />
                <MobileLink href="/bundles" label="Bundles & savings" />
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
                  <MobileAction
                    href="/account"
                    icon={UserRound}
                    label={displayName}
                  />
                  <MobileAction
                    href="/account/orders"
                    icon={ShoppingBag}
                    label="Your orders"
                  />
                  <MobileAction
                    href="/account/wishlist"
                    icon={Heart}
                    label={
                      "Wishlist" +
                      (wishlistCount ? " (" + wishlistCount + ")" : "")
                    }
                  />
                  {user.role === "ADMIN" && (
                    <MobileAction
                      href="/admin"
                      icon={ShieldCheck}
                      label="Admin panel"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                  >
                    <LogOut className="h-4 w-4" />
                    {loggingOut ? "Logging out…" : "Log out"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold transition hover:bg-muted"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-95"
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
  autoFocus = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={className} role="search">
      <label className="group relative block">
        <span className="sr-only">Search products</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition group-focus-within:text-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search products, categories and goals"
          autoFocus={autoFocus}
          className="h-11 w-full rounded-xl border border-transparent bg-[#f5f3ee] pl-11 pr-12 text-sm outline-none transition placeholder:text-muted-foreground/80 hover:bg-[#f0eee8] focus:border-foreground/15 focus:bg-background focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-foreground text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Submit search"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </label>
    </form>
  );
}

function CategoryMenu({
  categories,
  onClose,
}: {
  categories: Array<{ name: string; slug: string }>;
  onClose: () => void;
}) {
  return (
    <div
      id="desktop-category-menu"
      className="absolute left-0 top-12 z-50 w-[26rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background p-3 shadow-[0_24px_60px_rgba(24,21,16,0.16)]"
      role="menu"
      aria-label="Shop categories"
    >
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <div>
          <p className="text-sm font-bold">Shop by category</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Find the right gear for your routine
          </p>
        </div>
        <Link
          href="/shop"
          onClick={onClose}
          className="text-xs font-semibold underline-offset-4 hover:underline"
          role="menuitem"
        >
          View all
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-1 border-t border-border/70 pt-2">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={"/shop?category=" + category.slug}
            onClick={onClose}
            className="group flex min-h-12 items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition hover:bg-muted"
            role="menuitem"
          >
            {category.name}
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
      <Link
        href="/bundles"
        onClick={onClose}
        className="mt-2 flex items-center justify-between rounded-xl bg-primary/15 px-3 py-3 text-sm font-semibold transition hover:bg-primary/25"
        role="menuitem"
      >
        <span>
          <span className="block">Bundles & savings</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Curated combinations, fewer decisions
          </span>
        </span>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function AccountMenu({
  displayName,
  email,
  isAdmin,
  loggingOut,
  onLogout,
}: {
  displayName: string;
  email: string;
  isAdmin: boolean;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  return (
    <div
      id="desktop-account-menu"
      className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-border bg-background p-2 shadow-[0_24px_60px_rgba(24,21,16,0.16)]"
      role="menu"
      aria-label="Account menu"
    >
      <div className="border-b border-border px-3 py-2.5">
        <p className="truncate text-sm font-bold">{displayName}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <div className="py-1.5">
        <AccountMenuLink href="/account" icon={UserRound} label="Account overview" />
        <AccountMenuLink href="/account/orders" icon={ShoppingBag} label="Your orders" />
        <AccountMenuLink href="/account/wishlist" icon={Heart} label="Wishlist" />
        {isAdmin && (
          <AccountMenuLink href="/admin" icon={ShieldCheck} label="Admin panel" />
        )}
      </div>
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="flex h-10 w-full items-center gap-2 rounded-xl border-t border-border px-3 text-sm font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        role="menuitem"
      >
        <LogOut className="h-4 w-4 text-muted-foreground" />
        {loggingOut ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}

function AccountMenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:bg-muted"
      role="menuitem"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </Link>
  );
}

function HeaderIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function CountBadge({ count, dark = false }: { count: number; dark?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ${dark ? "bg-primary text-primary-foreground ring-2 ring-foreground" : "bg-primary text-primary-foreground"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
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
      className="ml-1 inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-3.5 text-sm font-semibold text-background transition hover:opacity-90"
      aria-label={"Cart (" + cartCount + " items)"}
    >
      <ShoppingBag className="h-4 w-4" />
      Cart
      {cartCount > 0 && (
        <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {cartCount > 99 ? "99+" : cartCount}
        </span>
      )}
    </button>
  );
}

function NavLink({
  href,
  active,
  emphasis,
  children,
}: {
  href: string;
  active?: boolean;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold transition " +
        (active
          ? "bg-muted text-foreground"
          : emphasis
            ? "text-foreground hover:bg-primary/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      {children}
      {emphasis && !active && (
        <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      )}
    </Link>
  );
}

function MobileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center justify-between rounded-xl px-3 text-sm font-medium transition hover:bg-muted"
    >
      {label}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function MobileAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold transition hover:bg-muted"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
