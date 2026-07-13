import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop gym supplements, equipment, and apparel",
  description:
    "Browse training supplements, home-gym equipment, apparel, and useful accessories with clear prices and live availability.",
  alternates: { canonical: "/shop" },
  openGraph: {
    title: "Shop gym essentials · beFitBeStrong",
    description:
      "Supplements, equipment, apparel, and accessories selected for repeat training.",
    url: "/shop",
  },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
