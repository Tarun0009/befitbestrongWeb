import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curated product bundles",
  description:
    "Shop server-priced gym and supplement stacks with transparent savings and live component availability.",
  alternates: { canonical: "/bundles" },
  openGraph: {
    title: "Curated training stacks · beFitBeStrong",
    description:
      "Build the routine and save on server-priced product bundles.",
    url: "/bundles",
  },
};

export default function BundlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
