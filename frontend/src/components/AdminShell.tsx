"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  Boxes,
  ExternalLink,
  Gift,
  LayoutDashboard,
  MapPinned,
  MailCheck,
  Menu,
  Package,
  PanelsTopLeft,
  Repeat2,
  ShoppingBag,
  Star,
  Tags,
  TicketPercent,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AdminNotificationBell } from "@/features/adminNotifications/AdminNotificationBell";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/admin",
        label: "Overview",
        description: "Monitor sales, fulfilment, and inventory health.",
        icon: LayoutDashboard,
      },
      {
        href: "/admin/email-delivery",
        label: "Email delivery",
        description: "Monitor queued messages, retries, and delivery failures.",
        icon: MailCheck,
      },
    ],
  },
  {
    label: "Commerce",
    items: [
      {
        href: "/admin/products",
        label: "Products",
        description: "Manage catalog items, pricing, variants, and visibility.",
        icon: Package,
      },
      {
        href: "/admin/categories",
        label: "Categories",
        description: "Organize the storefront catalog and product discovery.",
        icon: Tags,
      },
      {
        href: "/admin/orders",
        label: "Orders",
        description: "Review purchases, payment state, and fulfilment.",
        icon: ShoppingBag,
      },
      {
        href: "/admin/fulfillment",
        label: "Fulfillment",
        description: "Operate AWBs, pickups, shipment tracking, and exceptions.",
        icon: Truck,
      },
      {
        href: "/admin/service-areas",
        label: "Service areas",
        description: "Control delivery PINs, COD policy, and expansion demand.",
        icon: MapPinned,
      },
      {
        href: "/admin/bundles",
        label: "Bundles",
        description: "Create higher-value product combinations.",
        icon: Boxes,
      },
      {
        href: "/admin/subscriptions",
        label: "Subscriptions",
        description: "Manage recurring product offers and customer plans.",
        icon: Repeat2,
      },
    ],
  },
  {
    label: "Experience",
    items: [
      {
        href: "/admin/homepage",
        label: "Homepage",
        description: "Curate featured content and storefront merchandising.",
        icon: PanelsTopLeft,
      },
      {
        href: "/admin/reviews",
        label: "Reviews",
        description: "Moderate customer feedback and verified ratings.",
        icon: Star,
      },
      {
        href: "/admin/demand",
        label: "Demand",
        description: "Track wishlist interest and stock-alert demand.",
        icon: BellRing,
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        href: "/admin/coupons",
        label: "Coupons",
        description: "Configure promotions and redemption rules.",
        icon: TicketPercent,
      },
      {
        href: "/admin/loyalty",
        label: "Loyalty",
        description: "Operate rewards, referrals, and retention programs.",
        icon: Gift,
      },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

function isActiveRoute(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAppSelector((state) => state.auth.user);

  const currentPage = useMemo(
    () =>
      allNavItems.find((item) => isActiveRoute(pathname, item.href)) ??
      allNavItems[0],
    [pathname],
  );

  const displayName =
    user?.name?.trim() || user?.email?.split("@")[0] || "Administrator";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <RequireAuth role="ADMIN">
      <div className="admin-workspace min-h-screen bg-[#f4f3ef] text-foreground">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-[#171714] text-white lg:flex lg:flex-col">
          <SidebarContent
            pathname={pathname}
            displayName={displayName}
            email={user?.email}
          />
        </aside>

        <div className="min-h-screen lg:pl-72">
          <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f4f3ef]/95 backdrop-blur-xl">
            <div className="mx-auto flex min-h-20 w-full max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6 lg:min-h-24 lg:px-10">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-black/10 bg-white shadow-sm hover:bg-black/[0.03] lg:hidden"
                aria-label="Open admin navigation"
                aria-controls="admin-mobile-navigation"
                aria-expanded={mobileOpen}
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Administration
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                    {currentPage.label}
                  </h1>
                  <span className="hidden rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 sm:inline-flex">
                    Secure workspace
                  </span>
                </div>
                <p className="mt-1 hidden text-sm text-muted-foreground md:block">
                  {currentPage.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <AdminNotificationBell />
                <Link
                  href="/admin/products/new"
                  className="hidden h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 sm:inline-flex"
                >
                  Add product
                </Link>
                <Link
                  href="/"
                  target="_blank"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-black/[0.03] sm:px-4"
                >
                  <span className="hidden sm:inline">View store</span>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="admin-content mx-auto max-w-[1500px]">{children}</div>
          </main>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="Close admin navigation"
            />
            <aside
              id="admin-mobile-navigation"
              className="relative flex h-full w-[min(88vw,20rem)] flex-col bg-[#171714] text-white shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10"
                aria-label="Close admin navigation"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent
                pathname={pathname}
                displayName={displayName}
                email={user?.email}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}

function SidebarContent({
  pathname,
  displayName,
  email,
  onNavigate,
}: {
  pathname: string;
  displayName: string;
  email?: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-24 items-center border-b border-white/10 px-6">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="group flex items-center gap-3"
          aria-label="beFitBeStrong admin overview"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-xs font-black tracking-[-0.08em] text-primary-foreground shadow-[0_8px_30px_rgba(250,204,21,0.18)] transition-transform group-hover:-rotate-2">
            BFS
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight">
              beFitBeStrong
            </span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              Admin console
            </span>
          </span>
        </Link>
      </div>

      <nav
        className="flex-1 space-y-7 overflow-y-auto px-4 py-6"
        aria-label="Admin sections"
      >
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActiveRoute(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                      active
                        ? "bg-white/[0.09] text-white shadow-sm"
                        : "text-white/58 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    {active && (
                      <span className="absolute -left-1 h-5 w-1 rounded-full bg-primary" />
                    )}
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active ? "text-primary" : "text-white/45 group-hover:text-white/75",
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-white">
                {displayName}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-white/45">
                {email ?? "Admin account"}
              </span>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/account"
              onClick={onNavigate}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 text-[11px] font-semibold text-white/65 hover:bg-white/[0.06] hover:text-white"
            >
              Account
            </Link>
            <Link
              href="/"
              target="_blank"
              onClick={onNavigate}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground hover:brightness-95"
            >
              Store
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
