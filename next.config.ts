import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All user data lives in the browser (IndexedDB), so server caching features are not used.
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
