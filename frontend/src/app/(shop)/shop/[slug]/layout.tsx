import type { Metadata } from "next";
import { getServerProduct } from "@/lib/catalogServer";
import {
  compactDescription,
  jsonLd,
  productBreadcrumbJsonLd,
  productJsonLd,
  socialImageUrl,
} from "@/lib/seo";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site";

type ProductRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getServerProduct(slug);

  if (!product || !product.active) {
    return {
      title: "Product unavailable",
      robots: { index: false, follow: false },
    };
  }

  const description = compactDescription(product.description);
  const canonicalPath = `/shop/${product.slug}`;
  const shareImage = socialImageUrl(product.images[0]?.url);

  return {
    title: { absolute: `${product.name} · ${SITE_NAME}` },
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      title: `${product.name} · ${SITE_NAME}`,
      description,
      url: canonicalPath,
      images: [{ url: shareImage, width: 1200, height: 630, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} · ${SITE_NAME}`,
      description,
      images: [shareImage],
    },
  };
}

export default async function ProductSeoLayout({
  children,
  params,
}: ProductRouteProps & { children: React.ReactNode }) {
  const { slug } = await params;
  const product = await getServerProduct(slug);

  return (
    <>
      {product?.active && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(product)) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd(productBreadcrumbJsonLd(product)),
            }}
          />
        </>
      )}
      {children}
    </>
  );
}

export function generateStaticParams() {
  return [];
}

export const dynamicParams = true;
export const revalidate = 600;

