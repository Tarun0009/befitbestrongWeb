"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  LayoutDashboard,
  PackageCheck,
  Settings2,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const items = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/orders", label: "Orders", icon: PackageCheck },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/rewards", label: "Rewards", icon: Trophy },
  { href: "/account/subscriptions", label: "Subscriptions", icon: Sparkles },
  { href: "/account/settings", label: "Settings", icon: Settings2 },
];

function activeRoute(pathname: string, href: string) {
  return href === "/account" ? pathname === href : pathname.startsWith(href);
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAppSelector((state) => state.auth.user);
  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Guest order";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <header className="border-b border-white/10 bg-[#191916] text-white">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[5.5rem] items-center justify-between gap-5">
            <Link href="/account" className="group flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground shadow-[0_8px_24px_rgba(245,184,0,0.18)] transition-transform group-hover:-rotate-3">
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">{user ? "Member dashboard" : "Order access"}</span>
                <span className="mt-1 block truncate text-sm font-semibold sm:text-base">{displayName}</span>
              </span>
            </Link>
            <Link href="/shop" className="hidden rounded-xl border border-white/15 px-3.5 py-2 text-xs font-semibold text-white/75 transition hover:border-white/30 hover:bg-white/5 hover:text-white sm:inline-flex">
              Continue shopping
            </Link>
          </div>
          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Account navigation">
            {items.map(({ href, label, icon: Icon }) => {
              const active = activeRoute(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-3.5",
                    active ? "bg-white text-[#191916] shadow-sm" : "text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="border-b border-black/[0.06] bg-white/60">
        <div className="mx-auto flex max-w-[1280px] items-center gap-2 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6 lg:px-8">
          <UserRound className="h-3.5 w-3.5" />
          <span>Private account area</span>
          <span className="text-black/20">·</span>
          <span className="truncate">{user?.email ?? "Secure guest order view"}</span>
        </div>
      </div>
      {children}
    </div>
  );
}