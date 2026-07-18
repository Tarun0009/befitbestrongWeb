import Link from "next/link";
import type { ReactNode } from "react";

export interface SupportSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface SupportPageProps {
  eyebrow: string;
  title: string;
  description: string;
  sections: SupportSection[];
  updated?: string;
  children?: ReactNode;
}

/** Shared, server-rendered layout for customer support and policy pages. */
export function SupportPage({
  eyebrow,
  title,
  description,
  sections,
  updated,
  children,
}: SupportPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            Home
          </Link>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span aria-current="page">{title}</span>
        </nav>

        <header className="mt-10 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-emphasis">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            {description}
          </p>
          {updated && (
            <p className="mt-4 text-xs text-muted-foreground">
              Last updated: {updated}
            </p>
          )}
        </header>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold tracking-tight">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground sm:text-base">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <aside className="h-fit rounded-lg border border-border bg-muted/40 p-5">
            <p className="text-sm font-semibold">Useful links</p>
            <div className="mt-3 grid gap-2 text-sm">
              <Link className="hover:underline" href="/shop">
                Browse products
              </Link>
              <Link className="hover:underline" href="/account/orders">
                View your orders
              </Link>
              <Link className="hover:underline" href="/support">
                Customer support
              </Link>
              {children}
            </div>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              Delivery availability, payment methods, fees, and estimated dates
              are confirmed at checkout for the PIN code you enter.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
