import type { NextConfig } from "next";
import { publicEnv } from "./src/config/publicEnv";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output produces a slim `.next/standalone` directory that the
  // Dockerfile copies into the runtime image. Cuts container size significantly.
  output:
    process.env.NEXT_DISABLE_STANDALONE === "1" ? undefined : "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${publicEnv.apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
