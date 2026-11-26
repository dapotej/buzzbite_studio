import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Brand logos are stored as data URLs; allow request bodies big enough for them.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
