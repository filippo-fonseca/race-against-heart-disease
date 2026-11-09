import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Strava photo CDN plus the placeholder source used by the mock log.
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "dgalywyr863hv.cloudfront.net" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      // Photos uploaded through the MCP server (public `training-photos` bucket).
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/training-photos/**" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
