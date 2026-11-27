import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Brand logos are stored as data URLs; allow request bodies big enough for them.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Calendar thumbnails load resized copies of photos stored in Vercel Blob.
  images: { remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }], formats: ["image/webp"] },
};

export default nextConfig;
