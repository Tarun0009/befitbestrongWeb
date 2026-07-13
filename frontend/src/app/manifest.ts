import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "beFitBeStrong",
    short_name: "beFitBeStrong",
    description:
      "Supplements, gym equipment, apparel, and accessories built for training.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f4c430",
    categories: ["fitness", "shopping", "sports"],
  };
}
