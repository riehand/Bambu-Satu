import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate compiler output/locks only; both workflows use the same src tree.
  distDir: process.env.WELLBEING_LOCAL_RUNTIME_FILE ? ".next-isolated" : ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
