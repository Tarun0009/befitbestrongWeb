import { publicEnv } from "@/config/publicEnv";
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { getFirebaseAuth } from "@/lib/firebase";

const API_URL = publicEnv.apiUrl;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: async (headers) => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      /* anonymous */
    }
    return headers;
  },
});

const baseQueryWithRefresh: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        await user.getIdToken(true);
        result = await rawBaseQuery(args, api, extraOptions);
      }
    } catch {
      /* fall through */
    }
  }
  return result;
};

export interface HeroSlide {
  eyebrow: string;
  headline: string;
  highlight?: string | null;
  subtitle: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string | null;
  secondaryHref?: string | null;
  imageUrl?: string | null;
}

export interface RewardTier {
  threshold: number;
  reward: string;
}

// Public shape - matches PublicSiteConfig on the backend.
export interface PublicSiteConfig {
  announcement: {
    enabled: boolean;
    text: string;
    code: string | null;
    ctaText: string | null;
    ctaHref: string | null;
  };
  hero: {
    eyebrow: string;
    headline: string;
    highlight: string | null;
    subtitle: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string } | null;
  };
  heroSlides: HeroSlide[];
  rewardTiers: RewardTier[];
  featuredProductIds: string[];
  spotlight: {
    enabled: boolean;
    eyebrow: string | null;
    title: string | null;
    body: string | null;
    ctaLabel: string | null;
    ctaHref: string | null;
  };
}

// Admin shape - raw row.
export interface AdminSiteConfig {
  id: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementCode: string | null;
  announcementCtaText: string | null;
  announcementCtaHref: string | null;
  heroEyebrow: string;
  heroHeadline: string;
  heroHighlight: string | null;
  heroSubtitle: string;
  heroPrimaryLabel: string;
  heroPrimaryHref: string;
  heroSecondaryLabel: string | null;
  heroSecondaryHref: string | null;
  heroSlides: HeroSlide[];
  rewardTiers: RewardTier[];
  featuredProductIds: string[];
  spotlightEnabled: boolean;
  spotlightEyebrow: string | null;
  spotlightTitle: string | null;
  spotlightBody: string | null;
  spotlightCtaLabel: string | null;
  spotlightCtaHref: string | null;
  updatedAt: string;
  createdAt: string;
}

export type AdminSiteConfigPatch = Partial<
  Omit<AdminSiteConfig, "id" | "createdAt" | "updatedAt">
>;

export const siteConfigApi = createApi({
  reducerPath: "siteConfigApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["SiteConfig", "AdminSiteConfig"],
  endpoints: (builder) => ({
    getSiteConfig: builder.query<PublicSiteConfig, void>({
      query: () => "/site-config",
      providesTags: ["SiteConfig"],
    }),
    adminGetSiteConfig: builder.query<{ config: AdminSiteConfig }, void>({
      query: () => "/admin/site-config",
      providesTags: ["AdminSiteConfig"],
    }),
    adminUpdateSiteConfig: builder.mutation<
      { config: AdminSiteConfig },
      AdminSiteConfigPatch
    >({
      query: (body) => ({
        url: "/admin/site-config",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["SiteConfig", "AdminSiteConfig"],
    }),
  }),
});

export const {
  useGetSiteConfigQuery,
  useAdminGetSiteConfigQuery,
  useAdminUpdateSiteConfigMutation,
} = siteConfigApi;

