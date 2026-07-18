import { publicEnv } from "@/config/publicEnv";

export const SITE_NAME = "beFitBeStrong";
export const SITE_DESCRIPTION =
  "Supplements, home gym equipment, training apparel, and accessories with clear product information and PIN-code delivery checks.";

export const DEFAULT_SHARE_IMAGE =
  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&h=630&fit=crop";

export function getSiteUrl(): string {
  return publicEnv.siteUrl;
}

export function absoluteSiteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
