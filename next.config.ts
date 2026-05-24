import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Suppress the "multiple lockfiles" workspace root warning
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Allow external images from Apple CDN (product images in seed)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "store.storeimages.cdn-apple.com",
      },
    ],
  },
};

export default nextConfig;
