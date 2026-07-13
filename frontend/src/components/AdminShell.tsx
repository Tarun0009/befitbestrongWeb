"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/homepage", label: "Homepage" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/loyalty", label: "Loyalty" },
  { href: "/admin/bundles", label: "Bundles" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/demand", label: "Demand" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth role="ADMIN">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Control panel</h1>
        </header>

        <nav
          className="mt-6 flex gap-2 overflow-x-auto border-b border-border"
          aria-label="Admin sections"
        >
          {nav.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm",
                  active
                    ? "border-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8">{children}</div>
      </div>
    </RequireAuth>
  );
}
