import Link from "next/link";

/** Site-wide footer with only links and claims that are available in the product. */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border bg-muted/40">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-semibold">beFitBeStrong</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Supplements, home-gym equipment, apparel, and accessories for
              people who train.
            </p>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Delivery availability and payment options are confirmed for your
              PIN code at checkout.
            </p>
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
              { label: "Shipping & returns", href: "/shipping-returns" },
              { label: "Customer support", href: "/support" },
            ]}
          />

          <FooterColumn
            title="Company"
            links={[
              { label: "About us", href: "/about" },
              { label: "Privacy policy", href: "/privacy" },
              { label: "Terms of service", href: "/terms" },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            © {year} beFitBeStrong. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Payment methods shown at checkout vary by provider and PIN code.
          </p>
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
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-foreground hover:underline underline-offset-4"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
