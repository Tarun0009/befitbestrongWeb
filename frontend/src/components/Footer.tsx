import Link from "next/link";

/**
 * Site-wide footer. Kept text-heavy to match the DESIGN.md "content-first,
 * minimal chrome" principle — no giant social icons, no logo wall.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border bg-muted/40">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-semibold">beFitBeStrong</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Supplements, home-gym equipment, apparel, and accessories —
              curated for people who train.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-background px-3 py-2 text-xs ring-1 ring-inset ring-border">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              All systems operational
            </div>
          </div>

          <FooterColumn
            title="Shop"
            links={[
              { label: "Supplements", href: "/shop?category=supplements" },
              { label: "Equipment", href: "/shop?category=equipment" },
              { label: "Apparel", href: "/shop?category=apparel" },
              { label: "Accessories", href: "/shop?category=accessories" },
              { label: "All products", href: "/shop" },
            ]}
          />

          <FooterColumn
            title="Help"
            links={[
              { label: "Your orders", href: "/account/orders" },
              { label: "Your account", href: "/account" },
              { label: "Shipping & returns", href: "#" },
              { label: "Contact support", href: "#" },
            ]}
          />

          <FooterColumn
            title="Company"
            links={[
              { label: "About us", href: "#" },
              { label: "Careers", href: "#" },
              { label: "Ambassadors", href: "#" },
              { label: "Privacy policy", href: "#" },
              { label: "Terms of service", href: "#" },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {year} beFitBeStrong. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded border border-border px-2 py-1">Razorpay</span>
            <span className="rounded border border-border px-2 py-1">UPI</span>
            <span className="rounded border border-border px-2 py-1">Cards</span>
            <span className="rounded border border-border px-2 py-1">Net-banking</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-foreground hover:underline underline-offset-4"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
